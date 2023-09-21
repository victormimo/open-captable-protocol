import { config } from "dotenv";
import { ethers } from "ethers";
config();

import axios from "axios";
import CAP_TABLE from "../../chain/out/CapTable.sol/CapTable.json" assert { type: "json" };
const { abi, bytecode } = CAP_TABLE;

async function deployCapTableLocal(issuerId, issuerName) {
    // Replace with your private key and provider endpoint
    const WALLET_PRIVATE_KEY = process.env.PRIVATE_KEY_FAKE_ACCOUNT;
    const customNetwork = {
        chainId: 31337,
        name: "local",
    };

    const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545", customNetwork);
    const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY, provider);
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    const contract = await factory.deploy(issuerId, issuerName);

    console.log("Waiting for contract to be mined...");
    await contract.deployed();
    console.log("Contract mined!");

    return { contract, provider, address: contract.address };
}

async function deployCapTableOptimismGoerli(issuerId, issuerName) {
    const WALLET_PRIVATE_KEY = process.env.PRIVATE_KEY_POET_TEST;

    const provider = new ethers.providers.JsonRpcProvider(process.env.OPTIMISM_GOERLI_RPC_URL);
    const providerEtherscan = new ethers.providers.EtherscanProvider("optimism-goerli", process.env.ETHERSCAN_OPTIMISM_API_KEY);
    const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY, provider);
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    const contract = await factory.deploy(issuerId, issuerName);

    console.log("Waiting for contract to be mined...");
    await contract.deployed();
    console.log("Contract mined!");

    return { contract, provider, address: contract.address };
}

async function deployCapTable(chain, issuerId, issuerName) {
    if (chain === "local") {
        return deployCapTableLocal(issuerId, issuerName);
    } else if (chain === "optimism-goerli") {
        return deployCapTableOptimismGoerli(issuerId, issuerName);
    } else {
        throw new Error(`Unsupported chain: ${chain}`);
    }
}

export default deployCapTable;
