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

/**
 * Convert a MigrationPlan into a flat sequence of low-level Batcher calls.
 * Most ops map to a single call; SWAP_AND_TRANSFER expands to two
 * (approve + exactInputSingle).
 */
export function planToBatcherSteps(
  plan: MigrationPlan,
  user: `0x${string}`,
): BatcherStep[] {
  const steps: BatcherStep[] = [];

  for (const op of plan.operations) {
    switch (op.opType) {
      case "TRANSFER_NATIVE": {
        // Native gas-asset transfer: under EIP-7702 the EOA delegates to
        // Batcher.execute, so `target.call{value: amount}` here debits the
        // user's own balance. No data, just value.
        const amountIn = BigInt(op.amount ?? "0");
        if (amountIn === 0n) continue;
        steps.push({
          call: {
            target: op.destination,
            value: amountIn,
            data: "0x" as `0x${string}`,
            gas: GAS_HINT_NATIVE_TRANSFER,
          },
          origin: { assetId: op.assetId, opType: op.opType, subIndex: 0 },
          label: op.explanation || "Transfer Sepolia ETH",
        });
        break;
      }

      case "TRANSFER_ERC20": {
        steps.push({
          call: {
            target: op.target,
            value: 0n,
            data: encodeFunctionData({
              abi: ERC20_ABI,
              functionName: "transfer",
              args: [op.destination, BigInt(op.amount ?? "0")],
            }),
            gas: GAS_HINT_ERC20_TRANSFER,
          },
          origin: { assetId: op.assetId, opType: op.opType, subIndex: 0 },
          label: op.explanation || "Transfer ERC-20",
        });
        break;
      }

      case "TRANSFER_ERC721": {
        // Use plain transferFrom (not safe). safeTransferFrom calls
        // onERC721Received on the destination if it's a contract — under
        // EIP-7702 the user's EOA temporarily IS a contract (running the
        // Batcher's code), and some NFT contracts revert in MetaMask's
        // pre-flight simulation due to that. transferFrom skips the
        // receiver check entirely and works for both EOA and contract
        // destinations as long as they can hold the NFT.
        steps.push({
          call: {
            target: op.target,
            value: 0n,
            data: encodeFunctionData({
              abi: ERC721_ABI,
              functionName: "transferFrom",
              args: [user, op.destination, BigInt(op.tokenId ?? "0")],
            }),
            gas: GAS_HINT_ERC721_TRANSFER,
          },
          origin: { assetId: op.assetId, opType: op.opType, subIndex: 0 },
          label: op.explanation || "Transfer NFT",
        });
        break;
      }

      case "TRANSFER_ERC1155": {
        steps.push({
          call: {
            target: op.target,
            value: 0n,
            data: encodeFunctionData({
              abi: ERC1155_ABI,
              functionName: "safeTransferFrom",
              args: [
                user,
                op.destination,
                BigInt(op.tokenId ?? "0"),
                BigInt(op.amount ?? "1"),
                "0x",
              ],
            }),
            gas: GAS_HINT_ERC1155_TRANSFER,
          },
          origin: { assetId: op.assetId, opType: op.opType, subIndex: 0 },
          label: op.explanation || "Transfer ERC-1155",
        });
        break;
      }

      case "ENS_TRANSFER": {
        if (!op.tokenId) continue;
        const node = (`0x${BigInt(op.tokenId).toString(16).padStart(64, "0")}`) as `0x${string}`;
        steps.push({
          call: {
            target: SEPOLIA_ENS_REGISTRY,
            value: 0n,
            data: encodeFunctionData({
              abi: ENS_REGISTRY_ABI,
              functionName: "setOwner",
              args: [node, op.destination],
            }),
            gas: GAS_HINT_ENS_REGISTRY,
          },
          origin: { assetId: op.assetId, opType: op.opType, subIndex: 0 },
          label: op.explanation || "Transfer ENS subname",
        });
        break;
      }

      case "SWAP_AND_TRANSFER": {
        const amountIn = BigInt(op.amount ?? "0");
        if (amountIn === 0n) continue;
        const tokenIn = op.target;
        const tokenOut =
          op.counterparty && op.counterparty !== "0x0000000000000000000000000000000000000000"
            ? op.counterparty
            : SEPOLIA_SWAP_USDC;
        // Planner stashes the chosen V3 fee tier in tokenId for SWAP ops.
        const fee = op.tokenId ? Number(op.tokenId) : DEFAULT_UNISWAP_FEE_TIER;

        // Sub-call 1: approve the router to pull tokenIn from the EOA.
        steps.push({
          call: {
            target: tokenIn,
            value: 0n,
            data: encodeFunctionData({
              abi: ERC20_ABI,
              functionName: "approve",
              args: [SEPOLIA_UNISWAP_V3_ROUTER, amountIn],
            }),
            gas: GAS_HINT_ERC20_APPROVE,
          },
          origin: { assetId: op.assetId, opType: op.opType, subIndex: 0 },
          label: `Approve Uniswap V3 router for ${op.assetId}`,
        });

        // Sub-call 2: the swap itself, sending tokenOut directly to destination.
        steps.push({
          call: {
            target: SEPOLIA_UNISWAP_V3_ROUTER,
            value: 0n,
            data: encodeFunctionData({
              abi: UNISWAP_V3_ROUTER_ABI,
              functionName: "exactInputSingle",
              args: [
                {
                  tokenIn,
                  tokenOut,
                  fee,
                  recipient: op.destination,
                  amountIn,
                  amountOutMinimum: 0n,
                  sqrtPriceLimitX96: 0n,
                },
              ],
            }),
            gas: GAS_HINT_UNISWAP_SWAP,
          },
          origin: { assetId: op.assetId, opType: op.opType, subIndex: 1 },
          label: op.explanation || "Swap dust → USDC",
        });
        break;
      }
    }
  }

  return steps;
}

