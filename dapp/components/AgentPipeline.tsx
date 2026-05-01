"use client";

import { cn } from "@/lib/utils";
import type {
  AgentEnsIdentity,
  AgentName,
  AgentOutputSample,
  AgentRunMeta,
  AgentStatus,
} from "@/lib/types";
// <HTML tags and comments written by AI.>

interface AgentMeta {
  name: AgentName;
  emoji: string;
  title: string;
  ensName: string;
  description: string;
  accent: string; // tailwind class for accent
  shadow: string;
}

const META: AgentMeta[] = [
  {
    name: "scout",
    emoji: "🔍",
    title: "Scout",
    ensName: "scout.walletyeet-demo.eth",
    description: "Discovers tokens, NFTs, ENS, and approvals",
    accent: "bg-sky-100 border-ink-900",
    shadow: "shadow-pop-sky",
  },
  {
    name: "auditor",
    emoji: "⚠️",
    title: "Auditor",
    ensName: "auditor.walletyeet-demo.eth",
    description: "Scores risk on every approval and contract",
    accent: "bg-peach-100 border-ink-900",
    shadow: "shadow-pop-peach",
  },
  {
    name: "planner",
    emoji: "📋",
    title: "Planner",
    ensName: "planner.walletyeet-demo.eth",
    description: "Sequences ops, routes assets to your destinations",
    accent: "bg-lilac-100 border-ink-900",
    shadow: "shadow-pop-lilac",
  },
];

export interface AgentPipelineProps {
  statuses: Record<AgentName, AgentStatus>;
  /** Optional message override per agent */
  messages?: Partial<Record<AgentName, string>>;
  /** Real wall-clock timings + model id, populated once the API responds. */
  timings?: Partial<Record<AgentName, AgentRunMeta>>;
  /** Per-agent output samples (summary + highlights) shown on the agents page. */
  outputs?: Partial<Record<AgentName, AgentOutputSample>>;
  /** ENS identity (subname + text records) per agent. */
  identities?: Partial<Record<AgentName, AgentEnsIdentity>>;
}

function StatusLabel({ status }: { status: AgentStatus }) {
  if (status === "idle")
    return <span className="pill pill--info">Queued</span>;
  if (status === "running")
    return <span className="pill pill--lilac">Working…</span>;
  if (status === "complete")
    return <span className="pill pill--safe">Done ✓</span>;
  return <span className="pill pill--dangerous">Error</span>;
}

function fmtDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function AgentPipeline({
  statuses,
  messages,
  timings,
  outputs,
  identities,
}: AgentPipelineProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {META.map((m) => {
        const status = statuses[m.name] ?? "idle";
        const isActive = status === "running";
        const isDone = status === "complete";
        const timing = timings?.[m.name];
        const output = outputs?.[m.name];
        const identity = identities?.[m.name];
        return (
          <div
            key={m.name}
            className={cn(
              "card-pop p-5 relative overflow-hidden transition-transform",
              isActive && "animate-fade-up",
              isDone && "border-mint-400"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    "w-12 h-12 grid place-items-center rounded-2xl border-2 border-ink-900 text-2xl shrink-0",
                    m.accent,
                    m.shadow,
                    isActive && "animate-wiggle"
                  )}
                >
                  {m.emoji}
                </div>
                <div className="min-w-0">
                  <div className="font-display text-xl font-bold tracking-tight truncate flex items-center gap-1.5">
                    {m.title}
                    {identity?.verified && (
                      <span
                        title={`Verified on Sepolia ENS · ${
                          identity.address ?? "no address record"
                        }`}
                        className="text-mint-500 text-xs"
                      >
                        ✓
                      </span>
                    )}
                  </div>
                  <a
                    href={`https://sepolia.app.ens.domains/${m.ensName}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-ink-500 font-mono truncate hover:text-peach-500 transition-colors block"
                    title="View on Sepolia ENS app"
                  >
                    {m.ensName} ↗
                  </a>
                </div>
              </div>
              <StatusLabel status={status} />
            </div>

            <p className="mt-3 text-xs text-ink-500">{m.description}</p>

            {/* progress bar */}
            <div className="mt-3 h-2 rounded-full bg-ink-100 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  status === "complete"
                    ? "w-full bg-mint-400"
                    : status === "running"
                    ? "w-2/3 shimmer bg-peach-300"
                    : status === "error"
                    ? "w-full bg-red-300"
                    : "w-0 bg-ink-100"
                )}
              />
            </div>

            {/* live message */}
            <div className="mt-3 min-h-[1.25rem] text-xs text-ink-700 font-medium">
              {messages?.[m.name] ??
                (status === "running"
                  ? `Calling GPT-4o-mini…`
                  : status === "complete"
                  ? `Done`
                  : status === "error"
                  ? `Something went sideways`
                  : `Waiting`)}
            </div>

            {/* Real provenance — appears when the API has reported back */}
            {timing && (
              <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="rounded-lg border-2 border-ink-100 bg-cream/50 px-2 py-1">
                  <div className="text-ink-500">Time</div>
                  <div className="font-pixel text-[10px]">
                    {fmtDuration(timing.durationMs)}
                  </div>
                </div>
                <div className="rounded-lg border-2 border-ink-100 bg-cream/50 px-2 py-1">
                  <div className="text-ink-500">Model</div>
                  <div className="font-pixel text-[10px] truncate">
                    {timing.model}
                    {!timing.llmOk && (
                      <span className="ml-1 text-red-500">·fallback</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ENS text records — proof the agent has an on-chain identity.
                Ordered by a fixed priority so the cards look consistent
                across reloads (Promise.all-resolved order is racy). */}
            {identity && Object.keys(identity.records).length > 0 && (() => {
              const RECORD_ORDER = ["description", "ai.role", "ai.model", "url", "com.github"];
              const sortedEntries = Object.entries(identity.records).sort(
                ([a], [b]) => {
                  const ai = RECORD_ORDER.indexOf(a);
                  const bi = RECORD_ORDER.indexOf(b);
                  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                },
              );
              return (
                <div className="mt-3 rounded-xl border-2 border-sky-200 bg-sky-50/60 p-2.5">
                  <div className="text-[10px] font-pixel tracking-wider text-sky-600 mb-1.5">
                    ENS RECORDS
                  </div>
                  <ul className="space-y-1.5 text-[11px]">
                    {sortedEntries.slice(0, 5).map(([k, v]) => (
                      <li key={k} className="grid grid-cols-[max-content_1fr] gap-2">
                        <span className="font-mono text-ink-500 whitespace-nowrap">{k}</span>
                        <span className="break-words leading-snug">{v}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            {/* Per-agent output sample (summary + highlights) */}
            {output && (
              <div className="mt-3 rounded-xl border-2 border-ink-100 bg-white/60 p-2.5">
                <div className="text-[11px] font-semibold text-ink-700">
                  {output.summary}
                </div>
                {output.highlights.length > 0 && (
                  <ul className="mt-1.5 flex flex-wrap gap-1">
                    {output.highlights.slice(0, 5).map((h) => (
                      <li
                        key={h}
                        className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-700"
                      >
                        {h}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {isActive && (
              <span
                aria-hidden
                className="absolute -right-3 -top-3 w-12 h-12 rounded-full border-2 border-lilac-300 animate-pulse-ring"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
