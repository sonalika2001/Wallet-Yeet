// Shared types for the multi-agent pipeline + frontend.
// These mirror the OpType enum in MigrationVault.sol
// <Modified by AI.>

import type { Strategy } from "./config";

export type AssetCategory =
  | "token"
  | "dust-token"
  | "nft"
  | "ens"
  | "approval";

export type RiskLevel = "SAFE" | "SUSPICIOUS" | "DANGEROUS";

//< Interface written by AI.>
export interface Asset {
  id: string; // synthetic stable id used by the UI
  category: AssetCategory;
  displayName: string;
  symbol?: string;
  contractAddress?: `0x${string}`;
  tokenId?: string;
  amount?: string; // raw (wei / token base units)
  amountFormatted?: string; // "1,000,000"
  decimals?: number;
  estimatedValueUsd?: number;
  imageUrl?: string;
  approvalSpender?: `0x${string}`;
  approvalSpenderLabel?: string;
  ensName?: string;
  ensNamehash?: string;
  riskLevel?: RiskLevel;
  riskReason?: string;
  migrateRecommended: boolean;
  /** True if this is dust eligible for Uniswap auto-swap */
  isDust?: boolean;
  /** True when Scout had a curated price for this token (USDC/SHIB-PEPE/GOV).
   *  False/undefined means the token was auto-discovered with no price oracle —
   *  the user opts into swapping these via prefs.convertUnknownTokens. */
  priceKnown?: boolean;
  /** ENS-only: true when the name lives in the NameWrapper (ERC-1155). This
   *  changes the transfer dispatch — wrapped names go through
   *  NameWrapper.safeTransferFrom rather than registry.setOwner. */
  isWrapped?: boolean;
}

export interface DiscoveryInventory {
  wallet: `0x${string}`;
  assets: Asset[];
  /** Assets that cannot be migrated and reasons (POAPs, soulbound NFTs, etc.) */
  unmigratable: { name: string; reason: string }[];
}

export type OpType =
  | "REVOKE_ERC20"
  | "TRANSFER_ERC20"
  | "TRANSFER_ERC721"
  | "TRANSFER_ERC1155"
  | "ENS_TRANSFER"
  | "SWAP_AND_TRANSFER"
  /** Native chain currency (Sepolia ETH). target = recipient, amount = wei.
   *  The vault contract doesn't handle this — under 7702 it's a Batcher
   *  Call with value/data, under legacy it's a user-signed sendTransaction
   *  that runs alongside the vault batch. */
  | "TRANSFER_NATIVE";

  // <Interface written by AI.>
export interface PlannedOperation {
  /** Stable id linking back to the originating Asset */
  assetId: string;
  opType: OpType;
  target: `0x${string}`;
  counterparty?: `0x${string}`;
  tokenId?: string;
  amount?: string;
  destination: `0x${string}`;
  /** Human-readable, shown in the UI */
  explanation: string;
  /** True when user toggles this op off in the review screen */
  excluded?: boolean;
}

export interface MigrationPlan {
  operations: PlannedOperation[];
  warnings: string[];
  summary: string;
  /** Optional Uniswap dust quote info shown in the review */
  dustSwapsCount?: number;
}

export interface UserPreferences {
  defaultDestination: `0x${string}`;
  /** assetId -> destination address override */
  customRoutes: Record<string, `0x${string}`>;
  strategy: Strategy;
  /** Auto-swap dust (priceKnown && estimatedValueUsd < $1) to USDC. */
  convertDust: boolean;
  /** Auto-swap unknown tokens (priceKnown=false) to USDC when a Uniswap
   *  pool exists. Off by default — unknowns are usually held intentionally. */
  convertUnknownTokens?: boolean;
  scheduleAt?: number; // unix seconds; undefined = execute now
}

export type AgentName = "scout" | "auditor" | "planner";
export type AgentStatus = "idle" | "running" | "complete" | "error";

export interface AgentProgress {
  agent: AgentName;
  status: AgentStatus;
  message?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface AgentRunMeta {
  /** Wall-clock duration of this agent's run in ms. */
  durationMs: number;
  /** Friendly model identifier — e.g. "gpt-4o-mini@azure". */
  model: string;
  /** True if this agent's LLM call succeeded; false if it fell back to deterministic. */
  llmOk: boolean;
}

export interface AgentOutputSample {
  /** Short human-readable summary the UI shows on the agents page. */
  summary: string;
  /** Up to a few representative bullet items the agent produced. */
  highlights: string[];
}

export interface AgentEnsIdentity {
  ensName: string;
  address?: `0x${string}`;
  records: Record<string, string>;
  verified: boolean;
}

export interface OrchestrateResponse {
  inventory: DiscoveryInventory;
  auditedInventory: DiscoveryInventory;
  plan: MigrationPlan;
  /** True when running on mocks (no API keys configured server-side) */
  isMock: boolean;
  /** Per-agent wall-clock + model info — surfaced on the agents page so the UI shows real provenance. */
  agentTimings?: Partial<Record<AgentName, AgentRunMeta>>;
  /** Per-agent sample outputs (summary + a few highlights) for the live tail UI. */
  agentOutputs?: Partial<Record<AgentName, AgentOutputSample>>;
  /** ENS identities (subname + text records) for each agent. */
  agentIdentities?: Partial<Record<AgentName, AgentEnsIdentity>>;
}

// ── SSE event schema ─────────────────────────────────────────────────────
// Wire format: each line is `data: ${JSON.stringify(event)}\n\n`. Events
// are emitted as the agents progress; the final "complete" event carries
// the same payload shape as OrchestrateResponse for compatibility.

export type OrchestrateEvent =
  | { type: "agent:start"; agent: AgentName; identity?: AgentEnsIdentity }
  | { type: "agent:phase"; agent: AgentName; message: string }
  | {
      type: "agent:done";
      agent: AgentName;
      timing: AgentRunMeta;
      output: AgentOutputSample;
    }
  | { type: "agent:error"; agent: AgentName; message: string }
  | { type: "complete"; payload: OrchestrateResponse }
  | { type: "error"; message: string };

export interface SavedDestination {
  label: string;
  address: `0x${string}`;
  emoji?: string;
}
