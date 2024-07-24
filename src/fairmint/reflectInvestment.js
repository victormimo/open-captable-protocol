import axios from "axios";
import get from "lodash/get";
import { API_URL } from "./config";

export const reflectInvestment = async ({ id, issuerId, stakeholder_id, series_id, amount, number_of_shares = null }) => {
    const webHookUrl = `${API_URL}/ocp/reflectInvestment?portalId=${issuerId}`;
    try {
        console.log("Reflecting Investment fairmint...");
        console.log({ id, issuerId, stakeholder_id, series_id, amount });

        const resp = await axios.post(webHookUrl, {
            id,
            stakeholder_id,
            series_id,
            amount,
            number_of_shares,
        });

        return resp.data;
    } catch (error) {
        if (error.response) {
            const formattedError = {
                status: error.response.status,
                endpoint: webHookUrl,
                data: get(error, "response.data"),
            };
            throw Error(`Error reflecting Investment into Fairmint: ${JSON.stringify(formattedError, null, 2)}`);
        } else {
            throw Error(`Error reflecting Investment into Fairmint: ${error.message}`);
        }
    }
};
