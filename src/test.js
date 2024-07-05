import { v4 as uuid } from "uuid";
import validateInputAgainstOCF from "./utils/validateInputAgainstSchema.js";
import convertibleIssuanceSchema from "../ocf/schema/objects/transactions/issuance/ConvertibleIssuance.schema.json" assert { type: "json" };

const data = {
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
const incomingConvertibleIssuance = {
    id: uuid(), // for OCF Validation
    security_id: uuid(), // for OCF Validation
    date: new Date().toISOString().slice(0, 10), // for OCF Validation
    object_type: "TX_CONVERTIBLE_ISSUANCE",
    ...data,
};

console.log("incomingConvertibleIssuance", incomingConvertibleIssuance);
await validateInputAgainstOCF(incomingConvertibleIssuance, convertibleIssuanceSchema);
