// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../../lib/diamond-3-hardhat/contracts/Diamond.sol";
import "../../lib/diamond-3-hardhat/contracts/facets/DiamondCutFacet.sol";
import "../../lib/diamond-3-hardhat/contracts/facets/DiamondLoupeFacet.sol";
import "../../lib/diamond-3-hardhat/contracts/facets/OwnershipFacet.sol";

import "../CaptableDiamond.sol";
import "../facets/StockFacet.sol";
import "../facets/StakeHolderFacet.sol";
import {TransactionsFacet} from "../facets/TransactionsFacet.sol";
import "../CapTableFactory.sol";

contract DeployCapTableScript is Script {
    uint256 deployerPrivateKey;

    function setUp() public {
        deployerPrivateKey = vm.envUint("PRIVATE_KEY");
    }

    function run() external {
        console.log("Deploying CapTable Diamond and Facets");
        vm.startBroadcast(deployerPrivateKey);

        // Deploy Diamond Cut Facet
        DiamondCutFacet diamondCutFacet = new DiamondCutFacet();
        console.log("DiamondCutFacet deployed at:", address(diamondCutFacet));

        // Deploy Diamond with DiamondCutFacet
        Diamond diamond = new Diamond(address(this), address(diamondCutFacet));
        console.log("Diamond deployed at:", address(diamond));

        // Deploy facets
        DiamondLoupeFacet diamondLoupeFacet = new DiamondLoupeFacet();
        OwnershipFacet ownershipFacet = new OwnershipFacet();
        StockFacet stockFacet = new StockFacet();
        StakeHolderFacet stakeHolderFacet = new StakeHolderFacet();
        TransactionsFacet transactionsFacet = new TransactionsFacet();

        // Build cut struct for adding facets
        IDiamondCut.FacetCut[] memory cut = new IDiamondCut.FacetCut[](5);

        // Add DiamondLoupeFacet
        cut[0] = IDiamondCut.FacetCut({
            facetAddress: address(diamondLoupeFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: generateSelectors("DiamondLoupeFacet")
        });

        // Add OwnershipFacet
        cut[1] = IDiamondCut.FacetCut({
            facetAddress: address(ownershipFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: generateSelectors("OwnershipFacet")
        });

        // Add StockFacet
        cut[2] = IDiamondCut.FacetCut({
            facetAddress: address(stockFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: generateSelectors("StockFacet")
        });

        // Add StakeHolderFacet
        cut[3] = IDiamondCut.FacetCut({
            facetAddress: address(stakeHolderFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: generateSelectors("StakeHolderFacet")
        });

        // Add TransactionsFacet
        cut[4] = IDiamondCut.FacetCut({
            facetAddress: address(transactionsFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: generateSelectors("TransactionFacet")
        });

        // Upgrade diamond with facets
        IDiamondCut(address(diamond)).diamondCut(cut, address(0), "");

        // Deploy CapTableFactory with diamond implementation
        CapTableFactory factory = new CapTableFactory(address(diamond));
        console.log("CapTableFactory deployed at:", address(factory));

        vm.stopBroadcast();
    }

    function generateSelectors(string memory _facetName) internal returns (bytes4[] memory selectors) {
        string[] memory cmd = new string[](3);
        cmd[0] = "node";
        cmd[1] = "scripts/genSelectors.js";
        cmd[2] = _facetName;
        bytes memory res = vm.ffi(cmd);
        selectors = abi.decode(res, (bytes4[]));
    }
}
