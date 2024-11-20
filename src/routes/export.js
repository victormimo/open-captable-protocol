import { Router } from "express";
import Issuer from "../db/objects/Issuer";
import Stakeholder from "../db/objects/Stakeholder";
import StockClass from "../db/objects/StockClass";
import StockLegendTemplate from "../db/objects/StockLegendTemplate";
import StockPlan from "../db/objects/StockPlan";
import Valuation from "../db/objects/Valuation";
import VestingTerm from "../db/objects/VestingTerms";
import HistoricalTransaction from "../db/objects/HistoricalTransaction";

import { find } from "../db/operations/atomic";
const exportCaptable = Router();

exportCaptable.get("/ocf", async (req, res) => {
    const { issuerId } = req.query;
    if (!issuerId) {
        console.log("❌ | No issuer ID");
        return res.status(400).send("issuerId is required");
    }

    try {
        const issuer = await Issuer.findById(issuerId);
        const stakeholders = await find(Stakeholder, { issuer: issuerId });
        const stockClasses = await find(StockClass, { issuer: issuerId });
        const stockPlans = await find(StockPlan, { issuer: issuerId });
        const stockLegendTemplates = await find(StockLegendTemplate, { issuer: issuerId });
        const valuations = await find(Valuation, { issuer: issuerId });
        const vestingTerms = await find(VestingTerm, { issuer: issuerId });
        const historicalTransactions = await find(HistoricalTransaction, { issuer: issuerId });

        res.status(200).json({
            issuer,
            stakeholders,
            stockClasses,
            stockPlans,
            stockLegendTemplates,
            valuations,
            vestingTerms,
            historicalTransactions,
        });
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).send("Failed to fetch data");
    }
});

export default exportCaptable;
