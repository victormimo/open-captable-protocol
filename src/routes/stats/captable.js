import { find } from "../../db/operations/atomic.js";
import get from "lodash/get";
import Stockclass from "../../db/objects/StockClass.js";
import StockPlan from "../../db/objects/StockPlan.js";
import { getStockIssuances } from "./helpers.js";
import WarrantIssuance from "../../db/objects/transactions/issuance/WarrantIssuance.js";
import EquityCompensationIssuance from "../../db/objects/transactions/issuance/EquityCompensationIssuance.js";

const StockClassTypes = {
    COMMON: "COMMON",
    PREFERRED: "PREFERRED",
};

const StockIssuanceTypes = {
    FOUNDERS_STOCK: "FOUNDERS_STOCK",
};


const getAllEquityCompensationIssuances = async (issuerId) => {
    return (await find(EquityCompensationIssuance, { issuer: issuerId })) || [];
};

const getAllWarrants = async (issuerId) => {
    return (await find(WarrantIssuance, { issuer: issuerId })) || [];
};

const getAllStockClasses = async (issuerId) => {
    return (await find(Stockclass, { issuer: issuerId })) || [];
};

const getAllStockPlans = async (issuerId) => {
    return (await find(StockPlan, { issuer: issuerId })) || [];
};


const calculateTotalVotingPower = (stockClasses, outstandingSharesByStockClass) => {
    return stockClasses.reduce((acc, stockClass) => {
        const outstandingShares = outstandingSharesByStockClass[stockClass._id] || 0;
        return acc + Number(stockClass.votes_per_share) * outstandingShares;
    }, 0);
};

/*
    Note: we exclude the founder preferred stock issuances from the preferred stock classes summary.
*/
const calculateStockClassSummary = (stockClasses, stockIssuances, totalOutstandingShares, totalVotingPower, excludeIssuanceType = null) => {
    const totalSharesAuthorized = stockClasses.reduce((sum, sc) => sum + Number(sc.initial_shares_authorized), 0);

    const rows = stockClasses.map(stockClass => {
        const classIssuances = stockIssuances.filter(issuance =>
            issuance.stock_class_id === stockClass._id &&
            (excludeIssuanceType ? issuance.issuance_type !== excludeIssuanceType : true)
        );

        if (classIssuances.length === 0) return null;

        const outstandingShares = classIssuances.reduce((sum, issuance) => sum + Number(issuance.quantity), 0);
        const votingPower = stockClass.votes_per_share * outstandingShares;

        return {
            name: stockClass.name,
            sharesAuthorized: stockClass.initial_shares_authorized,
            outstandingShares,
            fullyDilutedShares: outstandingShares,
            fullyDilutedPercentage: (outstandingShares / totalOutstandingShares * 100).toFixed(2),
            liquidationPreference: stockClass.liquidation_preference_multiple,
            votingPower,
            votingPercentage: (votingPower / totalVotingPower * 100).toFixed(2)
        };
    }).filter(row => row !== null);

    return {
        totalSharesAuthorized,
        rows
    };
};

const calculateFounderPreferredSummary = (preferredStockClasses, stockIssuances, totalOutstandingShares, totalVotingPower) => {
    const founderIssuances = stockIssuances.filter(issuance => issuance.issuance_type === StockIssuanceTypes.FOUNDERS_STOCK);

    console.log('founderIssuances', founderIssuances);

    if (founderIssuances.length === 0) return null;

    const outstandingShares = founderIssuances.reduce((sum, issuance) => sum + Number(issuance.quantity), 0);

    const founderPreferredClasses = preferredStockClasses.filter(stockClass =>
        founderIssuances.some(issuance => issuance.stock_class_id === stockClass._id)
    );

    const votingPower = founderIssuances.reduce((sum, issuance) => {
        const stockClass = founderPreferredClasses.find(sc => sc._id === issuance.stock_class_id);
        return sum + (stockClass ? stockClass.votes_per_share * Number(issuance.quantity) : 0);
    }, 0);

    return {
        outstandingShares,
        sharesAuthorized: outstandingShares,
        fullyDilutedShares: outstandingShares,
        fullyDilutedPercentage: (outstandingShares / totalOutstandingShares * 100).toFixed(2),
        liquidationPreference: Math.max(...founderPreferredClasses.map(sc => sc.liquidation_preference_multiple)),
        votingPower,
        votingPercentage: (votingPower / totalVotingPower * 100).toFixed(2)
    };
};

