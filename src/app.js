import express, { json, urlencoded } from "express";
import { setupEnv } from "./utils/env.js";
import { connectDB } from "./db/config/mongoose.ts";
import { startListener } from "./utils/websocket.ts";
import { setTag } from "@sentry/node";
import * as Sentry from "@sentry/node";

// Routes
import historicalTransactions from "./routes/historicalTransactions.js";
import mainRoutes from "./routes/index.js";
import issuerRoutes from "./routes/issuer.js";
import stakeholderRoutes from "./routes/stakeholder.js";
import stockClassRoutes from "./routes/stockClass.js";
import stockLegendRoutes from "./routes/stockLegend.js";
import stockPlanRoutes from "./routes/stockPlan.js";
import transactionRoutes from "./routes/transactions.js";
import valuationRoutes from "./routes/valuation.js";
import vestingTermsRoutes from "./routes/vestingTerms.js";
import statsRoutes from "./routes/stats/index.js";
import exportRoutes from "./routes/export.js";
import ocfRoutes from "./routes/ocf.js";

import { readAllIssuers, readIssuerById } from "./db/operations/read.js";
import { contractCache } from "./utils/simple_caches.js";
import { getContractInstance } from "./chain-operations/getContractInstances.js";

setupEnv();
Sentry.init({
    integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    sendDefaultPii: false,
});

const app = express();

const PORT = process.env.PORT;
const CHAIN = process.env.CHAIN;

// Middlewares
const chainMiddleware = (req, res, next) => {
    req.chain = CHAIN;
    next();
};

// Middleware to get or create contract instance
// the listener is first started on deployment, then here as a backup
const contractMiddleware = async (req, res, next) => {
    if (!req.body.issuerId) {
        console.log("❌ | No issuer ID");
        return res.status(400).send("issuerId is required");
    }

    // fetch issuer to ensure it exists
    const issuer = await readIssuerById(req.body.issuerId);
    if (!issuer || !issuer.id) return res.status(404).send("issuer not found ");

    // Check if contract instance already exists in cache
    if (!contractCache[req.body.issuerId]) {
        const { contract, provider, libraries } = await getContractInstance(issuer.deployed_to);
        contractCache[req.body.issuerId] = { contract, provider, libraries };
    }

    setTag("issuerId", req.body.issuerId);
    req.contract = contractCache[req.body.issuerId].contract;
    req.provider = contractCache[req.body.issuerId].provider;
    next();
};

app.use(urlencoded({ limit: "50mb", extended: true }));
app.use(json({ limit: "50mb" }));
app.enable("trust proxy");

app.use("/", chainMiddleware, mainRoutes);
app.use("/issuer", chainMiddleware, issuerRoutes);
app.use("/stakeholder", contractMiddleware, stakeholderRoutes);
app.use("/stock-class", contractMiddleware, stockClassRoutes);

// No middleware required since these are only created offchain
app.use("/stock-legend", stockLegendRoutes);
app.use("/stock-plan", stockPlanRoutes);
app.use("/valuation", valuationRoutes);
app.use("/vesting-terms", vestingTermsRoutes);
app.use("/historical-transactions", historicalTransactions);
app.use("/stats", statsRoutes);
app.use("/export", exportRoutes);
app.use("/ocf", ocfRoutes);

// transactions
app.use("/transactions/", contractMiddleware, transactionRoutes);

const startServer = async () => {
    // Connect to MongoDB
    console.log("Connecting to MongoDB...");
    await connectDB();
    console.log("Connected to MongoDB");

    app.listen(PORT, async () => {
        console.log(`🚀  Server successfully launched at:${PORT}`);

        const issuers = (await readAllIssuers()) || null;
        if (issuers) {
            const contractAddresses = issuers
                .filter((issuer) => issuer?.deployed_to)
                .reduce((acc, issuer) => {
                    acc[issuer.id] = issuer.deployed_to;
                    return acc;
                }, {});

            console.log(contractAddresses);
            console.log("Issuer -> Contract Address");
            const contractsToWatch = Object.values(contractAddresses);
            console.log("Watching ", contractsToWatch.length, " Contracts");
            startListener(contractsToWatch);
        }
    });
    app.on("error", (err) => {
        console.error(err);
        if (err.code === "EADDRINUSE") {
            console.log(`Port ${PORT} is already in use.`);
        } else {
            console.log(err);
        }
    });
};

startServer().catch((error) => {
    console.error("Error starting server:", error);
});
