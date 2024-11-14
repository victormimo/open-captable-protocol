import { from, lastValueFrom } from "rxjs";
import { scan, tap, last, map } from "rxjs/operators";
import { getAllStateMachineObjectsById } from "../db/operations/read.js";
import { dashboardInitialState, processDashboardConvertibleIssuance, processDashboardStockIssuance } from "./dashboard.js";
import {
    captableInitialState,
    processCaptableStockIssuance,
    processCaptableStockClassAdjustment,
    processCaptableEquityCompensationIssuance,
    processCaptableWarrantAndNonPlanAwardIssuance,
    processCaptableConvertibleIssuance,
} from "./captable.js";

// Initial state structure
const createInitialState = (issuer, stockClasses, stockPlans, stakeholders) => {
    // First create the dashboard state
    const dashboardState = dashboardInitialState(stakeholders);

    // Create captable state
    const captableState = captableInitialState(issuer, stockClasses, stockPlans, stakeholders);

    return {
        issuer: {
            id: issuer._id,
            sharesAuthorized: parseInt(issuer.initial_shares_authorized),
            sharesIssued: 0,
        },
        stockClasses: stockClasses.reduce(
            (acc, sc) => ({
                ...acc,
                [sc.id]: {
                    id: sc.id,
                    sharesAuthorized: parseInt(sc.initial_shares_authorized),
                    sharesIssued: 0,
                },
            }),
            {}
        ),
        stockPlans: {
            "no-stock-plan": {
                id: "no-stock-plan",
                sharesReserved: 0,
                sharesIssued: 0,
                name: "Unassigned Stock Plan",
            },
            ...stockPlans.reduce(
                (acc, sp) => ({
                    ...acc,
                    [sp._id]: {
                        id: sp._id,
                        sharesReserved: parseInt(sp.initial_shares_reserved),
                        sharesIssued: 0,
                        stockClassIds: sp.stock_class_ids,
                        name: sp.plan_name,
                    },
                }),
                {}
            ),
        },
        equityCompensation: {
            exercises: {},
        },
        ...dashboardState,
        ...captableState, // Add captable specific state
        transactions: [], // Reset transactions array
        errors: new Set(), // Reset errors array
    };
};

