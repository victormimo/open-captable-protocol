import { Router } from "express";
import deployCapTable from "../chain-operations/deployCapTable.js";
import { updateIssuerById } from "../db/operations/update.js";
import seedDB, { verifyManifest } from "../db/scripts/seed.js";
import { convertUUIDToBytes16 } from "../utils/convertUUID.js";
import processManifest from "../utils/processManifest.js";
import { verifyCapTable } from "../rxjs/index.js";

const router = Router();

router.get("/", async (req, res) => {
    res.status(200).send(`Welcome to the future of Transfer Agents 💸`);
});

router.post("/mint-cap-table", async (req, res) => {
    try {
        const manifest = await processManifest(req);

        const issuer = await seedDB(manifest);

        const issuerIdBytes16 = convertUUIDToBytes16(issuer._id);
        const { address } = await deployCapTable(issuerIdBytes16, issuer.legal_name, issuer.initial_shares_authorized);

        const savedIssuerWithDeployedTo = await updateIssuerById(issuer._id, { deployed_to: address });
        res.status(200).send({ issuer: savedIssuerWithDeployedTo });
    } catch (error) {
        console.error(error);
        res.status(500).send({ error });
    }
});

router.post("/verify-cap-table", async (req, res) => {
    try {
        const manifest = await processManifest(req);
        const data = await verifyManifest(manifest);
        const result = await verifyCapTable(data);
        if (result.valid) {
            res.status(200).send({ valid: true });
        } else {
            res.status(200).send({ valid: false, errors: result.errors });
        }
    } catch (error) {
        console.error({ error });
        res.status(500).send({ error: String(error), valid: false });
    }
});

export default router;
