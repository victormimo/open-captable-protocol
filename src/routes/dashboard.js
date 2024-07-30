import { Router } from "express";
import { find } from "../db/operations/atomic";
import Stakeholder from "../db/objects/Stakeholder.js";
import StockPlan from "../db/objects/StockPlan.js";
import StockIssuance from "../db/objects/transactions/issuance/StockIssuance.js";
import ConvertibleIssuance from "../db/objects/transactions/issuance/ConvertibleIssuance.js";
import IssuerAuthorizedSharesAdjustment from "../db/objects/transactions/adjustment/IssuerAuthorizedSharesAdjustment.js";
import Issuer from "../db/objects/Issuer.js";

import get from "lodash/get";
import { readIssuerById } from "../db/operations/read.js";

const dashboard = Router();

dashboard.get("/", async (req, res) => {
    const { issuerId } = req.query;
    if (!issuerId) {
        console.log("❌ | No issuer ID");
        return res.status(400).send("issuerId is required");
    }

    await readIssuerById(issuerId);
    const stockIssuances = await find(StockIssuance, { issuer: issuerId });
    const totalStockIssuanceShares = stockIssuances.reduce((acc, issuance) => acc + Number(get(issuance, "quantity")), 0);

    const stockPlans = await find(StockPlan, { issuer: issuerId });
    const stockPlanAmount = stockPlans.reduce((acc, plan) => acc + Number(get(plan, "initial_shares_reserved")), 0);

    // ownership calculation
    const stakeholders = (await find(Stakeholder, { issuer: issuerId })) || [];
    const stakeholderShares = stakeholders.reduce((acc, stakeholder) => {
        acc[stakeholder.id] = { shares: 0, type: stakeholder.current_relationship };
        return acc;
    }, {});

    const founderStakeholderIds = new Set(
        stakeholders.filter((stakeholder) => stakeholder.current_relationship === "FOUNDER").map((stakeholder) => stakeholder.id)
    );

    stockIssuances.forEach((issuance) => {
        const stakeholderId = issuance.stakeholder_id;
        stakeholderShares[stakeholderId]["shares"] += Number(issuance.quantity);
    });

    const totalSharesOutstanding = totalStockIssuanceShares + stockPlanAmount;
    const stakeholderTypeShares = Object.values(stakeholderShares).reduce((acc, { shares, type }) => {
        if (!acc[type]) {
            acc[type] = 0;
        }
        acc[type] += shares;
        return acc;
    }, {});

    const ownership = Object.entries(stakeholderTypeShares).reduce((acc, [type, shares]) => {
        acc[type] = totalSharesOutstanding ? ((shares / totalSharesOutstanding) * 100).toFixed(2) : 0;
        return acc;
    }, {});

    const totalStockAmount = stockIssuances
        .filter((iss) => !founderStakeholderIds.has(iss.stakeholder_id)) // skip founders for total stock amount calculation
        .reduce((acc, issuance) => acc + Number(get(issuance, "quantity")) * Number(get(issuance, "share_price.amount")), 0);

    const convertibleIssuances = await find(ConvertibleIssuance, { issuer: issuerId });
    const totalConvertibleAmount = convertibleIssuances.reduce((acc, issuance) => acc + Number(issuance.investment_amount.amount), 0);
    const totalRaised = totalStockAmount + totalConvertibleAmount;

    // total shares calculation
    const latestAuthorizedSharesAdjustment = await IssuerAuthorizedSharesAdjustment.findOne({ issuer_id: issuerId }).sort({ date: -1 });
    const issuer = await Issuer.findById(issuerId);
    console.log({ issuer });
    const totalShares = latestAuthorizedSharesAdjustment
        ? Number(get(latestAuthorizedSharesAdjustment, "new_shares_authorized"))
        : Number(get(issuer, "initial_shares_authorized"));

    // share price calculation
    const latestStockIssuance = await StockIssuance.findOne({ issuer: issuerId }).sort({ createdAt: -1 });
    const sharePrice = get(latestStockIssuance, "share_price.amount", null);

    // fully diluted shares calculation
    const totalEquityCompensationIssuances = stockIssuances
        .filter((issuance) => !issuance.stock_class_id)
        .reduce((acc, issuance) => acc + Number(get(issuance, "quantity")), 0);
    const fullyDilutedShares = totalStockIssuanceShares + totalEquityCompensationIssuances;

    const getStockIssuanceValuation = () => {
        const totalStockIssuanceShares = stockIssuances
            .filter((iss) => !founderStakeholderIds.has(iss.stakeholder_id)) // skip founders for total stock amount calculation
            .reduce((acc, issuance) => acc + Number(get(issuance, "quantity")), 0);
        const outstandingShares = totalStockIssuanceShares + stockPlanAmount;
        console.log({ outstandingShares, totalStockIssuanceShares, stockPlanAmount, sharePrice });
        if (!outstandingShares || !sharePrice) return null;
        // Outstanding shares: shares reserved
        return {
            type: "STOCK",
            amount: (outstandingShares * sharePrice).toFixed(2),
            createdAt: get(latestStockIssuance, "createdAt"),
        };
    };
    const getConvertibleIssuanceValuation = () => {
        const convertibleValuation = convertibleIssuances
            .map((issuance) => {
                const conversionTriggers = get(issuance, "conversion_triggers", []);
                let conversionValuationCap = null;
                conversionTriggers.forEach((trigger) => {
                    const conversionRight = get(trigger, "conversion_right");
                    const isConvertibleConversion = get(conversionRight, "type") === "CONVERTIBLE_CONVERSION_RIGHT";
                    if (!isConvertibleConversion) return null;
                    const conversionMechanism = get(conversionRight, "conversion_mechanism");
                    const isSAFEConversion = get(conversionMechanism, "type") === "SAFE_CONVERSION";
                    if (!isSAFEConversion || !conversionMechanism) return null;

                    conversionValuationCap = get(conversionMechanism, "conversion_valuation_cap.amount");
                    if (!conversionValuationCap) return null;
                });
                return {
                    type: "CONVERTIBLE",
                    amount: conversionValuationCap,
                    createdAt: get(issuance, "createdAt"),
                };
            })
            .filter((issuance) => issuance)
            .sort((a, b) => b.createdAt - a.createdAt);
        return get(convertibleValuation, "0", null);
    };

    /* 
        Valuation Calculation:
        latest issuance either Convertible with valuation cap or stock issuance
        for stock issuance calculation:
            outstanding shares * share price
        for convertible issuance calculation:
            conversion valuation cap
    */
    const stockIssuanceValuation = getStockIssuanceValuation();
    const convertibleIssuanceValuation = getConvertibleIssuanceValuation();
    const valuations = [stockIssuanceValuation, convertibleIssuanceValuation].filter((val) => val && Object.keys(val).length > 0);
    valuations.sort((a, b) => b.createdAt - a.createdAt);
    const valuation = valuations.length > 0 ? valuations[0] : null;

    /*
        1. calculating ownership requires calcalationg total issuances which in case of cancelation the calculation will be wrong, therefore we need better way to get the latest ownership.
        One way we can get through active postions from smart contract
        2. Stock Plan Reissue is not considered in the ownership calculation: need to keep that in mind
    */

    const totalStakeholders = stakeholders.length;

    res.status(200).send({
        ownership,
        fullyDilutedShares,
        numOfStakeholders: totalStakeholders,
        totalRaised,
        stockPlanAmount,
        totalShares,
        sharePrice,
        valuation,
    });
});

export default dashboard;
