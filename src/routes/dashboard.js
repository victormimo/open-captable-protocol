import { Router } from "express";
import { find, countDocuments } from "../db/operations/atomic";
import Stakeholder from "../db/objects/Stakeholder.js";
import StockPlan from "../db/objects/StockPlan.js";
import StockIssuance from "../db/objects/transactions/issuance/StockIssuance.js";
import ConvertibleIssuance from "../db/objects/transactions/issuance/ConvertibleIssuance.js";
import IssuerAuthorizedSharesAdjustment from "../db/objects/transactions/adjustment/IssuerAuthorizedSharesAdjustment.js";
import Issuer from "../db/objects/Issuer.js";

import get from "lodash/get";

const dashboard = Router();

dashboard.get("/", async (req, res) => {
    const { issuerId } = req.query;
    if (!issuerId) {
        console.log("❌ | No issuer ID");
        return res.status(400).send("issuerId is required");
    }

    const stockIssuances = await find(StockIssuance, { issuer: issuerId });
    const totalStockAmount = stockIssuances.reduce(
        (acc, issuance) => acc + Number(get(issuance, "quantity")) * Number(get(issuance, "share_price.amount")),
        0
    );
    const convertibleIssuances = await find(ConvertibleIssuance, { issuer: issuerId });
    const totalConvertibleAmount = convertibleIssuances.reduce((acc, issuance) => acc + Number(issuance.investment_amount.amount), 0);
    const totalRaised = totalStockAmount + totalConvertibleAmount;
    const stockPlans = await find(StockPlan, { issuer: issuerId });
    const stockPlanAmount = stockPlans.reduce((acc, plan) => acc + Number(get(plan, "initial_shares_reserved")), 0);

    // total shares calculation
    const latestAuthorizedSharesAdjustment = await IssuerAuthorizedSharesAdjustment.findOne({ issuer_id: issuerId }).sort({ date: -1 });
    const issuer = await Issuer.findById(issuerId);
    const totalShares = latestAuthorizedSharesAdjustment
        ? Number(latestAuthorizedSharesAdjustment.new_shares_authorized)
        : Number(issuer.initial_shares_authorized);

    // share price calculation
    const latestStockIssuance = await StockIssuance.findOne({ issuer: issuerId }).sort({ createdAt: -1 });
    const sharePrice = get(latestStockIssuance, "share_price.amount", null);

    // TODO: complete add valuation calculation
    const valuation = [];

    // Stakeholder
    const stakeholders = await find(Stakeholder, { issuer: issuerId });
    const stakeholderTypeCounts = stakeholders.reduce(
        (acc, stakeholder) => {
            const type = stakeholder.current_relationship;
            if (!acc[type]) {
                acc[type] = 0;
            }

            acc[type]++;
            return acc;
        },
        {
            ADVISOR: 0,
            BOARD_MEMBER: 0,
            CONSULTANT: 0,
            EMPLOYEE: 0,
            EX_ADVISOR: 0,
            EX_CONSULTANT: 0,
            EX_EMPLOYEE: 0,
            EXECUTIVE: 0,
            FOUNDER: 0,
            INVESTOR: 0,
            NON_US_EMPLOYEE: 0,
            OFFICER: 0,
            OTHER: 0,
        }
    );

    const totalStakeholders = stakeholders.length;
    const ownership = Object.keys(stakeholderTypeCounts).reduce((acc, type) => {
        acc[type] = (stakeholderTypeCounts[type] / totalStakeholders) * 100;
        return acc;
    }, {});

    res.status(200).send({
        ownership,
        numOfStakeholders: totalStakeholders,
        totalRaised,
        stockPlanAmount,
        totalShares,
        sharePrice,
        valuation,
    });
});

export default dashboard;
