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
import { readIssuerById, readStakeholderById, readStakeholderByIssuerAssignedId, getAllStakeholdersByIssuerId } from "../db/operations/read.js";
import validateInputAgainstOCF from "../utils/validateInputAgainstSchema.js";
import { checkStakeholderExistsOnFairmint } from "../fairmint/checkStakeholder.js";
import { updateStakeholderById } from "../db/operations/update.js";
import { updateReflectedStakeholder } from "../fairmint/updateReflectStakeholder.js";
import { reflectStakeholder } from "../fairmint/reflectStakeholder.js";

const stakeholder = Router();

stakeholder.get("/", async (req, res) => {
    res.send(`Hello stakeholder!`);
});

// offchain
stakeholder.get("/fetch-offchain/id/:id", async (req, res) => {
    const { id } = req.params;

    if (!id) return res.status(400).send(`Missing id`);

    console.log("fetch offchain stakeholder with ID ");

    try {
        const stakeholder = await readStakeholderById(id);

        return res.status(200).send({ stakeholder });
    } catch (error) {
        console.error(error);
        return res.status(500).send(`${error}`);
    }
});

// onchain
stakeholder.get("/id/:id", async (req, res) => {
    const { contract } = req;
    const { id } = req.params;

    try {
        const { stakeholderId, type, role } = await getStakeholderById(contract, id);

        return res.status(200).send({ stakeholderId, type, role });
    } catch (error) {
        console.error(error);
        return res.status(500).send(`${error}`);
    }
});

stakeholder.get("/fetch-all", async (req, res) => {
    const { issuerId } = req.body;
    console.log("calling fetch all issuers");

    try {
        const stakeholders = await getAllStakeholdersByIssuerId(issuerId);

        console.log("stakeholders", stakeholder);

        return res.status(200).send({ stakeholders });
    } catch (error) {
        console.error(error);
        return res.status(500).send(`${error}`);
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
        const existingStakeholder = await readStakeholderByIssuerAssignedId(incomingStakeholderToValidate.id);

        if (existingStakeholder && existingStakeholder._id) {
            return res.status(200).send({
                message: "Stakeholder already created",
                stakeholder: existingStakeholder,
            });
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
stakeholder.post("/create-fairmint-reflection", async (req, res) => {
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
        const stakeholder_id = incomingStakeholderToValidate.id;
        const foundStakeholder = await readStakeholderById(stakeholder_id);

        if (foundStakeholder && foundStakeholder._id) {
            await reflectStakeholder({ issuerId, stakeholder: foundStakeholder });
            return res.status(200).send({
                message: `Stakeholder already found`,
                stakeholder: foundStakeholder,
            });
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
stakeholder.post("/update-fairmint-reflection", async (req, res) => {
    const { data, issuerId } = req.body;

    try {
        const issuer = await readIssuerById(issuerId);

        // OCF doesn't allow extra fields in their validation
        const incomingStakeholderToValidate = {
            object_type: "STAKEHOLDER",
            ...data,
        };

        const incomingStakeholderForDB = {
            ...incomingStakeholderToValidate,
            issuer: issuer._id,
        };

        await validateInputAgainstOCF(incomingStakeholderToValidate, stakeholderSchema);
        const stakeholder_id = incomingStakeholderToValidate.id;
        const foundStakeholder = await readStakeholderById(stakeholder_id);

        if (!foundStakeholder || !foundStakeholder._id) {
            return res.status(404).send(`Stakeholder not found`);
        }

        await checkStakeholderExistsOnFairmint({ portal_id: issuerId, stakeholder_id });

        const updatedStakeholder = await updateStakeholderById(stakeholder_id, incomingStakeholderForDB);

        await updateReflectedStakeholder({
            issuerId: issuerId,
            stakeholder: updatedStakeholder,
        });

        console.log("✅ | Stakeholder updated offchain:", updatedStakeholder);

        res.status(200).send({ stakeholder: updatedStakeholder });
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
