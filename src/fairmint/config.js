import get from "lodash/get.js";

const NODE_ENV = get(process, "env.NODE_ENV", "development");
const IS_PROD = NODE_ENV === "production";
export const API_URL = `https://api.series${IS_PROD ? "" : "-dev"}.fairmint.co/admin`;