// Process transactions
const processTransaction = (state, transaction, stakeholders, stockClasses, stockPlans) => {
    const newState = {
        ...state,
        transactions: [...state.transactions, transaction],
    };

    // console.log("transaction", transaction);

    const stakeholder = stakeholders.find((s) => s.id === transaction.stakeholder_id);
    if (
        !stakeholder &&
        ![
            "TX_EQUITY_COMPENSATION_EXERCISE",
            "TX_STOCK_PLAN_POOL_ADJUSTMENT",
            "TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT",
            "TX_ISSUER_AUTHORIZED_SHARES_ADJUSTMENT",
        ].includes(transaction.object_type)
    ) {
        return {
            ...state,
            errors: new Set([...state.errors, `Stakeholder not found - ${transaction.object_type}: ${transaction._id}`]),
        };
    }

    const originalStockPlan = transaction.stock_plan_id ? stockPlans.find((sp) => sp._id === transaction.stock_plan_id) : null;

    // let originalStockClass;
    let targetStockClassId;
    if (transaction.stock_class_id) {
        targetStockClassId = transaction.stock_class_id;
    }

    const warrantConvertsToStockClass =
        transaction.object_type === "TX_WARRANT_ISSUANCE" && transaction.exercise_triggers?.[0]?.conversion_right?.converts_to_stock_class_id;
    if (warrantConvertsToStockClass) {
        // Checking if the warrant converts to a stock class
        targetStockClassId = warrantConvertsToStockClass;
    }

    const originalStockClass = stockClasses.find((sc) => sc.id === targetStockClassId);
    // if transaction is one of the following, we need a stock class ID
    if (
        !targetStockClassId &&
        ![
            "TX_CONVERTIBLE_ISSUANCE",
            "TX_WARRANT_ISSUANCE",
            "TX_EQUITY_COMPENSATION_EXERCISE",
            "TX_ISSUER_AUTHORIZED_SHARES_ADJUSTMENT",
            "TX_STOCK_PLAN_POOL_ADJUSTMENT",
        ].includes(transaction.object_type)
    ) {
        return {
            ...state,
            errors: new Set([...state.errors, `No stock class ID found for - ${transaction.object_type}: ${transaction._id}`]),
        };
    }
    // if transaction is one of the following, we need a stock class ID
    if (
        !originalStockClass &&
        ![
            "TX_CONVERTIBLE_ISSUANCE",
            "TX_WARRANT_ISSUANCE",
            "TX_EQUITY_COMPENSATION_EXERCISE",
            "TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT",
            "TX_ISSUER_AUTHORIZED_SHARES_ADJUSTMENT",
            "TX_STOCK_PLAN_POOL_ADJUSTMENT",
        ].includes(transaction.object_type)
    ) {
        return {
            ...state,
            errors: new Set([...state.errors, `Invalid stock class - ${transaction.object_type}: ${transaction._id}`]),
        };
    }

    switch (transaction.object_type) {
        case "TX_STOCK_ISSUANCE":
            return processStockIssuance(newState, transaction, stakeholder, originalStockClass);
        case "TX_ISSUER_AUTHORIZED_SHARES_ADJUSTMENT":
            return processIssuerAdjustment(newState, transaction);
        case "TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT":
            return processStockClassAdjustment(newState, transaction, stakeholder, originalStockClass);
        case "TX_STOCK_PLAN_POOL_ADJUSTMENT":
            return processStockPlanAdjustment(newState, transaction);
        case "TX_EQUITY_COMPENSATION_ISSUANCE":
            if (transaction.stock_plan_id) return processEquityCompensationIssuance(newState, transaction, originalStockPlan);
            else return processWarrantAndNonPlanAwardIssuance(newState, transaction, stakeholder, originalStockClass);
        case "TX_EQUITY_COMPENSATION_EXERCISE":
            return processEquityCompensationExercise(newState, transaction);
        case "TX_CONVERTIBLE_ISSUANCE":
            return processConvertibleIssuance(newState, transaction, stakeholder);
        case "TX_WARRANT_ISSUANCE":
            // If the warrant has a stock class, it belongs in the Warrants and Non Plan Awards section, else it belongs in the Convertibles section
            if (transaction.exercise_triggers?.[0]?.conversion_right?.converts_to_stock_class_id)
                return processWarrantAndNonPlanAwardIssuance(newState, transaction, stakeholder, originalStockClass);
            else return processConvertibleIssuance(newState, transaction, stakeholder);
        default:
            return state;
    }
};

// Process convertible issuance
const processConvertibleIssuance = (state, transaction, stakeholder) => {
    const dashboardState = processDashboardConvertibleIssuance(state, transaction, stakeholder);

    const captableState = processCaptableConvertibleIssuance(state, transaction, stakeholder);

    return {
        ...state,
        ...dashboardState,
        ...captableState,
    };
};

const processWarrantAndNonPlanAwardIssuance = (state, transaction, stakeholder, originalStockClass) => {
    const captableUpdates = processCaptableWarrantAndNonPlanAwardIssuance(state, transaction, stakeholder, originalStockClass);
    return {
        ...state,
        ...captableUpdates,
    };
};

// Process stock issuance
const processStockIssuance = (state, transaction, stakeholder, originalStockClass) => {
    const { stock_class_id, quantity } = transaction;
    const numShares = parseInt(quantity);

    // Access state stock class directly from state
    const stateStockClass = state.stockClasses[stock_class_id];
    console.log("stateStockClass", stateStockClass);

    // Validate using state data
    if (stateStockClass.sharesIssued + numShares > stateStockClass.sharesAuthorized) {
        return {
            ...state,
            errors: [...state.errors, `Cannot issue ${numShares} shares - exceeds stock class authorized amount`],
        };
    }

    if (state.issuer.sharesIssued + numShares > state.issuer.sharesAuthorized) {
        return {
            ...state,
            errors: [...state.errors, `Cannot issue ${numShares} shares - exceeds issuer authorized amount`],
        };
    }

    // Core state updates
    const coreUpdates = {
        issuer: {
            ...state.issuer,
            sharesIssued: state.issuer.sharesIssued + numShares,
        },
        stockClasses: {
            ...state.stockClasses,
            [stock_class_id]: {
                ...stateStockClass,
                sharesIssued: stateStockClass.sharesIssued + numShares,
            },
        },
    };

    const dashboardUpdates = processDashboardStockIssuance(state, transaction, stakeholder);
    const captableUpdates = processCaptableStockIssuance(state, transaction, stakeholder, originalStockClass);

    return {
        ...state,
        ...coreUpdates,
        ...dashboardUpdates,
        ...captableUpdates,
    };
};

