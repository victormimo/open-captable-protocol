import { convertBytes16ToUUID } from "../utils/convertUUID.js";
import { createHistoricalTransaction } from "../db/operations/create.js";
import { readFairmintDataBySeriesId, readStakeholderById } from "../db/operations/read.js";
import {
    updateStakeholderById,
    updateStockClassById,
    upsertStockIssuanceById,
    upsertStockTransferById,
    upsertStockCancellationById,
    upsertStockRetractionById,
    upsertStockReissuanceById,
    upsertStockRepurchaseById,
    upsertStockAcceptanceById,
    upsertStockClassAuthorizedSharesAdjustment,
    upsertIssuerAuthorizedSharesAdjustment,
} from "../db/operations/update.js";
import get from "lodash/get";

import { reflectSeries } from "../fairmint/reflectSeries.js";
import { toDecimal } from "../utils/convertToFixedPointDecimals.js";
import { SERIES_TYPE } from "../fairmint/enums.js";
import { reflectStakeholder } from "../fairmint/reflectStakeholder.js";
import { reflectInvestment } from "../fairmint/reflectInvestment.js";

const options = {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
};

export const handleStockIssuance = async (stock, issuerId, timestamp) => {
    const { id, object_type, security_id, params } = stock;
    console.log("StockIssuanceCreated Event Emitted!", id);

    const {
        stock_class_id,
        stock_plan_id,
        share_numbers_issued: { starting_share_number, ending_share_number },
        share_price,
        quantity,
        vesting_terms_id,
        cost_basis,
        stock_legend_ids,
        issuance_type,
        comments,
        custom_id,
        stakeholder_id,
        board_approval_date,
        stockholder_approval_date,
        consideration_text,
        security_law_exemptions,
    } = params;

    // The custom_id field from the stock object is being assigned to the variable _series_id
    // to represent the series_id in this context.
    const _series_id = convertBytes16ToUUID(custom_id);

    const fairmintData = await readFairmintDataBySeriesId(_series_id);

    const sharePriceOCF = {
        amount: toDecimal(share_price).toString(),
        currency: "USD",
    };

    // Type represention of an ISO-8601 date, e.g. 2022-01-28.
    const dateOCF = new Date(timestamp * 1000).toISOString().split("T")[0];
    const costBasisOCF = { amount: toDecimal(cost_basis).toString(), currency: "USD" };
    const share_numbers_issuedOCF = [
        {
            starting_share_number: toDecimal(starting_share_number).toString(),
            ending_share_number: toDecimal(ending_share_number).toString(),
        },
    ];

    const stakeholder = await readStakeholderById(convertBytes16ToUUID(stakeholder_id));

    if (!stakeholder) {
        throw Error("Stakeholder does not exist");
    }

    const _id = convertBytes16ToUUID(id);
    const createdStockIssuance = await upsertStockIssuanceById(_id, {
        _id,
        object_type,
        stock_class_id: convertBytes16ToUUID(stock_class_id),
        stock_plan_id: convertBytes16ToUUID(stock_plan_id),
        share_numbers_issued: share_numbers_issuedOCF,
        share_price: sharePriceOCF,
        quantity: toDecimal(quantity).toString(),
        vesting_terms_id: convertBytes16ToUUID(vesting_terms_id),
        cost_basis: costBasisOCF,
        stock_legend_ids: convertBytes16ToUUID(stock_legend_ids),
        issuance_type: issuance_type,
        comments: comments,
        security_id: convertBytes16ToUUID(security_id),
        date: dateOCF,
        custom_id: _series_id,
        stakeholder_id: stakeholder._id,
        board_approval_date,
        stockholder_approval_date,
        consideration_text,
        security_law_exemptions,
        // TAP Native Fields
        issuer: issuerId,
        is_onchain_synced: true,
    });

    await createHistoricalTransaction({
        transaction: createdStockIssuance._id,
        issuer: issuerId,
        transactionType: "StockIssuance",
    });

    const dollarAmount = Number(toDecimal(share_price)) * Number(toDecimal(quantity)); // do we need to store this dollarAmount on Fairmint

    if (fairmintData && fairmintData._id) {
        // First, create series (or verify it's created)
        const seriesCreatedResp = await reflectSeries({
            issuerId,
            series_id: _series_id,
            stock_class_id: get(createdStockIssuance, "stock_class_id", null),
            stock_plan_id: get(createdStockIssuance, "stock_plan_id", null),
            series_name: get(fairmintData, "attributes.series_name"),
            series_type: SERIES_TYPE.SHARES,
        });

        console.log("series created response ", seriesCreatedResp);

        const reflectedInvestmentResp = await reflectInvestment({
            id: _id,
            issuerId,
            stakeholder_id: stakeholder._id,
            series_id: _series_id,
            amount: dollarAmount,
            number_of_shares: toDecimal(quantity).toString(),
        });

        console.log("stock investment response:", reflectedInvestmentResp);
    }

    console.log(
        `✅ | StockIssuance confirmation onchain with date ${new Date(Date.now()).toLocaleDateString("en-US", options)}`,
        createdStockIssuance
    );
};

