// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockERC721} from "../src/mocks/MockERC721.sol";

/// <NATSPEC written by AI.>
/// @title SeedDemoWallet — populates `WY Demo OLD` with diverse assets
/// @notice Run with:
///         forge script script/SeedDemoWallet.s.sol:SeedDemoWallet \
///             --rpc-url $SEPOLIA_RPC_URL \
///             --broadcast -vvv
///
/// @dev  Use DEMO_OLD_PRIVATE_KEY as the broadcaster so msg.sender inside
///      the script IS the demo wallet — that way constructors mint to it
///      automatically.
///
///      Deploy 5 ERC-20s using the generic MockERC20:
///        - "Mock USDC"      / USDC      / 6 dec  / 1,000,000 USDC
///        - "Mock SHIB-PEPE" / SHIB-PEPE / 18 dec / 1,000,000 SHIB-PEPE
///        - "Mock Gov"       / GOV       / 18 dec / 100,000 GOV
///        - "Mock Dust A"    / DUST-A    / 18 dec / 100  DUST-A   (sub-$1)
///        - "Mock Dust B"    / DUST-B    / 18 dec / 50   DUST-B   (sub-$1)
///
///      Deploy 2 ERC-721 collections using the generic MockERC721:
///        - "Mock CryptoPunks" / MPUNK / "ipfs://QmPunks/" — mint 3 NFTs
///        - "Mock Art Gallery" / MART  / "ipfs://QmArt/"   — mint 2 NFTs
///
///      Set "scary" approvals — the kind WalletYeet's Auditor flags:
///        - usdc.approve(SUSPICIOUS_ROUTER, type(uint256).max)
///        - shib.approve(SUSPICIOUS_ROUTER, type(uint256).max)
///        - gov.approve(RANDOM_DRAINER, type(uint256).max)
///        - punks.setApprovalForAll(SKETCHY_MARKETPLACE, true)
///        - art.setApprovalForAll(SKETCHY_MARKETPLACE, true)
///
///      After this script, the user manually:
///        - creates ENS subnames at app.ens.domains (alice.* and vault.*)
///        - optionally deploys a mock Uniswap pool for the dust pairs
///        - tops up DEMO_NEW + DEMO_COLD with a small amount of Sepolia ETH
contract SeedDemoWallet is Script {
    // Memorable-looking addresses with no on-chain code — purely targets
    // for risky `approve` calls so the Auditor agent has something to flag.
    address constant SUSPICIOUS_ROUTER = 0x1234567890123456789012345678901234567890;
    address constant SKETCHY_MARKETPLACE = 0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF;
    address constant RANDOM_DRAINER = 0xBAaAAAaaaAaaAaaAaaaAaaAaAaaAAaAaaAaAAaaa;

    function run() external {
        // 1. Read the demo wallet key from env. vm.addr() recovers its address
        //    so we can pass it as the recipient for NFT mints later.
        uint256 demoKey = vm.envUint("DEMO_OLD_PRIVATE_KEY");
        address demoWallet = vm.addr(demoKey);

        vm.startBroadcast(demoKey);

        MockERC20 usdc = new MockERC20("Mock USDC", "USDC", 6, 1_000_000 * 10 ** 6);
        MockERC20 shib = new MockERC20("Mock SHIB-PEPE", "SHIB-PEPE", 18, 1_000_000 ether);
        MockERC20 gov = new MockERC20("Mock Gov", "GOV", 18, 100_000 ether);
        MockERC20 dustA = new MockERC20("Mock Dust A", "DUST-A", 18, 100 ether);
        MockERC20 dustB = new MockERC20("Mock Dust B", "DUST-B", 18, 50 ether);

        MockERC721 punks = new MockERC721("Mock CryptoPunks", "MPUNK", "ipfs://QmPunks/");
        MockERC721 art = new MockERC721("Mock Art Gallery", "MART", "ipfs://QmArt/");

        punks.mint(demoWallet); // tokenId 1
        punks.mint(demoWallet); // tokenId 2
        punks.mint(demoWallet); // tokenId 3
        art.mint(demoWallet); // tokenId 1
        art.mint(demoWallet); // tokenId 2

        usdc.approve(SUSPICIOUS_ROUTER, type(uint256).max);
        shib.approve(SUSPICIOUS_ROUTER, type(uint256).max);
        gov.approve(RANDOM_DRAINER, type(uint256).max);
        punks.setApprovalForAll(SKETCHY_MARKETPLACE, true);
        art.setApprovalForAll(SKETCHY_MARKETPLACE, true);

        vm.stopBroadcast();

        // <Logs written by AI.>
        console.log("=== SEEDING COMPLETE ===");
        console.log("USDC      :", address(usdc));
        console.log("SHIB-PEPE :", address(shib));
        console.log("GOV       :", address(gov));
        console.log("DUST-A    :", address(dustA));
        console.log("DUST-B    :", address(dustB));
        console.log("Punks     :", address(punks));
        console.log("Art       :", address(art));
        console.log("");
        console.log("Next: copy these into frontend/lib/contracts.ts");
        console.log("Next: register ENS subnames manually at app.ens.domains");
    }
}
