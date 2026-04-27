// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

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
///      | opType            | target            | counterparty   | tokenId       | amount        | destination  |
///      | REVOKE_ERC20      | ERC20 contract    | spender to nuke| —             | —             | —            |
///      | TRANSFER_ERC20    | ERC20 contract    | —              | —             | base units    | recipient    |
///      | TRANSFER_ERC721   | ERC721 contract   | —              | tokenId       | —             | recipient    |
///      | TRANSFER_ERC1155  | ERC1155 contract  | —              | tokenId       | qty           | recipient    |
///      | ENS_TRANSFER      | (use ensRegistry) | —              | uint256(node) | —             | new ENS owner|
///      | SWAP_AND_TRANSFER | tokenIn (ERC20)   | tokenOut (USDC | —             | amountIn      | recipient    |
///      |                   |                   |  if address(0))|               |               |              |
///
contract MigrationVault {

    enum OpType {REVOKE_ERC20, TRANSFER_ERC20, TRANSFER_ERC721, TRANSFER_ERC1155, ENS_TRANSFER, SWAP_AND_TRANSFER}

    // <struct defined by AI.>
    struct Operation {
      OpType opType;        // which kind of op (TRANSFER_ERC20, etc.)
      address target;       // contract to interact with (token, ENS reg, router)
      address counterparty; // REVOKE: spender. SWAP: tokenOut. Else: unused.
      uint256 tokenId;      // NFT: tokenId. ENS: uint256(node). Else: 0.
      uint256 amount;       // fungible amount, OR swap amountIn
      address destination;  // per-op recipient wallet
  }
    
    address public immutable uniswapRouter;
    address public immutable ensRegistry;
    address public immutable usdcAddress;
    uint256 public constant MAX_OPS_PER_MIGRATION = 50;

    error OperationFailed();

    event MigrationStarted(address indexed from, uint256 indexed migrationId, uint256 opCount);
    event OperationExecuted(uint256 indexed migrationId,
      uint256 opIndex,
      OpType opType,
      address indexed destination,
      bool success,
      bytes reason);
    event MigrationCompleted(uint256 indexed migrationId, uint256 successCount, uint256 totalCount);
    
    constructor(address _uniswapRouter, address _ensRegistry, address _usdcAddress){
        uniswapRouter = _uniswapRouter;
        ensRegistry = _ensRegistry;
        usdcAddress = _usdcAddress;
    }

    function _executeOperation(uint256 migrationId, uint256 opIndex, Operation memory op) internal returns (bool, bytes memory){
        if (op.opType == OpType.REVOKE_ERC20) {}
        else if (op.opType == OpType.TRANSFER_ERC20){
            return _transferERC20Handler(op.target, op.destination,op.amount);
        }
        else if (op.opType == OpType.TRANSFER_ERC721){
            return _transferERC721Handler(op.target, op.destination, op.tokenId);
        }
        else if (op.opType == OpType.TRANSFER_ERC1155){
            return _transferERC1155Handler(op.target, op.destination, op.tokenId, op.amount);
        }
        else if (op.opType == OpType.ENS_TRANSFER){}
        else if (op.opType == OpType.SWAP_AND_TRANSFER){}
    }

    function _transferERC20Handler(address token, address destination, uint256 amount) internal returns (bool,bytes memory){
        try IERC20(token).transferFrom(msg.sender,destination, amount) returns (bool status) {
            return (status,"");
        }
        catch (bytes memory reason){
            return (false, reason);
        }
    }

    function _transferERC721Handler(address token, address destination, uint256 tokenId) internal returns (bool,bytes memory){
        try IERC721(token).transferFrom(msg.sender, destination, tokenId) {
            return (true,"");
        }
        catch (bytes memory reason){
            return (false, reason);
        }
    }

    function _transferERC1155Handler(address token, address destination, uint256 tokenId, uint256 amount) internal returns (bool,bytes memory){
        try IERC1155(token).safeTransferFrom(msg.sender, destination, tokenId, amount, "") {
            return (true,"");
        }
        catch (bytes memory reason){
            return (false, reason);
        }
    }

}