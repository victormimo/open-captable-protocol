// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {
    StockIssuance,
    ActivePosition,
    ShareNumbersIssued,
    ActivePositions,
    SecIdsStockClass,
    Issuer,
    StockClass,
    StockIssuanceParams,
    StockLegendTemplate,
    StockTransferParams,
    StockParamsQuantity,
    StockParams,
    StockCancellation,
    InitialShares
} from "./Structs.sol";
import "./ArrayLib.sol";
import "./StakeHolderLib.sol";
import "./TransactionHelper.sol";
import "./TransactionLib.sol";

struct StockStorage {
    Issuer issuer;
    StockClass[] stockClasses;
    StockLegendTemplate[] stockLegendTemplates;
    uint256 nonce;
    mapping(bytes16 => uint256) stockClassIndex;
    ActivePositions positions;
    SecIdsStockClass activeSecs;
}

bytes32 constant STORAGE_SLOT_STOCK = keccak256("storage.slot.stock");

library StockLib {
    event IssuerCreated(bytes16 indexed id);
    event StockClassCreated(
        bytes16 indexed id, string indexed classType, uint256 indexed pricePerShare, uint256 initialSharesAuthorized
    );

    error StockClassAlreadyExists(bytes16 stock_class_id);
    error StockClassDoesNotExist(bytes16 stock_class_id);
    error InvalidStockClass(bytes16 stock_class_id);
    error InsufficientIssuerSharesAuthorized();
    error InsufficientStockClassSharesAuthorized();
    error NoIssuanceFound();
    error NoActivePositionFound();
    error InsufficientShares(uint256 available, uint256 required);
    error InvalidQuantityOrPrice(uint256 quantity, uint256 price);
    error UnverifiedBuyer();
    error ActivePositionNotFound(bytes16 stakeholderId, bytes16 securityId);

    function _s() internal pure returns (StockStorage storage s) {
        bytes32 slot = STORAGE_SLOT_STOCK;
        assembly {
            s.slot := slot
        }
    }

    function _checkStockClassExists(bytes16 _id) internal view {
        if (_s().stockClassIndex[_id] > 0) {
            revert StockClassAlreadyExists(_id);
        }
    }

    function _checkInvalidStockClass(bytes16 _stock_class_id) internal view {
        if (_s().stockClassIndex[_stock_class_id] == 0) {
            revert InvalidStockClass(_stock_class_id);
        }
    }

    function _checkResultingSecurityIds(
        bytes16[] memory resulting_security_ids,
        bytes16 stakeholder_id,
        bytes16 stock_class_id
    ) internal view {
        if (resulting_security_ids.length == 0) {
            revert NoIssuanceFound();
        }

        bytes16 security_id = resulting_security_ids[0];
        ActivePosition memory activePosition = _s().positions.activePositions[stakeholder_id][security_id];

        if (activePosition.quantity == 0 || activePosition.stock_class_id != stock_class_id) {
            revert NoActivePositionFound();
        }
    }

    function _checkActivePositionExists(ActivePosition memory activePosition) internal pure {
        if (activePosition.quantity == 0) {
            revert NoActivePositionFound();
        }
    }

    function _getTotalActiveSecuritiesCount() internal view returns (uint256) {
        uint256 count = 0;
        uint256 totalStakeholders = StakeHolderLib._getTotalNumberOfStakeholders();
        for (uint256 i = 0; i < totalStakeholders; i++) {
            for (uint256 j = 0; j < _s().stockClasses.length; j++) {
                count += _s().activeSecs.activeSecurityIdsByStockClass[StakeHolderLib._getStakeholderId(i)][_s()
                    .stockClasses[j].id].length;
            }
        }
        return count;
    }

    function _seedSharesAuthorizedAndIssued(InitialShares calldata params) internal {
        require(
            params.issuerInitialShares.shares_authorized > 0 && params.issuerInitialShares.shares_issued > 0
                && params.stockClassesInitialShares.length > 0,
            "Invalid Seeding Shares Params"
        );

        _s().issuer.shares_authorized = params.issuerInitialShares.shares_authorized;
        _s().issuer.shares_issued = params.issuerInitialShares.shares_issued;

        for (uint256 i = 0; i < params.stockClassesInitialShares.length; i++) {
            bytes16 stockClassId = params.stockClassesInitialShares[i].id;
            _checkInvalidStockClass(stockClassId);

            uint256 index = _s().stockClassIndex[stockClassId] - 1;
            _s().stockClasses[index].shares_authorized = params.stockClassesInitialShares[i].shares_authorized;
            _s().stockClasses[index].shares_issued = params.stockClassesInitialShares[i].shares_issued;
        }
    }

    function _seedMultipleActivePositionsAndSecurityIds(
        bytes16[] calldata stakeholderIds,
        bytes16[] calldata securityIds,
        bytes16[] calldata stockClassIds,
        uint256[] calldata quantities,
        uint256[] calldata sharePrices,
        uint40[] calldata timestamps
    ) internal {
        require(
            stakeholderIds.length == securityIds.length && securityIds.length == stockClassIds.length
                && stockClassIds.length == quantities.length && quantities.length == sharePrices.length
                && sharePrices.length == timestamps.length,
            "Input arrays must have the same length"
        );

        for (uint256 i = 0; i < stakeholderIds.length; i++) {
            // perform requires to ensure valid stakeholders and stock classes
            StakeHolderLib._checkStakeholderIsStored(stakeholderIds[i]);
            _checkInvalidStockClass(stockClassIds[i]);
            _s().positions.activePositions[stakeholderIds[i]][securityIds[i]] =
                ActivePosition(stockClassIds[i], quantities[i], sharePrices[i], timestamps[i]);

            _s().activeSecs.activeSecurityIdsByStockClass[stakeholderIds[i]][stockClassIds[i]].push(securityIds[i]);
        }
    }

    function _createStockClass(
        bytes16 _id,
        string memory _class_type,
        uint256 _price_per_share,
        uint256 _initial_share_authorized
    ) internal {
        _checkStockClassExists(_id);

        _s().stockClasses.push(StockClass(_id, _class_type, _price_per_share, 0, _initial_share_authorized));
        _s().stockClassIndex[_id] = _s().stockClasses.length;
        emit StockClassCreated(_id, _class_type, _price_per_share, _initial_share_authorized);
    }

    // Basic functionality of Stock Legend Template, unclear how it ties to active positions.
    function _createStockLegendTemplate(bytes16 _id) internal {
        _s().stockLegendTemplates.push(StockLegendTemplate(_id));
    }

    function _issueStock(StockIssuanceParams calldata params) internal {
        StakeHolderLib._checkStakeholderIsStored(params.stakeholder_id);
        _checkInvalidStockClass(params.stock_class_id);

        StockClass storage stockClass = _s().stockClasses[_s().stockClassIndex[params.stock_class_id] - 1];

        require(
            _s().issuer.shares_issued + params.quantity <= _s().issuer.shares_authorized,
            "Issuer: Insufficient shares authorized"
        );
        require(
            stockClass.shares_issued + params.quantity <= stockClass.shares_authorized,
            "StockClass: Insufficient shares authorized"
        );

        _s().nonce++;

        createIssuance(_s().nonce, params);
    }

    function _repurchaseStock(StockParams calldata params, uint256 quantity, uint256 price) internal {
        StakeHolderLib._checkStakeholderIsStored(params.stakeholder_id);
        _checkInvalidStockClass(params.stock_class_id);

        _s().nonce++;

        StockParamsQuantity memory repurchaseParams = StockParamsQuantity(
            _s().nonce,
            quantity,
            params.stakeholder_id,
            params.stock_class_id,
            params.security_id,
            params.comments,
            params.reason_text
        );

        createRepurchase(repurchaseParams, price);
    }

    function _retractStockIssuance(StockParams calldata params) internal {
        StakeHolderLib._checkStakeholderIsStored(params.stakeholder_id);
        _checkInvalidStockClass(params.stock_class_id);

        _s().nonce++;

        createRetraction(params, _s().nonce);
    }

    function _reissueStock(StockParams calldata params, bytes16[] memory resulting_security_ids) internal {
        StakeHolderLib._checkStakeholderIsStored(params.stakeholder_id);
        _checkInvalidStockClass(params.stock_class_id);
        _checkResultingSecurityIds(resulting_security_ids, params.stakeholder_id, params.stock_class_id);

        _s().nonce++;

        _createReissuance(params, _s().nonce, resulting_security_ids);
    }

    function _cancelStock(StockParams calldata params, uint256 quantity) internal {
        StakeHolderLib._checkStakeholderIsStored(params.stakeholder_id);
        _checkInvalidStockClass(params.stock_class_id);

        _s().nonce++;

        StockParamsQuantity memory cancelParams = StockParamsQuantity(
            _s().nonce,
            quantity,
            params.stakeholder_id,
            params.stock_class_id,
            params.security_id,
            params.comments,
            params.reason_text
        );

        createCancellation(cancelParams);
    }

    function _transferStock(
        bytes16 transferorStakeholderId,
        bytes16 transfereeStakeholderId,
        bytes16 stockClassId,
        bool isBuyerVerified,
        uint256 quantity,
        uint256 share_price
    ) internal {
        StakeHolderLib._checkStakeholderIsStored(transferorStakeholderId);
        StakeHolderLib._checkStakeholderIsStored(transfereeStakeholderId);
        _checkInvalidStockClass(stockClassId);

        _s().nonce++;

        StockTransferParams memory params = StockTransferParams(
            transferorStakeholderId,
            transfereeStakeholderId,
            stockClassId,
            isBuyerVerified,
            quantity,
            share_price,
            _s().nonce
        );

        createTransfer(params);
    }

    // Stock Acceptance does not impact an active position. It's only recorded.
    function _acceptStock(bytes16 stakeholderId, bytes16 stockClassId, bytes16 securityId, string[] memory comments)
        internal
    {
        StakeHolderLib._checkStakeholderIsStored(stakeholderId);
        _checkInvalidStockClass(stockClassId);

        _s().nonce++;

        ActivePosition memory activePosition = _s().positions.activePositions[stakeholderId][securityId];

        _checkActivePositionExists(activePosition);

        createAcceptance(_s().nonce, securityId, comments);
    }

    function _adjustIssuerAuthorizedShares(
        uint256 newSharesAuthorized,
        string[] memory comments,
        string memory boardApprovalDate,
        string memory stockholderApprovalDate
    ) internal {
        require(
            newSharesAuthorized >= _s().issuer.shares_issued,
            "InsufficientIssuerSharesAuthorized: shares_issued exceeds newSharesAuthorized"
        );

        _s().nonce++;

        _adjustIssuerAuthorizedShares(
            _s().nonce, newSharesAuthorized, comments, boardApprovalDate, stockholderApprovalDate
        );
    }

    function _adjustStockClassAuthorizedShares(
        bytes16 stockClassId,
        uint256 newAuthorizedShares,
        string[] memory comments,
        string memory boardApprovalDate,
        string memory stockholderApprovalDate
    ) internal {
        StockClass storage stockClass = _s().stockClasses[_s().stockClassIndex[stockClassId] - 1];
        _checkInvalidStockClass(stockClassId);
        // check that the new stock class authorized is less than the issuer authorized if not revert
        require(
            newAuthorizedShares <= _s().issuer.shares_authorized,
            "InsufficientStockClassSharesAuthorized: stock class authorized shares exceeds issuer shares authorized"
        );

        _s().nonce++;

        // _adjustStockClassAuthorizedShares(
        //     _s().nonce, newAuthorizedShares, comments, boardApprovalDate, stockholderApprovalDate
        // );

        StockClassAuthorizedSharesAdjustment memory adjustment = TransactionHelper.adjustStockClassAuthorizedShares(
            _s().nonce, newAuthorizedShares, comments, boardApprovalDate, stockholderApprovalDate, stockClassId
        );

        stockClass.shares_authorized = newAuthorizedShares;

        TransactionLib.createTx(TxType.STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT, abi.encode(adjustment));
    }

    function _getStockClassById(bytes16 _id)
        internal
        view
        returns (bytes16, string memory, uint256, uint256, uint256)
    {
        if (_s().stockClassIndex[_id] > 0) {
            StockClass memory stockClass = _s().stockClasses[_s().stockClassIndex[_id] - 1];
            return (
                stockClass.id,
                stockClass.class_type,
                stockClass.price_per_share,
                stockClass.shares_issued,
                stockClass.shares_authorized
            );
        } else {
            return ("", "", 0, 0, 0);
        }
    }

    function _getTotalNumberOfStockClasses() internal view returns (uint256) {
        return _s().stockClasses.length;
    }

    function _getActivePosition(bytes16 stakeholderId, bytes16 securityId)
        internal
        view
        returns (bytes16, uint256, uint256, uint40)
    {
        ActivePosition storage position = _s().positions.activePositions[stakeholderId][securityId];
        return (position.stock_class_id, position.quantity, position.share_price, position.timestamp);
    }

    function _getAveragePosition(bytes16 stakeholderId, bytes16 stockClassId)
        internal
        view
        returns (uint256, uint256, uint40)
    {
        bytes16[] memory activeSecurityIDs = _s().activeSecs.activeSecurityIdsByStockClass[stakeholderId][stockClassId];
        uint256 quantityPrice = 0;
        uint256 quantity = 0;
        uint40 timestamp = 0;
        for (uint256 i = 0; i < activeSecurityIDs.length; i++) {
            ActivePosition storage position = _s().positions.activePositions[stakeholderId][activeSecurityIDs[i]];
            // Alley-oop the web2 caller to find the avg to avoid issues with fractions
            quantityPrice += position.quantity * position.share_price;
            quantity += position.quantity;
            timestamp = position.timestamp > timestamp ? position.timestamp : timestamp;
        }
        return (quantityPrice, quantity, timestamp);
    }

    function createIssuance(uint256 nonce, StockIssuanceParams memory issuanceParams) internal {
        _checkInvalidQuantityOrPrice(issuanceParams.quantity, issuanceParams.share_price);

        StockIssuance memory issuance = TransactionHelper.createStockIssuanceStruct(issuanceParams, nonce);
        _updateContext(issuance);
    }

    function createTransfer(StockTransferParams memory params) internal {
        _checkBuyerVerified(params.is_buyer_verified);
        _checkInvalidQuantityOrPrice(params.quantity, params.share_price);
        require(
            _s().activeSecs.activeSecurityIdsByStockClass[params.transferor_stakeholder_id][params.stock_class_id]
                .length > 0,
            "No active security ids found"
        );
        bytes16[] memory activeSecurityIDs =
            _s().activeSecs.activeSecurityIdsByStockClass[params.transferor_stakeholder_id][params.stock_class_id];

        uint256 sum = 0;
        uint256 numSecurityIds = 0;

        for (uint256 index = 0; index < activeSecurityIDs.length; index++) {
            ActivePosition storage activePosition =
                _s().positions.activePositions[params.transferor_stakeholder_id][activeSecurityIDs[index]];
            sum += activePosition.quantity;

            numSecurityIds += 1;
            if (sum >= params.quantity) {
                break;
            }
        }

        _checkInsuffientAmount(sum, params.quantity);

        uint256 remainingQuantity = params.quantity;

        for (uint256 index = 0; index < numSecurityIds; index++) {
            bytes16 active_security_id = activeSecurityIDs[index];

            ActivePosition storage activePosition =
                _s().positions.activePositions[params.transferor_stakeholder_id][active_security_id];

            uint256 transferQuantity = remainingQuantity;

            if (activePosition.quantity <= remainingQuantity) {
                transferQuantity = activePosition.quantity;
            }

            params.quantity = transferQuantity;

            _transferSingleStock(params, active_security_id);

            remainingQuantity -= transferQuantity;

            if (remainingQuantity == 0) {
                break;
            }
        }
    }

    function createCancellation(StockParamsQuantity memory params) internal {
        ActivePosition memory activePosition = _s().positions.activePositions[params.stakeholder_id][params.security_id];

        _checkActivePositionExists(activePosition, params.stakeholder_id, params.security_id);
        _checkInsuffientAmount(activePosition.quantity, params.quantity);

        uint256 remainingQuantity = activePosition.quantity - params.quantity;
        bytes16 balance_security_id = "";

        if (remainingQuantity > 0) {
            StockTransferParams memory transferParams = StockTransferParams(
                params.stakeholder_id,
                bytes16(0),
                params.stock_class_id,
                true,
                remainingQuantity,
                activePosition.share_price,
                params.nonce
            );
            StockIssuance memory balanceIssuance = TransactionHelper.createStockIssuanceStructForTransfer(
                transferParams, transferParams.transferor_stakeholder_id
            );

            _updateContext(balanceIssuance);

            balance_security_id = balanceIssuance.security_id;
        }

        StockCancellation memory cancellation = TransactionHelper.createStockCancellationStruct(
            params.nonce, params.quantity, params.comments, params.security_id, params.reason_text, balance_security_id
        );

        TransactionLib.createTx(TxType.STOCK_CANCELLATION, abi.encode(cancellation));

        _subtractSharesIssued(params.stock_class_id, activePosition.quantity);

        _deleteActivePosition(params.stakeholder_id, params.security_id);
        _deleteActiveSecurityIdsByStockClass(params.stakeholder_id, params.stock_class_id, params.security_id);
    }

    function _createReissuance(StockParams memory params, uint256 nonce, bytes16[] memory resulting_security_ids)
        internal
    {
        ActivePosition memory activePosition = _s().positions.activePositions[params.stakeholder_id][params.security_id];

        _checkActivePositionExists(activePosition, params.stakeholder_id, params.security_id);

        StockReissuance memory reissuance = TransactionHelper.createStockReissuanceStruct(
            nonce, params.comments, params.security_id, resulting_security_ids, params.reason_text
        );

        TransactionLib.createTx(TxType.STOCK_REISSUANCE, abi.encode(reissuance));

        _subtractSharesIssued(params.stock_class_id, activePosition.quantity);

        _deleteActivePosition(params.stakeholder_id, params.security_id);
        _deleteActiveSecurityIdsByStockClass(params.stakeholder_id, params.stock_class_id, params.security_id);
    }

    function createRepurchase(StockParamsQuantity memory params, uint256 price) internal {
        ActivePosition memory activePosition = _s().positions.activePositions[params.stakeholder_id][params.security_id];

        _checkActivePositionExists(activePosition, params.stakeholder_id, params.security_id);
        _checkInsuffientAmount(activePosition.quantity, params.quantity);

        uint256 remainingQuantity = activePosition.quantity - params.quantity;
        bytes16 balance_security_id = "";

        if (remainingQuantity > 0) {
            StockTransferParams memory transferParams = StockTransferParams(
                params.stakeholder_id,
                bytes16(0),
                params.stock_class_id,
                true,
                remainingQuantity,
                activePosition.share_price,
                params.nonce
            );
            StockIssuance memory balanceIssuance = TransactionHelper.createStockIssuanceStructForTransfer(
                transferParams, transferParams.transferor_stakeholder_id
            );

            _updateContext(balanceIssuance);

            balance_security_id = balanceIssuance.security_id;
        }

        StockRepurchase memory repurchase = TransactionHelper.createStockRepurchaseStruct(params, price);

        TransactionLib.createTx(TxType.STOCK_REPURCHASE, abi.encode(repurchase));

        _subtractSharesIssued(params.stock_class_id, activePosition.quantity);

        _deleteActivePosition(params.stakeholder_id, params.security_id);
        _deleteActiveSecurityIdsByStockClass(params.stakeholder_id, params.stock_class_id, params.security_id);
    }

    function createRetraction(StockParams memory params, uint256 nonce) internal {
        ActivePosition memory activePosition = _s().positions.activePositions[params.stakeholder_id][params.security_id];

        _checkActivePositionExists(activePosition, params.stakeholder_id, params.security_id);

        StockRetraction memory retraction = TransactionHelper.createStockRetractionStruct(
            nonce, params.comments, params.security_id, params.reason_text
        );
        TransactionLib.createTx(TxType.STOCK_RETRACTION, abi.encode(retraction));

        _subtractSharesIssued(params.stock_class_id, activePosition.quantity);

        _deleteActivePosition(params.stakeholder_id, params.security_id);
        _deleteActiveSecurityIdsByStockClass(params.stakeholder_id, params.stock_class_id, params.security_id);
    }

    function createAcceptance(uint256 nonce, bytes16 securityId, string[] memory comments) internal {
        StockAcceptance memory acceptance = TransactionHelper.createStockAcceptanceStruct(nonce, comments, securityId);

        TransactionLib.createTx(TxType.STOCK_ACCEPTANCE, abi.encode(acceptance));
    }

    function _updateContext(StockIssuance memory issuance) internal {
        _s().activeSecs.activeSecurityIdsByStockClass[issuance.params.stakeholder_id][issuance.params.stock_class_id]
            .push(issuance.security_id);

        _s().positions.activePositions[issuance.params.stakeholder_id][issuance.security_id] = ActivePosition(
            issuance.params.stock_class_id,
            issuance.params.quantity,
            issuance.params.share_price,
            _safeNow() // TODO: only using current datetime doesn't allow us to support backfilling transactions.
        );

        StockClass storage stockClass = _s().stockClasses[_s().stockClassIndex[issuance.params.stock_class_id] - 1];

        _s().issuer.shares_issued = _s().issuer.shares_issued + issuance.params.quantity;
        stockClass.shares_issued = stockClass.shares_issued + issuance.params.quantity;

        TransactionLib.createTx(TxType.STOCK_ISSUANCE, abi.encode(issuance));
    }

    function _safeNow() internal view returns (uint40) {
        return uint40(block.timestamp);
    }

    function _subtractSharesIssued(bytes16 stock_class_id, uint256 quantity) internal {
        StockClass storage stockClass = _s().stockClasses[_s().stockClassIndex[stock_class_id] - 1];
        _s().issuer.shares_issued = _s().issuer.shares_issued - quantity;
        stockClass.shares_issued = stockClass.shares_issued - quantity;
    }

    // isBuyerVerified is a placeholder for a signature, account or hash that confirms the buyer's identity. TODO: delete if not necessary
    function _transferSingleStock(StockTransferParams memory params, bytes16 transferorSecurityId) internal {
        ActivePosition memory transferorActivePosition =
            _s().positions.activePositions[params.transferor_stakeholder_id][transferorSecurityId];

        _checkInsuffientAmount(transferorActivePosition.quantity, params.quantity);

        StockIssuance memory transfereeIssuance =
            TransactionHelper.createStockIssuanceStructForTransfer(params, params.transferee_stakeholder_id);

        _updateContext(transfereeIssuance);

        uint256 balanceForTransferor = transferorActivePosition.quantity - params.quantity;

        bytes16 balance_security_id = "";

        StockTransferParams memory newParams = StockTransferParams(
            params.transferor_stakeholder_id,
            params.transferee_stakeholder_id,
            params.stock_class_id,
            params.is_buyer_verified,
            params.quantity,
            params.share_price,
            params.nonce
        );
        newParams.quantity = balanceForTransferor;
        newParams.share_price = transferorActivePosition.share_price;

        if (balanceForTransferor > 0) {
            StockIssuance memory transferorBalanceIssuance =
                TransactionHelper.createStockIssuanceStructForTransfer(newParams, newParams.transferor_stakeholder_id);

            _updateContext(transferorBalanceIssuance);

            balance_security_id = transferorBalanceIssuance.security_id;
        }

        StockTransfer memory transfer = TransactionHelper.createStockTransferStruct(
            params.nonce, params.quantity, transferorSecurityId, transfereeIssuance.security_id, balance_security_id
        );

        TransactionLib.createTx(TxType.STOCK_TRANSFER, abi.encode(transfer));

        _subtractSharesIssued(params.stock_class_id, transferorActivePosition.quantity);

        _deleteActivePosition(params.transferor_stakeholder_id, transferorSecurityId);
        _deleteActiveSecurityIdsByStockClass(
            params.transferor_stakeholder_id, params.stock_class_id, transferorSecurityId
        );
    }

    function _checkInvalidQuantityOrPrice(uint256 quantity, uint256 price) internal pure {
        if (quantity <= 0 || price <= 0) {
            revert InvalidQuantityOrPrice(quantity, price);
        }
    }

    function _checkInsuffientAmount(uint256 available, uint256 desired) internal pure {
        if (available < desired) {
            revert InsufficientShares(available, desired);
        }
    }

    function _checkActivePositionExists(ActivePosition memory activePosition, bytes16 stakeholderId, bytes16 securityId)
        internal
        pure
    {
        if (activePosition.quantity == 0) {
            revert ActivePositionNotFound(stakeholderId, securityId);
        }
    }

    function _checkBuyerVerified(bool isBuyerVerified) internal pure {
        if (!isBuyerVerified) {
            revert UnverifiedBuyer();
        }
    }

    function _adjustIssuerAuthorizedShares(
        uint256 nonce,
        uint256 newSharesAuthorized,
        string[] memory comments,
        string memory boardApprovalDate,
        string memory stockholderApprovalDate
    ) internal {
        IssuerAuthorizedSharesAdjustment memory adjustment = TransactionHelper.adjustIssuerAuthorizedShares(
            nonce, newSharesAuthorized, comments, boardApprovalDate, stockholderApprovalDate, _s().issuer.id
        );

        _s().issuer.shares_authorized = newSharesAuthorized;

        TransactionLib.createTx(TxType.ISSUER_AUTHORIZED_SHARES_ADJUSTMENT, abi.encode(adjustment));
    }

    function _deleteActivePosition(bytes16 _stakeholder_id, bytes16 _security_id) internal {
        delete _s().positions.activePositions[_stakeholder_id][_security_id];
    }

    // Active Security IDs by Stock Class { "stakeholder_id": { "stock_class_id-1": ["sec-id-1", "sec-id-2"] } }
    function _deleteActiveSecurityIdsByStockClass(
        bytes16 _stakeholder_id,
        bytes16 _stock_class_id,
        bytes16 _security_id
    ) internal {
        bytes16[] storage securities = _s().activeSecs.activeSecurityIdsByStockClass[_stakeholder_id][_stock_class_id];

        uint256 index = ArrayLib.find(securities, _security_id);
        if (index != type(uint256).max) {
            ArrayLib.remove(securities, index);
        }
    }
}
