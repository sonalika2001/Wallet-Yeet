"use client";

import { cn, shortAddr } from "@/lib/utils";
import type { MigrationPlan, SavedDestination } from "@/lib/types";

//<Metadata added by AI.>
const OP_META: Record<
  string,
  { emoji: string; tint: string; sponsor?: string }
> = {
  TRANSFER_NATIVE: { emoji: "Ξ", tint: "bg-sky-50" },
  TRANSFER_ERC20: { emoji: "🪙", tint: "bg-mint-50" },
  TRANSFER_ERC721: { emoji: "🎨", tint: "bg-lilac-50" },
  TRANSFER_ERC1155: { emoji: "🧩", tint: "bg-lilac-50" },
  ENS_TRANSFER: { emoji: "🟦", tint: "bg-sky-50", sponsor: "ENS" },
  SWAP_AND_TRANSFER: {
    emoji: "🔁",
    tint: "bg-peach-50",
    sponsor: "Uniswap",
  },
};

export function PlanReview({
  plan,
  destinations,
  defaultDestination,
}: {
  plan: MigrationPlan;
  destinations: SavedDestination[];
  defaultDestination: `0x${string}` | "";
}) {
  const labelFor = (addr: string) => {
    if (addr === defaultDestination) return "Default";
    const d = destinations.find((d) => d.address === addr);
    return d ? `${d.emoji ?? ""} ${d.label}` : shortAddr(addr);
  };

  // Compute counts deterministically from the LIVE plan so the summary
  // reflects current toggle/route selections, not the snapshot the LLM
  // wrote at orchestrate time.
  const totalOps = plan.operations.length;
  const swaps = plan.operations.filter((o) => o.opType === "SWAP_AND_TRANSFER").length;
  const transfers = plan.operations.filter(
    (o) =>
      o.opType === "TRANSFER_ERC20" ||
      o.opType === "TRANSFER_ERC721" ||
      o.opType === "TRANSFER_ERC1155" ||
      o.opType === "ENS_TRANSFER" ||
      o.opType === "TRANSFER_NATIVE",
  ).length;

  // Group ops by destination for the multi-destination panel.
  const grouped = plan.operations.reduce<Record<string, number>>((m, o) => {
    m[o.destination] = (m[o.destination] ?? 0) + 1;
    return m;
  }, {});
  const outbound = Object.values(grouped).reduce((a, b) => a + b, 0);

  // Plain-language summary derived from the live counts.
  const summaryParts: string[] = [];
  if (swaps) summaryParts.push(`${swaps} dust→USDC swap${swaps === 1 ? "" : "s"}`);
  if (transfers - swaps > 0) {
    const t = transfers - swaps;
    summaryParts.push(`${t} transfer${t === 1 ? "" : "s"}`);
  }
  const liveSummary =
    totalOps === 0
      ? "No operations selected. Toggle some assets back on above."
      : `${totalOps} operation${totalOps === 1 ? "" : "s"} (${summaryParts.join(", ")}) across ${Object.keys(grouped).length || 1} destination${Object.keys(grouped).length === 1 ? "" : "s"}.`;

  return (
    <div className="space-y-5">
      {/* summary banner */}
      <div className="card-pop p-5 bg-gradient-to-br from-peach-50 to-lilac-50">
        <div className="flex items-start gap-4">
          <div className="text-3xl">📋</div>
          <div className="flex-1">
            <div className="font-display text-2xl font-bold tracking-tight">
              Plan ready to yeet
            </div>
            <p className="mt-1 text-sm text-ink-700">{liveSummary}</p>
            {plan.summary && (
              <p className="mt-1 text-xs text-ink-500 italic">
                Planner agent: {plan.summary}
              </p>
            )}
          </div>
        </div>

        {plan.warnings.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {plan.warnings.map((w, i) => (
              <li
                key={i}
                className="text-xs flex items-start gap-2 text-ink-700"
              >
                <span className="font-pixel text-peach-500">!</span>
                {w}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* destination split */}
      <div className="card-soft p-4">
        <div className="text-sm font-semibold mb-1">
          Destinations split{" "}
          <span className="text-ink-500 font-normal">
            ({Object.keys(grouped).length} wallet
            {Object.keys(grouped).length === 1 ? "" : "s"} ·{" "}
            {outbound} outbound op{outbound === 1 ? "" : "s"})
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(grouped).map(([addr, count]) => (
            <div
              key={addr}
              className="flex items-center justify-between bg-white border-2 border-ink-100 rounded-xl px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg">📦</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {labelFor(addr)}
                  </div>
                  <div className="text-xs text-ink-500 font-mono">
                    {shortAddr(addr)}
                  </div>
                </div>
              </div>
              <span className="pill pill--info">{count} ops</span>
            </div>
          ))}
        </div>
      </div>

      {/* ordered op list */}
      <div className="card-pop overflow-hidden">
        <div className="px-4 py-3 bg-cream border-b-2 border-ink-900 font-semibold text-sm">
          Execution sequence
          <span className="ml-2 text-xs text-ink-500 font-normal">
            (native ETH → tokens → swaps → NFTs → ENS)
          </span>
        </div>
        <ol className="divide-y-2 divide-ink-100">
          {plan.operations.map((op, i) => {
            const meta = OP_META[op.opType];
            return (
              <li
                key={`${op.assetId}-${i}`}
                className={cn(
                  "grid grid-cols-[36px_36px_1fr_auto] items-center gap-3 px-4 py-3"
                )}
              >
                <span className="font-pixel text-xs text-ink-500">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div
                  className={cn(
                    "w-8 h-8 grid place-items-center rounded-lg border-2 border-ink-900 text-base",
                    meta.tint
                  )}
                >
                  {meta.emoji}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {op.explanation}
                  </div>
                  <div className="text-[11px] text-ink-500 flex flex-wrap gap-1.5 items-center">
                    <span className="font-pixel">{op.opType}</span>
                    <span>→</span>
                    <span>{labelFor(op.destination)}</span>
                  </div>
                </div>
                {meta.sponsor && (
                  <span className="pill pill--lilac">{meta.sponsor}</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
