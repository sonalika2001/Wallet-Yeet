import { ENABLED_FEATURES } from "@/lib/config";

const ITEMS = [
  {
    key: "uniswapDust",
    emoji: "🔁",
    title: "Uniswap",
    blurb: "Planner probes V3 pools at every fee tier; dust swapped to USDC inside the same migration tx.",
  },
  {
    key: "ensSubnames",
    emoji: "🟦",
    title: "ENS",
    blurb: "Each agent has a verified subname under walletyeet-demo.eth; user subnames migrate as first-class assets.",
  },
] as const;

export function SponsorBadges() {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
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