// modularizing the row creation for warrants and non-plan awards
// for warrants, we need to use the exercise_triggers to get the quantity of shares that the warrant can convert to
// for non-plan awards, we can just use the quantity
const createWarrantAndNonPlanAwardsRow = (issuancesByStockClass, stockClasses, totalOutstandingShares, suffix, isWarrant = false) => {
    return Object.entries(issuancesByStockClass).map(([stockClassId, issuances]) => {
        const fullyDilutedShares = issuances.reduce((sum, issuance) => {
            let quantity;
            if (isWarrant) {
                quantity = Number(issuance.exercise_triggers?.[0]?.conversion_right?.conversion_mechanism?.converts_to_quantity || 0);
            } else {
                quantity = Number(issuance.quantity);
            }
            return sum + (isNaN(quantity) ? 0 : quantity);
        }, 0);

        let name;
        if (stockClassId === 'general') {
            name = `General ${suffix}`;
        } else {
            const stockClass = stockClasses.find(sc => sc._id === stockClassId);
            name = stockClass ? `${stockClass.name} ${suffix}` : `Unknown Stock Class ${suffix}`;
        }

        return {
            name,
            fullyDilutedShares,
            fullyDilutedPercentage: (fullyDilutedShares / totalOutstandingShares * 100).toFixed(2)
        };
    });
}

const createEquityCompensationWithPlanSummaryRows = (equityCompensationByStockPlan, stockPlans, totalOutstandingShares) => {
    return Object.entries(equityCompensationByStockPlan).map(([stockPlanId, issuances]) => {
        const fullyDilutedShares = issuances.reduce((sum, issuance) => {
            const quantity = Number(issuance.quantity);
            return sum + (isNaN(quantity) ? 0 : quantity);
        }, 0);

        const stockPlan = stockPlans.find(sp => sp._id === stockPlanId);
        console.log('stockPlan', stockPlan);
        const name = stockPlan ? `${stockPlan.plan_name}` : 'Unknown Stock Plan';

        return {
            name,
            fullyDilutedShares,
            fullyDilutedPercentage: (fullyDilutedShares / totalOutstandingShares * 100).toFixed(2)
        };
    });
}

const groupIssuancesByStockClass = (issuances, stockClassIdPath) => {
    return issuances.reduce((acc, issuance) => {
        const stockClassId = get(issuance, stockClassIdPath) || 'general';
        if (!acc[stockClassId]) {
            acc[stockClassId] = [];
        }
        acc[stockClassId].push(issuance);
        return acc;
    }, {});
}

const groupIssuancesByStockPlan = (issuances) => {
    return issuances.reduce((acc, issuance) => {
        const stockPlanId = issuance.stock_plan_id;
        if (!acc[stockPlanId]) {
            acc[stockPlanId] = [];
        }
        acc[stockPlanId].push(issuance);
        return acc;
    }, {});
}

// Note: warrants only have fully diluted shares and fds %
const calculateWarrantAndNonPlanAwardSummary = (stockClasses, warrantIssuances, equityCompensationIssuancesWithoutStockPlan, totalOutstandingShares) => {
    console.log('warrantIssuances', warrantIssuances);
    console.log('equityCompensationIssuancesWithoutStockPlan', equityCompensationIssuancesWithoutStockPlan);

    /*
        {
            stockClassId1: [warrant1, warrant2, ...],
            general: [warrant3, warrant4, ...]
        }
    */
    const warrantsByStockClass = groupIssuancesByStockClass(warrantIssuances, 'exercise_triggers.0.conversion_right.converts_to_stock_class_id');
    const equityCompensationByStockClass = groupIssuancesByStockClass(equityCompensationIssuancesWithoutStockPlan, 'stock_class_id');

    console.log('warrantsByStockClass', warrantsByStockClass);
    console.log('equityCompensationByStockClass', equityCompensationByStockClass);

    const warrantRows = createWarrantAndNonPlanAwardsRow(warrantsByStockClass, stockClasses, totalOutstandingShares, 'Warrants', true);
    const equityCompensationRows = createWarrantAndNonPlanAwardsRow(equityCompensationByStockClass, stockClasses, totalOutstandingShares, 'Non-Plan Awards');

    console.log('warrantRows', warrantRows);
    console.log('equityCompensationRows', equityCompensationRows);

    return {
        rows: [...warrantRows, ...equityCompensationRows]
    }
};


