// 📋 Planner Agent — Strategy Specialist
//
// Responsibility: Takes the audited inventory + user preferences and outputs
// a structured MigrationPlan that the contract can consume. Enforces
// revoke-before-transfer, applies per-asset destinations, and (if convertDust
// is on) replaces dust transfers with SWAP_AND_TRANSFER ops.
//
// Architecture: We build the operation list DETERMINISTICALLY in TS — the
// shape, counts, and sequencing must match what the contract executes
// exactly, so trusting an LLM with the structure is a recipe for hallucinated
// counts. The LLM (GPT-4o-mini via Microsoft Foundry) is asked only to
// produce human-readable `explanation` strings per op, plus the plan-level
// `summary` and `warnings`. If the LLM fails we fall back to mechanical text.
// <Comments added by AI.>

import type {
  Asset,
  DiscoveryInventory,
  MigrationPlan,
  OpType,
  PlannedOperation,
  UserPreferences,
} from "../types";
import { hasServerKeys } from "../config";
import { buildMockPlan } from "../mockData";
import { SWAP_USDC_CANDIDATES } from "../contracts";
import { AzureOpenAI } from "openai";
import { withRetry } from "./retry";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

// Sepolia Uniswap V3 Factory. We probe getPool() across all four fee tiers
// to find liquidity for the dust pair before promoting a token transfer to
// a SWAP_AND_TRANSFER. The chosen tier is passed through to the executor so
// the on-chain swap targets the actual pool that exists.
const SEPOLIA_UNISWAP_V3_FACTORY =
  "0x0227628f3F023bb0B980b67D528571c95c6DaC1c" as `0x${string}`;
// All four V3 fee tiers, ordered by liquidity preference for stable-ish pairs.
// 0.05% is most common for stablecoins, 0.30% for volatile, 1% for exotic,
// 0.01% for the cheapest stablecoin pairs.
const UNISWAP_FEE_TIERS = [500, 3000, 100, 10000] as const;

