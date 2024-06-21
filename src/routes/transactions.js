import { Router } from "express";
import { v4 as uuid } from "uuid";
import Joi from "joi";

import stockAcceptanceSchema from "../../ocf/schema/objects/transactions/acceptance/StockAcceptance.schema.json" assert { type: "json" };
import issuerAuthorizedSharesAdjustmentSchema from "../../ocf/schema/objects/transactions/adjustment/IssuerAuthorizedSharesAdjustment.schema.json" assert { type: "json" };
import stockClassAuthorizedSharesAdjustmentSchema from "../../ocf/schema/objects/transactions/adjustment/StockClassAuthorizedSharesAdjustment.schema.json" assert { type: "json" };
import stockCancellationSchema from "../../ocf/schema/objects/transactions/cancellation/StockCancellation.schema.json" assert { type: "json" };
import convertibleIssuanceSchema from "../../ocf/schema/objects/transactions/issuance/ConvertibleIssuance.schema.json" assert { type: "json" };
import equityCompensationIssuanceSchema from "../../ocf/schema/objects/transactions/issuance/EquityCompensationIssuance.schema.json" assert { type: "json" };
import stockIssuanceSchema from "../../ocf/schema/objects/transactions/issuance/StockIssuance.schema.json" assert { type: "json" };
import stockReissuanceSchema from "../../ocf/schema/objects/transactions/reissuance/StockReissuance.schema.json" assert { type: "json" };
import stockRepurchaseSchema from "../../ocf/schema/objects/transactions/repurchase/StockRepurchase.schema.json" assert { type: "json" };
import stockRetractionSchema from "../../ocf/schema/objects/transactions/retraction/StockRetraction.schema.json" assert { type: "json" };

import { convertAndAdjustIssuerAuthorizedSharesOnChain } from "../controllers/issuerController.js";
import { convertAndAdjustStockClassAuthorizedSharesOnchain } from "../controllers/stockClassController.js";
import { convertAndCreateAcceptanceStockOnchain } from "../controllers/transactions/acceptanceController.js";
import { convertAndCreateCancellationStockOnchain } from "../controllers/transactions/cancellationController.js";
import { convertAndCreateIssuanceStockOnchain } from "../controllers/transactions/issuanceController.js";
import { convertAndCreateReissuanceStockOnchain } from "../controllers/transactions/reissuanceController.js";
import { convertAndCreateRepurchaseStockOnchain } from "../controllers/transactions/repurchaseController.js";
import { convertAndCreateRetractionStockOnchain } from "../controllers/transactions/retractionController.js";
import { convertAndCreateTransferStockOnchain } from "../controllers/transactions/transferController.js";
import { createConvertibleIssuance, createEquityCompensationIssuance } from "../db/operations/create.js";

import { readConvertibleIssuanceByCustomId, readIssuerById, readStakeholderById, readStockIssuanceByCustomId } from "../db/operations/read.js";
import validateInputAgainstOCF from "../utils/validateInputAgainstSchema.js";
import { StockIssuance } from "../chain-operations/structs.js";
import { createFairmintData } from "../db/operations/create.js";
import { getJoiErrorMessage } from "../chain-operations/utils.js";
import { upsertFairmintData, upsertFairmintDataByCustomId } from "../db/operations/update.js";
import { SERIES_TYPE } from "../fairmint/enums.js";
import { reflectSeries } from "../fairmint/reflectSeries.js";
import get from "lodash/get";
import { API_URL } from "../chain-operations/utils.js";
import axios from "axios";

const transactions = Router();

