import { Router } from "express";
import calculateDashboardStats from "./dashboard.js";
import { readIssuerById } from "../../db/operations/read.js";
import calculateCaptableStats from "./captable.js";
import { testStockIssuance } from "../../state-machines/breadth/test.js";
import { rxjs } from "../../rxjs/index.js";

const stats = Router();

stats.get("/dashboard", async (req, res) => {
    const { issuerId } = req.query;
    if (!issuerId) {
        console.log("❌ | No issuer ID");
        return res.status(400).send("issuerId is required");
    }

    await readIssuerById(issuerId);
    const dashboardData = await calculateDashboardStats(issuerId);

    res.status(200).send(dashboardData);
});

stats.get("/state-machine", async (req, res) => {
    const { issuerId } = req.query;
    console.log("issuerId", issuerId);

    const stockIssuanceData = await testStockIssuance(issuerId);

    console.log("stockIssuanceData", stockIssuanceData)

    res.status(200).send(stockIssuanceData);
});

stats.get("/rxjs", async (req, res) => {
    const { issuerId } = req.query;
    console.log("issuerId", issuerId);

    const rxjsData = await rxjs(issuerId);

    console.log("rxjsData", rxjsData)

    res.status(200).send(rxjsData);
});

stats.get("/captable", async (req, res) => {
    const { issuerId } = req.query;
    if (!issuerId) {
        console.log("❌ | No issuer ID");
        return res.status(400).send("issuerId is required");
    }

    const captableData = await calculateCaptableStats(issuerId);

    res.status(200).send(captableData);
});
export default stats;