// Process issuer adjustment
const processIssuerAdjustment = (state, transaction) => {
    const newSharesAuthorized = parseInt(transaction.new_shares_authorized);

    return {
        ...state,
        issuer: {
            ...state.issuer,
            sharesAuthorized: newSharesAuthorized,
        },
    };
};

// const proce

// Process stock class adjustment
const processStockClassAdjustment = (state, transaction, _stakeholder, originalStockClass) => {
    const { stock_class_id, new_shares_authorized } = transaction;

    // Core state updates
    const coreUpdates = {
        stockClasses: {
            ...state.stockClasses,
            [stock_class_id]: {
                ...state.stockClasses[stock_class_id],
                sharesAuthorized: parseInt(new_shares_authorized),
            },
        },
    };

    // Get cap table updates
    const captableUpdates = processCaptableStockClassAdjustment(state, transaction, originalStockClass);

    return {
        ...state,
        ...coreUpdates,
        ...captableUpdates,
    };
};

// Process equity compensation issuance
const processEquityCompensationIssuance = (state, transaction, originalStockPlan) => {
    const { stock_plan_id, quantity } = transaction;
    const numShares = parseInt(quantity);

    // Determine which plan ID to use - either the provided one or 'no-stock-plan'
    const planId = stock_plan_id || "no-stock-plan";

    // Ensure the plan exists in state
    if (!state.stockPlans[planId]) {
        return {
            ...state,
            errors: [...state.errors, `Invalid stock plan: ${planId}`],
        };
    }

    // Update stock plan's issued shares
    const updatedStockPlans = {
        ...state.stockPlans,
        [planId]: {
            ...state.stockPlans[planId],
            sharesIssued: state.stockPlans[planId].sharesIssued + numShares,
        },
    };

    const captableUpdates = processCaptableEquityCompensationIssuance(state, transaction, originalStockPlan);

    return {
        ...state,
        ...captableUpdates,
        stockPlans: updatedStockPlans,
    };
};

// Process stock plan adjustment
const processStockPlanAdjustment = (state, transaction) => {
    const { stock_plan_id, shares_reserved } = transaction;

    // Core state updates
    const coreUpdates = {
        stockPlans: {
            ...state.stockPlans,
            [stock_plan_id]: {
                ...state.stockPlans[stock_plan_id],
                sharesReserved: parseInt(shares_reserved),
            },
        },
    };

    return {
        ...state,
        ...coreUpdates,
    };
};

// Process equity compensation exercise, globally.
export const processEquityCompensationExercise = (state, transaction) => {
    const { security_id, quantity, resulting_security_ids } = transaction;
    const numShares = parseInt(quantity);

    // Just check security_id match
    const equityGrant = state.transactions.find((tx) => tx.security_id === security_id);

    if (!equityGrant) {
        console.log("No equity grant found for:", security_id);
        return {
            ...state,
            errors: [...state.errors, `Exercise references non-existent equity grant: ${security_id}`],
        };
    }

    // Same for stock issuance
    const stockIssuance = state.transactions.find((tx) => resulting_security_ids.includes(tx.security_id));

    if (!stockIssuance) {
        return {
            ...state,
            errors: [...state.errors, `Exercise references non-existent stock issuance: ${resulting_security_ids}`],
        };
    }

    // Track exercise in state
    return {
        ...state,
        equityCompensation: {
            ...state.equityCompensation,
            exercises: {
                ...state.equityCompensation.exercises,
                [security_id]: {
                    exercised: (state.equityCompensation.exercises[security_id]?.exercised || 0) + numShares,
                    stockSecurityId: resulting_security_ids[0],
                },
            },
        },
    };
};

