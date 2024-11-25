// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import { DiamondCapTableFactory } from "../src/lib/diamond/DiamondCapTableFactory.sol";
import { DiamondCutFacet } from "diamond-3-hardhat/facets/DiamondCutFacet.sol";
import { IssuerFacet } from "../src/lib/diamond/facets/IssuerFacet.sol";
import { StakeholderFacet } from "../src/lib/diamond/facets/StakeholderFacet.sol";
import { StockClassFacet } from "../src/lib/diamond/facets/StockClassFacet.sol";
import { StockFacet } from "../src/lib/diamond/facets/StockFacet.sol";
import { ConvertiblesFacet } from "../src/lib/diamond/facets/ConvertiblesFacet.sol";
import { EquityCompensationFacet } from "../src/lib/diamond/facets/EquityCompensationFacet.sol";
import { StockPlanFacet } from "../src/lib/diamond/facets/StockPlanFacet.sol";
import { WarrantFacet } from "../src/lib/diamond/facets/WarrantFacet.sol";
import { StakeholderNFTFacet } from "../src/lib/diamond/facets/StakeholderNFTFacet.sol";

contract DeployDiamondCapTableScript is Script {
    // Anvil's first default account private key
    uint256 constant ANVIL_PRIVATE_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address deployer;

    // Facet addresses
    address public diamondCutFacet;
    address public issuerFacet;
    address public stakeholderFacet;
    address public stockClassFacet;
    address public stockFacet;
    address public convertiblesFacet;
    address public equityCompensationFacet;
    address public stockPlanFacet;
    address public warrantFacet;
    address public stakeholderNFTFacet;

    function setUp() public {
        console.log("Setting up DiamondCapTable deployment");
        deployer = vm.addr(ANVIL_PRIVATE_KEY);
        console.log("Deployer address:", deployer);

        // Try to load existing facet addresses from environment
        diamondCutFacet = vm.envOr("DIAMOND_CUT_FACET", address(0));
        issuerFacet = vm.envOr("ISSUER_FACET", address(0));
        stakeholderFacet = vm.envOr("STAKEHOLDER_FACET", address(0));
        stockClassFacet = vm.envOr("STOCK_CLASS_FACET", address(0));
        stockFacet = vm.envOr("STOCK_FACET", address(0));
        convertiblesFacet = vm.envOr("CONVERTIBLES_FACET", address(0));
        equityCompensationFacet = vm.envOr("EQUITY_COMPENSATION_FACET", address(0));
        stockPlanFacet = vm.envOr("STOCK_PLAN_FACET", address(0));
        warrantFacet = vm.envOr("WARRANT_FACET", address(0));
        stakeholderNFTFacet = vm.envOr("STAKEHOLDER_NFT_FACET", address(0));
    }

    function run() external {
        console.log("Deploying DiamondCapTable system");
        vm.startBroadcast(ANVIL_PRIVATE_KEY);

        // Deploy missing facets if needed
        if (diamondCutFacet == address(0)) {
            diamondCutFacet = address(new DiamondCutFacet());
            console.log("DiamondCutFacet deployed at:", diamondCutFacet);
        }
        if (issuerFacet == address(0)) {
            issuerFacet = address(new IssuerFacet());
            console.log("IssuerFacet deployed at:", issuerFacet);
        }
        if (stakeholderFacet == address(0)) {
            stakeholderFacet = address(new StakeholderFacet());
            console.log("StakeholderFacet deployed at:", stakeholderFacet);
        }
        if (stockClassFacet == address(0)) {
            stockClassFacet = address(new StockClassFacet());
            console.log("StockClassFacet deployed at:", stockClassFacet);
        }
        if (stockFacet == address(0)) {
            stockFacet = address(new StockFacet());
            console.log("StockFacet deployed at:", stockFacet);
        }
        if (convertiblesFacet == address(0)) {
            convertiblesFacet = address(new ConvertiblesFacet());
            console.log("ConvertiblesFacet deployed at:", convertiblesFacet);
        }
        if (equityCompensationFacet == address(0)) {
            equityCompensationFacet = address(new EquityCompensationFacet());
            console.log("EquityCompensationFacet deployed at:", equityCompensationFacet);
        }
        if (stockPlanFacet == address(0)) {
            stockPlanFacet = address(new StockPlanFacet());
            console.log("StockPlanFacet deployed at:", stockPlanFacet);
        }
        if (warrantFacet == address(0)) {
            warrantFacet = address(new WarrantFacet());
            console.log("WarrantFacet deployed at:", warrantFacet);
        }
        if (stakeholderNFTFacet == address(0)) {
            stakeholderNFTFacet = address(new StakeholderNFTFacet());
            console.log("StakeholderNFTFacet deployed at:", stakeholderNFTFacet);
        }

        // Deploy factory with all facets
        DiamondCapTableFactory factory = new DiamondCapTableFactory(
            diamondCutFacet,
            issuerFacet,
            stakeholderFacet,
            stockClassFacet,
            stockFacet,
            convertiblesFacet,
            equityCompensationFacet,
            stockPlanFacet,
            warrantFacet,
            stakeholderNFTFacet
        );

        console.log("\nDiamondCapTableFactory deployed at:", address(factory));

        // Log all facet addresses for future reference
        console.log("\nFacet Addresses:");
        console.log("DIAMOND_CUT_FACET=", diamondCutFacet);
        console.log("ISSUER_FACET=", issuerFacet);
        console.log("STAKEHOLDER_FACET=", stakeholderFacet);
        console.log("STOCK_CLASS_FACET=", stockClassFacet);
        console.log("STOCK_FACET=", stockFacet);
        console.log("CONVERTIBLES_FACET=", convertiblesFacet);
        console.log("EQUITY_COMPENSATION_FACET=", equityCompensationFacet);
        console.log("STOCK_PLAN_FACET=", stockPlanFacet);
        console.log("WARRANT_FACET=", warrantFacet);
        console.log("STAKEHOLDER_NFT_FACET=", stakeholderNFTFacet);

        vm.stopBroadcast();
    }
}
