// Plan → Batcher Call[] conversion.
//
// Under EIP-7702 the EOA itself executes every call inside Batcher.execute,
// so msg.sender is always the user's address. That means we never use
// transferFrom (no allowance dance) — plain transfer / safeTransferFrom /
// setOwner / approve(spender, 0) all work directly because the caller is
// the asset owner.

// <ABIs written by AI.>

import { encodeFunctionData } from "viem";
import type { MigrationPlan, PlannedOperation } from "./types";
import {
  SEPOLIA_ENS_REGISTRY,
  SEPOLIA_SWAP_USDC,
  SEPOLIA_UNISWAP_V3_ROUTER,
} from "./contracts";
import type { BatcherCall } from "./abis/Batcher";

// ── ABIs we need to encode against ──────────────────────────────────────
const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const ERC721_ABI = [
  {
    type: "function",
    name: "transferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "safeTransferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const ERC1155_ABI = [
  {
    type: "function",
    name: "safeTransferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "id", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const ENS_REGISTRY_ABI = [
  {
    type: "function",
    name: "setOwner",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "owner", type: "address" },
    ],
    outputs: [],
  },
] as const;

const UNISWAP_V3_ROUTER_ABI = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

// Default Uniswap V3 fee tier — used only when the planner didn't pick a
// specific one. The planner now sets op.tokenId to the chosen fee tier for
// SWAP_AND_TRANSFER (one of 100/500/3000/10000), so this is just a fallback.
const DEFAULT_UNISWAP_FEE_TIER = 3000;

// Per-op-type gas hints we attach to each Batcher Call. Conservative but
// realistic for Sepolia. We pass these to wallet_sendCalls so MetaMask
// skips its own per-call estimation — under EIP-5792 it simulates each
// call independently without applying prior state changes, which makes
// sequence-dependent calls (e.g. swap-after-approve) revert in sim and
// triggers a block-gas-limit fallback ("gas limit too high"). With
// explicit hints, the wallet just trusts our numbers and the batch goes.
const GAS_HINT_NATIVE_TRANSFER = 30_000n;
const GAS_HINT_ERC20_TRANSFER = 80_000n;
const GAS_HINT_ERC721_TRANSFER = 120_000n;
const GAS_HINT_ERC1155_TRANSFER = 130_000n;
const GAS_HINT_ERC20_APPROVE = 60_000n;
const GAS_HINT_ENS_REGISTRY = 80_000n;
const GAS_HINT_UNISWAP_SWAP = 280_000n;

/** A 7702-flat representation of one PlannedOperation, with a label for UI. */
export interface BatcherStep {
  call: BatcherCall;
  /** Original assetId / opType so we can map results back to the plan UI. */
  origin: { assetId: string; opType: PlannedOperation["opType"]; subIndex: number };
  /** Short human label used by ExecuteFlow's per-step list. */
  label: string;
}

