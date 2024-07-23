import axios from "axios";
import get from "lodash/get";
import { API_URL } from "./config";

export const checkStakeholderExistsOnFairmint = async ({ portal_id, stakeholder_id }) => {
    const webHookUrl = `${API_URL}/ocp/checkStakeholder?portal_id=${portal_id}&stakeholder_id=${stakeholder_id}`;
    console.log({ portal_id, stakeholder_id });

    try {
        console.log("Checking stakeholder status in Fairmint...");
        const resp = await axios.get(webHookUrl);

        return resp.data;
    } catch (error) {
        if (error.response) {
            const formattedError = {
                status: error.response.status,
                endpoint: webHookUrl,
                data: get(error, "response.data"),
            };
            throw Error(`Error checking stakeholder status in Fairmint: ${JSON.stringify(formattedError, null, 2)}`);
        } else {
            throw Error(`Error checking stakeholder status in Fairmint: ${error.message}`);
        }
    }
};
