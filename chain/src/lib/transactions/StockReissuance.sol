// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/utils/math/SafeMath.sol";
import { StockRepurchase, ActivePositions, ActivePosition, SecIdsStockClass, Issuer, StockClass, StockParams } from "../Structs.sol";
import "./StockIssuance.sol";
import "../../transactions/StockReissuanceTX.sol";
import "../TxHelper.sol";
import "../DeleteContext.sol";

// In the MVP, reissuances are meant to fix issuance mistakes.
// It's a manual process of 1. Creating a new issuance and 2. Passing the new issuance security ID as a resulting security ID
library StockReissuanceLib {
    using SafeMath for uint256;

    event StockReissuanceCreated(StockReissuance reissuance);

    function reissueStockByTA(
        StockParams memory params,
        uint256 nonce,
        // bytes16 stakeholderId,
        // bytes16 stockClassId,
        // string[] memory comments,
        // bytes16 securityId,
        bytes16[] memory resulting_security_ids,
        // string memory reason_text,
        ActivePositions storage positions,
        SecIdsStockClass storage activeSecs,
        address[] storage transactions,
        Issuer storage issuer,
        StockClass storage stockClass
    ) external {
        ActivePosition memory activePosition = positions.activePositions[params.stakeholderId][params.securityId];

        nonce++;
        StockReissuance memory reissuance = TxHelper.createStockReissuanceStruct(
            nonce,
            params.comments,
            params.securityId,
            resulting_security_ids,
            params.reasonText
        );

        _reissueStock(reissuance, transactions);

        issuer.shares_issued = issuer.shares_issued.sub(activePosition.quantity);
        stockClass.shares_issued = stockClass.shares_issued.sub(activePosition.quantity);

        DeleteContext.deleteActivePosition(params.stakeholderId, params.securityId, positions);
        DeleteContext.deleteActiveSecurityIdsByStockClass(params.stakeholderId, params.stockClassId, params.securityId, activeSecs);
    }

    function _reissueStock(StockReissuance memory reissuance, address[] storage transactions) internal {
        StockReissuanceTx reissuanceTx = new StockReissuanceTx(reissuance);
        transactions.push(address(reissuanceTx));
        emit StockReissuanceCreated(reissuance);
    }
}
