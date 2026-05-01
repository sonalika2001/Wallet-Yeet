// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// <NATSPEC by AI.>
/// @title Batcher — EIP-7702 multicall delegate for WalletYeet
///
/// @notice This contract is designed to be the delegation target for an EOA
///         under EIP-7702. The user signs a SetCodeAuthorization with this
///         contract address, then sends a single transaction that calls
///         `execute(calls)` on themselves. While that authorization is
///         active, their EOA runs THIS code, so every internal call inside
///         `execute` is made with `msg.sender == userEOA`.
///
///         That property is what lets the entire migration (token transfers,
///         NFT transfers, ENS handovers, dust swaps, allowance revocations)
///         happen in a single signed transaction with NO prior approvals:
///         since msg.sender is the asset owner, plain `transfer`,
///         `safeTransferFrom`, `setOwner`, etc. all work directly.
///
/// @dev Per-call try/catch + event emission preserves the same
///      "X of Y succeeded" UX the legacy MigrationVault provided.
///      No state, no admin, no privileged paths — the only authority
///      flowing through this contract is the EOA's own.
contract Batcher {
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    event CallExecuted(uint256 indexed index, address indexed target, bool success, bytes returnData);
    event MigrationCompleted(address indexed sender, uint256 successCount, uint256 totalCount);

    /// @notice Run an ordered list of calls. Each is wrapped in try/catch so
    ///         a single failing operation cannot abort the rest. All
    ///         outcomes are emitted as events for the frontend to parse.
    function execute(Call[] calldata calls) external payable {
        uint256 successCount = 0;
        for (uint256 i = 0; i < calls.length; i++) {
            (bool success, bytes memory ret) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            if (success) successCount++;
            emit CallExecuted(i, calls[i].target, success, ret);
        }
        emit MigrationCompleted(msg.sender, successCount, calls.length);
    }

    receive() external payable {}
}
