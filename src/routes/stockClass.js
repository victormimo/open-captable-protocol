import { Router } from "express";
import { v4 as uuid } from "uuid";
import stockClassSchema from "../../ocf/schema/objects/StockClass.schema.json" assert { type: "json" };
import { convertAndReflectStockClassOnchain, getStockClassById, getTotalNumberOfStockClasses } from "../controllers/stockClassController.js";
import { createStockClass } from "../db/operations/create.js";
import { readIssuerById, readStockClassById } from "../db/operations/read.js";
import validateInputAgainstOCF from "../utils/validateInputAgainstSchema.js";
import { getJoiErrorMessage } from "../chain-operations/utils.js";
import Joi from "joi";
import { createFairmintData } from "../db/operations/create.js";

const stockClass = Router();

stockClass.get("/", async (req, res) => {
    res.send(`Hello Stock Class!`);
});

stockClass.get("/id/:id", async (req, res) => {
    const { contract } = req;
    const { id } = req.params;

    try {
        const { stockClassId, classType, pricePerShare, initialSharesAuthorized } = await getStockClassById(contract, id);

        res.status(200).send({ stockClassId, classType, pricePerShare, initialSharesAuthorized });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

stockClass.get("/total-number", async (req, res) => {
    const { contract } = req;
    try {
        const totalStockClasses = await getTotalNumberOfStockClasses(contract);
        res.status(200).send(totalStockClasses);
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

/// @dev: stock class is always created onchain, then to the DB
stockClass.post("/create", async (req, res) => {
    const { contract } = req;
    const { data, issuerId } = req.body;

    try {
        const issuer = await readIssuerById(issuerId);

        // OCF doesn't allow extra fields in their validation
        const incomingStockClassToValidate = {
            id: uuid(),
            object_type: "STOCK_CLASS",
            ...data,
        };

        const incomingStockClassForDB = {
            ...incomingStockClassToValidate,
            issuer: issuer._id,
        };
        await validateInputAgainstOCF(incomingStockClassToValidate, stockClassSchema);
        console.log("stockClassId", data.id);
        const exists = await readStockClassById(data.id);
        if (exists && exists._id) {
            return res.status(200).send({ stockClass: exists });
        }

        await convertAndReflectStockClassOnchain(contract, incomingStockClassForDB);

        const stockClass = await createStockClass(incomingStockClassForDB);

        console.log("✅ | Stock Class created offchain:", stockClass);

        res.status(200).send({ stockClass });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

// @dev use `id` to save the fairmint data
stockClass.post("/create-fairmint-reflection", async (req, res) => {
    try {
        const { contract } = req;
        const { custom_id, data, issuerId } = req.body;

        const issuer = await readIssuerById(issuerId);

        // OCF doesn't allow extra fields in their validation
        const incomingStockClassToValidate = {
            id: uuid(),
            object_type: "STOCK_CLASS",
            ...data,
        };

        const incomingStockClassForDB = {
            ...incomingStockClassToValidate,
            issuer: issuer._id,
        };
        await validateInputAgainstOCF(incomingStockClassToValidate, stockClassSchema);

        console.log("stockClassId", data.id);
        const exists = await readStockClassById(data.id);

        if (exists && exists._id) {
            return res.status(409).send({ stockClass: exists });
        }

        await convertAndReflectStockClassOnchain(contract, incomingStockClassForDB);

        const stockClass = await createStockClass(incomingStockClassForDB);
        await createFairmintData({
            custom_id,
            attributes: {
                stock_class_id: stockClass._id,
            },
        });

        console.log("✅ | Stock Class created offchain:", stockClass);

        res.status(200).send({ stockClass });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

export default stockClass;
