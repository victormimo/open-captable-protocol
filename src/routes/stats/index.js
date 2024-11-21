import { Router } from "express";
import calculateDashboardStats from "./dashboard.js";
import { readIssuerById } from "../../db/operations/read.js";
import calculateCaptableStats from "./captable.js";
import { dashboardStats, captableStats } from "../../rxjs/index.js";
import { captureException, setTag } from "@sentry/node";
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

stats.get("/rxjs/dashboard", async (req, res) => {
    try {
        const { issuerId } = req.query;
        setTag("issuerId", issuerId);

        const issuer = await readIssuerById(issuerId);
        if (!issuer) {
            return res.status(404).send({ error: "Issuer not found" });
        }

        const rxjsData = await dashboardStats(issuerId);

        if (rxjsData?.errors?.size > 0) {
            captureException(new Error(Array.from(rxjsData.errors).join("\n")));
            return res.status(500).send({ errors: Array.from(rxjsData.errors) });
        }

        console.log("rxjsData", rxjsData);

        res.status(200).send(rxjsData);
    } catch (error) {
        captureException(error);
        res.status(500).send({ error });
    }
});

stats.get("/rxjs/captable", async (req, res) => {
    try {
        const { issuerId } = req.query;
        setTag("issuerId", issuerId);

        const issuer = await readIssuerById(issuerId);
        if (!issuer) {
            return res.status(404).send({ error: "Issuer not found" });
        }

        const rxjsData = await captableStats(issuerId);
        if (rxjsData?.errors?.size > 0) {
            captureException(new Error(Array.from(rxjsData.errors).join("\n")));
            return res.status(500).send({ errors: Array.from(rxjsData.errors) });
        }

        console.log("rxjsData", rxjsData);

        res.status(200).send(rxjsData);
    } catch (error) {
        captureException(error);
        res.status(500).send({ error });
    }
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
