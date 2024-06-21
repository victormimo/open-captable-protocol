import mongoose from "mongoose";
import { v4 as uuid } from "uuid";

/*
How flexible do we need this to be?
- if it's for issuance transactions only, then we only need custom_id as the link.
For example, 
{
    custom_id: "232323232",
    attributes: {
        "series_name": "Seed Round",
        "another_fairmint_specific_field": "hello world"
    }
}
*/
const FairmintSchema = new mongoose.Schema(
    {
        _id: { type: String, default: () => uuid() },
        custom_id: { type: String },
        synced: { type: Boolean, default: false },
        attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    { timestamps: true }
);

const Fairmint = mongoose.model("Fairmint", FairmintSchema);

export default Fairmint;
