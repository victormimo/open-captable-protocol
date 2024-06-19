const IS_DEV = process.env.NODE_ENV === "development";
export const getJoiErrorMessage = (error) => (error.details.length > 0 ? error.details[0].message : "Invalid request");
export const API_URL = `https://api.series${IS_DEV ? "-dev" : ""}.fairmint.co/admin`;
