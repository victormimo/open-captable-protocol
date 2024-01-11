import Issuer from "../objects/Issuer.js";
import Stakeholder from "../objects/Stakeholder.js";
import StockClass from "../objects/StockClass.js";
import StockLegendTemplate from "../objects/StockLegendTemplate.js";
import StockPlan from "../objects/StockPlan.js";
import Valuation from "../objects/Valuation.js";
import VestingTerms from "../objects/VestingTerms.js";
import StockAcceptance from "../objects/transactions/acceptance/StockAcceptance.js";
import IssuerAuthorizedSharesAdjustment from "../objects/transactions/adjustment/IssuerAuthorizedSharesAdjustment.js";
import StockClassAuthorizedSharesAdjustment from "../objects/transactions/adjustment/StockClassAuthorizedSharesAdjustment.js";
import StockCancellation from "../objects/transactions/cancellation/StockCancellation.js";
import StockIssuance from "../objects/transactions/issuance/StockIssuance.js";
import StockReissuance from "../objects/transactions/reissuance/StockReissuance.js";
import StockRepurchase from "../objects/transactions/repurchase/StockRepurchase.js";
import StockRetraction from "../objects/transactions/retraction/StockRetraction.js";
import StockTransfer from "../objects/transactions/transfer/StockTransfer.js";


export const updateIssuerById = async (id, updatedData) => {
    return await findByIdAndUpdate(Issuer, id, updatedData, { new: true });
};

export const updateStakeholderById = async (id, updatedData) => {
    return await findByIdAndUpdate(Stakeholder, id, updatedData, { new: true });
};

export const updateStockClassById = async (id, updatedData) => {
    return await findByIdAndUpdate(StockClass, id, updatedData, { new: true });
};

export const updateStockLegendTemplateById = async (id, updatedData) => {
    return await findByIdAndUpdate(StockLegendTemplate, id, updatedData, { new: true });
};

export const updateStockPlanById = async (id, updatedData) => {
    return await findByIdAndUpdate(StockPlan, id, updatedData, { new: true });
};

export const updateValuationById = async (id, updatedData) => {
    return await findByIdAndUpdate(Valuation, id, updatedData, { new: true });
};

export const updateVestingTermsById = async (id, updatedData) => {
    return await findByIdAndUpdate(VestingTerms, id, updatedData, { new: true });
};

export const upsertStockIssuanceById = async (id, updatedData) => {
    return await findByIdAndUpdate(StockIssuance, id, updatedData, { new: true, upsert: true, returning: true });
};

export const upsertStockTransferById = async (id, updatedData) => {
    return await findByIdAndUpdate(StockTransfer, id, updatedData, { new: true, upsert: true, returning: true });
};

export const upsertStockCancellationById = async (id, updatedData) => {
    return await findByIdAndUpdate(StockCancellation, id, updatedData, { new: true, upsert: true, returning: true });
};

export const upsertStockRetractionById = async (id, updatedData) => {
    return await findByIdAndUpdate(StockRetraction, id, updatedData, { new: true, upsert: true, returning: true });
};

export const upsertStockReissuanceById = async (id, updatedData) => {
    return await findByIdAndUpdate(StockReissuance, id, updatedData, { new: true, upsert: true, returning: true });
};

export const upsertStockRepurchaseById = async (id, updatedData) => {
    return await findByIdAndUpdate(StockRepurchase, id, updatedData, { new: true, upsert: true, returning: true });
};

export const upsertStockAcceptanceById = async (id, updatedData) => {
    return await findByIdAndUpdate(StockAcceptance, id, updatedData, { new: true, upsert: true, returning: true });
};

export const upsertStockClassAuthorizedSharesAdjustment = async (id, updatedData) => {
    return await findByIdAndUpdate(StockClassAuthorizedSharesAdjustment, id, updatedData, { new: true, upsert: true, returning: true });
};

export const upsertIssuerAuthorizedSharesAdjustment = async (id, updatedData) => {
    return await findByIdAndUpdate(IssuerAuthorizedSharesAdjustment, id, updatedData, { new: true, upsert: true, returning: true });
};
