pragma solidity ^0.8.0;

import {TransactionLib, Tx} from "../lib/TransactionLib.sol";

contract TransactionFacet {
    function transactions(uint256 _idx) external view returns (Tx memory) {
        return TransactionLib._transactions()[_idx];
    }

    function getTransactionsCount() external view returns (uint256) {
        return TransactionLib._transactions().length;
    }
}
