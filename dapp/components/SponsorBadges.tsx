import { ENABLED_FEATURES } from "@/lib/config";

const ITEMS = [
  {
    key: "keeperHub",
    emoji: "🛰️",
    title: "KeeperHub",
    blurb: "Reliable execution with retry + MEV protect",
  },
  {
    key: "uniswapDust",
    emoji: "🔁",
    title: "Uniswap",
    blurb: "Auto-swap dust to USDC during migration",
  },
  {
    key: "ensSubnames",
    emoji: "🟦",
    title: "ENS",
    blurb: "Migrate subnames as first-class assets",
  },
] as const;

export function SponsorBadges() {
  return (
    <div className="grid sm:grid-cols-3 gap-3">
      {ITEMS.map((it) => {
        const on = ENABLED_FEATURES[it.key as keyof typeof ENABLED_FEATURES];
        return (
          <div
            key={it.key}
            className="card-soft p-4 flex items-start gap-3"
            aria-label={`${it.title} integration ${on ? "enabled" : "disabled"}`}
          >
            <div className="text-2xl">{it.emoji}</div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="font-semibold">{it.title}</div>
                <span className={on ? "pill pill--safe" : "pill pill--info"}>
                  {on ? "live" : "off"}
                </span>
              </div>
              <p className="text-xs text-ink-500 mt-0.5">{it.blurb}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
