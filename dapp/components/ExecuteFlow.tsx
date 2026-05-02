"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
  useWriteContract,
} from "wagmi";
import { decodeEventLog } from "viem";

import { cn, shortAddr } from "@/lib/utils";
import type { MigrationPlan, PlannedOperation, SavedDestination } from "@/lib/types";
import {
  BATCHER_ADDRESS,
  MIGRATION_VAULT_ADDRESS,
} from "@/lib/contracts";
import { SEPOLIA_CHAIN_ID } from "@/lib/config";
import {
  MIGRATION_VAULT_ABI,
  OP_TYPE_TO_UINT,
} from "@/lib/abis/MigrationVault";
import { ERC20_APPROVE_ABI, NFT_APPROVE_FOR_ALL_ABI } from "@/lib/abis/tokens";
import { planToBatcherSteps, type BatcherStep } from "@/lib/batcher";

import { Mascot } from "./Mascot";
import { PixelButton } from "./PixelButton";
import { ConfettiBurst } from "./ConfettiBurst";

export type ExecutePhase =
  | "idle"
  | "signing-auth"
  | "approving"
  | "submitted"
  | "executing"
  | "complete"
  | "error";

interface Props {
  plan: MigrationPlan;
  destinations: SavedDestination[];
  defaultDestination: `0x${string}` | "";
}

const ZERO = "0x0000000000000000000000000000000000000000" as const;

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

