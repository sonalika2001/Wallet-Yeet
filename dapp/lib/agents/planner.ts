// 📋 Planner Agent — Strategy Specialist
//
// Responsibility: Takes the audited inventory + user preferences and outputs
// a structured MigrationPlan that the contract can consume. Enforces
// revoke-before-transfer, applies per-asset destinations, and (if convertDust
// is on) replaces dust transfers with SWAP_AND_TRANSFER ops.
//
// LLM backend: GPT-4o-mini via Microsoft Foundry (Azure OpenAI).

import type {
  DiscoveryInventory,
  MigrationPlan,
  OpType,
  PlannedOperation,
  UserPreferences,
} from "../types";
import { hasServerKeys } from "../config";
import { buildMockPlan } from "../mockData";
import { AzureOpenAI } from "openai";

// ── helpers ──────────────────────────────────────────────────────────────

function parseAndValidate<T>(content: string | null): T {
  if (!content) throw new Error("Empty LLM response");
  return JSON.parse(content) as T;
}

// Canonical execution order — revocations first, ENS last.
// Matches MigrationVault's pre-condition that approvals get killed before
// transfers attempt to use them.
const OP_ORDER: Record<OpType, number> = {
  REVOKE_ERC20: 0,
  TRANSFER_ERC20: 1,
  SWAP_AND_TRANSFER: 2,
  TRANSFER_ERC721: 3,
  TRANSFER_ERC1155: 4,
  ENS_TRANSFER: 5,
};

function sortOps(ops: PlannedOperation[]): PlannedOperation[] {
  return [...ops].sort((a, b) => OP_ORDER[a.opType] - OP_ORDER[b.opType]);
}

function buildPlannerPrompt(
  inventory: DiscoveryInventory,
  prefs: UserPreferences
): string {
  return `You are a wallet migration planner. Build a SAFE, GAS-OPTIMIZED migration plan.

INVENTORY (with risk scores from Auditor): ${JSON.stringify(inventory, null, 2)}

USER PREFERENCES:
- Default destination: ${prefs.defaultDestination}
- Custom routes (assetId -> address): ${JSON.stringify(prefs.customRoutes)}
- Strategy: ${prefs.strategy} (Conservative / Balanced / Aggressive)
- Convert dust to USDC via Uniswap: ${prefs.convertDust ? "YES" : "NO"}

CRITICAL RULES:
1. ALWAYS revoke risky approvals BEFORE transferring tokens.
2. Op order: REVOKE_ERC20 → TRANSFER_ERC20 → SWAP_AND_TRANSFER → TRANSFER_ERC721 → TRANSFER_ERC1155 → ENS_TRANSFER.
3. If convertDust is YES, replace TRANSFER_ERC20 ops on dust tokens with SWAP_AND_TRANSFER ops to USDC.
4. Honor customRoutes per-assetId; otherwise route to defaultDestination.
5. Skip assets with migrate_recommended === false. Note these in warnings.

OUTPUT FORMAT (strict JSON, no prose):
{
  "operations": [
    {
      "assetId": "string from inventory",
      "opType": "REVOKE_ERC20" | "TRANSFER_ERC20" | "TRANSFER_ERC721" | "TRANSFER_ERC1155" | "ENS_TRANSFER" | "SWAP_AND_TRANSFER",
      "target": "0x... contract address",
      "counterparty": "0x... or null (for REVOKE: spender, for SWAP: tokenOut)",
      "tokenId": "string or null",
      "amount": "string (raw base units) or null",
      "destination": "0x... recipient",
      "explanation": "human-readable one-liner"
    }
  ],
  "warnings": ["one-line strings about unmigratable items"],
  "summary": "1-2 sentences"
}`;
}

// ── agent entry point ────────────────────────────────────────────────────

export async function runPlannerAgent(
  inventory: DiscoveryInventory,
  prefs: UserPreferences
): Promise<MigrationPlan> {
  if (!hasServerKeys()) {
    await new Promise((r) => setTimeout(r, 1300));
    return buildMockPlan(prefs);
  }

  const oai = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT!,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-12-01-preview",
  });

  const response = await oai.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT!,
    max_tokens: 4096,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: buildPlannerPrompt(inventory, prefs),
      },
    ],
  });

  const parsed = parseAndValidate<MigrationPlan>(
    response.choices[0].message.content
  );

  // Defensive: re-sort regardless of what the LLM returned. Never trust the
  // LLM with execution ordering — revocations must come before transfers.
  const ordered = sortOps(parsed.operations);
  return { ...parsed, operations: ordered };
}