export const handleStockTransfer = async (stock, issuerId) => {
    console.log(`Stock Transfer with quantity ${toDecimal(stock.quantity).toString()} received at `, new Date(Date.now()).toLocaleDateString());

    const id = convertBytes16ToUUID(stock.id);
    const quantity = toDecimal(stock.quantity).toString();
    const createdStockTransfer = await upsertStockTransferById(id, {
        _id: id,
        object_type: stock.object_type,
        quantity,
        comments: stock.comments,
        security_id: convertBytes16ToUUID(stock.security_id),
        consideration_text: stock.consideration_text,
        balance_security_id: convertBytes16ToUUID(stock.balance_security_id),
        resulting_security_ids: convertBytes16ToUUID(stock.resulting_security_ids),
        // TAP Native Fields
        issuer: issuerId,
        is_onchain_synced: true,
    });

    console.log("Stock Transfer reflected and validated off-chain", createdStockTransfer);

    await createHistoricalTransaction({
        transaction: createdStockTransfer._id,
        issuer: createdStockTransfer.issuer,
        transactionType: "StockTransfer",
    });

    console.log(
        `✅ | StockTransfer confirmation onchain with date ${new Date(Date.now()).toLocaleDateString("en-US", options)}`,
        createdStockTransfer
    );
};

export const handleStakeholder = async (id) => {
    try {
        console.log("StakeholderCreated Event Emitted!", id);
        const incomingStakeholderId = convertBytes16ToUUID(id);
        const stakeholder = await updateStakeholderById(incomingStakeholderId, { is_onchain_synced: true });

        if (!stakeholder) {
            throw Error("handleStakeholder: Stakeholder does not exist throw Error ");
        }

        await reflectStakeholder({ stakeholder, issuerId: stakeholder.issuer });
    } catch (error) {
        throw Error("Error handing Stakeholder On Chain", error);
    }
};

export const handleStockClass = async (id) => {
    console.log("StockClassCreated Event Emitted!", id);
    const incomingStockClassId = convertBytes16ToUUID(id);
    const stockClass = await updateStockClassById(incomingStockClassId, { is_onchain_synced: true });
    console.log("✅ | StockClass confirmation onchain ", stockClass);
};