export const dashboardStats = async (issuerId) => {
    const { issuer, stockClasses, stockPlans, stakeholders, transactions } = await getAllStateMachineObjectsById(issuerId);

    // If there are no transactions, map the initial state to the required format
    if (transactions.length === 0) {
        const initialState = createInitialState(issuer, stockClasses, stockPlans, stakeholders);
        return {
            numOfStakeholders: initialState.numOfStakeholders,
            totalOutstandingShares: initialState.issuer.sharesIssued,
            totalRaised: initialState.totalRaised,
            totalStockPlanAuthorizedShares: Object.entries(initialState.stockPlans)
                .filter(([id, _]) => id !== "no-stock-plan")
                .reduce((acc, [_, plan]) => acc + parseInt(plan.sharesReserved), 0),
            sharesIssuedByCurrentRelationship: initialState.sharesIssuedByCurrentRelationship,
            totalIssuerAuthorizedShares: initialState.issuer.sharesAuthorized,
            latestSharePrice: Number(initialState.latestSharePrice),
            ownership: {},
            valuation: null,
        };
    }

    const finalState = await lastValueFrom(
        from(transactions).pipe(
            scan((state, transaction) => {
                return processTransaction(state, transaction, stakeholders, stockClasses, stockPlans);
            }, createInitialState(issuer, stockClasses, stockPlans, stakeholders)),
            last(),
            tap((state) => {
                const stateWithoutTransactions = { ...state };
                delete stateWithoutTransactions.transactions;

                console.log("\nProcessed transaction. New state:", JSON.stringify(stateWithoutTransactions, null, 2));
            }),
            map((state) => {
                // If there are errors, return the state as is
                if (state.errors.size > 0) {
                    return state;
                }
                // Calculate ownership percentages
                const ownership = Object.entries(state.sharesIssuedByCurrentRelationship).reduce(
                    (acc, [relationship, shares]) => ({
                        ...acc,
                        [relationship]:
                            state.issuer.sharesIssued > 0
                                ? Number((shares / state.issuer.sharesIssued).toFixed(4)) // 4 decimal places
                                : 0,
                    }),
                    {}
                );

                // Get most recent valid valuation
                const validValuations = [state.valuations.stock, state.valuations.convertible]
                    .filter((v) => v && v.amount)
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                console.log("validValuations", validValuations);

                return {
                    numOfStakeholders: state.numOfStakeholders,
                    totalOutstandingShares: state.issuer.sharesIssued,
                    totalRaised: state.totalRaised,
                    // Calculating the sum across all stock plans
                    totalStockPlanAuthorizedShares: Object.entries(state.stockPlans)
                        .filter(([id, _]) => id !== "no-stock-plan")
                        .reduce((acc, [_, plan]) => acc + parseInt(plan.sharesReserved), 0),
                    sharesIssuedByCurrentRelationship: state.sharesIssuedByCurrentRelationship,
                    totalIssuerAuthorizedShares: state.issuer.sharesAuthorized,
                    latestSharePrice: Number(state.latestSharePrice),
                    ownership,
                    valuation: validValuations[0] || null,
                };
            })
        )
    );

    console.log("finalState", finalState);

    return finalState;
};

