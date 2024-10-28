// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {
    Issuer,
    StockClass,
    StockLegendTemplate,
    ActivePositions,
    StockIssuanceParams,
    StockParams,
    InitialShares,
    SecIdsStockClass
} from "../lib/Structs.sol";
import {StockLib} from "../lib/StockLib.sol";

import {CAPAccessControlFacet} from "./CAPAccessControlFacet.sol";

contract StockFacet is CAPAccessControlFacet {
    function issuer() external view returns (bytes16 id, uint256 shares_issued, uint256 shares_authorized) {
        Issuer memory i = StockLib._s().issuer;
        return (i.id, i.shares_issued, i.shares_authorized);
    }

    function getTotalActiveSecuritiesCount() external view returns (uint256) {
        return StockLib._getTotalActiveSecuritiesCount();
    }

    function seedSharesAuthorizedAndIssued(InitialShares calldata params) external {
        return StockLib._seedSharesAuthorizedAndIssued(params);
    }

    function seedMultipleActivePositionsAndSecurityIds(
        bytes16[] calldata stakeholderIds,
        bytes16[] calldata securityIds,
        bytes16[] calldata stockClassIds,
        uint256[] calldata quantities,
        uint256[] calldata sharePrices,
        uint40[] calldata timestamps
    ) external onlyAdmin {
        return StockLib._seedMultipleActivePositionsAndSecurityIds(
            stakeholderIds, securityIds, stockClassIds, quantities, sharePrices, timestamps
        );
    }

    function createStockClass(
        bytes16 _id,
        string memory _class_type,
        uint256 _price_per_share,
        uint256 _initial_share_authorized
    ) external onlyAdmin {
        return StockLib._createStockClass(_id, _class_type, _price_per_share, _initial_share_authorized);
    }

    // Basic functionality of Stock Legend Template, unclear how it ties to active positions.
    function createStockLegendTemplate(bytes16 _id) external onlyAdmin {
        StockLib._createStockLegendTemplate(_id);
    }

    function issueStock(StockIssuanceParams calldata params) external onlyOperator {
        StockLib._issueStock(params);
    }

    function repurchaseStock(StockParams calldata params, uint256 quantity, uint256 price) external onlyOperator {
        StockLib._repurchaseStock(params, quantity, price);
    }

    function retractStockIssuance(StockParams calldata params) external onlyOperator {
        StockLib._retractStockIssuance(params);
    }

    function reissueStock(StockParams calldata params, bytes16[] memory resulting_security_ids) external onlyOperator {
        StockLib._reissueStock(params, resulting_security_ids);
    }

    function cancelStock(StockParams calldata params, uint256 quantity) external onlyOperator {
        StockLib._cancelStock(params, quantity);
    }

    function transferStock(
        bytes16 transferorStakeholderId,
        bytes16 transfereeStakeholderId,
        bytes16 stockClassId,
        bool isBuyerVerified,
        uint256 quantity,
        uint256 share_price
    ) external onlyOperator {
        StockLib._transferStock(
            transferorStakeholderId, transfereeStakeholderId, stockClassId, isBuyerVerified, quantity, share_price
        );
    }

    // Stock Acceptance does not impact an active position. It's only recorded.
    function acceptStock(bytes16 stakeholderId, bytes16 stockClassId, bytes16 securityId, string[] memory comments)
        external
        onlyOperator
    {
        StockLib._acceptStock(stakeholderId, stockClassId, securityId, comments);
    }

    function adjustIssuerAuthorizedShares(
        uint256 newSharesAuthorized,
        string[] memory comments,
        string memory boardApprovalDate,
        string memory stockholderApprovalDate
    ) external onlyAdmin {
        StockLib._adjustIssuerAuthorizedShares(
            newSharesAuthorized, comments, boardApprovalDate, stockholderApprovalDate
        );
    }

    function adjustStockClassAuthorizedShares(
        bytes16 stockClassId,
        uint256 newAuthorizedShares,
        string[] memory comments,
        string memory boardApprovalDate,
        string memory stockholderApprovalDate
    ) external onlyAdmin {
        StockLib._adjustStockClassAuthorizedShares(
            stockClassId, newAuthorizedShares, comments, boardApprovalDate, stockholderApprovalDate
        );
    }

    function getStockClassById(bytes16 _id) external view returns (bytes16, string memory, uint256, uint256, uint256) {
        return StockLib._getStockClassById(_id);
    }

    function getTotalNumberOfStockClasses() external view returns (uint256) {
        return StockLib._getTotalNumberOfStockClasses();
    }

    function getActivePosition(bytes16 stakeholderId, bytes16 securityId)
        external
        view
        returns (bytes16, uint256, uint256, uint40)
    {
        return StockLib._getActivePosition(stakeholderId, securityId);
    }

    function getAveragePosition(bytes16 stakeholderId, bytes16 stockClassId)
        external
        view
        returns (uint256, uint256, uint40)
    {
        return StockLib._getAveragePosition(stakeholderId, stockClassId);
    }
}
