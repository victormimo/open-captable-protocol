// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/interfaces/ICapTable.sol";
import "../src/CapTableFactory.sol";
import "../src/CapTableDiamond.sol";
import "../src/facets/StockFacet.sol";
import "../src/facets/TransactionsFacet.sol";
import "../src/facets/StakeHolderFacet.sol";
import "../src/facets/CAPAccessControlFacet.sol";
import "../src/lib/Structs.sol";
import "../lib/diamond-3-hardhat/contracts/interfaces/IDiamondCut.sol";
import "../lib/diamond-3-hardhat/contracts/Diamond.sol";
import "../lib/diamond-3-hardhat/contracts/facets/DiamondCutFacet.sol";
import "../lib/diamond-3-hardhat/contracts/facets/DiamondLoupeFacet.sol";
import {SecurityLawExemption} from "../src/lib/Structs.sol";

contract CapTableTest is Test {
    ICapTable public capTable;
    uint256 public issuerInitialSharesAuthorized = 1000000;
    bytes16 issuerId = 0xd3373e0a4dd9430f8a563281f2800e1e;

    address public contractOwner;

    DiamondCutFacet public dcf;
    DiamondLoupeFacet public dlf;
    CapTableDiamond public ctd;
    StockFacet public sf;
    TransactionsFacet public tf;
    StakeHolderFacet public shf;
    CAPAccessControlFacet public acf;

    function setUp() public {
        //ICapTable capTableImplementation = new CapTable();
        contractOwner = address(this);
        dcf = new DiamondCutFacet();
        dlf = new DiamondLoupeFacet();
        ctd = new CapTableDiamond();
        sf = new StockFacet();
        tf = new TransactionsFacet();
        shf = new StakeHolderFacet();
        acf = new CAPAccessControlFacet();
        Diamond proxy = new Diamond(contractOwner, address(dcf));
        IDiamondCut.FacetCut[] memory cut = new IDiamondCut.FacetCut[](6);
        bytes4[] memory functionSelectors = new bytes4[](5);
        functionSelectors[0] = DiamondLoupeFacet.facets.selector;
        functionSelectors[1] = DiamondLoupeFacet.facetFunctionSelectors.selector;
        functionSelectors[2] = DiamondLoupeFacet.facetAddresses.selector;
        functionSelectors[3] = DiamondLoupeFacet.facetAddress.selector;
        functionSelectors[4] = DiamondLoupeFacet.supportsInterface.selector;
        cut[0] = IDiamondCut.FacetCut({
            facetAddress: address(dlf),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: functionSelectors
        });
        bytes4[] memory initselectors = new bytes4[](1);
        initselectors[0] = CapTableDiamond.initialize.selector;
        cut[1] = IDiamondCut.FacetCut({
            facetAddress: address(ctd),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: initselectors
        });
        bytes4[] memory stockSelectors = new bytes4[](19);
        stockSelectors[0] = StockFacet.issuer.selector;
        stockSelectors[1] = StockFacet.getTotalActiveSecuritiesCount.selector;
        stockSelectors[2] = StockFacet.seedSharesAuthorizedAndIssued.selector;
        stockSelectors[3] = StockFacet.seedMultipleActivePositionsAndSecurityIds.selector;
        stockSelectors[4] = StockFacet.createStockClass.selector;
        stockSelectors[5] = StockFacet.createStockLegendTemplate.selector;
        stockSelectors[6] = StockFacet.issueStock.selector;
        stockSelectors[7] = StockFacet.repurchaseStock.selector;
        stockSelectors[8] = StockFacet.retractStockIssuance.selector;
        stockSelectors[9] = StockFacet.reissueStock.selector;
        stockSelectors[10] = StockFacet.cancelStock.selector;
        stockSelectors[11] = StockFacet.transferStock.selector;
        stockSelectors[12] = StockFacet.acceptStock.selector;
        stockSelectors[13] = StockFacet.adjustIssuerAuthorizedShares.selector;
        stockSelectors[14] = StockFacet.adjustStockClassAuthorizedShares.selector;
        stockSelectors[15] = StockFacet.getStockClassById.selector;
        stockSelectors[16] = StockFacet.getTotalNumberOfStockClasses.selector;
        stockSelectors[17] = StockFacet.getActivePosition.selector;
        stockSelectors[18] = StockFacet.getAveragePosition.selector;
        cut[2] = IDiamondCut.FacetCut({
            facetAddress: address(sf),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: stockSelectors
        });
        bytes4[] memory txSelectors = new bytes4[](2);
        txSelectors[0] = TransactionsFacet.transactions.selector;
        txSelectors[1] = TransactionsFacet.getTransactionsCount.selector;
        cut[3] = IDiamondCut.FacetCut({
            facetAddress: address(tf),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: txSelectors
        });
        bytes4[] memory stakeHolderSelectors = new bytes4[](6);
        stakeHolderSelectors[0] = StakeHolderFacet.createStakeholder.selector;
        stakeHolderSelectors[1] = StakeHolderFacet.getStakeholderById.selector;
        stakeHolderSelectors[2] = StakeHolderFacet.getTotalNumberOfStakeholders.selector;
        stakeHolderSelectors[3] = StakeHolderFacet.getStakeholderIdByWallet.selector;
        stakeHolderSelectors[4] = StakeHolderFacet.addWalletToStakeholder.selector;
        stakeHolderSelectors[5] = StakeHolderFacet.removeWalletFromStakeholder.selector;
        cut[4] = IDiamondCut.FacetCut({
            facetAddress: address(shf),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: stakeHolderSelectors
        });
        bytes4[] memory accessControlSelectors = new bytes4[](4);
        accessControlSelectors[0] = CAPAccessControlFacet.addAdmin.selector;
        accessControlSelectors[1] = CAPAccessControlFacet.removeAdmin.selector;
        accessControlSelectors[2] = CAPAccessControlFacet.addOperator.selector;
        accessControlSelectors[3] = CAPAccessControlFacet.removeOperator.selector;
        cut[5] = IDiamondCut.FacetCut({
            facetAddress: address(acf),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: accessControlSelectors
        });
        capTable = ICapTable(address(proxy));
        DiamondCutFacet(address(proxy)).diamondCut(cut, address(0), hex"");
        CapTableDiamond(address(proxy)).initialize(issuerId, issuerInitialSharesAuthorized, contractOwner);
    }

    // HELPERS //
    function createPranksterAndExpectRevert() public {
        address prankster = address(0);
        vm.prank(prankster);
        vm.expectRevert("Does not have admin role");
    }

    // function createStockClassAndStakeholder(uint256 stockClassInitialSharesAuthorized)
    //     public
    //     returns (bytes16, bytes16)
    // {
    //     bytes16 stakeholderId = 0xd3373e0a4dd940000000000000000005;
    //     capTable.createStakeholder(stakeholderId, "INDIVIDUAL", "EMPLOYEE");

    //     bytes16 stockClassId = 0xd3373e0a4dd940000000000000000000;
    //     capTable.createStockClass(stockClassId, "COMMON", 100, stockClassInitialSharesAuthorized);

    //     return (stockClassId, stakeholderId);
    // }

    function issueStock(bytes16 stockClassId, bytes16 stakeholderId, uint256 quantity) public {
        // Issue stock
        StockIssuanceParams memory issuanceParams = StockIssuanceParams({
            stock_class_id: stockClassId,
            stock_plan_id: 0x00000000000000000000000000000000,
            share_numbers_issued: ShareNumbersIssued(0, 0),
            share_price: 100,
            quantity: quantity,
            vesting_terms_id: 0x00000000000000000000000000000000,
            cost_basis: 50,
            stock_legend_ids: new bytes16[](0),
            issuance_type: "RSA",
            comments: new string[](0),
            custom_id: "R2-D2",
            stakeholder_id: stakeholderId,
            board_approval_date: "2023-01-01",
            stockholder_approval_date: "2023-01-02",
            consideration_text: "For services rendered",
            security_law_exemptions: new SecurityLawExemption[](0)
        });
        capTable.issueStock(issuanceParams);
    }
}