const calculateStockPlanSummary = (stockPlans, equityCompensationIssuances, totalOutstandingShares) => {
    // Filter equity compensation issuances with stock plans
    const equityCompensationWithPlan = equityCompensationIssuances.filter(issuance => issuance.stock_plan_id);

    // Group issuances by stock plan
    const equityCompensationByStockPlan = groupIssuancesByStockPlan(equityCompensationWithPlan);

    console.log('equityCompensationByStockPlan', equityCompensationByStockPlan);

    const rows = createEquityCompensationWithPlanSummaryRows(equityCompensationByStockPlan, stockPlans, totalOutstandingShares);

    return {
        totalSharesAuthorized: stockPlans.reduce((sum, plan) => sum + Number(plan.initial_shares_reserved), 0),
        rows
    };
}

const calculateCaptableStats = async (issuerId) => {
    // First Section: Stock Classes
    const stockClasses = await getAllStockClasses(issuerId);
    const stockIssuances = await getStockIssuances(issuerId);
    const warrantIssuances = await getAllWarrants(issuerId);
    const stockPlans = await getAllStockPlans(issuerId);
    const equityCompensationIssuances = await getAllEquityCompensationIssuances(issuerId);
    console.log('equityCompensationIssuances', equityCompensationIssuances);
    const equityCompensationIssuancesStockPlan = equityCompensationIssuances.filter(issuance => issuance.stock_plan_id && issuance.stock_plan_id !== '');
    const equityCompensationIssuancesWithoutStockPlan = equityCompensationIssuances.filter(issuance => !get(issuance, 'stock_plan_id', null));

    // Creates a map of stockClassId to the total number of shares issued
    const outstandingSharesByStockClass = stockIssuances.reduce((acc, issuance) => {
        const stockClassId = issuance.stock_class_id;
        if (!acc[stockClassId]) {
            acc[stockClassId] = 0;
        }
        acc[stockClassId] += Number(get(issuance, "quantity"));
        return acc;
    }, {});

    const totalOutstandingShares = stockIssuances.reduce((acc, issuance) => acc + Number(issuance.quantity), 0);

    const commonStockClasses = stockClasses.filter((stockClass) => stockClass.class_type === StockClassTypes.COMMON);
    const preferredStockClasses = stockClasses.filter((stockClass) => stockClass.class_type === StockClassTypes.PREFERRED);

    // only used for the voting % calculation
    const commonTotalVotingPower = calculateTotalVotingPower(commonStockClasses, outstandingSharesByStockClass);
    const preferredTotalVotingPower = calculateTotalVotingPower(preferredStockClasses, outstandingSharesByStockClass);
    const totalVotingPower = commonTotalVotingPower + preferredTotalVotingPower;


    return {
        summary: {
            common: calculateStockClassSummary(commonStockClasses, stockIssuances, totalOutstandingShares, totalVotingPower),
            preferred: calculateStockClassSummary(preferredStockClasses, stockIssuances, totalOutstandingShares, totalVotingPower, StockIssuanceTypes.FOUNDERS_STOCK),
            founderPreferred: calculateFounderPreferredSummary(preferredStockClasses, stockIssuances, totalOutstandingShares, totalVotingPower),
            warrantsAndNonPlanAwards: calculateWarrantAndNonPlanAwardSummary(stockClasses, warrantIssuances, equityCompensationIssuancesWithoutStockPlan, totalOutstandingShares),
            stockPlans: calculateStockPlanSummary(stockPlans, equityCompensationIssuancesStockPlan, totalOutstandingShares)
        }
    }


};

export default calculateCaptableStats;
