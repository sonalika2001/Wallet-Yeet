// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {Batcher} from "../src/Batcher.sol";

/// @title DeployBatcher — deploys WalletYeet's EIP-7702 delegate contract
///
/// @notice This contract is the delegation target for the user's EOA under
///         EIP-7702 — it lets the entire migration happen in one signed tx.
///         Run with a Foundry-managed wallet (no private key in env):
///
///         forge script script/DeployBatcher.s.sol:DeployBatcher \
///             --rpc-url $SEPOLIA_RPC_URL \
///             --account <wallet-name> \
///             --broadcast --verify
///
///         Then copy the printed address to dapp/.env.local as:
///           NEXT_PUBLIC_BATCHER_ADDRESS=0x...
contract DeployBatcher is Script {
    function run() external returns (Batcher) {
        vm.startBroadcast();
        Batcher batcher = new Batcher();
        vm.stopBroadcast();

        console.log("=========================================");
        console.log("Batcher deployed at:", address(batcher));
        console.log("=========================================");
        console.log("Add to dapp/.env.local:");
        console.log("NEXT_PUBLIC_BATCHER_ADDRESS=%s", address(batcher));

        return batcher;
    }
}
