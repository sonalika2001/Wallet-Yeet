"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Mascot } from "@/components/Mascot";
import { PixelButton } from "@/components/PixelButton";
import { StepIndicator } from "@/components/StepIndicator";
import { AgentPipeline } from "@/components/AgentPipeline";
import { DestinationManager } from "@/components/DestinationManager";
import { AssetTable } from "@/components/AssetTable";
import { PlanReview } from "@/components/PlanReview";
import { ExecuteFlow } from "@/components/ExecuteFlow";
import { Toggle } from "@/components/Toggle";
import { ENABLED_FEATURES } from "@/lib/config";
import type {
  AgentEnsIdentity,
  AgentName,
  AgentRunMeta,
  AgentOutputSample,
  AgentStatus,
  MigrationPlan,
  OrchestrateEvent,
  OrchestrateResponse,
  SavedDestination,
  UserPreferences,
} from "@/lib/types";
import { isAddress } from "@/lib/utils";

// <STEPS written by AI.>
const STEPS = [
  { id: "connect", label: "Connect", icon: "🔌" },
  { id: "destinations", label: "Destinations", icon: "📦" },
  { id: "discover", label: "Agents", icon: "🤖" },
  { id: "review", label: "Review", icon: "📋" },
  { id: "execute", label: "Execute", icon: "🚀" },
];

