// POST /api/orchestrate
//
// Runs Scout → Auditor → Planner sequentially and returns the full
// inventory + audit + plan. The frontend renders the three-agent
// progress bar separately and animates while this endpoint runs.
//
// When ANTHROPIC_API_KEY + ALCHEMY_API_KEY aren't set, each agent
// falls back to mock data so the UI remains usable end-to-end.

import { NextRequest, NextResponse } from "next/server";
import { runScoutAgent } from "@/lib/agents/scout";
import { runAuditorAgent } from "@/lib/agents/auditor";
import { runPlannerAgent } from "@/lib/agents/planner";
import { hasServerKeys, STRATEGY_PRESETS } from "@/lib/config";
import type { OrchestrateResponse, UserPreferences } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

interface OrchestrateRequest {
  oldWallet: string;
  preferences: UserPreferences;
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(req: NextRequest) {
  let body: OrchestrateRequest;
  try {
    body = (await req.json()) as OrchestrateRequest;
  } catch {
    return bad("Invalid JSON body");
  }

  const { oldWallet, preferences } = body ?? {};
  if (!oldWallet || !/^0x[a-fA-F0-9]{40}$/.test(oldWallet)) {
    return bad("Missing or invalid oldWallet address");
  }
  if (!preferences?.defaultDestination) {
    return bad("Missing preferences.defaultDestination");
  }
  if (!(STRATEGY_PRESETS as readonly string[]).includes(preferences.strategy)) {
    return bad("Invalid preferences.strategy");
  }

  try {
    const inventory = await runScoutAgent(oldWallet);
    const auditedInventory = await runAuditorAgent(inventory);
    const plan = await runPlannerAgent(auditedInventory, preferences);

    const payload: OrchestrateResponse = {
      inventory,
      auditedInventory,
      plan,
      isMock: !hasServerKeys(),
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[orchestrate] failed:", err);
    return bad("Agent pipeline failed", 500);
  }
}
