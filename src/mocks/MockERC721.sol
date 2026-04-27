// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title MockERC721 — generic configurable ERC-721 for the demo wallet
/// @notice ONE contract, deployed twice (Punks + Art) with different
///         name / symbol / baseURI. Replaces MockPunks + MockArt.
contract MockERC721 is ERC721 {

    uint256 public nextId = 1;
    string private _baseTokenURI;

    constructor(
        string memory name_,
        string memory symbol_,
        string memory baseURI_
    ) ERC721(name_, symbol_) {
        _baseTokenURI = baseURI_;
    }

    function mint(address to) external returns (uint256) {
        uint256 tokenId = nextId++;
        _mint(to, tokenId);
        return tokenId;
    }

function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }
}