export default function MigratePage() {
  const { address, isConnected } = useAccount();
  const [stepIdx, setStepIdx] = useState(0);

  // user prefs
  const [defaultDest, setDefaultDest] = useState<`0x${string}` | "">("");
  const [destinations, setDestinations] = useState<SavedDestination[]>([]);
  const [convertDust, setConvertDust] = useState(true);
  const [convertUnknownTokens, setConvertUnknownTokens] = useState(false);

  // pipeline state
  const [agentStatus, setAgentStatus] = useState<Record<AgentName, AgentStatus>>({
    scout: "idle",
    auditor: "idle",
    planner: "idle",
  });
  const [agentMsg, setAgentMsg] = useState<Partial<Record<AgentName, string>>>({});
  const [agentTimings, setAgentTimings] = useState<Partial<Record<AgentName, AgentRunMeta>>>({});
  const [agentOutputs, setAgentOutputs] = useState<Partial<Record<AgentName, AgentOutputSample>>>({});
  const [agentIdentities, setAgentIdentities] = useState<Partial<Record<AgentName, AgentEnsIdentity>>>({});
  const [orchestrateError, setOrchestrateError] = useState<string | null>(null);
  const [orchestrateResp, setOrchestrateResp] = useState<OrchestrateResponse | null>(
    null
  );

  // per-asset overrides for the review screen
  const [routes, setRoutes] = useState<Record<string, `0x${string}`>>({});
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  // First-time auto-advance: once a wallet connects on the connect step,
  // nudge them forward — but only fire once so "Back" doesn't trap them.
  const [autoAdvanced, setAutoAdvanced] = useState(false);
  useEffect(() => {
    if (isConnected && stepIdx === 0 && !autoAdvanced) {
      setStepIdx(1);
      setAutoAdvanced(true);
    }
  }, [isConnected, stepIdx, autoAdvanced]);

  // Step gating
  const destValid = isAddress(defaultDest);
  const canAdvanceFromStep = (i: number) => {
    if (i === 0) return isConnected;
    if (i === 1) return destValid;
    if (i === 2) return !!orchestrateResp && agentStatus.planner === "complete";
    if (i === 3) return !!orchestrateResp;
    return true;
  };

  const goNext = () => {
    if (canAdvanceFromStep(stepIdx)) setStepIdx((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const goBack = () => setStepIdx((s) => Math.max(0, s - 1));

  // Allow clicking the StepIndicator to jump back. Forward jumps are gated by
  // canAdvanceFromStep so users can't skip discovery.
  const jumpToStep = (target: number) => {
    if (target <= stepIdx) {
      setStepIdx(target);
      return;
    }
    // Forward jump: allow only if every intermediate gate is satisfied.
    for (let i = stepIdx; i < target; i++) {
      if (!canAdvanceFromStep(i)) return;
    }
    setStepIdx(target);
  };

  // Run the streaming orchestrate API. Each SSE event updates the live agent
  // statuses + a tail of phase messages, so the agents page reflects what's
  // actually happening server-side instead of an optimistic animation.
  const runDiscovery = async () => {
    if (!address || !defaultDest) return;
    setOrchestrateError(null);
    setOrchestrateResp(null);
    setAgentStatus({ scout: "idle", auditor: "idle", planner: "idle" });
    setAgentMsg({});
    setAgentTimings({});
    setAgentOutputs({});
    setAgentIdentities({});

    const prefs: UserPreferences = {
      defaultDestination: defaultDest as `0x${string}`,
      customRoutes: {},
      strategy: "balanced",
      convertDust: convertDust && ENABLED_FEATURES.uniswapDust,
      convertUnknownTokens: convertUnknownTokens && ENABLED_FEATURES.uniswapDust,
    };

    let finalPayload: OrchestrateResponse | null = null;

    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldWallet: address, preferences: prefs }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      // Read SSE chunks. Each event is `data: ${json}\n\n`. We accumulate
      // until we see a blank-line delimiter, then parse + dispatch.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const messages = buf.split("\n\n");
        buf = messages.pop() ?? "";
        for (const raw of messages) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          let event: OrchestrateEvent;
          try {
            event = JSON.parse(json) as OrchestrateEvent;
          } catch (err) {
            console.warn("[orchestrate] bad SSE chunk:", err, json);
            continue;
          }
          handleEvent(event, (p) => (finalPayload = p));
        }
      }

      if (finalPayload) {
        const data: OrchestrateResponse = finalPayload;
        setOrchestrateResp(data);
        // Initialise per-row state from the freshly built plan.
        const initialRoutes: Record<string, `0x${string}`> = {};
        for (const op of data.plan.operations) {
          initialRoutes[op.assetId] = op.destination;
        }
        setRoutes(initialRoutes);
        setExcluded(new Set());
      } else {
        throw new Error("Stream ended without a 'complete' event");
      }
    } catch (err: unknown) {
      console.error(err);
      setAgentStatus((s) => {
        const errored: AgentName =
          s.planner === "running"
            ? "planner"
            : s.auditor === "running"
            ? "auditor"
            : "scout";
        return { ...s, [errored]: "error" };
      });
      setOrchestrateError(err instanceof Error ? err.message : "Pipeline failed");
    }
  };

  // Dispatch one SSE event: update agent status + the live tail message,
  // and capture the final payload when it arrives.
  const handleEvent = (
    event: OrchestrateEvent,
    onComplete: (payload: OrchestrateResponse) => void,
  ) => {
    switch (event.type) {
      case "agent:start":
        setAgentStatus((s) => ({ ...s, [event.agent]: "running" }));
        setAgentMsg((m) => ({ ...m, [event.agent]: "Starting…" }));
        if (event.identity) {
          setAgentIdentities((id) => ({ ...id, [event.agent]: event.identity }));
        }
        break;
      case "agent:phase":
        setAgentMsg((m) => ({ ...m, [event.agent]: event.message }));
        break;
      case "agent:done":
        setAgentStatus((s) => ({ ...s, [event.agent]: "complete" }));
        setAgentMsg((m) => ({ ...m, [event.agent]: "Done" }));
        setAgentTimings((t) => ({ ...t, [event.agent]: event.timing }));
        setAgentOutputs((o) => ({ ...o, [event.agent]: event.output }));
        break;
      case "agent:error":
        setAgentStatus((s) => ({ ...s, [event.agent]: "error" }));
        setAgentMsg((m) => ({ ...m, [event.agent]: event.message }));
        break;
      case "complete":
        onComplete(event.payload);
        break;
      case "error":
        setOrchestrateError(event.message);
        break;
    }
  };

  // Memoize the live plan as the user toggles per-row destinations / inclusion.
  const livePlan: MigrationPlan | null = useMemo(() => {
    if (!orchestrateResp) return null;
    const ops = orchestrateResp.plan.operations
      .filter((op) => !excluded.has(op.assetId))
      .map((op) => ({
        ...op,
        destination: routes[op.assetId] ?? op.destination,
      }));
    const dustSwapsCount = ops.filter((o) => o.opType === "SWAP_AND_TRANSFER")
      .length;
    return { ...orchestrateResp.plan, operations: ops, dustSwapsCount };
  }, [orchestrateResp, routes, excluded]);

  // <HTML added by AI.>
  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-20">
        <div className="mb-6">
          <StepIndicator
            steps={STEPS}
            current={stepIdx}
            onSelect={jumpToStep}
            canSelect={(i) => i <= stepIdx || canAdvanceFromStep(stepIdx)}
          />
        </div>

        {orchestrateResp?.isMock && (
          <div className="mb-6 card-soft p-3 text-xs flex items-center gap-2">
            <span className="pill pill--lilac">Mock mode</span>
            <span className="text-ink-500">
              Server has no API keys yet — running on canned demo data so you
              can preview the UI. Add keys to <code>.env.local</code> to switch
              to live agents.
            </span>
          </div>
        )}

        {/* ============== STEP 0: CONNECT ============== */}
        {stepIdx === 0 && (
          <section className="card-pop p-8 grid md:grid-cols-[1fr,auto] gap-8 items-center">
            <div>
              <span className="font-pixel text-[10px] tracking-widest text-ink-500">
                STEP 1 / {STEPS.length}
              </span>
              <h1 className="font-display text-4xl font-bold mt-1">
                Connect the wallet you want to retire.
              </h1>
              <p className="mt-2 text-ink-700">
                We&apos;ll only read it. Nothing moves until you sign the
                migration transaction at the end.
              </p>
              <div className="mt-5 flex items-center gap-3">
                <ConnectButton />
                {!isConnected && (
                  <span className="text-xs text-ink-500">
                    ← Connect to continue
                  </span>
                )}
                {isConnected && (
                  <PixelButton variant="primary" onClick={goNext}>
                    Continue →
                  </PixelButton>
                )}
              </div>
            </div>
            <Mascot size={140} />
          </section>
        )}

        {/* ============== STEP 1: DESTINATIONS + DUST TOGGLE ============== */}
        {stepIdx === 1 && (
          <section className="card-pop p-6 sm:p-8">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="font-pixel text-[10px] tracking-widest text-ink-500">
                  STEP 2 / {STEPS.length}
                </span>
                <h2 className="font-display text-3xl font-bold mt-1">
                  Where should things go?
                </h2>
                <p className="text-ink-700 mt-1 text-sm max-w-xl">
                  Set a default destination, then optionally save a few extra
                  wallets you&apos;ll route specific assets to in Review.
                </p>
              </div>
              <Mascot size={80} />
            </div>

            <DestinationManager
              defaultDestination={defaultDest}
              onChangeDefault={setDefaultDest}
              destinations={destinations}
              onAddDestination={(d) =>
                setDestinations((prev) => [...prev, d])
              }
              onRemoveDestination={(addr) =>
                setDestinations((prev) =>
                  prev.filter((d) => d.address !== addr)
                )
              }
            />

            <div className="mt-6 grid md:grid-cols-2 gap-3">
              <Toggle
                checked={convertDust}
                onChange={setConvertDust}
                disabled={!ENABLED_FEATURES.uniswapDust}
                label="Auto-convert dust to USDC via Uniswap"
                description={
                  ENABLED_FEATURES.uniswapDust
                    ? "Tokens with a known price under $1 get swapped to USDC during migration."
                    : "Disabled — Uniswap adapter is off in this build."
                }
                accent="peach"
              />
              <Toggle
                checked={convertUnknownTokens}
                onChange={setConvertUnknownTokens}
                disabled={!ENABLED_FEATURES.uniswapDust}
                label="Auto-swap unknown tokens to USDC"
                description={
                  ENABLED_FEATURES.uniswapDust
                    ? "Tokens with no price oracle get swapped if a Uniswap pool exists. Off by default — leaves unknown holdings intact."
                    : "Disabled — Uniswap adapter is off in this build."
                }
                accent="lilac"
              />
            </div>

            <div className="mt-6 flex justify-between">
              <PixelButton variant="ghost" onClick={goBack}>
                ← Back
              </PixelButton>
              <PixelButton
                variant="primary"
                onClick={async () => {
                  setStepIdx(2);
                  void runDiscovery();
                }}
                disabled={!destValid}
              >
                Run discovery →
              </PixelButton>
            </div>
          </section>
        )}

        {/* ============== STEP 2: AGENTS ============== */}
        {stepIdx === 2 && (
          <section className="space-y-5">
            <div className="card-pop p-6">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-pixel text-[10px] tracking-widest text-ink-500">
                    STEP 3 / {STEPS.length}
                  </span>
                  <h2 className="font-display text-3xl font-bold mt-1">
                    Agents working…
                  </h2>
                  <p className="text-ink-700 text-sm">
                    Scout → Auditor → Planner. Each call streams its output
                    in real time.
                  </p>
                </div>
                <Mascot
                  size={84}
                  yeeting={false}
                  className={
                    Object.values(agentStatus).every((s) => s === "complete")
                      ? "animate-bounceY"
                      : "animate-wiggle"
                  }
                />
              </div>
            </div>

            <AgentPipeline
              statuses={agentStatus}
              messages={agentMsg}
              timings={agentTimings}
              outputs={agentOutputs}
              identities={agentIdentities}
            />

            {/* Why ENS for agents? — explainer surfaced once at least one
                identity has resolved, so judges can see the angle in
                context. Links straight to the parent on app.ens.domains
                so they can verify on-chain. */}
            {Object.keys(agentIdentities).length > 0 && (
              <div className="card-soft p-4 bg-sky-50/40">
                <div className="text-sm font-semibold mb-1">
                  🟦 Why ENS for the agents?
                </div>
                <p className="text-xs text-ink-700 leading-relaxed">
                  Each agent has its own ENS subname under{" "}
                  <a
                    href="https://sepolia.app.ens.domains/walletyeet-demo.eth"
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-peach-500 hover:underline"
                  >
                    walletyeet-demo.eth
                  </a>{" "}
                  with text records (description, model, role) that this dapp
                  resolves on-chain at every run. The green ✓ badges above
                  prove each agent has a verifiable identity, separate from
                  any user wallet. In production this lets users (or other
                  agents) discover, verify, and rate-limit by agent identity
                  — like an on-chain version of OAuth.
                </p>
              </div>
            )}

            {orchestrateError && (
              <div className="card-pop p-4 bg-red-50">
                <div className="font-semibold text-red-600">
                  Pipeline error: {orchestrateError}
                </div>
                <p className="text-sm text-ink-700 mt-1">
                  Check that your Azure OpenAI + Alchemy keys are set in
                  <code> .env.local</code>, or leave them blank to run in
                  mock mode.
                </p>
                <PixelButton
                  className="mt-3"
                  variant="default"
                  onClick={runDiscovery}
                >
                  Retry
                </PixelButton>
              </div>
            )}

            <div className="flex justify-between">
              <PixelButton variant="ghost" onClick={goBack}>
                ← Back
              </PixelButton>
              <PixelButton
                variant="primary"
                disabled={!orchestrateResp}
                onClick={goNext}
              >
                Review plan →
              </PixelButton>
            </div>
          </section>
        )}

        {/* ============== STEP 3: REVIEW ============== */}
        {stepIdx === 3 && orchestrateResp && livePlan && (
          <section className="space-y-5">
            <div className="card-pop p-6">
              <span className="font-pixel text-[10px] tracking-widest text-ink-500">
                STEP 4 / {STEPS.length}
              </span>
              <h2 className="font-display text-3xl font-bold mt-1">
                Customize the migration.
              </h2>
              <p className="text-ink-700 text-sm">
                Toggle any asset off, override its destination, then check the
                plan summary below.
              </p>
            </div>

            <AssetTable
              assets={orchestrateResp.auditedInventory.assets}
              defaultDestination={defaultDest}
              destinations={destinations}
              routes={routes}
              excluded={excluded}
              convertDust={convertDust}
              convertUnknownTokens={convertUnknownTokens}
              onToggleAsset={(id, included) =>
                setExcluded((prev) => {
                  const next = new Set(prev);
                  if (included) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onChangeRoute={(id, dest) =>
                setRoutes((prev) => ({ ...prev, [id]: dest }))
              }
            />

            <PlanReview
              plan={livePlan}
              destinations={destinations}
              defaultDestination={defaultDest}
            />

            <div className="flex justify-between">
              <PixelButton variant="ghost" onClick={goBack}>
                ← Back
              </PixelButton>
              <PixelButton variant="primary" onClick={goNext}>
                Looks good →
              </PixelButton>
            </div>
          </section>
        )}

        {/* ============== STEP 4: EXECUTE ============== */}
        {stepIdx === 4 && livePlan && (
          <section className="space-y-5">
            <div className="card-pop p-6">
              <span className="font-pixel text-[10px] tracking-widest text-ink-500">
                STEP 5 / {STEPS.length}
              </span>
              <h2 className="font-display text-3xl font-bold mt-1">
                The yeet.
              </h2>
              <p className="text-ink-700 text-sm">
                Sign the approvals MetaMask asks for, then the bundled
                migration tx. Each operation runs in try/catch — partial
                failures don&apos;t abort the rest.
              </p>
            </div>

            <ExecuteFlow
              plan={livePlan}
              destinations={destinations}
              defaultDestination={defaultDest}
            />

            <div className="flex justify-between">
              <PixelButton variant="ghost" onClick={goBack}>
                ← Back
              </PixelButton>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
