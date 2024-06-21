import { API_URL } from "../chain-operations/utils";

export const reflectSeries = async ({ issuerId, custom_id, series_name, stock_class_id, stock_plan_id }) => {
    console.log("Reflecting Series in fairmint...");

    const reflectSeriesResponse = await axios.post(`${API_URL}/ocp/reflectSeries?portalId=${issuerId}`, {
        series_id: custom_id,
        series_name,
        stock_class_id,
        stock_plan_id,
    });

    console.log("Successfully reflected Series into Fairmint");

    return reflectSeriesResponse.data.data;
};
