// POST /api/orchestrate — Server-Sent Events stream
//
// We stream events so the agents page can show live progress as Scout →
// Auditor → Planner work, instead of staring at a fake animated timeline.
// Each event is `data: ${JSON.stringify(event)}\n\n`. The final "complete"
// event carries the full payload (same shape as the legacy JSON response)
// so frontend state still gets a single source of truth at the end.

import { NextRequest } from "next/server";
import { runScoutAgent } from "@/lib/agents/scout";
import { runAuditorAgent } from "@/lib/agents/auditor";
import { runPlannerAgent } from "@/lib/agents/planner";
import { fetchAgentIdentities } from "@/lib/agents/identity";
import { hasServerKeys, STRATEGY_PRESETS } from "@/lib/config";
import type {
  AgentEnsIdentity,
  AgentName,
  AgentOutputSample,
  AgentRunMeta,
  DiscoveryInventory,
  MigrationPlan,
  OrchestrateEvent,
  OrchestrateResponse,
  UserPreferences,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface OrchestrateRequest {
  oldWallet: string;
  preferences: UserPreferences;
}

const MODEL_LABEL = "gpt-4o-mini@azure";

// Human-readable labels per asset category. Avoids degenerate plurals like
// "2 enss" or "2 dust-tokens" that the naive `${k}s` template produces.
const CATEGORY_LABEL: Record<string, { singular: string; plural: string }> = {
  token: { singular: "token", plural: "tokens" },
  "dust-token": { singular: "dust token", plural: "dust tokens" },
  nft: { singular: "NFT", plural: "NFTs" },
  ens: { singular: "ENS name", plural: "ENS names" },
  native: { singular: "native asset", plural: "native assets" },
};

function labelForCategory(cat: string, count: number): string {
  const entry = CATEGORY_LABEL[cat];
  if (entry) return count === 1 ? entry.singular : entry.plural;
  // Unknown category: fall back to the raw key but keep a sane plural rule.
  return count === 1 ? cat : `${cat}s`;
}

function summariseScout(inv: DiscoveryInventory): AgentOutputSample {
  const counts: Record<string, number> = {};
  for (const a of inv.assets) counts[a.category] = (counts[a.category] ?? 0) + 1;
  const total = inv.assets.length;
  const parts = Object.entries(counts).map(
    ([k, v]) => `${v} ${labelForCategory(k, v)}`,
  );
  return {
    summary: `Discovered ${total} on-chain asset${total === 1 ? "" : "s"} for the wallet.`,
    highlights: [
      ...parts,
      ...(inv.unmigratable.length
        ? [`${inv.unmigratable.length} flagged unmigratable`]
        : []),
    ],
  };
}

function summariseAuditor(inv: DiscoveryInventory): AgentOutputSample {
  const dust = inv.assets.filter((a) => a.isDust).length;
  return {
    summary: `Scored risks across ${inv.assets.length} asset${inv.assets.length === 1 ? "" : "s"}.`,
    highlights: [
      `${dust} dust token${dust === 1 ? "" : "s"} eligible for swap`,
      "All other assets: SAFE",
    ],
  };
}

function summarisePlanner(plan: MigrationPlan): AgentOutputSample {
  const opCounts: Record<string, number> = {};
  for (const op of plan.operations) opCounts[op.opType] = (opCounts[op.opType] ?? 0) + 1;
  const total = plan.operations.length;
  const dest = new Set(plan.operations.map((o) => o.destination)).size;
  return {
    summary: `Sequenced ${total} op${total === 1 ? "" : "s"} across ${dest} destination${dest === 1 ? "" : "s"}.`,
    highlights: Object.entries(opCounts).map(([k, v]) => `${v}× ${k}`),
  };
}

export async function POST(req: NextRequest) {
  let body: OrchestrateRequest;
  try {
    body = (await req.json()) as OrchestrateRequest;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { oldWallet, preferences } = body ?? {};
  if (!oldWallet || !/^0x[a-fA-F0-9]{40}$/.test(oldWallet)) {
    return new Response("Missing or invalid oldWallet address", { status: 400 });
  }
  if (!preferences?.defaultDestination) {
    return new Response("Missing preferences.defaultDestination", { status: 400 });
  }
  if (!(STRATEGY_PRESETS as readonly string[]).includes(preferences.strategy)) {
    return new Response("Invalid preferences.strategy", { status: 400 });
  }

  const isMock = !hasServerKeys();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: OrchestrateEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const timings: Partial<Record<AgentName, AgentRunMeta>> = {};
      const outputs: Partial<Record<AgentName, AgentOutputSample>> = {};

      // Resolve agent ENS identities in parallel with the pipeline. We
      // emit them as part of agent:start once the lookup lands.
      const identitiesPromise: Promise<
        Partial<Record<AgentName, AgentEnsIdentity>>
      > = fetchAgentIdentities().catch((err) => {
        console.warn("[orchestrate] agent identity lookup failed:", err);
        return {};
      });

      const phaseEmitter = (agent: AgentName) => (message: string) => {
        send({ type: "agent:phase", agent, message });
      };

      try {
        const identities = await identitiesPromise;

        // ── SCOUT ─────────────────────────────────────────────────────
        send({ type: "agent:start", agent: "scout", identity: identities.scout });
        const tScout = Date.now();
        const inventory = await runScoutAgent(oldWallet, phaseEmitter("scout"));
        const scoutTiming: AgentRunMeta = {
          durationMs: Date.now() - tScout,
          model: isMock ? "mock" : MODEL_LABEL,
          llmOk: !isMock,
        };
        const scoutOutput = summariseScout(inventory);
        timings.scout = scoutTiming;
        outputs.scout = scoutOutput;
        send({ type: "agent:done", agent: "scout", timing: scoutTiming, output: scoutOutput });

        // ── AUDITOR ───────────────────────────────────────────────────
        send({ type: "agent:start", agent: "auditor", identity: identities.auditor });
        const tAuditor = Date.now();
        const auditedInventory = await runAuditorAgent(inventory, phaseEmitter("auditor"));
        const auditorTiming: AgentRunMeta = {
          durationMs: Date.now() - tAuditor,
          model: isMock ? "mock" : MODEL_LABEL,
          llmOk: !isMock,
        };
        const auditorOutput = summariseAuditor(auditedInventory);
        timings.auditor = auditorTiming;
        outputs.auditor = auditorOutput;
        send({ type: "agent:done", agent: "auditor", timing: auditorTiming, output: auditorOutput });

        // ── PLANNER ───────────────────────────────────────────────────
        send({ type: "agent:start", agent: "planner", identity: identities.planner });
        const tPlanner = Date.now();
        const plan = await runPlannerAgent(auditedInventory, preferences, phaseEmitter("planner"));
        const plannerTiming: AgentRunMeta = {
          durationMs: Date.now() - tPlanner,
          model: isMock ? "mock" : MODEL_LABEL,
          llmOk: !isMock,
        };
        const plannerOutput = summarisePlanner(plan);
        timings.planner = plannerTiming;
        outputs.planner = plannerOutput;
        send({ type: "agent:done", agent: "planner", timing: plannerTiming, output: plannerOutput });

        const payload: OrchestrateResponse = {
          inventory,
          auditedInventory,
          plan,
          isMock,
          agentTimings: timings,
          agentOutputs: outputs,
          agentIdentities: identities,
        };
        send({ type: "complete", payload });
        controller.close();
      } catch (err) {
        console.error("[orchestrate] failed:", err);
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Pipeline failed",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
