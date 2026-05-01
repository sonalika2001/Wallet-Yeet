// Minimal ABI for MigrationVault — just the surface area the dApp uses:
// `executeMigration` (write) and the three lifecycle events. Re-deriving
// from `forge build` output is fine if you ever need more functions.
//
// Kept as `as const` so wagmi v2 / viem can infer typed arg shapes.
//<Written by AI.>

export const MIGRATION_VAULT_ABI = [
  // ── Functions ────────────────────────────────────────────────────────
  {
    type: "function",
    name: "executeMigration",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "operations",
        type: "tuple[]",
        components: [
          { name: "opType", type: "uint8" }, // OpType enum (0..5)
          { name: "target", type: "address" },
          { name: "counterparty", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "destination", type: "address" },
        ],
      },
    ],
    outputs: [{ name: "migrationId", type: "uint256" }],
  },
  {
    type: "function",
    name: "UNISWAP_ROUTER",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "ENS_REGISTRY",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "USDC_ADDRESS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "MAX_OPS_PER_MIGRATION",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },

  // ── Events ───────────────────────────────────────────────────────────
  {
    type: "event",
    name: "MigrationStarted",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "migrationId", type: "uint256", indexed: true },
      { name: "opCount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OperationExecuted",
    inputs: [
      { name: "migrationId", type: "uint256", indexed: true },
      { name: "opIndex", type: "uint256", indexed: false },
      { name: "opType", type: "uint8", indexed: false },
      { name: "destination", type: "address", indexed: true },
      { name: "success", type: "bool", indexed: false },
      { name: "reason", type: "bytes", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "MigrationCompleted",
    inputs: [
      { name: "migrationId", type: "uint256", indexed: true },
      { name: "successCount", type: "uint256", indexed: false },
      { name: "totalCount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;

// Mapping from the TS string-enum used in PlannedOperation to the contract's
// uint8 enum value. Order MUST match `enum OpType` in MigrationVault.sol.
export const OP_TYPE_TO_UINT = {
  REVOKE_ERC20: 0,
  TRANSFER_ERC20: 1,
  TRANSFER_ERC721: 2,
  TRANSFER_ERC1155: 3,
  ENS_TRANSFER: 4,
  SWAP_AND_TRANSFER: 5,
} as const;

export const UINT_TO_OP_TYPE = [
  "REVOKE_ERC20",
  "TRANSFER_ERC20",
  "TRANSFER_ERC721",
  "TRANSFER_ERC1155",
  "ENS_TRANSFER",
  "SWAP_AND_TRANSFER",
] as const;