const FACTORY_ABI = [
  {
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    name: "getPool",
    outputs: [{ name: "pool", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

interface SwapPoolMatch {
  tokenOut: `0x${string}`;
  fee: number;
}

/**
 * Find the first (USDC candidate, fee tier) pair that has an active Uniswap
 * V3 pool for the input token on Sepolia. We try every candidate × every fee
 * tier in parallel and return the most-preferred match (preferred order is
 * defined by SWAP_USDC_CANDIDATES, then the fee tiers list). Returns null
 * only when NO combination has liquidity — in that case the planner
 * downgrades to a plain transfer.
 */
async function findSwapPool(
  tokenIn: `0x${string}`,
): Promise<SwapPoolMatch | null> {
  try {
    const client = createPublicClient({
      chain: sepolia,
      transport: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
    });
    // Build the full grid: every USDC candidate × every fee tier. Probe in
    // parallel for speed (Sepolia RPC reads are individually cheap but ~250ms
    // round-trip each; doing 8 sequentially would add ~2s to scout).
    const probes: { tokenOut: `0x${string}`; fee: number }[] = [];
    for (const tokenOut of SWAP_USDC_CANDIDATES) {
      for (const fee of UNISWAP_FEE_TIERS) {
        probes.push({ tokenOut, fee });
      }
    }
    const matches = await Promise.all(
      probes.map((p) =>
        client
          .readContract({
            address: SEPOLIA_UNISWAP_V3_FACTORY,
            abi: FACTORY_ABI,
            functionName: "getPool",
            args: [tokenIn, p.tokenOut, p.fee],
          })
          .then((addr) => (addr !== ZERO ? p : null))
          .catch(() => null),
      ),
    );
    return matches.find((m): m is SwapPoolMatch => m !== null) ?? null;
  } catch (err) {
    console.warn("[planner] swap-pool discovery failed:", err);
    return null;
  }
}

// Canonical execution order — revocations first, ENS last.
// Matches MigrationVault's pre-condition that approvals get killed before
// transfers attempt to use them.
const OP_ORDER: Record<OpType, number> = {
  REVOKE_ERC20: 0,
  TRANSFER_NATIVE: 1, // native ETH first — last op tx in 7702 batch could revert and we want gas safe
  TRANSFER_ERC20: 2,
  SWAP_AND_TRANSFER: 3,
  TRANSFER_ERC721: 4,
  TRANSFER_ERC1155: 5,
  ENS_TRANSFER: 6,
};

function sortOps(ops: PlannedOperation[]): PlannedOperation[] {
  return [...ops].sort((a, b) => OP_ORDER[a.opType] - OP_ORDER[b.opType]);
}

function destFor(
  assetId: string,
  prefs: UserPreferences,
): `0x${string}` {
  return prefs.customRoutes[assetId] ?? prefs.defaultDestination;
}

/**
 * Build the operation list deterministically. The result mirrors what the
 * contract will actually attempt — no hallucinated counts. Async because
 * we read Uniswap V3 factory state to verify pools exist before emitting
 * swap ops; missing pools downgrade to plain transfers.
 */
async function buildOperations(
  inventory: DiscoveryInventory,
  prefs: UserPreferences,
): Promise<{ ops: PlannedOperation[]; skipped: string[]; downgraded: string[] }> {
  const ops: PlannedOperation[] = [];
  const skipped: string[] = [];
  const downgraded: string[] = [];

  for (const a of inventory.assets) {
    if (a.migrateRecommended === false) {
      skipped.push(`${a.displayName} — flagged unmigratable`);
      continue;
    }

    if (a.category === "approval") {
      // Only revoke when risky — SAFE approvals are left alone.
      if (a.riskLevel === "SUSPICIOUS" || a.riskLevel === "DANGEROUS") {
        if (a.contractAddress && a.approvalSpender) {
          ops.push({
            assetId: a.id,
            opType: "REVOKE_ERC20",
            target: a.contractAddress,
            counterparty: a.approvalSpender,
            destination: prefs.defaultDestination, // unused, but contract expects it
            explanation: "", // filled by the LLM (or fallback) below
          });
        }
      }
      continue;
    }

    // Native ETH — has no contractAddress; identified by symbol + missing
    // contract address. Emit a dedicated TRANSFER_NATIVE op so the executor
    // knows to route via msg.value rather than ERC-20 transfer.
    if (
      (a.category === "token" || a.category === "dust-token") &&
      !a.contractAddress &&
      a.symbol === "ETH" &&
      a.amount
    ) {
      ops.push({
        assetId: a.id,
        opType: "TRANSFER_NATIVE",
        target: ZERO, // recipient encoded in `destination`; target unused for native
        amount: a.amount,
        destination: destFor(a.id, prefs),
        explanation: "",
      });
      continue;
    }

    if (a.category === "token" || a.category === "dust-token") {
      if (!a.contractAddress || !a.amount) continue;
      // Two independent reasons to attempt a swap:
      //   1. Curated dust — user opted into "Auto-swap dust to USDC"
      //   2. Unknown token — user opted into "Auto-swap unknown tokens"
      // We treat them as separate intents because dust is an economic
      // categorization (sub-$1 of real value) while unknowns are a
      // metadata gap (no price = we're guessing on the user's behalf).
      const isCuratedDust = a.priceKnown === true && a.isDust === true;
      const isUnknown = a.priceKnown === false;
      let useSwap =
        (prefs.convertDust && isCuratedDust) ||
        (Boolean(prefs.convertUnknownTokens) && isUnknown);
      let match: SwapPoolMatch | null = null;
      // Probe every USDC candidate × every fee tier and use the first pool
      // with liquidity. This way ANY dust token with ANY pool against ANY
      // of our swap-target USDCs gets swapped — only if literally nothing
      // matches do we fall back to a plain transfer.
      if (useSwap) {
        match = await findSwapPool(a.contractAddress);
        if (match === null) {
          useSwap = false;
          downgraded.push(
            `${a.displayName} — no Uniswap V3 pool against any candidate USDC at any fee tier, transferring as-is`,
          );
        }
      }
      ops.push({
        assetId: a.id,
        opType: useSwap ? "SWAP_AND_TRANSFER" : "TRANSFER_ERC20",
        target: a.contractAddress,
        // For SWAP_AND_TRANSFER, counterparty carries tokenOut (the swap
        // destination token). The vault + Batcher both honor this and route
        // to the discovered pool's quote token. Different dust tokens can
        // end up swapping to different USDC variants if that's what their
        // pools support — totally fine.
        counterparty: useSwap && match ? match.tokenOut : undefined,
        // Repurpose tokenId on SWAP_AND_TRANSFER ops to carry the chosen
        // Uniswap V3 fee tier so the on-chain executor swaps against the
        // pool that actually has liquidity. The vault + batcher both read
        // it; 0 means "use the 0.30% default" for backwards compat.
        tokenId: useSwap && match ? String(match.fee) : undefined,
        amount: a.amount,
        destination: destFor(a.id, prefs),
        explanation: "",
      });
      continue;
    }

    if (a.category === "nft") {
      if (!a.contractAddress || !a.tokenId) continue;
      ops.push({
        assetId: a.id,
        opType: "TRANSFER_ERC721",
        target: a.contractAddress,
        tokenId: a.tokenId,
        destination: destFor(a.id, prefs),
        explanation: "",
      });
      continue;
    }

    if (a.category === "ens") {
      if (!a.ensNamehash) continue;
      // Wrapped names (NameWrapper, ERC-1155) need safeTransferFrom on the
      // wrapper contract — registry.setOwner only works for unwrapped names.
      // We reuse the existing TRANSFER_ERC1155 opcode so neither the vault
      // nor the Batcher needs special handling: just route to the right
      // contract with the right calldata.
      if (a.isWrapped && a.contractAddress) {
        ops.push({
          assetId: a.id,
          opType: "TRANSFER_ERC1155",
          target: a.contractAddress, // NameWrapper address
          tokenId: a.ensNamehash, // namehash uint256
          amount: "1", // ENS NFTs are unique, single-supply
          destination: destFor(a.id, prefs),
          explanation: "",
        });
        continue;
      }
      // Unwrapped — classic registry.setOwner path.
      ops.push({
        assetId: a.id,
        opType: "ENS_TRANSFER",
        target: ZERO, // ENS registry filled in at execution time by the vault
        tokenId: a.ensNamehash,
        destination: destFor(a.id, prefs),
        explanation: "",
      });
      continue;
    }
  }

  return { ops: sortOps(ops), skipped, downgraded };
}

interface PlannerLlmResponse {
  explanations: { assetId: string; opType: OpType; explanation: string }[];
  summary: string;
  warnings: string[];
}

function fallbackExplanation(op: PlannedOperation, asset: Asset | undefined): string {
  const dest = `${op.destination.slice(0, 6)}…${op.destination.slice(-4)}`;
  const name = asset?.displayName ?? asset?.symbol ?? "asset";
  switch (op.opType) {
    case "REVOKE_ERC20":
      return `Revoke ${name} approval to ${asset?.approvalSpenderLabel ?? "spender"}`;
    case "TRANSFER_ERC20":
      return `Transfer ${asset?.amountFormatted ?? ""} ${asset?.symbol ?? name} → ${dest}`;
    case "SWAP_AND_TRANSFER":
      return `Swap ${name} → USDC and send to ${dest}`;
    case "TRANSFER_ERC721":
      return `Transfer ${name} (#${op.tokenId}) → ${dest}`;
    case "TRANSFER_ERC1155":
      // Wrapped ENS subnames also flow through TRANSFER_ERC1155 (the
      // NameWrapper contract is ERC-1155). Detect via the asset's ensName
      // so the explanation reads naturally instead of dumping a 78-digit
      // namehash as the tokenId.
      if (asset?.ensName) return `Transfer wrapped ENS ${asset.ensName} → ${dest}`;
      return `Transfer ${name} (#${op.tokenId}) → ${dest}`;
    case "ENS_TRANSFER":
      return `Transfer ENS ${asset?.ensName ?? name} → ${dest}`;
    case "TRANSFER_NATIVE":
      return `Transfer ${asset?.amountFormatted ?? ""} ETH → ${dest}`;
  }
}

function fallbackSummary(ops: PlannedOperation[]): string {
  const dests = new Set(ops.map((o) => o.destination)).size;
  return `Plan ready. ${ops.length} operation${ops.length === 1 ? "" : "s"} across ${dests} destination${dests === 1 ? "" : "s"}. Revocations run before transfers.`;
}

// ── agent entry point ────────────────────────────────────────────────────

export type PhaseCallback = (message: string) => void;

export async function runPlannerAgent(
  inventory: DiscoveryInventory,
  prefs: UserPreferences,
  onPhase?: PhaseCallback,
): Promise<MigrationPlan> {
  if (!hasServerKeys()) {
    onPhase?.("Mock mode — returning canned plan");
    await new Promise((r) => setTimeout(r, 1300));
    return buildMockPlan(prefs);
  }

  // 1) Build the operation list deterministically — never let the LLM own
  //    structural fields (target, amount, tokenId, destination, opType).
  onPhase?.("Building deterministic op list (revoke → ERC-20 → swap → NFT → ENS)…");
  onPhase?.("Verifying Uniswap V3 pool existence for any dust swaps…");
  const { ops, skipped, downgraded } = await buildOperations(inventory, prefs);
  const assetsById = new Map(inventory.assets.map((a) => [a.id, a]));
  const dustOps = ops.filter((o) => o.opType === "SWAP_AND_TRANSFER").length;
  if (downgraded.length > 0) {
    onPhase?.(`Downgraded ${downgraded.length} swap(s) — no pool, transferring as-is`);
  }
  onPhase?.(
    `${ops.length} op${ops.length === 1 ? "" : "s"} sequenced` +
      (dustOps > 0 ? ` (${dustOps} dust→USDC swap${dustOps === 1 ? "" : "s"})` : "")
  );

  // 2) Ask the LLM only to write per-op explanation strings + a plan summary
  //    + warnings. Strict JSON schema, slim payload, low max_tokens since the
  //    response is tiny.
  const oai = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT!,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-12-01-preview",
  });

  const slimOps = ops.map((op) => {
    const a = assetsById.get(op.assetId);
    return {
      assetId: op.assetId,
      opType: op.opType,
      assetName: a?.displayName ?? a?.symbol ?? "asset",
      symbol: a?.symbol,
      amountFormatted: a?.amountFormatted,
      tokenId: op.tokenId,
      ensName: a?.ensName,
      spenderLabel: a?.approvalSpenderLabel,
      destinationShort: `${op.destination.slice(0, 6)}…${op.destination.slice(-4)}`,
    };
  });

  let llmExplanations: PlannerLlmResponse | null = null;
  try {
    onPhase?.("Asking GPT-4o-mini to write explanations + plan summary…");
    const response = await withRetry(
      () => oai.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT!,
      max_tokens: 2048,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are the Planner Agent in a wallet-migration tool. The operation list has ALREADY been computed deterministically — your job is to write a short human-readable explanation for each one, plus a plan summary and any warnings.

STRICT RULES (violating these means your output is discarded):
1. Output one explanation per input op, keyed by (assetId, opType). Do not invent, drop, reorder, or merge ops.
2. Each "explanation" MUST be a single sentence, <= 90 chars, plain prose, no markdown.
3. The "summary" MUST report the EXACT number of operations and destinations you were given. Do not estimate.
4. Use these phrasings as templates:
   - REVOKE_ERC20: "Revoke <assetName> approval to <spenderLabel>."
   - TRANSFER_ERC20: "Transfer <amountFormatted> <symbol> to <destinationShort>."
   - SWAP_AND_TRANSFER: "Swap <assetName> to USDC and send to <destinationShort>."
   - TRANSFER_ERC721 / TRANSFER_ERC1155: "Transfer <assetName> #<tokenId> to <destinationShort>."
   - ENS_TRANSFER: "Transfer ENS <ensName> to <destinationShort>."
5. Warnings: include short notes about anything passed in "skipped". Otherwise return an empty array.

Output strict JSON in this exact schema:
{
  "explanations": [ { "assetId": string, "opType": string, "explanation": string } ],
  "summary": string,
  "warnings": string[]
}`,
        },
        {
          role: "user",
          content: JSON.stringify({
            ops: slimOps,
            opCount: ops.length,
            destinationCount: new Set(ops.map((o) => o.destination)).size,
            skipped,
          }),
        },
      ],
    }),
      { label: "planner" },
    );

    const content = response.choices[0]?.message?.content;
    if (content) {
      llmExplanations = JSON.parse(content) as PlannerLlmResponse;
      onPhase?.("Explanations + summary received");
    }
  } catch (err) {
    console.warn("[planner] LLM explanation pass failed, using deterministic strings:", err);
    onPhase?.("LLM call failed — using mechanical explanation strings");
  }

  // 3) Merge LLM explanations onto the deterministic ops. Anything the LLM
  //    didn't return (or returned malformed) gets the mechanical fallback.
  const explanationMap = new Map<string, string>();
  for (const e of llmExplanations?.explanations ?? []) {
    explanationMap.set(`${e.assetId}::${e.opType}`, e.explanation);
  }

  const finalOps = ops.map((op) => ({
    ...op,
    explanation:
      explanationMap.get(`${op.assetId}::${op.opType}`) ||
      fallbackExplanation(op, assetsById.get(op.assetId)),
  }));

  const summary = llmExplanations?.summary || fallbackSummary(finalOps);
  const warnings = [
    ...(llmExplanations?.warnings ?? []),
    ...skipped,
    ...downgraded,
  ];

  const dustSwapsCount = finalOps.filter((o) => o.opType === "SWAP_AND_TRANSFER").length;

  return {
    operations: finalOps,
    warnings,
    summary,
    dustSwapsCount,
  };
}
