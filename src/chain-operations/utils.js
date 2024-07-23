export const getJoiErrorMessage = (error) => (error.details.length > 0 ? error.details[0].message : "Invalid request");
