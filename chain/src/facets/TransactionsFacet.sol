// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {TransactionLib, Tx} from "../lib/TransactionLib.sol";

contract TransactionsFacet {
    function transactions(uint256 _idx) external view returns (bytes memory) {
        return TransactionLib._transactions()[_idx].txData;
    }

    function getTransactionsCount() external view returns (uint256) {
        return TransactionLib._transactions().length;
    }
}