transactions.post("/issuance/stock", async (req, res) => {
    const { contract } = req;
    const { issuerId, data } = req.body;

    try {
        const issuer = await readIssuerById(issuerId);

        const incomingStockIssuance = {
            id: uuid(), // for OCF Validation
            security_id: uuid(), // for OCF Validation
            date: new Date().toISOString().slice(0, 10), // for OCF Validation
            object_type: "TX_STOCK_ISSUANCE",
            ...data,
        };
        await validateInputAgainstOCF(incomingStockIssuance, stockIssuanceSchema);

        const stockExists = await readStockIssuanceByCustomId(data?.custom_id);
        if (stockExists._id) {
            return res.status(200).send({ stockIssuance: stockExists });
        }

        await convertAndCreateIssuanceStockOnchain(contract, incomingStockIssuance);

        res.status(200).send({ stockIssuance: incomingStockIssuance });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/issuance/stock-fairmint-reflection", async (req, res) => {
    const { contract } = req;
    const { issuerId, data } = req.body;

    /*
    We need new information to pass to Fairmint, like series name
    */
    const schema = Joi.object({
        issuerId: Joi.string().uuid().required(),
        data: Joi.object().required(),
        series_name: Joi.string().required(),
    });

    const { error, value: payload } = schema.validate(req.body);

    if (error) {
        return res.status(400).send({
            error: getJoiErrorMessage(error),
        });
    }

    try {
        await readIssuerById(issuerId);

        const incomingStockIssuance = {
            id: uuid(), // for OCF Validation
            security_id: uuid(), // for OCF Validation
            date: new Date().toISOString().slice(0, 10), // for OCF Validation
            object_type: "TX_STOCK_ISSUANCE",
            ...data,
        };

        await validateInputAgainstOCF(incomingStockIssuance, stockIssuanceSchema);

        await convertAndCreateIssuanceStockOnchain(contract, incomingStockIssuance);

        // warning, custom_id is required
        await upsertFairmintDataByCustomId(data.custom_id, {
            custom_id: data.custom_id,
            attributes: {
                series_name: payload.series_name,
            },
        });

        res.status(200).send({ stockIssuance: incomingStockIssuance });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/transfer/stock", async (req, res) => {
    const { contract } = req;
    const { issuerId, data } = req.body;

    try {
        await readIssuerById(issuerId);

        // @dev: Transfer Validation is not possible through schema because it validates that the transfer has occurred,at this stage it has not yet.

        await convertAndCreateTransferStockOnchain(contract, data);

        res.status(200).send("success");
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/cancel/stock", async (req, res) => {
    const { contract } = req;
    const { issuerId, data } = req.body;

    try {
        await readIssuerById(issuerId);

        const { stakeholderId, stockClassId } = data;
        console.log({ data });
        const incomingStockCancellation = {
            id: uuid(),
            security_id: uuid(),
            date: new Date().toISOString().slice(0, 10),
            object_type: "TX_STOCK_CANCELLATION",
            ...data,
        };
        delete incomingStockCancellation.stakeholderId;
        delete incomingStockCancellation.stockClassId;

        // NOTE: schema validation does not include stakeholder, stockClassId, however these properties are needed on to be passed on chain

        await validateInputAgainstOCF(incomingStockCancellation, stockCancellationSchema);

        await convertAndCreateCancellationStockOnchain(contract, {
            ...incomingStockCancellation,
            stakeholderId,
            stockClassId,
        });

        res.status(200).send({ stockCancellation: incomingStockCancellation });
    } catch (error) {
        console.error(`error: ${error.stack}`);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/retract/stock", async (req, res) => {
    const { contract } = req;
    const { data } = req.body;

    try {
        const { stakeholderId, stockClassId } = data;
        const incomingStockRetraction = {
            id: uuid(), // placeholder
            date: new Date().toISOString().slice(0, 10),
            object_type: "TX_STOCK_RETRACTION",
            ...data,
        };

        delete incomingStockRetraction.stakeholderId;
        delete incomingStockRetraction.stockClassId;

        // NOTE: schema validation does not include stakeholder, stockClassId, however these properties are needed on to be passed on chain
        await validateInputAgainstOCF(incomingStockRetraction, stockRetractionSchema);

        await convertAndCreateRetractionStockOnchain(contract, {
            ...incomingStockRetraction,
            stakeholderId,
            stockClassId,
        });

        res.status(200).send({ stockRetraction: incomingStockRetraction });
    } catch (error) {
        console.error(`error: ${error.stack}`);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/reissue/stock", async (req, res) => {
    const { contract } = req;
    const { data } = req.body;

    try {
        const { stakeholderId, stockClassId } = data;
        const incomingStockReissuance = {
            id: uuid(), // placeholder
            date: new Date().toISOString().slice(0, 10),
            object_type: "TX_STOCK_REISSUANCE",
            ...data,
        };

        delete incomingStockReissuance.stakeholderId;
        delete incomingStockReissuance.stockClassId;

        // NOTE: schema validation does not include stakeholder, stockClassId, however these properties are needed on to be passed on chain
        await validateInputAgainstOCF(incomingStockReissuance, stockReissuanceSchema);

        await convertAndCreateReissuanceStockOnchain(contract, {
            ...incomingStockReissuance,
            stakeholderId,
            stockClassId,
        });

        res.status(200).send({ stockReissuance: incomingStockReissuance });
    } catch (error) {
        console.error(`error: ${error.stack}`);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/repurchase/stock", async (req, res) => {
    const { contract } = req;
    const { data } = req.body;

    try {
        const { stakeholderId, stockClassId } = data;
        const incomingStockRepurchase = {
            id: uuid(), // placeholder
            date: new Date().toISOString().slice(0, 10),
            object_type: "TX_STOCK_REPURCHASE",
            ...data,
        };

        delete incomingStockRepurchase.stakeholderId;
        delete incomingStockRepurchase.stockClassId;

        // NOTE: schema validation does not include stakeholder, stockClassId, however these properties are needed on to be passed on chain
        await validateInputAgainstOCF(incomingStockRepurchase, stockRepurchaseSchema);

        await convertAndCreateRepurchaseStockOnchain(contract, {
            ...incomingStockRepurchase,
            stakeholderId,
            stockClassId,
        });

        res.status(200).send({ stockRepurchase: incomingStockRepurchase });
    } catch (error) {
        console.error(`error: ${error.stack}`);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/accept/stock", async (req, res) => {
    const { contract } = req;
    const { data } = req.body;

    try {
        const { stakeholderId, stockClassId } = data;
        const incomingStockAcceptance = {
            id: uuid(), // placeholder
            date: new Date().toISOString().slice(0, 10),
            object_type: "TX_STOCK_ACCEPTANCE",
            ...data,
        };

        delete incomingStockAcceptance.stakeholderId;
        delete incomingStockAcceptance.stockClassId;

        // NOTE: schema validation does not include stakeholder, stockClassId, however these properties are needed on to be passed on chain
        await validateInputAgainstOCF(incomingStockAcceptance, stockAcceptanceSchema);

        await convertAndCreateAcceptanceStockOnchain(contract, {
            ...incomingStockAcceptance,
            stakeholderId,
            stockClassId,
        });

        res.status(200).send({ stockAcceptance: incomingStockAcceptance });
    } catch (error) {
        console.error(`error: ${error.stack}`);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/adjust/issuer/authorized-shares", async (req, res) => {
    const { contract } = req;
    const { data } = req.body;

    try {
        // OCF doesn't allow extra fields in their validation
        const issuerAuthorizedSharesAdj = {
            id: uuid(),
            date: new Date().toISOString().slice(0, 10),
            object_type: "TX_ISSUER_AUTHORIZED_SHARES_ADJUSTMENT",
            ...data,
        };

        await validateInputAgainstOCF(issuerAuthorizedSharesAdj, issuerAuthorizedSharesAdjustmentSchema);

        await convertAndAdjustIssuerAuthorizedSharesOnChain(contract, issuerAuthorizedSharesAdj);

        res.status(200).send({ issuerAuthorizedSharesAdj });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/adjust/stock-class/authorized-shares", async (req, res) => {
    const { contract } = req;
    const { data } = req.body;

    try {
        const { stockClassId } = data;
        const stockClassAuthorizedSharesAdjustment = {
            id: uuid(), // placeholder
            date: new Date().toISOString().slice(0, 10),
            object_type: "TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT",
            ...data,
        };

        console.log("stockClassAuthorizedSharesAdjustment", stockClassAuthorizedSharesAdjustment);

        // NOTE: schema validation does not include stakeholder, stockClassId, however these properties are needed on to be passed on chain
        await validateInputAgainstOCF(stockClassAuthorizedSharesAdjustment, stockClassAuthorizedSharesAdjustmentSchema);

        await convertAndAdjustStockClassAuthorizedSharesOnchain(contract, {
            ...stockClassAuthorizedSharesAdjustment,
            stockClassId,
        });

        res.status(200).send({ stockClassAdjustment: stockClassAuthorizedSharesAdjustment });
    } catch (error) {
        console.error(`error: ${error.stack}`);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/issuance/equity-compensation", async (req, res) => {
    const { issuerId, data } = req.body;

    try {
        // ensuring issuer exists
        await readIssuerById(issuerId);

        const incomingEquityCompensationIssuance = {
            id: uuid(), // for OCF Validation
            security_id: uuid(), // for OCF Validation,
            date: new Date().toISOString().slice(0, 10), // for OCF Validation
            object_type: "TX_EQUITY_COMPENSATION_ISSUANCE",
            ...data,
        };
        //  await validateInputAgainstOCF(incomingEquityCompensationIssuance, equityCompensationIssuanceSchema);

        // save to DB
        const createdIssuance = await createEquityCompensationIssuance(incomingEquityCompensationIssuance);

        res.status(200).send({ equityCompensationIssuance: createdIssuance });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/issuance/equity-compensation-fairmint-reflection", async (req, res) => {
    const { issuerId, data } = req.body;

    const schema = Joi.object({
        custom_id: Joi.string().uuid().required(),
    });

    const { error, value: payload } = schema.validate(data);

    if (error) {
        req.status(400).send({
            error: getJoiErrorMessage(error),
        });
    }

    const { custom_id } = payload;
    try {
        // ensuring issuer exists
        await readIssuerById(issuerId);

        const incomingEquityCompensationIssuance = {
            id: uuid(), // for OCF Validation
            security_id: uuid(), // for OCF Validation,
            date: new Date().toISOString().slice(0, 10), // for OCF Validation
            object_type: "TX_EQUITY_COMPENSATION_ISSUANCE",
            ...data,
        };
        // TODO: fix ocf validation
        // await validateInputAgainstOCF(incomingEquityCompensationIssuance, equityCompensationIssuanceSchema);

        // save to DB
        const createdIssuance = await createEquityCompensationIssuance(incomingEquityCompensationIssuance);
        await createFairmintData({
            custom_id,
            attributes: {
                series_name,
            },
        });
        // Note: this will have it's own listener in the future to check with Fairmint Obj and sync with Fairmint accordingly

        res.status(200).send({ equityCompensationIssuance: createdIssuance });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/issuance/convertible", async (req, res) => {
    const { issuerId, data } = req.body;

    try {
        // ensuring issuer exists
        await readIssuerById(issuerId);

        const incomingConvertibleIssuance = {
            issuer: issuerId, // TEMPORARY: need to change when deployed on chain
            id: uuid(), // for OCF Validation
            security_id: uuid(), // for OCF Validation
            date: new Date().toISOString().slice(0, 10), // for OCF Validation
            object_type: "TX_CONVERTIBLE_ISSUANCE",
            ...data,
        };

        console.log("incomingConvertibleIssuance", incomingConvertibleIssuance);
        // await validateInputAgainstOCF(incomingConvertibleIssuance, convertibleIssuanceSchema);

        // check if it exists

        const convertibleExists = await readConvertibleIssuanceByCustomId(data?.custom_id);
        if (convertibleExists._id) {
            return res.status(200).send({ convertibleIssuance: convertibleExists });
        }

        // save to DB
        const createdIssuance = await createConvertibleIssuance(incomingConvertibleIssuance);

        res.status(200).send({ convertibleIssuance: createdIssuance });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/issuance/convertible-fairmint-reflection", async (req, res) => {
    const { issuerId, data } = req.body;
    const schema = Joi.object({
        series_name: Joi.string().required(),
        data: Joi.object().required(),
        issuerId: Joi.string().uuid().required(),
    });

    const { error, value: payload } = schema.validate(req.body);

    if (error) {
        res.status(400).send({
            error: getJoiErrorMessage(error),
        });
    }

    try {
        // ensuring issuer exists
        await readIssuerById(issuerId);

        const incomingConvertibleIssuance = {
            issuer: issuerId, // TEMPORARY: need to change when deployed on chain
            id: uuid(), // for OCF Validation
            security_id: uuid(), // for OCF Validation
            date: new Date().toISOString().slice(0, 10), // for OCF Validation
            object_type: "TX_CONVERTIBLE_ISSUANCE",
            ...data,
        };

        console.log("incomingConvertibleIssuance", incomingConvertibleIssuance);
        // await validateInputAgainstOCF(incomingConvertibleIssuance, convertibleIssuanceSchema); //TODO: fix me

        // check if the stakeholder exists
        const stakeholder = await readStakeholderById(incomingConvertibleIssuance.stakeholder_id);
        if (!stakeholder._id) {
            return res.status(400).send({ error: "Stakeholder not found" });
        }

        // save to DB
        const createdIssuance = await createConvertibleIssuance(incomingConvertibleIssuance);
        // TODO: change to create instead of upsert

        await upsertFairmintData(payload.data.custom_id, {
            attributes: {
                series_name: payload.series_name,
            },
        });

        const seriesCreated = await reflectSeries({
            issuerId,
            series_id: payload.data.custom_id,
            series_name: payload.series_name,
        });

        console.log("series created response ", seriesCreated);

        const body = {
            stakeholder_id: stakeholder._id,
            series_id: payload.data.custom_id,
            amount: get(incomingConvertibleIssuance, "investment_amount.amount", 0),
            series_type: SERIES_TYPE.FUNDRAISING,
        };
        console.log({ body });
        console.log("Reflecting Convertible Issuance into fairmint...");
        console.log("issuerId: ", issuerId);
        console.log("custom_id", payload.data.custom_id);
        const webHookUrl = `${API_URL}/ocp/reflectInvestment?portalId=${issuerId}`;
        const resp = await axios.post(webHookUrl, body);
        console.log("Successfully reflected Convertible Issuance on Fairmint");
        console.log("Fairmint response:", resp.data);
        // Note: this will have it's own listener in the future to check with Fairmint Obj and sync with Fairmint accordingly

        res.status(200).send({ convertibleIssuance: createdIssuance });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});
export default transactions;
