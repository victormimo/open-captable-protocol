import { Router } from "express";
import { v4 as uuid } from "uuid";
import Joi from "joi";

import stockAcceptanceSchema from "../../ocf/schema/objects/transactions/acceptance/StockAcceptance.schema.json";
import issuerAuthorizedSharesAdjustmentSchema from "../../ocf/schema/objects/transactions/adjustment/IssuerAuthorizedSharesAdjustment.schema.json";
import stockClassAuthorizedSharesAdjustmentSchema from "../../ocf/schema/objects/transactions/adjustment/StockClassAuthorizedSharesAdjustment.schema.json";
import stockCancellationSchema from "../../ocf/schema/objects/transactions/cancellation/StockCancellation.schema.json";
import warrantIssuanceSchema from "../../ocf/schema/objects/transactions/issuance/WarrantIssuance.schema.json";
import convertibleIssuanceSchema from "../../ocf/schema/objects/transactions/issuance/ConvertibleIssuance.schema.json";
import equityCompensationIssuanceSchema from "../../ocf/schema/objects/transactions/issuance/EquityCompensationIssuance.schema.json";
import stockIssuanceSchema from "../../ocf/schema/objects/transactions/issuance/StockIssuance.schema.json";
import stockReissuanceSchema from "../../ocf/schema/objects/transactions/reissuance/StockReissuance.schema.json";
import stockRepurchaseSchema from "../../ocf/schema/objects/transactions/repurchase/StockRepurchase.schema.json";
import stockRetractionSchema from "../../ocf/schema/objects/transactions/retraction/StockRetraction.schema.json";
import equityCompensationExerciseSchema from "../../ocf/schema/objects/transactions/exercise/EquityCompensationExercise.schema.json";
import stockPlanPoolAdjustmentSchema from "../../ocf/schema/objects/transactions/adjustment/StockPlanPoolAdjustment.schema.json";

import { convertAndAdjustIssuerAuthorizedSharesOnChain } from "../controllers/issuerController.js";
import { convertAndAdjustStockClassAuthorizedSharesOnchain } from "../controllers/stockClassController.js";
import { convertAndCreateAcceptanceStockOnchain } from "../controllers/transactions/acceptanceController.js";
import { convertAndCreateCancellationStockOnchain } from "../controllers/transactions/cancellationController.js";
import { convertAndCreateIssuanceStockOnchain } from "../controllers/transactions/issuanceController.js";
import { convertAndCreateReissuanceStockOnchain } from "../controllers/transactions/reissuanceController.js";
import { convertAndCreateRepurchaseStockOnchain } from "../controllers/transactions/repurchaseController.js";
import { convertAndCreateRetractionStockOnchain } from "../controllers/transactions/retractionController.js";
import { convertAndCreateTransferStockOnchain } from "../controllers/transactions/transferController.js";
import {
    createConvertibleIssuance,
    createEquityCompensationIssuance,
    createWarrantIssuance,
    createEquityCompensationExercise,
} from "../db/operations/create.js";
import StockIssuance from "../db/objects/transactions/issuance/StockIssuance.js";
import { reflectGrantExercise } from "../fairmint/reflectGrantExercise.js";

import {
    readStockPlanById,
    readConvertibleIssuanceById,
    readIssuerById,
    readStakeholderById,
    readStockClassById,
    readStockIssuanceByCustomId,
} from "../db/operations/read.js";
import { createStockPlanPoolAdjustment } from "../db/operations/create.js";
import validateInputAgainstOCF from "../utils/validateInputAgainstSchema.js";
import { getJoiErrorMessage } from "../chain-operations/utils.js";
import { upsertFairmintDataBySeriesId } from "../db/operations/update.js";
import { SERIES_TYPE } from "../fairmint/enums.js";
import { reflectSeries } from "../fairmint/reflectSeries.js";
import get from "lodash/get";
import { reflectInvestment } from "../fairmint/reflectInvestment.js";
import { reflectGrant } from "../fairmint/reflectGrant.js";
import { checkStakeholderExistsOnFairmint } from "../fairmint/checkStakeholder.js";

const transactions = Router();