export function ExecuteFlow({ plan, destinations, defaultDestination }: Props) {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<ExecutePhase>("idle");
  const [stepResults, setStepResults] = useState<{ index: number; success: boolean }[]>([]);
  const [yeeted, setYeeted] = useState(false);
  const [migrationTxHash, setMigrationTxHash] = useState<`0x${string}` | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [approvalsDone, setApprovalsDone] = useState(0);
  // Live gas estimate state — populated on mount + after execution.
  const [gasPriceWei, setGasPriceWei] = useState<bigint | null>(null);
  const [actualGasUsed, setActualGasUsed] = useState<bigint | null>(null);

  // User-controlled override: lets you fall back to the legacy approve+vault
  // flow when your wallet doesn't support EIP-7702 yet (e.g. older MetaMask
  // or a wallet from before Pectra).
  const batcherDeployed = BATCHER_ADDRESS !== ZERO;
  const [useLegacyOverride, setUseLegacyOverride] = useState(false);
  const use7702 = batcherDeployed && !useLegacyOverride;
  const batcherSteps: BatcherStep[] = use7702 && address
    ? planToBatcherSteps(plan, address)
    : [];

  // Pre-computed counts for the legacy approvals progress bar.
  const legacyApprovals = !use7702
    ? {
        erc20: collectErc20Approvals(plan.operations).length,
        nft: collectNftCollections(plan.operations).length,
      }
    : { erc20: 0, nft: 0 };
  const totalApprovals = legacyApprovals.erc20 + legacyApprovals.nft;

  const onWrongChain = chainId !== SEPOLIA_CHAIN_ID;
  const noVault = !use7702 && MIGRATION_VAULT_ADDRESS === ZERO;

  // Fetch live gas price on mount + every 30s while idle. Sepolia post-
  // Pectra often reports sub-0.01-gwei prices that round to "0.00 gwei"
  // in the UI and zero out the cost math. Floor at 0.1 gwei (10^8 wei)
  // for display purposes — that's the minimum reasonable price for a
  // working demo and keeps the savings math meaningful. The actual tx
  // signing uses whatever gas price MetaMask wants.
  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    const FLOOR = 100_000_000n; // 0.1 gwei
    const refresh = async () => {
      try {
        const gp = await publicClient.getGasPrice();
        if (cancelled) return;
        setGasPriceWei(gp < FLOOR ? FLOOR : gp);
      } catch {
        if (!cancelled) setGasPriceWei(FLOOR);
      }
    };
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [publicClient]);

  // After execution, read the actual gas used from the receipt so we can
  // show the user what it really cost (vs our pre-flight estimate).
  useEffect(() => {
    if (!publicClient || !migrationTxHash || phase !== "complete") return;
    let cancelled = false;
    publicClient
      .getTransactionReceipt({ hash: migrationTxHash })
      .then((r) => {
        if (!cancelled) setActualGasUsed(r.gasUsed);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [publicClient, migrationTxHash, phase]);

  // ── Gas estimate accounting ─────────────────────────────────────────
  const TX_BASE_GAS = 21_000n;
  const SET_CODE_AUTH_GAS = 25_000n;
  const APPROVE_GAS = 50_000n;
  const sumCallGas = batcherSteps.reduce(
    (acc, s) => acc + (s.call.gas ?? 0n),
    0n,
  );
  const legacyVaultOpGas = plan.operations
    .filter((o) => o.opType !== "TRANSFER_NATIVE")
    .reduce((acc) => acc + 80_000n, 0n);
  const estimatedBatchedGas = use7702
    ? TX_BASE_GAS + SET_CODE_AUTH_GAS + sumCallGas
    : TX_BASE_GAS + legacyVaultOpGas;

  const equivalentUnbatchedGas = (() => {
    // Per-asset approve (real users on mainnet would do this for ERC-20s
    // and per-collection for NFTs) plus per-op base costs.
    const approvalCount =
      collectErc20Approvals(plan.operations).length +
      collectNftCollections(plan.operations).length;
    const opCount = plan.operations.length;
    return (
      BigInt(approvalCount + opCount) * TX_BASE_GAS +
      BigInt(approvalCount) * APPROVE_GAS +
      sumCallGas
    );
  })();
  const gasSavingsAbs =
    equivalentUnbatchedGas > estimatedBatchedGas
      ? equivalentUnbatchedGas - estimatedBatchedGas
      : 0n;
  const gasSavingsPct =
    equivalentUnbatchedGas > 0n
      ? Number((gasSavingsAbs * 100n) / equivalentUnbatchedGas)
      : 0;
  const estimatedCostWei =
    gasPriceWei !== null ? estimatedBatchedGas * gasPriceWei : null;
  const actualCostWei =
    actualGasUsed !== null && gasPriceWei !== null
      ? actualGasUsed * gasPriceWei
      : null;
  const fmtEth = (wei: bigint | null) => {
    if (wei === null) return "—";
    if (wei === 0n) return "0 ETH";
    const eth = Number(wei) / 1e18;
    if (eth >= 0.001) return `${eth.toFixed(5)} ETH`;
    if (eth >= 0.000001) return `${(eth * 1e6).toFixed(2)} µETH`;
    // Sub-µETH: show the wei count; useful on near-zero-gas Sepolia.
    return `${wei.toString()} wei`;
  };
  const fmtGas = (gas: bigint | null) => {
    if (gas === null) return "—";
    if (gas >= 1_000_000n) return `${(Number(gas) / 1e6).toFixed(2)}M gas`;
    if (gas >= 1_000n) return `${(Number(gas) / 1e3).toFixed(0)}k gas`;
    return `${gas.toString()} gas`;
  };
  const fmtGwei = (wei: bigint | null) => {
    if (wei === null) return "—";
    const gwei = Number(wei) / 1e9;
    if (gwei >= 1) return `${gwei.toFixed(2)} gwei`;
    if (gwei >= 0.01) return `${gwei.toFixed(3)} gwei`;
    // Below 0.01 gwei (rare even for Sepolia). Show milli-gwei to be useful.
    return `${(gwei * 1000).toFixed(2)} mgwei`;
  };

  const successCount = stepResults.filter((r) => r.success).length;
  const failedCount = stepResults.length - successCount;
  const totalSteps = use7702 ? batcherSteps.length : plan.operations.length;
  const allSucceeded =
    phase === "complete" && failedCount === 0 && stepResults.length > 0;
  const partialFail = phase === "complete" && failedCount > 0;
  const explorerUrl = migrationTxHash
    ? `https://sepolia.etherscan.io/tx/${migrationTxHash}`
    : null;

  

// ─────────────────────────────────────────────────────────────────────────
// Helpers (legacy path only)
// ─────────────────────────────────────────────────────────────────────────

function collectErc20Approvals(
  ops: PlannedOperation[]
): { token: `0x${string}`; amount: bigint }[] {
  const totals = new Map<`0x${string}`, bigint>();
  for (const op of ops) {
    if (op.opType !== "TRANSFER_ERC20" && op.opType !== "SWAP_AND_TRANSFER") continue;
    const token = op.target;
    const amt = BigInt(op.amount ?? "0");
    totals.set(token, (totals.get(token) ?? 0n) + amt);
  }
  return Array.from(totals.entries()).map(([token, amount]) => ({ token, amount }));
}

function collectNftCollections(ops: PlannedOperation[]): `0x${string}`[] {
  const seen = new Set<`0x${string}`>();
  for (const op of ops) {
    if (op.opType === "TRANSFER_ERC721" || op.opType === "TRANSFER_ERC1155") {
      seen.add(op.target);
    }
  }
  return Array.from(seen);
}

function encodeOperations(ops: PlannedOperation[]) {
  // Native ETH ops are filtered out before this is called — they don't go
  // through MigrationVault. PlannedOperation.opType is a flat union (not
  // a discriminated tagged union) so we can't narrow via predicate;
  // instead we filter out TRANSFER_NATIVE then cast the remaining opType
  // to the keys MigrationVault understands.
  type VaultOpType = keyof typeof OP_TYPE_TO_UINT;
  return ops
    .filter((op) => op.opType !== "TRANSFER_NATIVE")
    .map((op) => ({
      opType: OP_TYPE_TO_UINT[op.opType as VaultOpType],
      target: op.target,
      counterparty: (op.counterparty ?? ZERO) as `0x${string}`,
      tokenId: BigInt(op.tokenId ?? "0"),
      amount: BigInt(op.amount ?? "0"),
      destination: op.destination,
    }));
}

