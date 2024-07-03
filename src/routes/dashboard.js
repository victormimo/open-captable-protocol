import { Router } from "express";
import { find, countDocuments } from "../db/operations/atomic";
import Stakeholder from "../db/objects/Stakeholder.js";
import StockIssuance from "../db/objects/transactions/issuance/StockIssuance.js";
import ConvertibleIssuance from "../db/objects/transactions/issuance/ConvertibleIssuance.js";
import get from "lodash/get";

const dashboard = Router();

dashboard.get("/", async (req, res) => {
    const { issuerId } = req.query;
    if (!issuerId) {
        console.log("❌ | No issuer ID");
        return res.status(400).send("issuerId is required");
    }

    const numOfStakeholders = await countDocuments(Stakeholder, { issuer: issuerId });
    const stockIssuances = await find(StockIssuance, { issuer: issuerId });
    const totalStockAmount = stockIssuances.reduce((acc, issuance) => acc + (Number(get(issuance, "quantity")) * Number(get(issuance, "share_price.amount"))), 0)
    const convertibleIssuances = await find(ConvertibleIssuance, { issuer: issuerId });
    const totalConvertibleAmount = convertibleIssuances.reduce((acc, issuance) => acc + Number(issuance.investment_amount.amount), 0);
    const totalRaised = totalStockAmount + totalConvertibleAmount;

    res.status(200).send({
        numOfStakeholders,
        totalRaised,
    });
});

export default dashboard;