transactions.post("/issuance/stock", async (req, res) => {
    const { contract } = req;
    const { issuerId, data } = req.body;

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

transactions.post("/issuance/Stock-fairmint-reflection", async (req, res) => {
    const { contract } = req;
    const { issuerId } = req.body;

    /*
    We need new information to pass to Fairmint, like series name
    */
    const schema = Joi.object({
        issuerId: Joi.string().uuid().required(),
        series_id: Joi.string().uuid().required(),
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
            ...payload.data,
        };

        await validateInputAgainstOCF(incomingStockIssuance, stockIssuanceSchema);

        const stakeholder = await readStakeholderById(incomingStockIssuance.stakeholder_id);
        const stockClass = await readStockClassById(incomingStockIssuance.stock_class_id);
        incomingStockIssuance.comments = [
            `old-security-id=${incomingStockIssuance.security_id}`,
            `fairmintData=${JSON.stringify({ series_id: payload.series_id, date: payload.data.date })}`,
            ...(incomingStockIssuance.comments || []),
        ];

        // check if the stakeholder exists on OCP
        if (!stakeholder || !stakeholder._id) {
            return res.status(404).send({ error: "Stakeholder not found on OCP" });
        }

        if (!stockClass || !stockClass._id) {
            return res.status(404).send({ error: "Stock class not found on OCP" });
        }

        await checkStakeholderExistsOnFairmint({ stakeholder_id: stakeholder._id, portal_id: issuerId });

        await convertAndCreateIssuanceStockOnchain(contract, incomingStockIssuance);

        await upsertFairmintDataBySeriesId(payload.series_id, {
            series_id: payload.series_id,
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
    const { data, issuerId } = req.body;

    try {
        await readIssuerById(issuerId);
        // OCF doesn't allow extra fields in their validation
        const issuerAuthorizedSharesAdj = {
            id: uuid(),
            date: new Date().toISOString().slice(0, 10),
            object_type: "TX_ISSUER_AUTHORIZED_SHARES_ADJUSTMENT",
            issuer_id: issuerId,
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
    const { data, issuerId } = req.body;

    try {
        await readIssuerById(issuerId);
        const stockClassAuthorizedSharesAdjustment = {
            id: uuid(), // placeholder
            date: new Date().toISOString().slice(0, 10),
            object_type: "TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT",
            ...data,
        };

        console.log("stockClassAuthorizedSharesAdjustment", stockClassAuthorizedSharesAdjustment);

        // NOTE: schema validation does not include stakeholder, stockClassId, however these properties are needed on to be passed on chain
        await validateInputAgainstOCF(stockClassAuthorizedSharesAdjustment, stockClassAuthorizedSharesAdjustmentSchema);

        const stockClass = await readStockClassById(stockClassAuthorizedSharesAdjustment.stock_class_id);

        if (!stockClass || !stockClass._id) {
            return res.status(404).send({ error: "Stock class not found on OCP" });
        }

        await convertAndAdjustStockClassAuthorizedSharesOnchain(contract, {
            ...stockClassAuthorizedSharesAdjustment,
        });

        res.status(200).send({ stockClassAdjustment: stockClassAuthorizedSharesAdjustment });
    } catch (error) {
        console.error(`error: ${error.stack}`);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/adjust/stock-plan-pool", async (req, res) => {
    // const { contract } = req;
    const { data, issuerId } = req.body;

    try {
        await readIssuerById(issuerId);
        const stockPlanPoolAdjustment = {
            id: uuid(), // placeholder
            date: new Date().toISOString().slice(0, 10),
            object_type: "TX_STOCK_PLAN_POOL_ADJUSTMENT",
            ...data,
        };

        console.log("stockPlanPoolAdjustment", stockPlanPoolAdjustment);

        // NOTE: schema validation does not include stakeholder, stockClassId, however these properties are needed on to be passed on chain
        await validateInputAgainstOCF(stockPlanPoolAdjustment, stockPlanPoolAdjustmentSchema);

        const stockPlan = await readStockPlanById(stockPlanPoolAdjustment.stock_plan_id);

        if (!stockPlan || !stockPlan._id) {
            return res.status(404).send({ error: "Stock plan not found on OCP" });
        }

        // TODO: implement Chain OP

        await createStockPlanPoolAdjustment({
            ...stockPlanPoolAdjustment,
            issuer: issuerId,
        });

        res.status(200).send({ stockPlanAdjustment: stockPlanPoolAdjustment });
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

        await validateInputAgainstOCF(incomingEquityCompensationIssuance, equityCompensationIssuanceSchema);

        const stock_class_id = get(incomingEquityCompensationIssuance, "stock_class_id");
        if (!stock_class_id) {
            return res.status(400).send({ error: "Stock class id is required" });
        }

        const stockClass = await readStockClassById(stock_class_id);
        if (!stockClass || !stockClass._id) {
            return res.status(404).send({ error: "Stock class not found on OCP" });
        }

        // save to DB
        const createdIssuance = await createEquityCompensationIssuance({ ...incomingEquityCompensationIssuance, issuer: issuerId });

        res.status(200).send({ equityCompensationIssuance: createdIssuance });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/issuance/equity-compensation-fairmint-reflection", async (req, res) => {
    const { issuerId, data } = req.body;
    const schema = Joi.object({
        issuerId: Joi.string().uuid().required(),
        series_id: Joi.string().uuid().required(),
        series_name: Joi.string().required(),
        data: Joi.object().required(),
    });

    const { error, value: payload } = schema.validate(req.body);

    if (error) {
        return res.status(400).send({
            error: getJoiErrorMessage(error),
        });
    }
    try {
        // ensuring issuer exists
        await readIssuerById(issuerId);

        const incomingEquityCompensationIssuance = {
            id: uuid(), // for OCF Validation
            security_id: uuid(), // for OCF Validation,
            date: new Date().toISOString().slice(0, 10), // for OCF Validation, it gets overriden if date exists in data
            object_type: "TX_EQUITY_COMPENSATION_ISSUANCE",
            ...data,
        };

        await validateInputAgainstOCF(incomingEquityCompensationIssuance, equityCompensationIssuanceSchema);

        const stock_class_id = get(incomingEquityCompensationIssuance, "stock_class_id");

        if (!stock_class_id) {
            return res.status(400).send({ error: "Stock class id is required" });
        }

        const stockClass = await readStockClassById(stock_class_id);
        if (!stockClass || !stockClass._id) {
            return res.status(404).send({ error: "Stock class not found on OCP" });
        }

        const stakeholder = await readStakeholderById(incomingEquityCompensationIssuance.stakeholder_id);

        // check if the stakeholder exists on OCP
        if (!stakeholder || !stakeholder._id) {
            return res.status(404).send({ error: "Stakeholder not found on OCP" });
        }

        await checkStakeholderExistsOnFairmint({
            stakeholder_id: stakeholder._id,
            portal_id: issuerId,
        });

        // save to DB
        const createdIssuance = await createEquityCompensationIssuance({
            ...incomingEquityCompensationIssuance,
            issuer: issuerId,
        });

        const seriesCreated = await reflectSeries({
            issuerId,
            series_id: payload.series_id,
            series_name: payload.series_name,
            stock_class_id: get(incomingEquityCompensationIssuance, "stock_class_id"),
            stock_plan_id: get(incomingEquityCompensationIssuance, "stock_plan_id"),
            series_type: SERIES_TYPE.GRANT,
            date: get(incomingEquityCompensationIssuance, "date", new Date().toISOString().split("T")[0]),
        });

        console.log("series reflected response ", seriesCreated);

        const reflectGrantResponse = await reflectGrant({
            security_id: get(incomingEquityCompensationIssuance, "security_id"),
            issuerId,
            stakeholder_id: stakeholder._id,
            series_id: payload.series_id,
            quantity: get(incomingEquityCompensationIssuance, "quantity", "0"),
            exercise_price: get(incomingEquityCompensationIssuance, "exercise_price.amount", "0"),
            compensation_type: get(incomingEquityCompensationIssuance, "compensation_type", ""),
            option_grant_type: get(incomingEquityCompensationIssuance, "option_grant_type", ""),
            security_law_exemptions: get(incomingEquityCompensationIssuance, "security_law_exemptions", []),
            expiration_date: get(incomingEquityCompensationIssuance, "expiration_date", null),
            termination_exercise_windows: get(incomingEquityCompensationIssuance, "termination_exercise_windows", []),
            vestings: get(incomingEquityCompensationIssuance, "vestings", []),
            expiration_date: get(incomingEquityCompensationIssuance, "expiration_date", null),
            date: get(incomingEquityCompensationIssuance, "date", new Date().toISOString().split("T")[0]),
            vesting_terms_id: get(incomingEquityCompensationIssuance, "vesting_terms_id", null),
        });

        console.log("Reflected Grant Response:", reflectGrantResponse);

        res.status(200).send({ equityCompensationIssuance: createdIssuance });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/exercise/equity-compensation-fairmint-reflection", async (req, res) => {
    const { data, issuerId } = req.body; // issuer id is checked in the middleware

    try {
        const incomingEquityCompensationExercise = {
            id: uuid(), // for OCF Validation, it gets overriden if id exists in data
            security_id: uuid(), // for OCF Validation, it gets overriden if security_id exists in data
            date: new Date().toISOString().slice(0, 10), // for OCF Validation, it gets overriden if date exists in data
            object_type: "TX_EQUITY_COMPENSATION_EXERCISE",
            ...data,
        };

        await validateInputAgainstOCF(incomingEquityCompensationExercise, equityCompensationExerciseSchema);
        // Query DB for existing exercise with old security_id on StockIssuance
        const oldSecurityIds = get(incomingEquityCompensationExercise, "resulting_security_ids", []);
        const newSecurityIds = [];

        for (const oldSecurityId of oldSecurityIds) {
            console.log(`Checking DB for old-security-id=${oldSecurityId}`);
            const stockIssuance = await StockIssuance.findOne({ comments: `old-security-id=${oldSecurityId}` });
            if (!stockIssuance) {
                return res.status(404).send({ error: `Stock Issuance not found on OCP for old-security-id=${oldSecurityId}` });
            }
            newSecurityIds.push(stockIssuance.security_id);
        }

        // replace old security_ids with new security_ids
        incomingEquityCompensationExercise.resulting_security_ids = newSecurityIds;

        const createdExercise = await createEquityCompensationExercise({
            ...incomingEquityCompensationExercise,
            issuer: issuerId,
        });

        // Reflect exercise on fairmint
        const reflectedExercise = await reflectGrantExercise({
            security_id: incomingEquityCompensationExercise.security_id,
            resulting_security_ids: incomingEquityCompensationExercise.resulting_security_ids,
            issuerId,
            quantity: incomingEquityCompensationExercise.quantity,
            date: incomingEquityCompensationExercise.date,
        });

        console.log("Reflected Exercise Response:", reflectedExercise);

        res.status(200).send({ equityCompensationExercise: createdExercise });
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
            id: uuid(), // for OCF Validation
            security_id: uuid(), // for OCF Validation
            date: new Date().toISOString().slice(0, 10), // for OCF Validation
            object_type: "TX_CONVERTIBLE_ISSUANCE",
            ...data,
        };

        console.log("incomingConvertibleIssuance", incomingConvertibleIssuance);
        await validateInputAgainstOCF(incomingConvertibleIssuance, convertibleIssuanceSchema);

        // check if it exists
        const convertibleExists = await readConvertibleIssuanceById(incomingConvertibleIssuance?.id);
        if (convertibleExists && convertibleExists._id) {
            return res.status(200).send({
                message: "Convertible Issuance Already Exists",
                convertibleIssuance: convertibleExists,
            });
        }

        // save to DB
        const createdIssuance = await createConvertibleIssuance({ ...incomingConvertibleIssuance, issuer: issuerId });

        res.status(200).send({ convertibleIssuance: createdIssuance });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/issuance/convertible-fairmint-reflection", async (req, res) => {
    const { issuerId, data } = req.body;
    const schema = Joi.object({
        series_id: Joi.string().uuid().required(),
        series_name: Joi.string().required(),
        data: Joi.object().required(),
        issuerId: Joi.string().uuid().required(),
    });

    const { error, value: payload } = schema.validate(req.body);

    if (error) {
        return res.status(400).send({
            error: getJoiErrorMessage(error),
        });
    }

    try {
        // ensuring issuer exists
        await readIssuerById(issuerId);

        const incomingConvertibleIssuance = {
            id: uuid(), // for OCF Validation
            security_id: uuid(), // for OCF Validation
            date: new Date().toISOString().slice(0, 10), // for OCF Validation
            object_type: "TX_CONVERTIBLE_ISSUANCE",
            ...data,
        };

        console.log("incomingConvertibleIssuance", incomingConvertibleIssuance);
        await validateInputAgainstOCF(incomingConvertibleIssuance, convertibleIssuanceSchema);

        // check if the stakeholder exists
        const stakeholder = await readStakeholderById(incomingConvertibleIssuance.stakeholder_id);
        if (!stakeholder || !stakeholder._id) {
            return res.status(400).send({ error: "Stakeholder not found on OCP" });
        }

        // check stakeholder exists on fairmint
        await checkStakeholderExistsOnFairmint({
            stakeholder_id: stakeholder._id,
            portal_id: issuerId,
        });

        // check if it exists
        const convertibleExists = await readConvertibleIssuanceById(incomingConvertibleIssuance?.id);
        if (convertibleExists && convertibleExists._id) {
            return res.status(200).send({
                message: "Convertible Issuance Already Exists",
                convertibleIssuance: convertibleExists,
            });
        }
        // save to DB
        const createdIssuance = await createConvertibleIssuance({
            ...incomingConvertibleIssuance,
            issuer: issuerId,
        });

        const seriesCreated = await reflectSeries({
            issuerId,
            series_id: payload.series_id,
            series_name: payload.series_name,
            series_type: SERIES_TYPE.FUNDRAISING,
            date: get(incomingConvertibleIssuance, "date", new Date().toISOString().split("T")[0]),
        });

        console.log("series reflected response ", seriesCreated);

        const reflectInvestmentResponse = await reflectInvestment({
            security_id: get(incomingConvertibleIssuance, "security_id"),
            issuerId,
            stakeholder_id: stakeholder._id,
            series_id: payload.series_id,
            amount: get(incomingConvertibleIssuance, "investment_amount.amount", 0),
            date: get(incomingConvertibleIssuance, "date", new Date().toISOString().split("T")[0]),
        });

        console.log("Reflected Investment Response:", reflectInvestmentResponse);
        // Note: this will have it's own listener in the future to check with Fairmint Obj and sync with Fairmint accordingly

        res.status(200).send({ convertibleIssuance: createdIssuance });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/issuance/warrant", async (req, res) => {
    const { issuerId, data } = req.body;

    try {
        // ensuring issuer exists
        await readIssuerById(issuerId);

        const incomingWarrantIssuance = {
            id: uuid(), // for OCF Validation
            security_id: uuid(), // for OCF Validation
            date: new Date().toISOString().slice(0, 10), // for OCF Validation
            object_type: "TX_WARRANT_ISSUANCE",
            ...data,
        };

        console.log("incomingWarrantIssuance", incomingWarrantIssuance);
        await validateInputAgainstOCF(incomingWarrantIssuance, warrantIssuanceSchema);

        // save to DB
        const createdIssuance = await createWarrantIssuance({ ...incomingWarrantIssuance, issuer: issuerId });

        res.status(200).send({ warrantIssuance: createdIssuance });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

transactions.post("/issuance/warrant-fairmint-reflection", async (req, res) => {
    const { issuerId, data } = req.body;
    const schema = Joi.object({
        series_id: Joi.string().uuid().required(),
        series_name: Joi.string().required(),
        data: Joi.object().required(),
        issuerId: Joi.string().uuid().required(),
    });

    const { error, value: payload } = schema.validate(req.body);

    if (error) {
        return res.status(400).send({
            error: getJoiErrorMessage(error),
        });
    }

    try {
        // ensuring issuer exists
        await readIssuerById(issuerId);

        const incomingWarrantIssuance = {
            id: uuid(), // for OCF Validation
            security_id: uuid(), // for OCF Validation
            date: new Date().toISOString().slice(0, 10), // for OCF Validation
            object_type: "TX_WARRANT_ISSUANCE",
            ...data,
        };

        console.log("incomingWarrantIssuance", incomingWarrantIssuance);
        await validateInputAgainstOCF(incomingWarrantIssuance, warrantIssuanceSchema);

        // check if the stakeholder exists
        const stakeholder = await readStakeholderById(incomingWarrantIssuance.stakeholder_id);
        if (!stakeholder || !stakeholder._id) {
            return res.status(400).send({ error: "Stakeholder not found on OCP" });
        }

        // check stakeholder exists on fairmint
        await checkStakeholderExistsOnFairmint({
            stakeholder_id: stakeholder._id,
            portal_id: issuerId,
        });

        // save to DB
        const createdIssuance = await createWarrantIssuance({ ...incomingWarrantIssuance, issuer: issuerId });

        const seriesCreated = await reflectSeries({
            issuerId,
            series_id: payload.series_id,
            series_name: payload.series_name,
            series_type: SERIES_TYPE.WARRANT,
            date: get(incomingWarrantIssuance, "date", new Date().toISOString().split("T")[0]),
        });

        console.log("series reflected response ", seriesCreated);
        const { purchase_price } = incomingWarrantIssuance;
        const dollarAmount = Number(get(purchase_price, "amount", 1));

        const reflectInvestmentResponse = await reflectInvestment({
            security_id: incomingWarrantIssuance.security_id,
            issuerId,
            stakeholder_id: stakeholder._id,
            series_id: payload.series_id,
            amount: dollarAmount,
            date: get(incomingWarrantIssuance, "date", new Date().toISOString().split("T")[0]),
        });

        console.log("Reflected Investment Response:", reflectInvestmentResponse);
        // Note: this will have it's own listener in the future to check with Fairmint Obj and sync with Fairmint accordingly

        res.status(200).send({ warrantIssuance: createdIssuance });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

export default transactions;
