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
import { notifyMigrationComplete } from "@/lib/adapters/keeperhub";

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
        revocations: plan.operations.filter((o) => o.opType === "REVOKE_ERC20").length,
      }
    : { erc20: 0, nft: 0, revocations: 0 };
  const totalApprovals =
    legacyApprovals.erc20 + legacyApprovals.nft + legacyApprovals.revocations;

  const onWrongChain = chainId !== SEPOLIA_CHAIN_ID;
  const noVault = !use7702 && MIGRATION_VAULT_ADDRESS === ZERO;

  // Fetch live gas price on mount + every 30s while idle, so the cost
  // estimate reflects current chain conditions.
  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const gp = await publicClient.getGasPrice();
        if (!cancelled) setGasPriceWei(gp);
      } catch {
        // Ignore — UI just shows the placeholder if we can't fetch.
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
  // 7702 path: one tx with 21k base + ~25k SetCode auth + sum of per-call
  // gas hints. Legacy path: one tx per approval (each 21k base + ~50k for
  // the approve) + the vault's executeMigration tx (21k base + sum of
  // op gas).
  const TX_BASE_GAS = 21_000n;
  const SET_CODE_AUTH_GAS = 25_000n;
  const APPROVE_GAS = 50_000n;
  const sumCallGas = batcherSteps.reduce(
    (acc, s) => acc + (s.call.gas ?? 0n),
    0n,
  );
  const legacyVaultOpGas = plan.operations
    .filter((o) => o.opType !== "REVOKE_ERC20" && o.opType !== "TRANSFER_NATIVE")
    .reduce((acc) => acc + 80_000n, 0n);
  const estimatedBatchedGas = use7702
    ? TX_BASE_GAS + SET_CODE_AUTH_GAS + sumCallGas
    : TX_BASE_GAS + legacyVaultOpGas;
  // What the equivalent unbatched flow would cost: each individual tx
  // pays its own 21k base. For 7702 we compare against the same logical
  // ops as N separate user-signed txs. For the legacy flow we count the
  // approvals + revocations + vault tx as already-N transactions.
  const equivalentUnbatchedGas = (() => {
    // Per-asset approve (real users on mainnet would do this for ERC-20s
    // and per-collection for NFTs) plus per-op base costs.
    const approvalCount =
      collectErc20Approvals(plan.operations).length +
      collectNftCollections(plan.operations).length +
      plan.operations.filter((o) => o.opType === "REVOKE_ERC20").length;
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
    const eth = Number(wei) / 1e18;
    if (eth < 0.0001) return `${(eth * 1e6).toFixed(0)} µETH`;
    return `${eth.toFixed(5)} ETH`;
  };
  const fmtGas = (gas: bigint | null) => {
    if (gas === null) return "—";
    if (gas >= 1_000_000n) return `${(Number(gas) / 1e6).toFixed(2)}M gas`;
    if (gas >= 1_000n) return `${(Number(gas) / 1e3).toFixed(0)}k gas`;
    return `${gas.toString()} gas`;
  };
  const fmtGwei = (wei: bigint | null) => {
    if (wei === null) return "—";
    return `${(Number(wei) / 1e9).toFixed(2)} gwei`;
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

  // ── 7702 single-signature flow ──────────────────────────────────────
  const startYeet7702 = async () => {
    if (!address || !walletClient || !publicClient) {
      setErrorMsg("Wallet not ready.");
      setPhase("error");
      return;
    }
    if (onWrongChain) {
      setErrorMsg("Switch your wallet to Sepolia.");
      setPhase("error");
      return;
    }
    if (batcherSteps.length === 0) {
      setErrorMsg("No operations to execute.");
      setPhase("error");
      return;
    }

    setErrorMsg(null);
    setStepResults([]);
    setYeeted(false);
    setMigrationTxHash(null);

    try {
      // EIP-5792 `wallet_sendCalls`. The wallet (MetaMask) handles the
      // batching mechanics — under the hood it uses EIP-7702 to delegate the
      // EOA to its internal multicall contract for one transaction, so the
      // user signs ONCE for the whole batch. We never call signAuthorization
      // ourselves (viem's helper only works with local accounts; MetaMask is
      // a JSON-RPC account).
      setPhase("signing-auth");
      const sendCalls = (
        walletClient as unknown as {
          sendCalls?: (args: {
            calls: {
              to: `0x${string}`;
              data?: `0x${string}`;
              value: bigint;
              gas?: bigint;
            }[];
            forceAtomic?: boolean;
            capabilities?: Record<string, unknown>;
          }) => Promise<string | { id: string }>;
        }
      ).sendCalls;
      if (!sendCalls) {
        throw new Error(
          "walletClient.sendCalls is missing — your viem version is too old. Run `pnpm add viem@latest wagmi@latest` and restart.",
        );
      }
      // forceAtomic: true tells the wallet to execute the batch as a SINGLE
      // EIP-7702 transaction and estimate gas for the whole thing — without
      // it MetaMask estimates each call independently, which fails for
      // sequence-dependent calls (e.g. a swap that reads from a prior
      // approve) and falls back to the block gas limit, triggering the
      // "gas limit too high" error.
      //
      // Native ETH transfers have no calldata. viem 2.48 strictly rejects
      // `data: "0x"` (regex requires at least one nibble after 0x), so we
      // OMIT the field for those calls instead of sending an empty hex
      // string. EIP-5792 spec treats `data` as optional, MetaMask is fine.
      const sendResult = await sendCalls.call(walletClient, {
        calls: batcherSteps.map((s) => {
          const call: {
            to: `0x${string}`;
            value: bigint;
            data?: `0x${string}`;
            gas?: bigint;
          } = {
            to: s.call.target,
            value: s.call.value,
          };
          if (s.call.data && s.call.data !== "0x") {
            call.data = s.call.data;
          }
          if (s.call.gas) {
            call.gas = s.call.gas;
          }
          return call;
        }),
        forceAtomic: true,
      });
      const batchId =
        typeof sendResult === "string" ? sendResult : sendResult.id;

      // Poll batch status until the wallet reports completion. We treat
      // ANY of these as "done": status === "CONFIRMED", numeric status ≥ 200
      // (per EIP-5792 v2), OR the appearance of a non-empty receipts array
      // (some wallets populate receipts before bumping status). The receipt
      // signal is the most reliable — once it's there, the tx has been mined.
      setPhase("submitted");
      const getCallsStatus = (
        walletClient as unknown as {
          getCallsStatus?: (args: { id: string }) => Promise<{
            status: string | number;
            receipts?: {
              status: string | number;
              transactionHash: `0x${string}`;
            }[];
          }>;
        }
      ).getCallsStatus;
      if (!getCallsStatus) {
        throw new Error("walletClient.getCallsStatus is missing — viem too old.");
      }

      let final: Awaited<ReturnType<typeof getCallsStatus>> | null = null;
      const startedAt = Date.now();
      while (Date.now() - startedAt < 180_000) {
        const status = await getCallsStatus.call(walletClient, { id: batchId });
        const numericStatus =
          typeof status.status === "number" ? status.status : NaN;
        const stringStatus =
          typeof status.status === "string" ? status.status.toUpperCase() : "";
        const hasReceipts =
          Array.isArray(status.receipts) && status.receipts.length > 0;

        // Surface tx hash AS SOON as the wallet hands one back, even if the
        // batch isn't confirmed yet — gives the user a working "View on
        // Etherscan" link immediately.
        if (hasReceipts && !migrationTxHash) {
          setMigrationTxHash(status.receipts![0].transactionHash);
        }

        const isConfirmed =
          stringStatus === "CONFIRMED" ||
          stringStatus === "SUCCESS" ||
          stringStatus === "FAILURE" ||
          (numericStatus >= 200 && numericStatus < 700) ||
          hasReceipts;
        if (isConfirmed) {
          final = status;
          break;
        }
        if (Date.now() - startedAt > 1000 && phase !== "executing") {
          setPhase("executing");
          setYeeted(true);
        }
        await new Promise((r) => setTimeout(r, 1500));
      }

      if (!final) {
        throw new Error(
          "Wallet didn't report status in 180s. Check the migration tx on Etherscan — it may have succeeded; the wallet just didn't acknowledge it.",
        );
      }

      // EIP-5792 receipt accounting:
      //   - Atomic batch (7702): wallet returns ONE receipt for the
      //     whole transaction. All sub-calls succeeded or none did.
      //   - Sequential batch: wallet returns one receipt per call.
      // We can't always tell which mode the wallet picked, so we infer:
      // if receipts.length === 1 but our batch has > 1 sub-call AND that
      // single receipt is success, we mark every sub-call as succeeded
      // (atomic semantics — they all ran in the same tx).
      const receipts = final.receipts ?? [];
      const expectedCalls = batcherSteps.length;
      const oneReceiptIsSuccess =
        receipts.length === 1 &&
        (receipts[0].status === "success" ||
          receipts[0].status === 1 ||
          receipts[0].status === "0x1");
      const isAtomicBatch =
        receipts.length === 1 && expectedCalls > 1 && oneReceiptIsSuccess;
      const results: { index: number; success: boolean }[] = isAtomicBatch
        ? // All sub-calls share the single tx's success status.
          batcherSteps.map((_, i) => ({ index: i, success: true }))
        : receipts.map((r, i) => ({
            index: i,
            success:
              r.status === "success" || r.status === 1 || r.status === "0x1",
          }));
      setStepResults(results);
      const finalTxHash =
        receipts.length > 0 ? receipts[0].transactionHash : null;
      if (finalTxHash) {
        setMigrationTxHash(finalTxHash);
      }
      setYeeted(true);
      setPhase("complete");
      // Post-migration KeeperHub webhook (fire-and-forget).
      if (finalTxHash) {
        void notifyMigrationComplete({
          migrationId: batchId,
          fromWallet: address,
          successCount: results.filter((r) => r.success).length,
          totalCount: results.length,
          txHash: finalTxHash,
          destinations: Array.from(
            new Set(plan.operations.map((o) => o.destination)),
          ),
        }).catch(() => {});
      }
    } catch (err) {
      console.error("[ExecuteFlow:7702] failed:", err);
      // Surface the real error verbatim. The viem/wagmi/MetaMask stack has
      // many possible failure modes here (method not exposed, chain mismatch,
      // user rejection, missing signAuthorization on this wagmi version,
      // etc.) so guessing the cause and overriding the message just hides
      // useful debugging info. The legacy fallback toggle below the YEET
      // button gives users an out without us pretending to know.
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "Unknown error — check the browser console.";
      const userRejected =
        msg.toLowerCase().includes("user rejected") ||
        msg.toLowerCase().includes("user denied") ||
        (err as { code?: number })?.code === 4001;
      setErrorMsg(
        userRejected
          ? "Signature rejected in MetaMask. Click YEET again or tick 'Use legacy flow' to try the multi-sig path."
          : `${msg}\n\nIf this looks like an EIP-7702 incompatibility, tick "Use legacy flow" below and retry. Full error in the browser console.`,
      );
      setPhase("error");
    }
  };

  // ── Legacy approve-then-vault flow (used when Batcher isn't deployed) ─
  const startYeetLegacy = async () => {
    if (!address || onWrongChain || noVault || !publicClient) {
      setErrorMsg(
        !address
          ? "Connect a wallet first."
          : onWrongChain
          ? "Switch your wallet to Sepolia."
          : noVault
          ? "MigrationVault address not configured."
          : "RPC client unavailable."
      );
      setPhase("error");
      return;
    }

    const erc20Approvals = collectErc20Approvals(plan.operations);
    const nftCollections = collectNftCollections(plan.operations);
    const revocations = plan.operations.filter((o) => o.opType === "REVOKE_ERC20");
    const nativeTransfers = plan.operations.filter((o) => o.opType === "TRANSFER_NATIVE");
    const totalApprovals =
      erc20Approvals.length + nftCollections.length + revocations.length;
    // Native ETH and revocations don't go through the vault — natives are
    // user-signed sendTransactions, revocations are user-signed approves.
    const vaultOps = plan.operations.filter(
      (o) => o.opType !== "REVOKE_ERC20" && o.opType !== "TRANSFER_NATIVE",
    );

    setErrorMsg(null);
    setStepResults([]);
    setApprovalsDone(0);
    setYeeted(false);
    setMigrationTxHash(null);
    setPhase("approving");

    try {
      for (const { token, amount } of erc20Approvals) {
        const hash = await writeContractAsync({
          address: token,
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [MIGRATION_VAULT_ADDRESS, amount],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        setApprovalsDone((d) => d + 1);
      }
      for (const collection of nftCollections) {
        const hash = await writeContractAsync({
          address: collection,
          abi: NFT_APPROVE_FOR_ALL_ABI,
          functionName: "setApprovalForAll",
          args: [MIGRATION_VAULT_ADDRESS, true],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        setApprovalsDone((d) => d + 1);
      }
      for (const op of revocations) {
        if (!op.counterparty) continue;
        const hash = await writeContractAsync({
          address: op.target,
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [op.counterparty, 0n],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        setApprovalsDone((d) => d + 1);
      }

      // Native ETH transfers — user-signed sendTransaction per op. The
      // vault contract doesn't handle native asset (no payable batch
      // semantics in the current ABI), so we send these directly.
      for (const op of nativeTransfers) {
        if (!walletClient) throw new Error("walletClient unavailable for native ETH transfer");
        const hash = await walletClient.sendTransaction({
          to: op.destination,
          value: BigInt(op.amount ?? "0"),
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }

      setPhase("submitted");
      const encoded = encodeOperations(vaultOps);
      const migrationHash = await writeContractAsync({
        address: MIGRATION_VAULT_ADDRESS,
        abi: MIGRATION_VAULT_ABI,
        functionName: "executeMigration",
        args: [encoded],
      });
      setMigrationTxHash(migrationHash);
      setPhase("executing");
      setYeeted(true);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: migrationHash,
      });

      const results: { index: number; success: boolean }[] = [];
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== MIGRATION_VAULT_ADDRESS.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({
            abi: MIGRATION_VAULT_ABI,
            data: log.data,
            topics: log.topics as [
              signature: `0x${string}`,
              ...args: `0x${string}`[]
            ],
          });
          if (decoded.eventName === "OperationExecuted") {
            const args = decoded.args as unknown as {
              opIndex: bigint;
              success: boolean;
            };
            results.push({ index: Number(args.opIndex), success: args.success });
          }
        } catch {
          // ignore
        }
      }
      const sortedResults = results.sort((a, b) => a.index - b.index);
      setStepResults(sortedResults);
      setPhase("complete");
      // Fire-and-forget KeeperHub webhook so the user gets a Discord/Slack
      // notification after the migration confirms. Failures here MUST NOT
      // bubble up — the migration already succeeded.
      void notifyMigrationComplete({
        migrationId: migrationHash,
        fromWallet: address,
        successCount: sortedResults.filter((r) => r.success).length,
        totalCount: sortedResults.length,
        txHash: migrationHash,
        destinations: Array.from(new Set(plan.operations.map((o) => o.destination))),
      }).catch(() => {});
    } catch (err) {
      console.error("[ExecuteFlow:legacy] failed:", err);
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setPhase("error");
    }
  };

  const startYeet = use7702 ? startYeet7702 : startYeetLegacy;

  // ── UI ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 relative">
      {allSucceeded && <ConfettiBurst />}

      <div className="card-pop p-6 relative overflow-hidden">
        <div className="grid sm:grid-cols-[auto,1fr,auto] items-center gap-5">
          <div className={allSucceeded ? "animate-mascot-celebrate" : undefined}>
            <Mascot size={120} yeeting={allSucceeded} />
          </div>
          <div>
            <div className="font-display text-2xl font-bold tracking-tight">
              {phase === "idle" && "Ready to migrate?"}
              {phase === "signing-auth" && "Sign the EIP-7702 authorization…"}
              {phase === "approving" && "Sign approvals…"}
              {phase === "submitted" && "Submitting migration…"}
              {phase === "executing" && "Migration in progress 🚀"}
              {allSucceeded && "Yeet complete!"}
              {partialFail && `Migrated with ${failedCount} failure${failedCount === 1 ? "" : "s"}`}
              {phase === "error" && "Something snagged"}
            </div>
            <p className="mt-1 text-sm text-ink-700 max-w-prose">
              {phase === "idle" && use7702 && (
                <>
                  <span className="pill pill--lilac mr-2">EIP-5792 + 7702</span>
                  One signature batches all {batcherSteps.length} sub-call
                  {batcherSteps.length === 1 ? "" : "s"} (transfers, swaps,
                  revocations, ENS handovers) into a single transaction via
                  MetaMask&apos;s native batched-call API — no per-asset
                  approvals required.
                </>
              )}
              {phase === "idle" && !use7702 && (
                <>
                  Legacy flow — sign each per-asset approval, then the bundled
                  migration tx. Set <code>NEXT_PUBLIC_BATCHER_ADDRESS</code>{" "}
                  to switch to the single-signature 7702 path.
                </>
              )}
              {phase === "signing-auth" &&
                "MetaMask will ask you to confirm a single batched transaction. Behind the scenes it uses EIP-7702 to delegate your EOA for the call."}
              {phase === "approving" &&
                `Sign each approval — ${approvalsDone} done.`}
              {phase === "submitted" &&
                "Migration tx submitted. Waiting for inclusion…"}
              {phase === "executing" &&
                "Each sub-call runs in try/catch — partial failures don't abort the rest."}
              {allSucceeded &&
                `All ${stepResults.length} sub-call${stepResults.length === 1 ? "" : "s"} succeeded${use7702 ? " atomically in one tx" : ""}. Switch wallets to verify.`}
              {partialFail &&
                `Migration transaction confirmed on-chain — ${successCount}/${stepResults.length} ops executed successfully. ${failedCount} reverted (most often: no Uniswap pool for the dust pair, insufficient balance, or wrapped-vs-unwrapped ENS). The successful ops moved real assets; check Etherscan to confirm.`}
              {phase === "error" && (errorMsg ?? "Check the console / explorer.")}
            </p>
          </div>
          <div className="flex flex-col gap-2 items-end">
            {phase === "idle" && (
              <PixelButton variant="primary" onClick={startYeet}>
                YEET IT 🚀
              </PixelButton>
            )}
            {phase === "complete" && explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                className={cn("inline-block rounded-2xl", allSucceeded && "animate-success-pulse")}
              >
                <PixelButton variant="mint">View on Etherscan ↗</PixelButton>
              </a>
            )}
            {phase === "error" && (
              <>
                <PixelButton variant="default" onClick={startYeet}>
                  Retry
                </PixelButton>
                {/* If we just failed on the 7702 path, offer a one-click
                    fallback to the legacy approve-then-vault flow. */}
                {use7702 && (
                  <PixelButton
                    variant="ghost"
                    onClick={() => {
                      setUseLegacyOverride(true);
                      setPhase("idle");
                      setErrorMsg(null);
                    }}
                  >
                    Switch to legacy flow ↻
                  </PixelButton>
                )}
              </>
            )}
          </div>
        </div>

        {/* Gas estimate panel — visible while idle so the user sees what
            the migration will cost before they sign, plus a real comparison
            against the unbatched alternative. After execution we replace
            the estimate with the actual gas used from the receipt. */}
        {(phase === "idle" || phase === "complete") && (
          <div className="mt-4 pt-4 border-t-2 border-ink-100">
            <div className="flex items-center justify-between text-xs text-ink-500 mb-2">
              <span className="font-pixel text-[10px] tracking-widest">
                {phase === "complete" ? "ACTUAL GAS USED" : "ESTIMATED GAS"}
              </span>
              <span>Live gas price: {fmtGwei(gasPriceWei)}</span>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <div className="card-soft p-3">
                <div className="text-[11px] text-ink-500">
                  {phase === "complete" ? "Used" : "This batch"}
                </div>
                <div className="font-display text-lg font-bold">
                  {phase === "complete"
                    ? fmtEth(actualCostWei)
                    : fmtEth(estimatedCostWei)}
                </div>
                <div className="text-[10px] text-ink-500 font-mono">
                  {phase === "complete"
                    ? fmtGas(actualGasUsed)
                    : fmtGas(estimatedBatchedGas)}
                </div>
              </div>
              <div className="card-soft p-3 opacity-60 line-through decoration-red-300">
                <div className="text-[11px] text-ink-500 no-underline">
                  Equivalent unbatched
                </div>
                <div className="font-display text-lg font-bold no-underline">
                  {gasPriceWei !== null
                    ? fmtEth(equivalentUnbatchedGas * gasPriceWei)
                    : "—"}
                </div>
                <div className="text-[10px] text-ink-500 font-mono no-underline">
                  {fmtGas(equivalentUnbatchedGas)}
                </div>
              </div>
              <div className="card-soft p-3 bg-mint-50 border-mint-300">
                <div className="text-[11px] text-mint-600">You save</div>
                <div className="font-display text-lg font-bold text-mint-600">
                  {gasPriceWei !== null
                    ? fmtEth(gasSavingsAbs * gasPriceWei)
                    : "—"}
                </div>
                <div className="text-[10px] text-mint-700 font-mono">
                  ~{gasSavingsPct}% · {fmtGas(gasSavingsAbs)}
                </div>
              </div>
            </div>
            <details className="mt-2 text-[11px] text-ink-500">
              <summary className="cursor-pointer hover:text-ink-700">
                Why is the batch cheaper? ↓
              </summary>
              <div className="mt-2 leading-relaxed space-y-1">
                <p>
                  Every Ethereum transaction pays a flat <strong>21,000 gas</strong>{" "}
                  base cost regardless of what it does — that&apos;s the cost the
                  network charges just to include the tx in a block. Sending
                  N tokens manually means paying that base N times.
                </p>
                <p>
                  Plus, ERC-20 transfers traditionally need a separate{" "}
                  <code>approve()</code> tx beforehand (~50k gas + 21k base each).
                  For a 12-asset migration that&apos;s ~10 approvals before any
                  transfer happens.
                </p>
                <p>
                  WalletYeet bundles everything into{" "}
                  <strong>one EIP-7702 transaction</strong>: 21k base paid once,
                  plus a ~25k SetCode authorization that delegates your EOA to
                  the Batcher contract for this single tx. Inside the batch,
                  every sub-call runs with <code>msg.sender = your EOA</code>,
                  so plain transfers work without per-asset approvals.
                </p>
                <p>
                  Net effect on a typical demo wallet: one tx base + zero
                  separate approvals + an auth, vs ~25 separate transactions.
                  That&apos;s where the {gasSavingsPct}% comes from.
                </p>
              </div>
            </details>
          </div>
        )}

        {/* Legacy approvals progress bar. Visible during the approving
            phase or when the migration is in flight after approvals — gives
            the user a clear "X of Y signatures done" indicator. */}
        {!use7702 &&
          totalApprovals > 0 &&
          (phase === "approving" ||
            phase === "submitted" ||
            phase === "executing" ||
            phase === "complete") && (
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-ink-500 mb-1">
                <span>
                  Approvals signed{" "}
                  <span className="text-ink-700">
                    ({legacyApprovals.erc20} ERC-20 · {legacyApprovals.nft} NFT
                    {legacyApprovals.nft === 1 ? "" : "s"} ·{" "}
                    {legacyApprovals.revocations} revocation
                    {legacyApprovals.revocations === 1 ? "" : "s"})
                  </span>
                </span>
                <span className="font-pixel">
                  {Math.min(approvalsDone, totalApprovals)}/{totalApprovals}
                </span>
              </div>
              <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-peach-400 transition-all duration-300"
                  style={{
                    width: `${
                      (Math.min(approvalsDone, totalApprovals) / totalApprovals) *
                      100
                    }%`,
                  }}
                />
              </div>
            </div>
          )}

        {/* EIP-7702 / legacy fallback toggle. Only visible if the Batcher
            contract is actually deployed; otherwise legacy is the only path. */}
        {batcherDeployed && phase === "idle" && (
          <div className="mt-4 pt-4 border-t-2 border-ink-100">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useLegacyOverride}
                onChange={(e) => setUseLegacyOverride(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-peach-500"
              />
              <span className="text-xs text-ink-700">
                <span className="font-semibold">Use legacy flow</span>{" "}
                <span className="text-ink-500">
                  (multiple signatures via MigrationVault). Check this if your
                  wallet doesn&apos;t support EIP-7702 yet.
                </span>
              </span>
            </label>
          </div>
        )}
      </div>

      {/* Per-step live tracker — works for both 7702 and legacy flows. */}
      {(phase === "executing" || phase === "complete") && (
        <div className="card-pop overflow-hidden">
          <div className="px-4 py-3 bg-cream border-b-2 border-ink-900 font-semibold text-sm flex items-center justify-between">
            <span>{use7702 ? "Batched calls" : "Operations"}</span>
            <span className="text-xs text-ink-500 font-normal">
              {stepResults.length}/{totalSteps}
            </span>
          </div>
          <ul className="divide-y-2 divide-ink-100 max-h-[420px] overflow-y-auto">
            {(use7702 ? batcherSteps : plan.operations).map((s, i) => {
              const r = stepResults.find((rr) => rr.index === i);
              const status: "pending" | "success" | "fail" = !r
                ? "pending"
                : r.success
                ? "success"
                : "fail";
              const label = use7702
                ? (s as BatcherStep).label
                : (s as PlannedOperation).explanation;
              const opType = use7702
                ? (s as BatcherStep).origin.opType
                : (s as PlannedOperation).opType;
              const subtitle = use7702
                ? `${opType} · ${shortAddr((s as BatcherStep).call.target)}`
                : `${opType} · ${shortAddr((s as PlannedOperation).destination)}`;
              // Contextual revert hint per op type — keeps users from thinking
              // a single failed op means the whole tx died.
              const failHint =
                status === "fail"
                  ? opType === "SWAP_AND_TRANSFER"
                    ? "Reverted on Uniswap router — no V3 pool for this token pair"
                    : opType === "ENS_TRANSFER"
                    ? "Reverted on ENS registry — likely a wrapped name (needs NameWrapper.safeTransferFrom)"
                    : opType === "TRANSFER_ERC20" || opType === "TRANSFER_ERC721"
                    ? "Reverted — insufficient balance or approval"
                    : "Reverted on-chain"
                  : null;
              return (
                <li
                  key={i}
                  className={cn(
                    "grid grid-cols-[28px_1fr_auto] items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                    status === "pending" && "opacity-60",
                    status === "fail" && "bg-red-50/40"
                  )}
                >
                  <span
                    className={cn(
                      "w-6 h-6 rounded-full grid place-items-center text-xs font-pixel",
                      status === "pending" && "bg-ink-100 text-ink-500",
                      status === "success" && "bg-mint-300 text-ink-900",
                      status === "fail" && "bg-red-200 text-red-700"
                    )}
                  >
                    {status === "pending" ? "…" : status === "success" ? "✓" : "✕"}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{label}</div>
                    <div className="text-[11px] text-ink-500">{subtitle}</div>
                    {failHint && (
                      <div className="text-[11px] text-red-600 mt-0.5">
                        ↳ {failHint}
                      </div>
                    )}
                  </div>
                  {migrationTxHash && status !== "pending" && (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${migrationTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-mono text-ink-500 hover:text-peach-500"
                      title="View migration tx on Etherscan"
                    >
                      {shortAddr(migrationTxHash)} ↗
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {phase === "complete" && (
        <div className="card-pop p-5 bg-gradient-to-br from-mint-50 to-sky-50">
          <div className="font-display text-xl font-bold">Final report</div>
          <ul className="mt-2 space-y-1 text-sm">
            <li>
              ✅ Successful sub-calls:{" "}
              <span className="font-semibold">{successCount}</span>
            </li>
            <li>
              ❌ Failed sub-calls:{" "}
              <span className="font-semibold">{failedCount}</span>
            </li>
            <li>
              📦 Destinations touched:{" "}
              <span className="font-semibold">
                {new Set(plan.operations.map((o) => o.destination)).size}
              </span>
            </li>
            {plan.dustSwapsCount ? (
              <li>
                🔁 Uniswap dust swaps:{" "}
                <span className="font-semibold">{plan.dustSwapsCount}</span>
              </li>
            ) : null}
            {use7702 && (
              <li>
                ✍️ Signatures used:{" "}
                <span className="font-semibold">1</span>
                <span className="text-ink-500"> (EIP-7702)</span>
              </li>
            )}
          </ul>
          <p className="text-xs text-ink-500 mt-3">
            Tip: switch MetaMask to{" "}
            <span className="font-mono">{shortAddr(defaultDestination)}</span>
            {destinations.length > 0
              ? ` (or any of your ${destinations.length} extra destination${destinations.length === 1 ? "" : "s"})`
              : ""}{" "}
            to see assets arrive.
          </p>
        </div>
      )}
    </div>
  );
}

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
  return ops.map((op) => ({
    opType: OP_TYPE_TO_UINT[op.opType],
    target: op.target,
    counterparty: (op.counterparty ?? ZERO) as `0x${string}`,
    tokenId: BigInt(op.tokenId ?? "0"),
    amount: BigInt(op.amount ?? "0"),
    destination: op.destination,
  }));
}

