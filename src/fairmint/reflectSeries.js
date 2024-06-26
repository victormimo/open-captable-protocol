import { API_URL } from "../chain-operations/utils";
import axios from "axios";
import get from "lodash/get";

export const reflectSeries = async ({ issuerId, series_id, series_name, stock_class_id, stock_plan_id, series_type }) => {
    console.log("Reflecting Series in fairmint...");
    console.log({ issuerId, series_id, series_name, stock_class_id, stock_plan_id, series_type });

    try {
        const reflectSeriesResponse = await axios.post(`${API_URL}/ocp/reflectSeries?portalId=${issuerId}`, {
            series_id,
            series_name,
            stock_class_id,
            stock_plan_id,
            series_type,
        });

        console.log("Successfully reflected Series into Fairmint");

        return reflectSeriesResponse.data;
    } catch (error) {
        if (error.response) {
            const formatedError = {
                status: error.response.status,
                endpoint: `${API_URL}/ocp/reflectSeries?portalId=${issuerId}`,
                data: get(error, "response.data"),
            };
            throw Error(`Error reflecting Series into Fairmint:  ${JSON.stringify(formatedError, null, 2)}`);
        } else {
            console.error("Error reflecting Series into Fairmint:", error.message);
            throw Error(`Error reflecting Series into Fairmint: ${error.message}`);
        }
    }
};
