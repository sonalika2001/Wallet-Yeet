// Shared types for the multi-agent pipeline + frontend.
// These mirror the OpType enum in MigrationVault.sol

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
  | "SWAP_AND_TRANSFER";

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
  convertDust: boolean;
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

export interface OrchestrateResponse {
  inventory: DiscoveryInventory;
  auditedInventory: DiscoveryInventory;
  plan: MigrationPlan;
  /** True when running on mocks (no API keys configured server-side) */
  isMock: boolean;
}

export interface SavedDestination {
  label: string;
  address: `0x${string}`;
  emoji?: string;
}
