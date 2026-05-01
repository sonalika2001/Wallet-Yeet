// Approval discovery — scans known (token, spender) pairs for active approvals.
//
// Why this exists: Alchemy SDK doesn't expose a "list all allowances on this
// wallet" endpoint, because allowance data lives in `Approval` event logs and
// would require a full historical scan + current-allowance recheck per pair.
// For a hackathon-scale demo wallet whose approvals were created by our seed
// script, we know exactly which (token, spender) and (collection, operator)
// pairs to check — so we just check them directly via viem.
//
// Cost: ~10 RPC reads (~5 known tokens × ~3 suspicious spenders, plus 2
// NFT collections × ~3 marketplaces). Sub-second on Sepolia.
// < Written by AI.>

import type { Asset } from "../types";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import {
  KNOWN_TOKENS,
  KNOWN_NFT_COLLECTIONS,
  SUSPICIOUS_ADDRESSES,
} from "../contracts";

const ZERO = "0x0000000000000000000000000000000000000000";

const ERC20_ABI = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const ERC721_ABI = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    name: "isApprovedForAll",
    outputs: [{ type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

function makeClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
  });
}

/**
 * Walks KNOWN_TOKENS × SUSPICIOUS_ADDRESSES and KNOWN_NFT_COLLECTIONS ×
 * SUSPICIOUS_ADDRESSES, querying each pair for an active approval. Returns
 * Asset entries with category="approval" matching the shape Auditor expects.
 *
 * Failures on individual pairs (e.g. token not deployed yet) are caught and
 * skipped silently — we want partial results, not a single bad token taking
 * down discovery.
 */
export async function discoverApprovals(
  wallet: `0x${string}`,
): Promise<Asset[]> {
  const client = makeClient();
  const approvals: Asset[] = [];

  // ── ERC-20 allowances ─────────────────────────────────────────────────
  for (const [symbol, tokenAddress] of Object.entries(KNOWN_TOKENS)) {
    if (tokenAddress === ZERO) continue;

    for (const [spender, label] of Object.entries(SUSPICIOUS_ADDRESSES)) {
      try {
        const allowance = await client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [wallet, spender as `0x${string}`],
        });
        if (allowance > 0n) {
          approvals.push({
            id: `appr-${symbol.toLowerCase()}-${spender.slice(2, 8).toLowerCase()}`,
            category: "approval",
            displayName: `${symbol} → ${label}`,
            symbol,
            contractAddress: tokenAddress,
            approvalSpender: spender as `0x${string}`,
            approvalSpenderLabel: label,
            migrateRecommended: true,
          });
        }
      } catch (err) {
        console.warn(
          `[approvals] allowance read failed for ${symbol} × ${label}:`,
          err,
        );
      }
    }
  }

  // ── ERC-721 / ERC-1155 setApprovalForAll ──────────────────────────────
  for (const [name, collectionAddress] of Object.entries(
    KNOWN_NFT_COLLECTIONS,
  )) {
    if (collectionAddress === ZERO) continue;

    for (const [operator, label] of Object.entries(SUSPICIOUS_ADDRESSES)) {
      try {
        const approved = await client.readContract({
          address: collectionAddress,
          abi: ERC721_ABI,
          functionName: "isApprovedForAll",
          args: [wallet, operator as `0x${string}`],
        });
        if (approved) {
          approvals.push({
            id: `appr-${name.toLowerCase()}-${operator.slice(2, 8).toLowerCase()}`,
            category: "approval",
            displayName: `${name} (ALL) → ${label}`,
            contractAddress: collectionAddress,
            approvalSpender: operator as `0x${string}`,
            approvalSpenderLabel: label,
            migrateRecommended: true,
          });
        }
      } catch (err) {
        console.warn(
          `[approvals] isApprovedForAll read failed for ${name} × ${label}:`,
          err,
        );
      }
    }
  }

  return approvals;
}
