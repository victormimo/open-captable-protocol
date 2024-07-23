// import { get } from "lodash";

// const NODE_ENV = get(process, "env.NODE_ENV", "development");
const IS_PROD = false; // NODE_ENV === "production";
export const API_URL = `https://api.series${IS_PROD ? "" : "-dev"}.fairmint.co/admin`;