export const handleStockCancellation = async (stock, issuerId, timestamp) => {
    console.log("StockCancellationCreated Event Emitted!", stock.id);
    const id = convertBytes16ToUUID(stock.id);
    const dateOCF = new Date(timestamp * 1000).toISOString().split("T")[0];
    const createdStockCancellation = await upsertStockCancellationById(id, {
        _id: id,
        object_type: stock.object_type,
        quantity: toDecimal(stock.quantity).toString(),
        comments: stock.comments,
        security_id: convertBytes16ToUUID(stock.security_id),
        date: dateOCF,
        reason_text: stock.reason_text,
        balance_security_id: convertBytes16ToUUID(stock.balance_security_id),
        // TAP Native Fields
        issuer: issuerId,
        is_onchain_synced: true,
    });

    await createHistoricalTransaction({
        transaction: createdStockCancellation._id,
        issuer: createdStockCancellation.issuer,
        transactionType: "StockCancellation",
    });
    console.log(
        `✅ | StockCancellation confirmation onchain with date ${new Date(Date.now()).toLocaleDateString("en-US", options)}`,
        createdStockCancellation
    );
};

export const handleStockRetraction = async (stock, issuerId, timestamp) => {
    console.log("StockRetractionCreated Event Emitted!", stock.id);
    const dateOCF = new Date(timestamp * 1000).toISOString().split("T")[0];
    const id = convertBytes16ToUUID(stock.id);
    const createdStockRetraction = await upsertStockRetractionById(id, {
        _id: id,
        object_type: stock.object_type,
        comments: stock.comments,
        security_id: convertBytes16ToUUID(stock.security_id),
        date: dateOCF,
        reason_text: stock.reason_text,
        // TAP Native Fields
        issuer: issuerId,
        is_onchain_synced: true,
    });

    await createHistoricalTransaction({
        transaction: createdStockRetraction._id,
        issuer: createdStockRetraction.issuer,
        transactionType: "StockRetraction",
    });
    console.log(
        `✅ | StockRetraction confirmation onchain with date ${new Date(Date.now()).toLocaleDateString("en-US", options)}`,
        createdStockRetraction
    );
};

export const handleStockReissuance = async (stock, issuerId, timestamp) => {
    console.log("StockReissuanceCreated Event Emitted!", stock.id);
    const dateOCF = new Date(timestamp * 1000).toISOString().split("T")[0];
    const id = convertBytes16ToUUID(stock.id);
    const createdStockReissuance = await upsertStockReissuanceById(id, {
        _id: id,
        object_type: stock.object_type,
        comments: stock.comments,
        security_id: convertBytes16ToUUID(stock.security_id),
        date: dateOCF,
        reason_text: stock.reason_text,
        resulting_security_ids: stock.resulting_security_ids.map((sId) => convertBytes16ToUUID(sId)),
        // TAP Native Fields
        issuer: issuerId,
        is_onchain_synced: true,
    });

    await createHistoricalTransaction({
        transaction: createdStockReissuance._id,
        issuer: createdStockReissuance.issuer,
        transactionType: "StockReissuance",
    });
    console.log(
        `✅ | StockReissuance confirmation onchain with date ${new Date(Date.now()).toLocaleDateString("en-US", options)}`,
        createdStockReissuance
    );
};

export const handleStockRepurchase = async (stock, issuerId, timestamp) => {
    console.log("StockRepurchaseCreated Event Emitted!", stock.id);
    const id = convertBytes16ToUUID(stock.id);

    const sharePriceOCF = {
        amount: toDecimal(stock.price).toString(),
        currency: "USD",
    };

    const dateOCF = new Date(timestamp * 1000).toISOString().split("T")[0];

    const createdStockRepurchase = await upsertStockRepurchaseById(id, {
        _id: id,
        object_type: stock.object_type,
        comments: stock.comments,
        security_id: convertBytes16ToUUID(stock.security_id),
        date: dateOCF,
        price: sharePriceOCF,
        quantity: toDecimal(stock.quantity).toString(),
        consideration_text: stock.consideration_text,
        balance_security_id: convertBytes16ToUUID(stock.balance_security_id),

        // TAP Native Fields
        issuer: issuerId,
        is_onchain_synced: true,
    });

    await createHistoricalTransaction({
        transaction: createdStockRepurchase._id,
        issuer: createdStockRepurchase.issuer,
        transactionType: "StockRepurchase",
    });
    console.log(
        `✅ | StockRepurchase confirmation onchain with date ${new Date(Date.now()).toLocaleDateString("en-US", options)}`,
        createdStockRepurchase
    );
};