export const captableStats = async (issuerId) => {
    const { issuer, stockClasses, stockPlans, stakeholders, transactions } = await getAllStateMachineObjectsById(issuerId);

    // If there are no transactions, map the initial state to the required format
    if (transactions.length === 0) {
        const initialState = createInitialState(issuer, stockClasses, stockPlans, stakeholders);
        return {
            isCapTableEmpty: true,
            summary: {
                isEmpty: true,
                common: initialState.summary.common,
                preferred: initialState.summary.preferred,
                founderPreferred: initialState.summary.founderPreferred,
                warrantsAndNonPlanAwards: initialState.summary.warrantsAndNonPlanAwards,
                stockPlans: initialState.summary.stockPlans,
                totals: initialState.summary.totals,
            },
            convertibles: {
                isEmpty: true,
                convertiblesSummary: initialState.convertibles?.convertiblesSummary || {},
                totals: {
                    outstandingAmount: 0,
                },
            },
        };
    }

    const finalState = await lastValueFrom(
        from(transactions).pipe(
            scan(
                (state, transaction) => processTransaction(state, transaction, stakeholders, stockClasses, stockPlans),
                createInitialState(issuer, stockClasses, stockPlans, stakeholders)
            ),
            last(),
            tap((state) => {
                const stateWithoutTransactions = { ...state };
                delete stateWithoutTransactions.transactions;
                console.log("\nProcessed transaction. New state:", JSON.stringify(stateWithoutTransactions, null, 2));
            }),
            map((state) => {
                // If there are errors, return the state as is
                if (state.errors.size > 0) {
                    return state;
                }
                // Just maintain section structures without calculating totals yet
                const commonSummary = {
                    rows: state.summary.common.rows,
                    totalSharesAuthorized: state.summary.common.rows.reduce((acc, row) => acc + row.sharesAuthorized, 0),
                };

                const preferredSummary = {
                    rows: state.summary.preferred.rows,
                    totalSharesAuthorized: state.summary.preferred.rows.reduce((acc, row) => acc + row.sharesAuthorized, 0),
                };

                const warrantsAndNonPlanAwardsSummary = {
                    rows: state.summary.warrantsAndNonPlanAwards.rows,
                };

                const stockPlansSummary = {
                    rows: (() => {
                        const totalSharesAuthorized = Object.entries(state.stockPlans)
                            .filter(([id, _]) => id !== "no-stock-plan")
                            .reduce((acc, [_, plan]) => acc + plan.sharesReserved, 0);

                        const totalIssuedShares = state.summary.stockPlans.rows.reduce(
                            (sum, row) => sum + (row.name !== "Available for Grants" ? row.fullyDilutedShares : 0),
                            0
                        );

                        const availableForGrants = totalSharesAuthorized - totalIssuedShares;

                        const finalRows = [...state.summary.stockPlans.rows.filter((row) => row.name !== "Available for Grants")];

                        if (availableForGrants > 0) {
                            finalRows.push({
                                name: "Available for Grants",
                                fullyDilutedShares: availableForGrants,
                            });
                        }

                        return finalRows;
                    })(),
                    totalSharesAuthorized: Object.entries(state.stockPlans)
                        .filter(([id, _]) => id !== "no-stock-plan")
                        .reduce((acc, [_, plan]) => acc + plan.sharesReserved, 0),
                };

                // Calculate totals
                const totals = {
                    totalSharesAuthorized:
                        commonSummary.totalSharesAuthorized +
                        preferredSummary.totalSharesAuthorized +
                        (state.summary.founderPreferred?.sharesAuthorized || 0),
                    totalOutstandingShares:
                        commonSummary.rows.reduce((sum, row) => sum + (row.outstandingShares || 0), 0) +
                        preferredSummary.rows.reduce((sum, row) => sum + (row.outstandingShares || 0), 0) +
                        (state.summary.founderPreferred?.outstandingShares || 0),
                    totalFullyDilutedShares:
                        commonSummary.rows.reduce((sum, row) => sum + row.fullyDilutedShares, 0) +
                        preferredSummary.rows.reduce((sum, row) => sum + row.fullyDilutedShares, 0) +
                        (state.summary.founderPreferred?.fullyDilutedShares || 0) +
                        warrantsAndNonPlanAwardsSummary.rows.reduce((sum, row) => sum + row.fullyDilutedShares, 0) +
                        stockPlansSummary.rows.reduce((sum, row) => sum + row.fullyDilutedShares, 0),
                    totalFullyPercentage: 1,
                    totalLiquidation:
                        commonSummary.rows.reduce((sum, row) => sum + (row.liquidation || 0), 0) +
                        preferredSummary.rows.reduce((sum, row) => sum + (row.liquidation || 0), 0) +
                        (state.summary.founderPreferred?.liquidation || 0),
                    totalVotingPower:
                        commonSummary.rows.reduce((sum, row) => sum + (row.votingPower || 0), 0) +
                        preferredSummary.rows.reduce((sum, row) => sum + (row.votingPower || 0), 0) +
                        (state.summary.founderPreferred?.votingPower || 0),
                    totalVotingPowerPercentage: 1,
                };

                // Function to recalculate percentages
                const recalculatePercentages = (summary) => {
                    if (!summary.rows) return summary;

                    const updatedRows = summary.rows.map((row) => ({
                        ...row,
                        fullyDilutedPercentage: (row.fullyDilutedShares / totals.totalFullyDilutedShares).toFixed(4),
                        ...(row.votingPower !== undefined
                            ? {
                                  votingPercentage: (row.votingPower / totals.totalVotingPower).toFixed(4),
                              }
                            : {}),
                    }));

                    return {
                        ...summary,
                        rows: updatedRows,
                    };
                };

                // Recalculate percentages for all summaries
                const updatedCommonSummary = recalculatePercentages(commonSummary);
                const updatedPreferredSummary = recalculatePercentages(preferredSummary);
                const updatedWarrantsAndNonPlanAwardsSummary = recalculatePercentages(warrantsAndNonPlanAwardsSummary);
                const updatedStockPlansSummary = recalculatePercentages(stockPlansSummary);

                // Check if the summary is empty
                const isSummaryEmpty =
                    commonSummary.rows.length === 0 &&
                    preferredSummary.rows.length === 0 &&
                    !state.summary.founderPreferred &&
                    warrantsAndNonPlanAwardsSummary.rows.length === 0 &&
                    stockPlansSummary.rows.length === 0;

                // Check if convertibles are empty
                const isConvertiblesEmpty =
                    !state.convertibles?.convertiblesSummary || Object.keys(state.convertibles.convertiblesSummary).length === 0;

                // Calculate convertibles total outstanding amount
                const convertiblesTotalOutstandingAmount = isConvertiblesEmpty
                    ? 0
                    : Object.values(state.convertibles.convertiblesSummary).reduce((sum, group) => sum + (group.outstandingAmount || 0), 0);

                return {
                    isCapTableEmpty: isSummaryEmpty && isConvertiblesEmpty,
                    summary: {
                        isEmpty: isSummaryEmpty,
                        common: updatedCommonSummary,
                        preferred: updatedPreferredSummary,
                        founderPreferred: state.summary.founderPreferred
                            ? {
                                  ...state.summary.founderPreferred,
                                  fullyDilutedPercentage: (
                                      state.summary.founderPreferred.fullyDilutedShares / totals.totalFullyDilutedShares
                                  ).toFixed(4),
                                  votingPercentage: (state.summary.founderPreferred.votingPower / totals.totalVotingPower).toFixed(4),
                              }
                            : null,
                        warrantsAndNonPlanAwards: updatedWarrantsAndNonPlanAwardsSummary,
                        stockPlans: updatedStockPlansSummary,
                        totals,
                    },
                    convertibles: {
                        isEmpty: isConvertiblesEmpty,
                        convertiblesSummary: state.convertibles?.convertiblesSummary || {},
                        totals: {
                            outstandingAmount: convertiblesTotalOutstandingAmount,
                        },
                    },
                };
            })
        )
    );

    console.log("finalState", finalState);
    return finalState;
};

export const verifyCapTable = async (captable) => {
    // Format manifest and get items for each object / transaction
    const { issuer, stockClasses, stockPlans, stakeholders, transactions } = captable;
    console.log({ captable });

    // If there are no transactions, map the initial state to the required format
    if (transactions.length === 0) {
        return true;
    }

    const finalState = await lastValueFrom(
        from(transactions).pipe(
            scan(
                (state, transaction) => processTransaction(state, transaction, stakeholders, stockClasses, stockPlans),
                createInitialState(issuer, stockClasses, stockPlans, stakeholders)
            ),
            last(),
            // tap((state) => {
            // }),
            map((state) => {
                if (state.errors.size > 0) {
                    return { valid: false, errors: Array.from(state.errors) };
                }
                return { valid: true };
            })
        )
    );

    console.log("finalState", finalState);
    return finalState;
};
