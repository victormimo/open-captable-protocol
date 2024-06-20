import { Router } from "express";
import { v4 as uuid } from "uuid";
import {
    addWalletToStakeholder,
    convertAndReflectStakeholderOnchain,
    getStakeholderById,
    getTotalNumberOfStakeholders,
    removeWalletFromStakeholder,
} from "../controllers/stakeholderController.js"; // Importing the controller functions

import stakeholderSchema from "../../ocf/schema/objects/Stakeholder.schema.json" assert { type: "json" };
import { createStakeholder } from "../db/operations/create.js";
import { readIssuerById, readStakeholderById, readStakeholderByIssuerAssignedId } from "../db/operations/read.js";
import validateInputAgainstOCF from "../utils/validateInputAgainstSchema.js";
import Joi from "joi";
import { upsertFairmintObjectById } from "../db/operations/update.js";
import { getJoiErrorMessage } from "../chain-operations/utils.js";

const stakeholder = Router();

stakeholder.get("/", async (req, res) => {
    res.send(`Hello stakeholder!`);
});

stakeholder.get("/id/:id", async (req, res) => {
    const { contract } = req;
    const { id } = req.params;

    try {
        const { stakeholderId, type, role } = await getStakeholderById(contract, id);

        res.status(200).send({ stakeholderId, type, role });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

stakeholder.get("/total-number", async (req, res) => {
    const { contract } = req;

    try {
        const totalStakeholders = await getTotalNumberOfStakeholders(contract);
        res.status(200).send(totalStakeholders);
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

/// @dev: stakeholder is always created onchain, then to the DB
stakeholder.post("/create", async (req, res) => {
    const { contract } = req;
    const { data, issuerId } = req.body;

    try {
        const issuer = await readIssuerById(issuerId);

        // OCF doesn't allow extra fields in their validation
        const incomingStakeholderToValidate = {
            id: uuid(),
            object_type: "STAKEHOLDER",
            ...data,
        };

        const incomingStakeholderForDB = {
            ...incomingStakeholderToValidate,
            issuer: issuer._id,
        };

        await validateInputAgainstOCF(incomingStakeholderToValidate, stakeholderSchema);
        console.log(`Checking if Stakeholder id: ${data.issuer_assigned_id} exists`);
        const existingStakeholder = await readStakeholderByIssuerAssignedId(data.issuer_assigned_id);
        if (existingStakeholder && existingStakeholder._id) {
            return res.status(200).send({ stakeholder: existingStakeholder });
        }

        await convertAndReflectStakeholderOnchain(contract, incomingStakeholderForDB);

        const stakeholder = await createStakeholder(incomingStakeholderForDB);

        console.log("✅ | Stakeholder created offchain:", stakeholder);

        res.status(200).send({ stakeholder });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

/// @dev: stakeholder is always created onchain, then to the DB
// we're using `issuer_assigned_id` to link Fairmint objects to OCF
stakeholder.post("/create-fairmint-reflection", async (req, res) => {
    const { contract } = req;
    const { data, issuerId } = req.body;

    try {
        const issuer = await readIssuerById(issuerId);

        const schema = Joi.object({
            issuerId: Joi.string().required(),
            data: Joi.object().required(),
            series_name: Joi.string().required(),
            custom_id: Joi.string().required(),
        });

        const { error, value: payload } = schema.validate(req.body);

        if (error) {
            return res.status(400).send({
                error: getJoiErrorMessage(error),
            });
        }

        console.log("series_name", payload.series_name);
        console.log("issuer_assigned_id", payload.issuer_assigned_id);

        // OCF doesn't allow extra fields in their validation
        const incomingStakeholderToValidate = {
            id: uuid(),
            object_type: "STAKEHOLDER",
            ...data,
        };

        const incomingStakeholderForDB = {
            ...incomingStakeholderToValidate,
            issuer: issuer._id,
            issuer_assigned_id: payload.custom_id,
        };

        await validateInputAgainstOCF(incomingStakeholderToValidate, stakeholderSchema);

        console.log(`Checking if Stakeholder id: ${data.issuer_assigned_id} exists`);
        const existingStakeholder = await readStakeholderByIssuerAssignedId(data.issuer_assigned_id);

        if (existingStakeholder && existingStakeholder._id) {
            return res.status(200).send({ stakeholder: existingStakeholder });
        }

        await convertAndReflectStakeholderOnchain(contract, incomingStakeholderForDB);
        await upsertFairmintObjectById(payload.custom_id, {
            attributes: {
                series_name: payload.series_name,
            },
        });

        const stakeholder = await createStakeholder(incomingStakeholderForDB);

        console.log("✅ | Stakeholder created offchain:", stakeholder);

        res.status(200).send({ stakeholder });
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});
stakeholder.post("/add-wallet", async (req, res) => {
    const { contract } = req;
    const { id, wallet } = req.body;

    try {
        // TODO: handle wallet already exists: maybe add a getter wallet from smart contract?
        await addWalletToStakeholder(contract, id, wallet);
        res.status(200).send("Success");
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

stakeholder.post("/remove-wallet", async (req, res) => {
    const { contract } = req;
    const { id, wallet } = req.body;

    try {
        await removeWalletFromStakeholder(contract, id, wallet);
        res.status(200).send("Success");
    } catch (error) {
        console.error(error);
        res.status(500).send(`${error}`);
    }
});

export default stakeholder;
