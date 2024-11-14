export const dashboardInitialState = (stakeholders) => {
    return {
        sharesIssuedByCurrentRelationship: {},
        positions: [],
        numOfStakeholders: stakeholders.length,
        totalRaised: 0,
        latestSharePrice: 0,
        valuations: {
            stock: null, // { amount, createdAt, type: 'STOCK' }
            convertible: null, // { amount, createdAt, type: 'CONVERTIBLE' }
        },
    };
};

export const processDashboardConvertibleIssuance = (state, transaction, stakeholder) => {
    // Get investment amount based on transaction type
    const investmentAmount = transaction.object_type === "TX_WARRANT_ISSUANCE" ? transaction.purchase_price : transaction.investment_amount;

    const shouldCountTowardsRaised = stakeholder && !["FOUNDER", "BOARD_MEMBER"].includes(stakeholder.current_relationship);
    const amountToAdd = shouldCountTowardsRaised ? Number(investmentAmount?.amount || 0) : 0;

    const conversionTriggers = transaction.conversion_triggers || [];
    let conversionValuationCap = null;

    // Look for SAFE, Convertible Note, and Warrant conversions with valuation cap
    conversionTriggers.forEach((trigger) => {
        if (
            trigger.conversion_right?.type === "CONVERTIBLE_CONVERSION_RIGHT" &&
            (trigger.conversion_right?.conversion_mechanism?.type === "SAFE_CONVERSION" ||
                trigger.conversion_right?.conversion_mechanism?.type === "CONVERTIBLE_NOTE_CONVERSION" ||
                trigger.conversion_right?.conversion_mechanism?.type === "WARRANT_CONVERSION")
        ) {
            conversionValuationCap = trigger.conversion_right.conversion_mechanism.conversion_valuation_cap?.amount;
        }
    });

    // Only update if we found a valuation cap
    const newValuation = conversionValuationCap
        ? {
              type: "CONVERTIBLE",
              amount: Number(conversionValuationCap),
              createdAt: transaction.createdAt,
          }
        : state.valuations.convertible;

    return {
        totalRaised: state.totalRaised + amountToAdd,
        sharesIssuedByCurrentRelationship: {
            ...state.sharesIssuedByCurrentRelationship,
            [stakeholder.current_relationship]: state.sharesIssuedByCurrentRelationship[stakeholder.current_relationship] || 0,
        },
        valuations: {
            ...state.valuations,
            convertible: newValuation,
        },
    };
};

export const processDashboardStockIssuance = (state, transaction, stakeholder) => {
    const { share_price, quantity } = transaction;
    const numShares = parseInt(quantity);

    // Check if stakeholder is founder/board member
    const shouldCountTowardsRaised = stakeholder && !["FOUNDER", "BOARD_MEMBER"].includes(stakeholder.current_relationship);
    const amountToAdd = shouldCountTowardsRaised ? numShares * Number(share_price.amount) : 0;

    const newValuation = {
        type: "STOCK",
        amount: (state.issuer.sharesIssued + numShares) * Number(share_price.amount),
        createdAt: transaction.createdAt,
    };

    return {
        sharesIssuedByCurrentRelationship: {
            ...state.sharesIssuedByCurrentRelationship,
            [stakeholder.current_relationship]: (state.sharesIssuedByCurrentRelationship[stakeholder.current_relationship] || 0) + numShares,
        },
        totalRaised: state.totalRaised + amountToAdd,
        latestSharePrice: share_price?.amount || state.latestSharePrice,
        valuations: {
            ...state.valuations,
            stock: newValuation,
        },
    };
};
