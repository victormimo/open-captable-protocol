// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/core/CapTableFactory.sol";
import { DiamondCutFacet } from "diamond-3-hardhat/facets/DiamondCutFacet.sol";
import { IssuerFacet } from "@facets/IssuerFacet.sol";
import { StakeholderFacet } from "@facets/StakeholderFacet.sol";
import { StockClassFacet } from "@facets/StockClassFacet.sol";
import { StockFacet } from "@facets/StockFacet.sol";
import { ConvertiblesFacet } from "@facets/ConvertiblesFacet.sol";
import { EquityCompensationFacet } from "@facets/EquityCompensationFacet.sol";
import { StockPlanFacet } from "@facets/StockPlanFacet.sol";
import { WarrantFacet } from "@facets/WarrantFacet.sol";
import { StakeholderNFTFacet } from "@facets/StakeholderNFTFacet.sol";

contract DeployDiamondCapTableScript is Script {
    function setUp() public {
        // Setup for Base Sepolia deployment
    }
    function checkEnv(
        address diamondCutFacet,
        address issuerFacet,
        address stakeholderFacet,
        address stockClassFacet,
        address stockFacet,
        address convertiblesFacet,
        address equityCompensationFacet,
        address stockPlanFacet,
        address warrantFacet,
        address stakeholderNFTFacet
    ) public view returns (bool) {
        // check one by one
        if (diamondCutFacet == address(0)) {
            console.log("DIAMOND_CUT_FACET not set");
            return false;
        }
        if (issuerFacet == address(0)) {
            console.log("ISSUER_FACET not set");
            return false;
        }
        if (stakeholderFacet == address(0)) {
            console.log("STAKEHOLDER_FACET not set");
            return false;
        }
        if (stockClassFacet == address(0)) {
            console.log("STOCK_CLASS_FACET not set");
            return false;
        }
        if (stockFacet == address(0)) {
            console.log("STOCK_FACET not set");
            return false;
        }
        if (convertiblesFacet == address(0)) {
            console.log("CONVERTIBLES_FACET not set");
            return false;
        }
        if (equityCompensationFacet == address(0)) {
            console.log("EQUITY_COMPENSATION_FACET not set");
            return false;
        }
        if (stockPlanFacet == address(0)) {
            console.log("STOCK_PLAN_FACET not set");
            return false;
        }
        if (warrantFacet == address(0)) {
            console.log("WARRANT_FACET not set");
            return false;
        }
        if (stakeholderNFTFacet == address(0)) {
            console.log("STAKEHOLDER_NFT_FACET not set");
            return false;
        }
        return true;
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        console.log("Deploying DiamondCapTable system to Base Sepolia");

        vm.startBroadcast(deployerPrivateKey);

        // Try to get addresses from env
        address diamondCutFacet = vm.envOr("DIAMOND_CUT_FACET", address(0));
        address issuerFacet = vm.envOr("ISSUER_FACET", address(0));
        address stakeholderFacet = vm.envOr("STAKEHOLDER_FACET", address(0));
        address stockClassFacet = vm.envOr("STOCK_CLASS_FACET", address(0));
        address stockFacet = vm.envOr("STOCK_FACET", address(0));
        address convertiblesFacet = vm.envOr("CONVERTIBLES_FACET", address(0));
        address equityCompensationFacet = vm.envOr("EQUITY_COMPENSATION_FACET", address(0));
        address stockPlanFacet = vm.envOr("STOCK_PLAN_FACET", address(0));
        address warrantFacet = vm.envOr("WARRANT_FACET", address(0));
        address stakeholderNFTFacet = vm.envOr("STAKEHOLDER_NFT_FACET", address(0));

        bool allSet = checkEnv(
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

        // Deploy new facets if addresses not in env
        if (!allSet) {
            revert("One or more required addresses are not set in the .env file");
            // console.log("Deploying new facets...");
            // diamondCutFacet = address(new DiamondCutFacet());
            // issuerFacet = address(new IssuerFacet());
            // stakeholderFacet = address(new StakeholderFacet());
            // stockClassFacet = address(new StockClassFacet());
            // stockFacet = address(new StockFacet());
            // convertiblesFacet = address(new ConvertiblesFacet());
            // equityCompensationFacet = address(new EquityCompensationFacet());
            // stockPlanFacet = address(new StockPlanFacet());
            // warrantFacet = address(new WarrantFacet());
            // stakeholderNFTFacet = address(new StakeholderNFTFacet());

            console.log("------- New Facet Addresses (Add to .env) -------");
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
            console.log("-------------------------------------------------");
        } else {
            console.log("Using existing facets from .env");
        }

        // Deploy factory with facet addresses
        CapTableFactory factory = new CapTableFactory(
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

        vm.stopBroadcast();
    }
}
