import { v4 as uuid } from "uuid";
import validateInputAgainstOCF from "./utils/validateInputAgainstSchema.js";
import convertibleIssuanceSchema from "../ocf/schema/objects/transactions/issuance/ConvertibleIssuance.schema.json" assert { type: "json" };
import warrantIssuanceSchema from "../ocf/schema/objects/transactions/issuance/WarrantIssuance.schema.json" assert { type: "json" };

const convertible_data = {
    security_law_exemptions: [
        {
            description: "Exemption",
            jurisdiction: "US",
        },
    ],
    board_approval_date: "2022-01-01",
    stakeholder_id: "f96ce5be-fe29-481b-bf3a-727cd33a1805",
    consideration_text: "",
    custom_id: "4929f525-058b-4b33-9ae6-5a2a1a08e223", // THIS IS NEEDED TO LINK SERIES, whether new one or existing for a series to link.
    convertible_type: "SAFE",
    investment_amount: {
        amount: "123400",
        currency: "USD",
    },
    conversion_triggers: [
        {
            trigger_id: "CN-1.TRIG.1",
            nickname: "Next Financing",
            trigger_description: "Conversion at Next Equity Financing",
            type: "AUTOMATIC_ON_CONDITION",
            trigger_condition: "SAFE shall convert upon completion of next equity financing (as defined in the instrument)",
            conversion_right: {
                type: "CONVERTIBLE_CONVERSION_RIGHT",
                conversion_mechanism: {
                    type: "SAFE_CONVERSION",
                    conversion_timing: "PRE_MONEY",
                    conversion_mfn: true,
                },
                converts_to_future_round: true,
            },
        },
    ],
    seniority: 1,
    pro_rata: "2500",
    comments: ["comment-one", "comment-two", "..."],
};

const warrant_data = {
    stakeholder_id: "c46a341c-333a-4ee4-8bc7-cabfc5ce6c51",
    custom_id: "W-1",
    security_law_exemptions: [],
    // quantity: "1000",
    quantity_source: "INSTRUMENT_FIXED",
    // exercise_price: {
    //     amount: "1.00",
    //     currency: "USD",
    // },
    purchase_price: {
        amount: "1.00",
        currency: "USD",
    },
    exercise_triggers: [
        {
            trigger_id: "WARRANT-1.TRIG.1",
            nickname: "Automatic exercise immediately prior to qualified public offering",
            trigger_description: "Warrant shall be deemed exercise immediately prior to consummation to a qualified public offering.",
            trigger_condition:
                "Qualified Public Offering means the issuance by the issuer or any direct or indirect parent of the issuer of its common Equity Interests in an underwritten primary public offering (other than a public offering pursuant to a registration statement on Form S-8) pursuant to an effective registration statement filed with the U.S. Securities and Exchange Commission in accordance with the Securities Act of 1933, as amended.",
            type: "AUTOMATIC_ON_CONDITION",
            conversion_right: {
                type: "WARRANT_CONVERSION_RIGHT",
                conversion_mechanism: {
                    type: "FIXED_AMOUNT_CONVERSION",
                    converts_to_quantity: "10000.00",
                },
                converts_to_stock_class_id: "stock-class-id",
            },
        },
    ],
    warrant_expiration_date: "2032-02-01",
};

const incomingConvertibleIssuance = {
    id: uuid(), // for OCF Validation
    security_id: uuid(), // for OCF Validation
    date: new Date().toISOString().slice(0, 10), // for OCF Validation
    object_type: "TX_CONVERTIBLE_ISSUANCE",
    ...convertible_data,
};
const incomingWarrantIssuance = {
    id: uuid(), // for OCF Validation
    security_id: uuid(), // for OCF Validation
    date: new Date().toISOString().slice(0, 10), // for OCF Validation
    object_type: "TX_WARRANT_ISSUANCE",
    ...warrant_data,
};

// console.log("incomingConvertibleIssuance", incomingConvertibleIssuance);
await validateInputAgainstOCF(incomingConvertibleIssuance, convertibleIssuanceSchema);
await validateInputAgainstOCF(incomingWarrantIssuance, warrantIssuanceSchema);
