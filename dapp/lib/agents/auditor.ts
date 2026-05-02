// ⚠️ Auditor Agent — Risk Specialist
//
// Responsibility: Receives Scout's raw inventory, scores risk per asset
// (SAFE / SUSPICIOUS / DANGEROUS), and identifies sub-$1 dust tokens.
// Uses deterministic heuristics first, then optionally asks GPT-4o-mini
// (via Microsoft Foundry) to refine the per-item explanation text.
//
// Note: Auditor does NOT call Alchemy. The inventory is already populated
// by Scout — Auditor just annotates it.
//<Comments written by AI.>

import type { DiscoveryInventory } from "../types";
import { DUST_THRESHOLD_USD, hasServerKeys } from "../config";
import { MOCK_AUDITED_INVENTORY } from "../mockData";
import { SUSPICIOUS_ADDRESSES } from "../contracts";
import { AzureOpenAI } from "openai";
import { withRetry } from "./retry";

function parseAndValidate<T>(content: string | null): T {
  if (!content) throw new Error("Empty LLM response");
  return JSON.parse(content) as T;
}

export type PhaseCallback = (message: string) => void;

export async function runAuditorAgent(
  inventory: DiscoveryInventory,
  onPhase?: PhaseCallback,
): Promise<DiscoveryInventory> {
  if (!hasServerKeys()) {
    onPhase?.("Mock mode — returning canned audit");
    await new Promise((r) => setTimeout(r, 1100));
    return { ...MOCK_AUDITED_INVENTORY, wallet: inventory.wallet };
  }

  onPhase?.(`Scoring ${inventory.assets.length} asset${inventory.assets.length === 1 ? "" : "s"} via deterministic rules…`);
  // First-pass deterministic scoring — keeps LLM calls cheap and results
  // predictable. The LLM refines reasons but never overrides DANGEROUS.
  const annotated = inventory.assets.map((a) => {
    if (a.category === "approval" && a.approvalSpender) {
      const isKnownBad =
        SUSPICIOUS_ADDRESSES[a.approvalSpender.toLowerCase()] !== undefined ||
        SUSPICIOUS_ADDRESSES[a.approvalSpender] !== undefined;
      return {
        ...a,
        riskLevel: isKnownBad ? ("DANGEROUS" as const) : ("SUSPICIOUS" as const),
        riskReason: isKnownBad
          ? "Approval target matches a known-bad pattern."
          : "Unlimited allowance to an unfamiliar contract.",
      };
    }
    if (
      (a.category === "token" || a.category === "dust-token") &&
      typeof a.estimatedValueUsd === "number" &&
      a.estimatedValueUsd < DUST_THRESHOLD_USD &&
      // Respect Scout's explicit decision. If Scout already set isDust=false
      // (e.g. for native ETH where the price-of-zero is "no oracle" not
      // "tiny value"), don't auto-flip. Only auto-flip when isDust is
      // undefined (Scout left it ambiguous).
      a.isDust !== false
    ) {
      return {
        ...a,
        category: "dust-token" as const,
        isDust: true,
        riskLevel: "SAFE" as const,
        riskReason: `Sub-$${DUST_THRESHOLD_USD} dust — recommend converting to USDC.`,
      };
    }
    return { ...a, riskLevel: "SAFE" as const };
  });

  const dangerousCount = annotated.filter((a) => a.riskLevel === "DANGEROUS").length;
  const suspiciousCount = annotated.filter((a) => a.riskLevel === "SUSPICIOUS").length;
  onPhase?.(`Flagged ${dangerousCount} DANGEROUS, ${suspiciousCount} SUSPICIOUS`);

  // Optional LLM refinement of riskReason text. We send only the fields the
  // model needs to write a better explanation — never structural fields it
  // could corrupt — and merge the result back. If the call fails or returns
  // malformed JSON we keep the deterministic annotations above.
  try {
    onPhase?.("Asking GPT-4o-mini to write user-friendly risk reasons…");
    const oai = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT!,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-12-01-preview",
    });

    // Slim payload: id + the few fields the LLM needs to write a reason.
    const slim = annotated.map((a) => ({
      id: a.id,
      category: a.category,
      symbol: a.symbol,
      displayName: a.displayName,
      riskLevel: a.riskLevel,
      spenderLabel: a.approvalSpenderLabel,
      isDust: a.isDust ?? false,
    }));

    const response = await withRetry(
      () => oai.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT!,
      max_tokens: 4096,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are the Auditor Agent in a wallet-migration tool. You receive a list of assets that already have a riskLevel pre-computed deterministically. Your only job is to write a short, user-facing riskReason for each one.

RULES (strict — violations cause your output to be discarded):
1. NEVER change riskLevel. Output exactly the riskLevel you were given.
2. Output one entry per input asset, keyed by the input "id".
3. Each riskReason MUST be a single sentence, <= 120 chars, no markdown, no emojis.
4. For DANGEROUS approvals: explain in plain English why this approval is dangerous (e.g. unlimited allowance to an address known for draining wallets).
5. For SUSPICIOUS approvals: note that the spender is unfamiliar and the user should consider revoking.
6. For dust tokens (isDust=true): mention they're sub-$1 and recommend converting to USDC.
7. For other SAFE assets: a brief reassurance like "Looks healthy."

Output strict JSON in this exact schema:
{ "annotations": [ { "id": string, "riskReason": string } ] }`,
        },
        {
          role: "user",
          content: JSON.stringify({ assets: slim }),
        },
      ],
    }),
      { label: "auditor" },
    );

    const refined = parseAndValidate<{
      annotations: { id: string; riskReason: string }[];
    }>(response.choices[0].message.content);

    const reasonById = new Map(
      (refined.annotations ?? []).map((a) => [a.id, a.riskReason])
    );

    const merged = annotated.map((a) => ({
      ...a,
      riskReason: reasonById.get(a.id) ?? a.riskReason,
    }));

    onPhase?.("Risk reasons merged");
    return { ...inventory, assets: merged };
  } catch (err) {
    console.warn("[auditor] LLM refinement failed, falling back to deterministic:", err);
    onPhase?.("LLM call failed — keeping deterministic reasons");
    return { ...inventory, assets: annotated };
  }
}
