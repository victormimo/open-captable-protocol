import Ajv from "ajv";
import addFormats from "ajv-formats";
import fs from "fs";
import path from "path";

const ajv = new Ajv();
addFormats(ajv); // To support formats like date-time

const schemaDirPath = path.join("__dirname", "../../ocf/schema");
const REMOTE_OCF_URL = "https://raw.githubusercontent.com/Open-Cap-Table-Coalition/Open-Cap-Format-OCF/main/schema";
import get from "lodash/get";

function replaceRemoteUrlLocally(remoteUrl) {
    const formattedUrl = remoteUrl.replace(REMOTE_OCF_URL, schemaDirPath);
    return path.join("__dirname", formattedUrl);
}

async function fetchRefsInSchema(schema) {
    // If the schema has its own $ref references, fetch and add those first
    if (schema.$ref) {
        await fetchAndAddExternalSchema(schema.$ref);
    }

    // Handle $ref references inside properties
    if (schema.properties) {
        for (const propName in schema.properties) {
            const prop = schema.properties[propName];

            // Check for direct $ref in the property
            if (prop.$ref) {
                await fetchAndAddExternalSchema(prop.$ref);
            }

            // Check for $ref inside 'items' of an array property
            if (prop.type === "array" && prop.items && prop.items.$ref) {
                await fetchAndAddExternalSchema(prop.items.$ref);
            }

            // Handle nested oneOf, allOf, etc. inside properties
            for (const keyword of ["allOf", "anyOf", "oneOf", "not"]) {
                if (prop[keyword]) {
                    for (const subSchema of prop[keyword]) {
                        await fetchRefsInSchema(subSchema);
                    }
                }
            }
        }
    }

    // Handle $ref references inside "allOf", "anyOf", "oneOf", or "not" keywords
    for (const keyword of ["allOf", "anyOf", "oneOf", "not"]) {
        if (schema[keyword]) {
            if (Array.isArray(schema[keyword])) {
                for (const subSchema of schema[keyword]) {
                    await fetchRefsInSchema(subSchema);
                }
            }
        }
    }
}

async function fetchAndAddExternalSchema(schemaOrUrl) {
    let schema;

    // Check if the argument is a URL or a schema object
    if (typeof schemaOrUrl === "string") {
        // If it's a URL, fetch the schema
        let schemaPath = replaceRemoteUrlLocally(schemaOrUrl);
        schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    } else {
        // If it's a schema object, use it directly
        schema = schemaOrUrl;
    }

    // Check if the schema is already added to avoid infinite loops
    if (!schema || ajv.getSchema(schema.$id)) return;

    // If the schema has its own $ref references, fetch and add those first
    if (schema.$ref) {
        await fetchAndAddExternalSchema(schema.$ref);
    }

    // If the schema has "allOf", "anyOf", "oneOf", or "not" keywords, handle those3
    await fetchRefsInSchema(schema);

    // Handle $ref references inside properties
    if (schema.properties) {
        for (const propName in schema.properties) {
            const prop = schema.properties[propName];
            // Check for direct $ref in the property
            if (prop.$ref) {
                await fetchAndAddExternalSchema(prop.$ref);
            }

            // Check for $ref inside 'items' of an array property
            if (prop.type === "array" && prop.items) {
                if (prop.items.$ref) {
                    await fetchAndAddExternalSchema(prop.items.$ref);
                } else if (prop.items.anyOf) {
                    for (const subSchema of prop.items.anyOf) {
                        await fetchAndAddExternalSchema(subSchema.$ref);
                    }
                }
            }

            // You can further extend this to handle other nested structures as needed
        }
    }

    // After all references have been fetched and added, add the current schema to AJV
    ajv.addSchema(schema, schema.$id);
}

async function validateInputAgainstSchema(input, schema) {
    // Fetch and add the external schema to AJV
    await fetchAndAddExternalSchema(schema);

    const validate = ajv.compile(schema);
    const valid = validate(input);
    if (!valid) {
        return {
            isValid: false,
            errors: validate.errors,
        };
    }
    return {
        isValid: true,
        errors: false,
    };
}

async function validateInputAgainstOCF(input, schema) {
    const { isValid, errors } = await validateInputAgainstSchema(input, schema);
    if(isValid) {
        const id = get(input, "id");
        console.log(`Check ${schema.title}: ${id} Against OCF Schema is valid ✅`, isValid);
    } else {
        throw new Error(JSON.stringify({ errors, schema: schema.$id.replace(REMOTE_OCF_URL, "") }, null, 2));
    }
}

export default validateInputAgainstOCF;
