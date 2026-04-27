// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

import {MigrationVault, IENSRegistry, IUniswapV3Router} from "../src/MigrationVault.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockERC721} from "../src/mocks/MockERC721.sol";

// < Mocks & Comments written by AI.>
// ─────────────────────────────────────────────────────────────────────────────
// Test-only mocks (kept inline so test file is self-contained)
// ─────────────────────────────────────────────────────────────────────────────

contract MockENSRegistry is IENSRegistry {
    mapping(bytes32 => address) public owners;

    function setOwner(bytes32 node, address newOwner) external override {
        owners[node] = newOwner;
    }
}
contract MockERC1155 is ERC1155 {
    constructor() ERC1155("ipfs://Mock1155/{id}") {}

    function mint(address to, uint256 id, uint256 amount) external {
        _mint(to, id, amount, "");
    }
}

contract MockUniswapRouter is IUniswapV3Router {
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        override
        returns (uint256)
    {
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        IERC20(params.tokenOut).transfer(params.recipient, params.amountIn);
        return params.amountIn;
    }
}

contract RevertingUniswapRouter is IUniswapV3Router {
    function exactInputSingle(ExactInputSingleParams calldata)
        external
        payable
        override
        returns (uint256)
    {
        revert("router boom");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MigrationVault test suite
// ─────────────────────────────────────────────────────────────────────────────

contract MigrationVaultTest is Test {
    MigrationVault internal vault;
    MockERC20 internal tokenIn;
    MockERC20 internal tokenOut;
    MockERC721 internal nft;
    MockERC1155 internal multi;
    MockENSRegistry internal ens;
    MockUniswapRouter internal router;

    address internal user;
    address internal destA;
    address internal destB;
    address internal spender;

    uint256 internal constant TS = 1_700_000_000;
    bytes32 internal constant TEST_NODE = keccak256("alice.walletyeet-demo.eth");

    function setUp() public {
        vm.warp(TS);

        user = makeAddr("user");
        destA = makeAddr("destA");
        destB = makeAddr("destB");
        spender = makeAddr("spender");

        tokenIn = new MockERC20("Token In", "TIN", 18, 1_000_000 ether);
        tokenOut = new MockERC20("Token Out", "USDC", 18, 1_000_000 ether);
        nft = new MockERC721("Test NFT", "TNFT", "ipfs://test/");
        multi = new MockERC1155();
        ens = new MockENSRegistry();
        router = new MockUniswapRouter();

        // Vault wires to router + ENS registry + USDC
        vault = new MigrationVault(address(router), address(ens), address(tokenOut));

        // Pre-fund the mock router so it can deliver tokenOut to recipients
        tokenOut.transfer(address(router), 500_000 ether);

        // User starts with assets across all four token types
        tokenIn.transfer(user, 1_000 ether);
        nft.mint(user); // tokenId 1
        nft.mint(user); // tokenId 2
        multi.mint(user, 1, 100);

        // Seed the ENS node so user is the current owner
        ens.setOwner(TEST_NODE, user);

        // User pre-approves the vault for everything
        vm.startPrank(user);
        tokenIn.approve(address(vault), type(uint256).max);
        nft.setApprovalForAll(address(vault), true);
        multi.setApprovalForAll(address(vault), true);
        vm.stopPrank();
    }

    // ─── helpers ────────────────────────────────────────────────────────────

    function _runMigration(MigrationVault.Operation[] memory ops) internal returns (uint256) {
        vm.prank(user);
        return vault.executeMigration(ops);
    }

    function _expectedMigrationId(address from, uint256 ts, uint256 opCount)
        internal
        pure
        returns (uint256)
    {
        return uint256(keccak256(abi.encode(from, ts, opCount)));
    }

    function _erc20Op(address token, address dest, uint256 amount)
        internal
        pure
        returns (MigrationVault.Operation memory)
    {
        return MigrationVault.Operation({
            opType: MigrationVault.OpType.TRANSFER_ERC20,
            target: token,
            counterparty: address(0),
            tokenId: 0,
            amount: amount,
            destination: dest
        });
    }

    function _erc721Op(address token, address dest, uint256 tokenId)
        internal
        pure
        returns (MigrationVault.Operation memory)
    {
        return MigrationVault.Operation({
            opType: MigrationVault.OpType.TRANSFER_ERC721,
            target: token,
            counterparty: address(0),
            tokenId: tokenId,
            amount: 0,
            destination: dest
        });
    }

    function _erc1155Op(address token, address dest, uint256 tokenId, uint256 amount)
        internal
        pure
        returns (MigrationVault.Operation memory)
    {
        return MigrationVault.Operation({
            opType: MigrationVault.OpType.TRANSFER_ERC1155,
            target: token,
            counterparty: address(0),
            tokenId: tokenId,
            amount: amount,
            destination: dest
        });
    }

    function _ensOp(bytes32 node, address dest)
        internal
        pure
        returns (MigrationVault.Operation memory)
    {
        return MigrationVault.Operation({
            opType: MigrationVault.OpType.ENS_TRANSFER,
            target: address(0),
            counterparty: address(0),
            tokenId: uint256(node),
            amount: 0,
            destination: dest
        });
    }

    function _swapOp(address inToken, address outToken, uint256 amountIn, address dest)
        internal
        pure
        returns (MigrationVault.Operation memory)
    {
        return MigrationVault.Operation({
            opType: MigrationVault.OpType.SWAP_AND_TRANSFER,
            target: inToken,
            counterparty: outToken,
            tokenId: 0,
            amount: amountIn,
            destination: dest
        });
    }

    function _revokeOp(address token, address spenderAddr)
        internal
        pure
        returns (MigrationVault.Operation memory)
    {
        return MigrationVault.Operation({
            opType: MigrationVault.OpType.REVOKE_ERC20,
            target: token,
            counterparty: spenderAddr,
            tokenId: 0,
            amount: 0,
            destination: address(0)
        });
    }

    function test_Constructor_SetsImmutables() public {
        assertEq(vault.UNISWAP_ROUTER(), address(router));
        assertEq(vault.ENS_REGISTRY(), address(ens));
        assertEq(vault.USDC_ADDRESS(), address(tokenOut));
        assertEq(vault.MAX_OPS_PER_MIGRATION(), 50);
    }

    function test_TransferErc20_HappyPath() public {
        MigrationVault.Operation[] memory ops = new MigrationVault.Operation[](1);
        ops[0] = _erc20Op(address(tokenIn), destA, 100 ether);

        _runMigration(ops);

        assertEq(tokenIn.balanceOf(destA), 100 ether, "destA receives 100 TIN");
        assertEq(tokenIn.balanceOf(user), 900 ether, "user is down 100 TIN");
    }

    function test_TransferErc721_HappyPath() public {
        MigrationVault.Operation[] memory ops = new MigrationVault.Operation[](1);
        ops[0] = _erc721Op(address(nft), destA, 1);

        _runMigration(ops);

        assertEq(nft.ownerOf(1), destA, "destA now owns NFT 1");
    }

    function test_TransferErc1155_HappyPath() public {
        MigrationVault.Operation[] memory ops = new MigrationVault.Operation[](1);
        ops[0] = _erc1155Op(address(multi), destA, 1, 30);

        _runMigration(ops);

        assertEq(multi.balanceOf(destA, 1), 30);
        assertEq(multi.balanceOf(user, 1), 70);
    }

    function test_EnsTransfer_HappyPath() public {
        MigrationVault.Operation[] memory ops = new MigrationVault.Operation[](1); //array of ops with length 1
        ops[0] = _ensOp(TEST_NODE, destA);

        _runMigration(ops);

        assertEq(ens.owners(TEST_NODE), destA, "destA now owns the ENS node");
    }

    function test_SwapAndTransfer_HappyPath() public {
        MigrationVault.Operation[] memory ops = new MigrationVault.Operation[](1);
        ops[0] = _swapOp(address(tokenIn), address(tokenOut), 50 ether, destA);

        _runMigration(ops);

        assertEq(tokenIn.balanceOf(user), 950 ether, "user down 50 TIN");
        assertEq(tokenOut.balanceOf(destA), 50 ether, "destA up 50 USDC (1:1 mock)");
        assertEq(tokenIn.balanceOf(address(vault)), 0, "vault holds no leftover dust");
        assertEq(tokenOut.balanceOf(address(vault)), 0, "vault never receives tokenOut");
    }

    
    function test_SwapAndTransfer_DefaultsToUsdcWhenCounterpartyIsZero() public {
        // counterparty = address(0) → vault should default tokenOut to USDC_ADDRESS
        MigrationVault.Operation[] memory ops = new MigrationVault.Operation[](1);
        ops[0] = _swapOp(address(tokenIn), address(0), 25 ether, destA);

        _runMigration(ops);

        // tokenOut is the constructor-passed USDC address, so destA should get USDC
        assertEq(tokenOut.balanceOf(destA), 25 ether, "0x0 counterparty - defaults to USDC");
    }

    function test_RevokeErc20_StubReturnsFalse() public {
        MigrationVault.Operation[] memory ops = new MigrationVault.Operation[](1);
        ops[0] = _revokeOp(address(tokenIn), spender);

        bytes memory expectedReason = abi.encodeWithSelector(
            MigrationVault.RevocationHandledByFrontend.selector
        );

        uint256 expectedId = _expectedMigrationId(user, TS, 1);
        vm.expectEmit(true, true, true, true);
        emit MigrationVault.OperationExecuted(
            expectedId,
            0,
            MigrationVault.OpType.REVOKE_ERC20,
            address(0),
            false,
            expectedReason
        );

        _runMigration(ops);
    }

    function test_OneFailingOp_DoesNotRevertOthers() public {
        MigrationVault.Operation[] memory ops = new MigrationVault.Operation[](2);
        // op 0 transfers more than user has → fails inside try/catch
        ops[0] = _erc20Op(address(tokenIn), destA, 10_000_000 ether);
        // op 1 is a healthy 100 TIN transfer
        ops[1] = _erc20Op(address(tokenIn), destB, 100 ether);

        _runMigration(ops);

        assertEq(tokenIn.balanceOf(destA), 0, "failed op leaves destA empty");
        assertEq(tokenIn.balanceOf(destB), 100 ether, "good op still lands at destB");
    }

    function test_PartialFailure_EmitsCorrectSuccessCount() public {
        MigrationVault.Operation[] memory ops = new MigrationVault.Operation[](3);
        ops[0] = _erc20Op(address(tokenIn), destA, 10 ether); // ok
        ops[1] = _erc20Op(address(tokenIn), destA, 10_000_000 ether); // fails
        ops[2] = _erc20Op(address(tokenIn), destA, 5 ether); // ok

        uint256 expectedId = _expectedMigrationId(user, TS, 3);
        vm.expectEmit(true, false, false, true);
        emit MigrationVault.MigrationCompleted(expectedId, 2, 3); // 2 successes out of 3

        _runMigration(ops);
    }

}
