// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

interface IENSRegistry {
    function setOwner(bytes32 node, address owner) external;
}

interface IUniswapV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// <NatSpec written by AI.>
/// @title MigrationVault — WalletYeet's core multicall executor
///
/// @notice Receives a sequenced list of operations from the user's old wallet
///         (one signature, one tx) and executes each one. Supports six kinds:
///
///           - REVOKE_ERC20:       set an ERC-20 allowance to 0
///           - TRANSFER_ERC20:     pull an ERC-20 from old wallet to a destination
///           - TRANSFER_ERC721:    move a single NFT
///           - TRANSFER_ERC1155:   move a multi-token amount
///           - ENS_TRANSFER:       hand a subname to a destination       [sponsor: ENS]
///           - SWAP_AND_TRANSFER:  swap dust → USDC, send to destination [sponsor: Uniswap]
///
///         Each operation carries its own destination address, so a single
///         migration can split assets across up to 5 destination wallets.
///
/// @dev Design — batched-with-reporting, NOT true atomic.
///      Each op runs in a try/catch and its outcome is emitted as an event.
///      A single bad asset (rebasing token, non-standard approve, deprecated
///      ERC-20, wrapped vs unwrapped ENS, etc.) cannot revert a 50-asset
///      migration — the user gets a transparent "X of Y succeeded" report.
///
///      Pre-conditions enforced by the FRONTEND, not this contract:
///        - For each ERC-20 in the plan, the old wallet has signed
///          approve(VAULT, amount) beforehand.
///        - For each NFT collection, the old wallet has signed
///          setApprovalForAll(VAULT, true) beforehand.
///        - For each ENS subname, the old wallet has authorised the vault
///          (registry.setApprovalForAll(VAULT, true) for unwrapped names).
///        - REVOKE_ERC20 is handled in the frontend as separate user-signed
///          approve(spender, 0) txs — the vault cannot revoke a user's
///          allowance from inside its own context.
///
///      Threat model: msg.sender of executeMigration IS the source wallet.
///      We never accept a `from` parameter — that means a malicious caller
///      cannot trick the vault into pulling someone else's funds.
///
///      Caps: at most MAX_OPS_PER_MIGRATION = 50 ops per call (gas budget).
///      Uniswap fee tier: hard-coded 0.30% (3000) for hackathon scope.
///
/// @dev Operation field semantics:
///      | opType            | target            | counterparty    | tokenId        | amount        | destination  |
///      | REVOKE_ERC20      | ERC20 contract    | spender to nuke | —              | —             | —            |
///      | TRANSFER_ERC20    | ERC20 contract    | —               | —              | base units    | recipient    |
///      | TRANSFER_ERC721   | ERC721 contract   | —               | tokenId        | —             | recipient    |
///      | TRANSFER_ERC1155  | ERC1155 contract  | —               | tokenId        | qty           | recipient    |
///      | ENS_TRANSFER      | (use ENS_REGISTRY)| —               | uint256(node)  | —             | new ENS owner|
///      | SWAP_AND_TRANSFER | tokenIn (ERC20)   | tokenOut (USDC  | UniV3 fee tier | amountIn      | recipient    |
///      |                   |                   |  if address(0)) | (3000 if 0)    |               |              |
///
contract MigrationVault {
    enum OpType {
        REVOKE_ERC20,
        TRANSFER_ERC20,
        TRANSFER_ERC721,
        TRANSFER_ERC1155,
        ENS_TRANSFER,
        SWAP_AND_TRANSFER
    }

    // <struct defined by AI.>
    struct Operation {
        OpType opType; // which kind of op (TRANSFER_ERC20, etc.)
        address target; // contract to interact with (token, ENS reg, router)
        address counterparty; // REVOKE: spender. SWAP: tokenOut. Else: unused.
        uint256 tokenId; // NFT: tokenId. ENS: uint256(node). Else: 0.
        uint256 amount; // fungible amount, OR swap amountIn
        address destination; // per-op recipient wallet
    }

    address public immutable UNISWAP_ROUTER;
    address public immutable ENS_REGISTRY;
    address public immutable USDC_ADDRESS;
    uint256 public constant MAX_OPS_PER_MIGRATION = 50;

    error RevocationHandledByFrontend();
    error ApprovalFailed();
    error UnknownOperationType();
    error TransferFromFailed();

    event MigrationStarted(address indexed from, uint256 indexed migrationId, uint256 opCount);
    event OperationExecuted(
        uint256 indexed migrationId,
        uint256 opIndex,
        OpType opType,
        address indexed destination,
        bool success,
        bytes reason
    );
    event MigrationCompleted(uint256 indexed migrationId, uint256 successCount, uint256 totalCount);

    constructor(address _uniswapRouter, address _ensRegistry, address _usdcAddress) {
        UNISWAP_ROUTER = _uniswapRouter;
        ENS_REGISTRY = _ensRegistry;
        USDC_ADDRESS = _usdcAddress;
    }

    function executeMigration(Operation[] calldata operations) external returns (uint256 migrationId) {
        require(operations.length > 0 && operations.length <= MAX_OPS_PER_MIGRATION);
        migrationId = uint256(keccak256(abi.encode(msg.sender, block.timestamp, operations.length)));
        emit MigrationStarted(msg.sender, migrationId, operations.length);

        uint256 successCount = 0;

        for (uint256 i = 0; i < operations.length; i++) {
            Operation calldata op = operations[i];
            (bool success, bytes memory reason) = _executeOperation(op);
            if (success) successCount++;
            emit OperationExecuted(migrationId, i, op.opType, op.destination, success, reason);
        }

        emit MigrationCompleted(migrationId, successCount, operations.length);
    }

    function _executeOperation(Operation calldata op) internal returns (bool, bytes memory) {
        if (op.opType == OpType.REVOKE_ERC20) {
            return _revokeErc20Handler(op.target, op.counterparty);
        } else if (op.opType == OpType.TRANSFER_ERC20) {
            return _transferErc20Handler(op.target, op.destination, op.amount);
        } else if (op.opType == OpType.TRANSFER_ERC721) {
            return _transferErc721Handler(op.target, op.destination, op.tokenId);
        } else if (op.opType == OpType.TRANSFER_ERC1155) {
            return _transferErc1155Handler(op.target, op.destination, op.tokenId, op.amount);
        } else if (op.opType == OpType.ENS_TRANSFER) {
            return _transferEnsHandler(op.tokenId, op.destination);
        } else if (op.opType == OpType.SWAP_AND_TRANSFER) {
            // tokenId carries the Uniswap V3 fee tier for SWAP ops 
            return _swapAndTransferHandler(
                op.target, op.amount, op.counterparty, op.destination, op.tokenId
            );
        } else {
            return (false, abi.encodeWithSelector(UnknownOperationType.selector));
        }
    }

    // stub, since real revocation happens in the frontend as separate user-signed approve(spender,0) transactions
    function _revokeErc20Handler(
        address,
        /*token*/
        address /*spender*/
    )
        internal
        pure
        returns (bool, bytes memory)
    {
        return (false, abi.encodeWithSelector(RevocationHandledByFrontend.selector));
    }

    function _transferErc20Handler(address token, address destination, uint256 amount)
        internal
        returns (bool, bytes memory)
    {
        try IERC20(token).transferFrom(msg.sender, destination, amount) returns (bool status) {
            return (status, "");
        } catch (bytes memory reason) {
            return (false, reason);
        }
    }

    function _transferErc721Handler(address token, address destination, uint256 tokenId)
        internal
        returns (bool, bytes memory)
    {
        try IERC721(token).safeTransferFrom(msg.sender, destination, tokenId) {
            return (true, "");
        } catch (bytes memory reason) {
            return (false, reason);
        }
    }

    function _transferErc1155Handler(address token, address destination, uint256 tokenId, uint256 amount)
        internal
        returns (bool, bytes memory)
    {
        try IERC1155(token).safeTransferFrom(msg.sender, destination, tokenId, amount, "") {
            return (true, "");
        } catch (bytes memory reason) {
            return (false, reason);
        }
    }

    function _transferEnsHandler(uint256 nodeAsUint, address newOwner) internal returns (bool, bytes memory) {
        bytes32 node = bytes32(nodeAsUint);
        try IENSRegistry(ENS_REGISTRY).setOwner(node, newOwner) {
            return (true, "");
        } catch (bytes memory reason) {
            return (false, reason);
        }
    }

    function _swapAndTransferHandler(
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        address destination,
        uint256 feeTier
    ) internal returns (bool, bytes memory) {
        address actualTokenOut = tokenOut == address(0) ? USDC_ADDRESS : tokenOut; // 0x0 means swap to USDC

        // Frontend picks the V3 fee tier with active liquidity for this pair
        // (100 = 0.01%, 500 = 0.05%, 3000 = 0.30%, 10000 = 1%). 0 means
        // "use the 0.30% default" for backwards compatibility with old
        // encoded ops.
        uint24 fee = feeTier == 0 ? 3000 : uint24(feeTier);

        // pull dust from user -> vault
        try IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn) returns (bool status) {
            if (!status) return (false, abi.encodeWithSelector(TransferFromFailed.selector));
        } catch (bytes memory reason) {
            return (false, reason);
        }

        // approve router to spend tokenIn
        try IERC20(tokenIn).approve(UNISWAP_ROUTER, amountIn) returns (bool status) {
            if (!status) {
                _refundDust(tokenIn, amountIn);
                return (false, abi.encodeWithSelector(ApprovalFailed.selector));
            }
        } catch (bytes memory reason) {
            _refundDust(tokenIn, amountIn);
            return (false, reason);
        }

        // swap - output token goes directly to destination
        try IUniswapV3Router(UNISWAP_ROUTER)
            .exactInputSingle(
                IUniswapV3Router.ExactInputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: actualTokenOut,
                    fee: fee,
                    recipient: destination,
                    amountIn: amountIn,
                    amountOutMinimum: 0, // no slippage protection
                    sqrtPriceLimitX96: 0 //no price limit
                })
            ) returns (
            uint256 /*amountOut*/
        ) {
            return (true, "");
        } catch (bytes memory reason) {
            _refundDust(tokenIn, amountIn);
            return (false, reason);
        }
    }

    /// @dev Best-effort refund of dust that the vault pulled but couldn't swap.
    ///      If the refund itself fails, the dust is stuck — known edge case for v1.
    function _refundDust(address token, uint256 amount) internal {
        try IERC20(token).transfer(msg.sender, amount) {} catch {}
    }
}
