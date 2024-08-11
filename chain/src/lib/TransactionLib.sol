// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {
    StockIssuance,
    StockIssuanceParams,
    ActivePositions,
    ActivePosition,
    SecIdsStockClass,
    Issuer,
    StockClass,
    StockTransfer,
    StockRepurchase,
    ShareNumbersIssued,
    StockAcceptance,
    StockCancellation,
    StockReissuance,
    StockRetraction,
    IssuerAuthorizedSharesAdjustment,
    StockClassAuthorizedSharesAdjustment,
    StockTransferParams,
    StockParamsQuantity,
    StockIssuanceParams
} from "./Structs.sol";

enum TxType {
    INVALID,
    ISSUER_AUTHORIZED_SHARES_ADJUSTMENT,
    STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT,
    STOCK_ACCEPTANCE,
    STOCK_CANCELLATION,
    STOCK_ISSUANCE,
    STOCK_REISSUANCE,
    STOCK_REPURCHASE,
    STOCK_RETRACTION,
    STOCK_TRANSFER
}

struct Tx {
    TxType txType;
    bytes txData;
}

bytes32 constant STORAGE_SLOT_TXS = keccak256("storage.slot.transactions");

struct TransactionStroage {
    Tx[] transactions;
}

library TransactionLib {
    event TxCreated(uint256 index, TxType txType, bytes txData);

    function _s() internal pure returns (TransactionStroage storage s) {
        bytes32 slot = STORAGE_SLOT_TXS;
        assembly {
            s.slot := slot
        }
    }

    function _transactions() internal view returns (Tx[] storage s) {
        return _s().transactions;
    }

    function createTx(TxType txType, bytes memory txData) internal {
        _transactions().push(Tx(txType, txData));
        emit TxCreated(_transactions().length, txType, txData);
    }
}
