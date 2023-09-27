// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Issuer, Stakeholder, StockClass, ActivePositions, SecIdsStockClass } from "./lib/Structs.sol";
import "./lib/TxHelper.sol";
import "./transactions/StockIssuanceTX.sol";
import "./transactions/StockTransferTX.sol";
import "./lib/Arrays.sol";
import "./lib/transactions/StockIssuance.sol";
import "./lib/transactions/StockTransfer.sol";
import "./lib/transactions/StockCancellation.sol";

contract CapTableLibs {
    Issuer public issuer;
    Stakeholder[] public stakeholders;
    StockClass[] public stockClasses;
    // @dev Transactions will be created on-chain then reflected off-chain.
    address[] public transactions;

    // used to help generate deterministic UUIDs
    uint256 private nonce;

    // O(1) search
    // id -> index
    mapping(bytes16 => uint256) stakeholderIndex;
    mapping(bytes16 => uint256) stockClassIndex;

    // bit wonky but experimenting -> positions.activePositions
    ActivePositions positions;
    // bit wonky but experimenting -> activeSecs.activeSecurityIdsByStockClass
    SecIdsStockClass activeSecs;

    event IssuerCreated(bytes16 indexed id, string indexed _name);
    event StakeholderCreated(bytes16 indexed id);
    event StockClassCreated(bytes16 indexed id, string indexed classType, uint256 indexed pricePerShare, uint256 initialSharesAuthorized);

    constructor(bytes16 _id, string memory _name) {
        nonce = 0;
        issuer = Issuer(_id, _name);
        emit IssuerCreated(_id, _name);
    }

    function createStakeholder(bytes16 _id, string memory _stakeholder_type, string memory _current_relationship) public {
        require(stakeholderIndex[_id] == 0, "Stakeholder already exists");
        stakeholders.push(Stakeholder(_id, _stakeholder_type, _current_relationship));
        stakeholderIndex[_id] = stakeholders.length;
        emit StakeholderCreated(_id);
    }

    function createStockClass(bytes16 _id, string memory _class_type, uint256 _price_per_share, uint256 _initial_share_authorized) public {
        require(stockClassIndex[_id] == 0, "Stock class already exists");

        stockClasses.push(StockClass(_id, _class_type, _price_per_share, _initial_share_authorized));
        stockClassIndex[_id] = stockClasses.length;
        emit StockClassCreated(_id, _class_type, _price_per_share, _initial_share_authorized);
    }

    // can extend this to check that it's not issuing more than stock_class initial shares issued
    // TODO: small syntax but change this to issueStock
    function issueStockByTA(
        bytes16 stockClassId,
        bytes16 stockPlanId,
        ShareNumbersIssued memory shareNumbersIssued,
        uint256 sharePrice,
        uint256 quantity,
        bytes16 vestingTermsId,
        uint256 costBasis,
        bytes16[] memory stockLegendIds,
        string memory issuanceType,
        string[] memory comments,
        string memory customId,
        bytes16 stakeholderId,
        string memory boardApprovalDate,
        string memory stockholderApprovalDate,
        string memory considerationText,
        string[] memory securityLawExemptions
    ) external {
        require(stakeholderIndex[stakeholderId] > 0, "No stakeholder");
        require(stockClassIndex[stockClassId] > 0, "Invalid stock class");

        nonce++;

        StockIssuanceLib.createStockIssuanceByTA(
            nonce,
            stockClassId,
            stockPlanId,
            shareNumbersIssued,
            sharePrice,
            quantity,
            vestingTermsId,
            costBasis,
            stockLegendIds,
            issuanceType,
            comments,
            customId,
            stakeholderId,
            boardApprovalDate,
            stockholderApprovalDate,
            considerationText,
            securityLawExemptions,
            positions,
            activeSecs,
            transactions
        );
    }

    function cancelStock(
        bytes16 stakeholderId, // not OCF, but required to fetch activePositions
        bytes16 stockClassId, //  not OCF, but required to fetch activePositions
        bytes16 securityId,
        string[] memory comments,
        string memory reasonText,
        uint256 quantity
    ) external {
        require(stakeholderIndex[stakeholderId] > 0, "No stakeholder");
        require(stockClassIndex[stockClassId] > 0, "Invalid stock class");

        // need a require for activePositions
        StockCancellationLib.cancelStockByTA(
            nonce,
            stakeholderId,
            stockClassId,
            securityId,
            comments,
            reasonText,
            quantity,
            positions,
            activeSecs,
            transactions
        );
    }

    function transferStock(
        bytes16 transferorStakeholderId,
        bytes16 transfereeStakeholderId,
        bytes16 stockClassId, // TODO: verify that we would have fong would have the stock class
        bool isBuyerVerified,
        uint256 quantity,
        uint256 share_price
    ) external {
        require(stakeholderIndex[transferorStakeholderId] > 0, "No transferor");
        require(stakeholderIndex[transfereeStakeholderId] > 0, "No transferee");
        require(stockClassIndex[stockClassId] > 0, "Invalid stock class");

        nonce++;
        StockTransferLib.transferStock(
            transferorStakeholderId,
            transfereeStakeholderId,
            stockClassId,
            isBuyerVerified,
            quantity,
            share_price,
            nonce,
            positions,
            activeSecs,
            transactions
        );
    }
}
