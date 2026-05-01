"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const SUPPORTED_NOW = [
  { name: "Sepolia", note: "testnet — live", live: true, emoji: "🟢" },
];

const ROADMAP_CHAINS = [
  { name: "Ethereum mainnet", note: "post-hackathon", emoji: "⚪️" },
  { name: "Base", note: "L2 priority", emoji: "🔵" },
  { name: "Arbitrum", note: "L2 priority", emoji: "🔶" },
  { name: "Optimism", note: "after Base", emoji: "🔴" },
  { name: "Monad", note: "once mainnet", emoji: "🟣" },
];

/** Compact "Sepolia · more chains coming soon" pill. Click expands a list. */
export function ChainBadge() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="pill pill--info hover:bg-sky-100 transition-colors flex items-center gap-1.5"
        aria-expanded={open}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-mint-400 animate-pulse" />
        Sepolia only · more chains coming soon
        <span className={cn("transition-transform text-[8px]", open && "rotate-180")}>
          ▼
        </span>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30"
          />
          <div className="absolute z-40 left-0 mt-2 w-72 card-pop p-3 text-xs space-y-2">
            <div>
              <div className="font-pixel text-[10px] tracking-widest text-mint-500 mb-1">
                LIVE NOW
              </div>
              <ul className="space-y-1">
                {SUPPORTED_NOW.map((c) => (
                  <li key={c.name} className="flex items-center gap-2">
                    <span>{c.emoji}</span>
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-ink-500">— {c.note}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="pt-2 border-t-2 border-ink-100">
              <div className="font-pixel text-[10px] tracking-widest text-ink-500 mb-1">
                ROADMAP
              </div>
              <ul className="space-y-1">
                {ROADMAP_CHAINS.map((c) => (
                  <li key={c.name} className="flex items-center gap-2 opacity-70">
                    <span>{c.emoji}</span>
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-ink-500">— {c.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
