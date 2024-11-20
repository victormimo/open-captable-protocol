// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { StorageLib, Storage } from "../Storage.sol";
import { Issuer, StockClass, StockActivePosition } from "../Structs.sol";
import { TxHelper, TxType } from "../DiamondTxHelper.sol";
import { ValidationLib } from "../libraries/ValidationLib.sol";

contract StockFacet {
    function issueStock(bytes16 stock_class_id, uint256 share_price, uint256 quantity, bytes16 stakeholder_id) external {
        Storage storage ds = StorageLib.get();
        ds.nonce++;

        ValidationLib.validateStakeholder(stakeholder_id);
        ValidationLib.validateStockClass(stock_class_id);
        ValidationLib.validateQuantity(quantity);
        ValidationLib.validateSharesAvailable(stock_class_id, quantity);

        // Generate security ID
        bytes16 securityId = TxHelper.generateDeterministicUniqueID(stakeholder_id, ds.nonce);

        // Update storage
        ds.stockActivePositions.securities[securityId] = StockActivePosition({
            stock_class_id: stock_class_id,
            quantity: quantity,
            share_price: share_price
        });

        // Track security IDs for this stakeholder
        ds.stockActivePositions.stakeholderToSecurities[stakeholder_id].push(securityId);

        // Update share counts
        ds.issuer.shares_issued += quantity;
        StockClass storage stockClass = ds.stockClasses[ds.stockClassIndex[stock_class_id] - 1];
        stockClass.shares_issued += quantity;

        // Store transaction
        bytes memory txData = abi.encode(stock_class_id, share_price, quantity, stakeholder_id, securityId);
        TxHelper.createTx(TxType.STOCK_ISSUANCE, txData);
    }
}