export const handleStockAcceptance = async (stock, issuerId, timestamp) => {
    console.log("StockAcceptanceCreated Event Emitted!", stock.id);
    const id = convertBytes16ToUUID(stock.id);
    const dateOCF = new Date(timestamp * 1000).toISOString().split("T")[0];

    const createdStockAcceptance = await upsertStockAcceptanceById(id, {
        _id: id,
        object_type: stock.object_type,
        comments: stock.comments,
        security_id: convertBytes16ToUUID(stock.security_id),
        date: dateOCF,

        // TAP Native Fields
        issuer: issuerId,
        is_onchain_synced: true,
    });

    await createHistoricalTransaction({
        transaction: createdStockAcceptance._id,
        issuer: createdStockAcceptance.issuer,
        transactionType: "StockAcceptance",
    });
    console.log(
        `✅ | StockAcceptance confirmation onchain with date ${new Date(Date.now()).toLocaleDateString("en-US", options)}`,
        createdStockAcceptance
    );
};

export const handleStockClassAuthorizedSharesAdjusted = async (stock, issuerId, timestamp) => {
    console.log("StockClassAuthorizedSharesAdjusted Event Emitted!", stock.id);
    const id = convertBytes16ToUUID(stock.id);
    console.log("stock price", stock.price);

    const dateOCF = new Date(timestamp * 1000).toISOString().split("T")[0];

    const upsert = await upsertStockClassAuthorizedSharesAdjustment(id, {
        _id: id,
        object_type: stock.object_type,
        comments: stock.comments,
        issuer_id: convertBytes16ToUUID(stock.security_id),
        date: dateOCF,
        new_shares_authorized: stock.new_shares_authorized,
        board_approval_date: stock.board_approval_date,
        stockholder_approval_date: stock.stockholder_approval_date,

        // TAP Native Fields
        issuer: issuerId,
        is_onchain_synced: true,
    });

    await createHistoricalTransaction({
        transaction: upsert._id,
        issuer: issuerId,
        transactionType: "StockClassAuthorizedSharesAdjustment",
    });
    console.log(
        `✅ | StockClassAuthorizedSharesAdjusted confirmation onchain with date ${new Date(Date.now()).toLocaleDateString("en-US", options)}`,
        upsert
    );
};

export const handleIssuerAuthorizedSharesAdjusted = async (issuer, issuerId, timestamp) => {
    console.log("IssuerAuthorizedSharesAdjusted Event Emitted!", issuer.id);
    const id = convertBytes16ToUUID(issuer.id);
    console.log("stock price", issuer.price);

    const dateOCF = new Date(timestamp * 1000).toISOString().split("T")[0];

    const upsert = await upsertIssuerAuthorizedSharesAdjustment(id, {
        _id: id,
        object_type: issuer.object_type,
        comments: issuer.comments,
        issuer_id: convertBytes16ToUUID(issuer.security_id),
        date: dateOCF,
        new_shares_authorized: issuer.new_shares_authorized,
        board_approval_date: issuer.board_approval_date,
        stockholder_approval_date: issuer.stockholder_approval_date,

        // TAP Native Fields
        issuer: issuerId,
        is_onchain_synced: true,
    });

    await createHistoricalTransaction({
        transaction: upsert._id,
        issuer: issuerId,
        transactionType: "IssuerAuthorizedSharesAdjustment",
    });
    console.log(
        `✅ | IssuerAuthorizedSharesAdjusted confirmation onchain with date ${new Date(Date.now()).toLocaleDateString("en-US", options)}`,
        upsert
    );
};
