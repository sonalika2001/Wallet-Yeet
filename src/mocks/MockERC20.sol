// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// <NatSpec written by AI.>
/// @title MockERC20 — generic configurable ERC-20 for the demo wallet
/// @notice ONE contract, deployed N times with different constructor params.
///         Replaces what would have been MockUSDC / MockShitcoin / MockGov /
///         MockDustA / MockDustB. The seed script picks name + symbol +
///         decimals + initial supply at deploy time.
contract MockERC20 is ERC20{

 uint8 private immutable _decimals;

constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply
    ) ERC20(name_, symbol_) {
        _decimals = decimals_;
        _mint(msg.sender, initialSupply);
    }

function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Demo helper — anyone can mint to anyone.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
