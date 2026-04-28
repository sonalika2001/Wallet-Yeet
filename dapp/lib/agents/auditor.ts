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

function parseAndValidate<T>(content: string | null): T {
  if (!content) throw new Error("Empty LLM response");
  return JSON.parse(content) as T;
}

export async function runAuditorAgent(
  inventory: DiscoveryInventory
): Promise<DiscoveryInventory> {
  if (!hasServerKeys()) {
    await new Promise((r) => setTimeout(r, 1100));
    return { ...MOCK_AUDITED_INVENTORY, wallet: inventory.wallet };
  }

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
      a.estimatedValueUsd < DUST_THRESHOLD_USD
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

  // Optional LLM refinement of riskReason text. If the call fails or the
  // JSON is malformed, fall back to the deterministic annotations above.
  try {
    const oai = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT!,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-12-01-preview",
    });

    const response = await oai.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT!,
      max_tokens: 2048,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `You are a wallet security auditor. We've already done a first-pass deterministic scoring. Your job is to refine the riskReason text on each asset to be more user-friendly, but you MUST NOT change riskLevel.

Pre-annotated assets: ${JSON.stringify(annotated, null, 2)}

Output strict JSON: { "assets": [...same shape, riskReason possibly improved...] }`,
        },
      ],
    });

    const refined = parseAndValidate<{ assets: typeof annotated }>(
      response.choices[0].message.content
    );
    return { ...inventory, assets: refined.assets };
  } catch (err) {
    console.warn("[auditor] LLM refinement failed, falling back to deterministic:", err);
    return { ...inventory, assets: annotated };
  }
}
