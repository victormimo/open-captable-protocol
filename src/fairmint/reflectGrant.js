import axios from "axios";
import get from "lodash/get";
import { API_URL } from "./config";

export const reflectGrant = async ({ issuerId, stakeholder_id, series_id, token_amount, exercise_price, compensation_type }) => {
    const webHookUrl = `${API_URL}/ocp/reflectGrant?portalId=${issuerId}`;
    console.log({
        stakeholder_id,
        series_id,
        token_amount,
        exercise_price,
        compensation_type,
    });

    try {
        console.log("Reflecting Equity Compensation Issuance into fairmint...");
        const resp = await axios.post(webHookUrl, {
            stakeholder_id,
            series_id,
            token_amount,
            exercise_price,
            compensation_type,
        });

        return resp.data;
    } catch (error) {
        if (error.response) {
            const formattedError = {
                status: error.response.status,
                endpoint: webHookUrl,
                data: get(error, "response.data"),
            };
            throw Error(`Error reflecting Equity Compensation Issuance into Fairmint: ${JSON.stringify(formattedError, null, 2)}`);
        } else {
            throw Error(`Error reflecting Equity Compensation Issuance into Fairmint: ${error.message}`);
        }
    }
};
