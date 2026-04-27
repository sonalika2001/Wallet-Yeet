// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MigrationVault} from "../src/MigrationVault.sol";

/// @title Deploy — puts WalletYeet's core contract on Sepolia
/// @notice Run with a Foundry-managed wallet (no private key in env):
///         forge script script/Deploy.s.sol:Deploy \
///             --rpc-url $SEPOLIA_RPC_URL \
///             --account <wallet-name> \
///             --broadcast --verify
///
///         (Set up the wallet once via `cast wallet import <name> --interactive`.)
///
/// @dev Required env vars:
///        SEPOLIA_UNISWAP_V3_ROUTER - Uniswap V3 SwapRouter on Sepolia
///        SEPOLIA_ENS_REGISTRY      - ENS Registry on Sepolia
///        SEPOLIA_USDC_ADDRESS      - real USDC OR your MockUSDC from seeding
///                                    (run SeedDemoWallet first to get it)
contract Deploy is Script {
    function run() external returns (MigrationVault) {
        address uniswapRouter = vm.envAddress("SEPOLIA_UNISWAP_V3_ROUTER");
        address ensRegistry = vm.envAddress("SEPOLIA_ENS_REGISTRY");
        address usdcAddress = vm.envAddress("SEPOLIA_USDC_ADDRESS");

        vm.startBroadcast();
        MigrationVault migrationVault = new MigrationVault(uniswapRouter, ensRegistry, usdcAddress);
        vm.stopBroadcast();

        // <logging added by AI.>
        console.log("=========================================");
        console.log("MigrationVault deployed at:", address(migrationVault));
        console.log("=========================================");
        console.log("Add to frontend/.env.local:");
        console.log("NEXT_PUBLIC_MIGRATION_VAULT_ADDRESS=%s", address(migrationVault));

        return migrationVault;
    }
}
