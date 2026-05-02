"use client";

import { cn, formatUsd, shortAddr } from "@/lib/utils";
import type { Asset, SavedDestination } from "@/lib/types";
import { RiskBadge } from "./RiskBadge";

// <Record written by AI.>
const CATEGORY_META: Record<
  Asset["category"],
  { emoji: string; label: string; tint: string }
> = {
  token: { emoji: "🪙", label: "Token", tint: "bg-mint-50" },
  "dust-token": { emoji: "✨", label: "Dust", tint: "bg-peach-50" },
  nft: { emoji: "🎨", label: "NFT", tint: "bg-lilac-50" },
  ens: { emoji: "🟦", label: "ENS", tint: "bg-sky-50" },
};

// <Interface written by AI.>
interface Props {
  assets: Asset[];
  defaultDestination: `0x${string}` | "";
  destinations: SavedDestination[];
  /** assetId -> destination address (per-row override) */
  routes: Record<string, `0x${string}`>;
  /** assetIds that the user has unchecked (excluded from migration) */
  excluded: Set<string>;
  onToggleAsset: (id: string, included: boolean) => void;
  onChangeRoute: (id: string, dest: `0x${string}`) => void;
  convertDust: boolean;
  convertUnknownTokens: boolean;
}

export function AssetTable({
  assets,
  defaultDestination,
  destinations,
  routes,
  excluded,
  onToggleAsset,
  onChangeRoute,
  convertDust,
  convertUnknownTokens,
}: Props) {
  const optionsForRow = (_id: string) => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];

    for (const d of destinations) {
      const key = d.address.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      opts.push({ value: d.address, label: `${d.emoji ?? ""} ${d.label}` });
    }

    if (defaultDestination) {
      const key = defaultDestination.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        opts.unshift({
          value: defaultDestination,
          label: `Default · ${shortAddr(defaultDestination)}`,
        });
      }
    }

    return opts;
  };

  return (
    <div className="card-pop overflow-hidden">
      <div className="grid grid-cols-[40px_1.6fr_0.8fr_0.8fr_1.4fr] items-center gap-3 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-500 bg-cream border-b-2 border-ink-900">
        <span></span>
        <span>Asset</span>
        <span>Value</span>
        <span>Risk</span>
        <span>Destination</span>
      </div>
      <ul className="divide-y-2 divide-ink-100">
        {assets.map((a) => {
          const meta = CATEGORY_META[a.category];
          const isExcluded = excluded.has(a.id);
          const dest = routes[a.id] ?? defaultDestination ?? "";
          const isSwapped =
            (convertDust && a.isDust && a.priceKnown !== false) ||
            (convertUnknownTokens && a.priceKnown === false);
          return (
            <li
              key={a.id}
              className={cn(
                "grid grid-cols-[40px_1.6fr_0.8fr_0.8fr_1.4fr] items-center gap-3 px-4 py-3 text-sm transition-colors",
                isExcluded
                  ? "bg-ink-100/40 opacity-55"
                  : "hover:bg-peach-50/40"
              )}
            >
              <input
                type="checkbox"
                checked={!isExcluded}
                onChange={(e) => onToggleAsset(a.id, e.target.checked)}
                className="w-5 h-5 accent-peach-500 cursor-pointer"
                aria-label={`Include ${a.displayName}`}
              />

              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    "w-9 h-9 grid place-items-center rounded-xl border-2 border-ink-900 text-lg",
                    meta.tint
                  )}
                >
                  {meta.emoji}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">
                    {a.displayName}
                  </div>
                  <div className="text-[11px] text-ink-500 flex flex-wrap items-center gap-1.5">
                    <span className="font-pixel">{meta.label}</span>
                    {a.amountFormatted && a.symbol && (
                      <>
                        <span>·</span>
                        <span>
                          {a.amountFormatted} {a.symbol}
                        </span>
                      </>
                    )}
                    {a.tokenId && (
                      <>
                        <span>·</span>
                        <span>#{a.tokenId}</span>
                      </>
                    )}
                    {isSwapped && (
                      <>
                        <span>·</span>
                        <span className="text-peach-500 font-semibold">
                          → USDC swap
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-sm font-semibold">
                {formatUsd(a.estimatedValueUsd)}
              </div>

              <div>
                {a.riskLevel && <RiskBadge risk={a.riskLevel} />}
              </div>

              <div>
                <select
                  value={dest}
                  onChange={(e) =>
                    onChangeRoute(a.id, e.target.value as `0x${string}`)
                  }
                  disabled={isExcluded}
                  className="w-full rounded-lg border-2 border-ink-900 bg-white px-2 py-1.5 text-xs font-mono"
                >
                  {optionsForRow(a.id).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
