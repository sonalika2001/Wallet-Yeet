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

  