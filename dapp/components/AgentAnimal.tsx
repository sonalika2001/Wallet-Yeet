"use client";

import { cn } from "@/lib/utils";

// Per-agent pixel-art mascot rendered as inline SVG. Each "kind" maps to
// an animal that matches the agent's personality:
//
//   scout   → puppy   (sniffs out the mess)
//   auditor → owl     (watches every approval, big judgmental eyes)
//   planner → fox     (clever sequencer)
//
// All three are drawn on the same 16×16 grid with `shapeRendering="crispEdges"`
// so they scale crisply to any display size. Animation is opt-in via the
// `active` prop — when true, a CSS wiggle plays on the wrapper.
//
// <Pixel art written by AI.>

interface AgentAnimalProps {
  kind: "scout" | "auditor" | "planner";
  size?: number;
  /** When true, plays the wiggle animation. */
  active?: boolean;
  className?: string;
}

const PALETTE = {
  ink: "#1A1733",
  white: "#FFFFFF",
  // Scout (puppy) — warm sandy browns
  tan: "#F0C892",
  brown: "#A8743C",
  brownDark: "#6F4A20",
  pink: "#FF8FA7",
  // Auditor (owl) — woodsy + yellow watchful eyes
  owl: "#7D5A3A",
  owlLight: "#B89472",
  yellow: "#FFD86E",
  orange: "#FF7A3D",
  // Planner (fox) — vivid orange + white muzzle
  fox: "#FF924A",
  foxDark: "#C45A1F",
  cream: "#FFEAD2",
} as const;

export function AgentAnimal({ kind, size = 48, active, className }: AgentAnimalProps) {
  return (
    <div
      className={cn(
        "inline-block",
        active && "animate-wiggle",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        className="pixelated block"
        shapeRendering="crispEdges"
      >
        {kind === "scout" && <Scout />}
        {kind === "auditor" && <Auditor />}
        {kind === "planner" && <Planner />}
      </svg>
    </div>
  );
}

// ── Scout: a sniffer puppy with floppy ears, sniffing leftward ──────────
function Scout() {
  const { ink, brown, brownDark, tan, pink, white } = PALETTE;
  return (
    <>
      {/* floppy ears */}
      <rect x="2" y="3" width="2" height="4" fill={brownDark} />
      <rect x="12" y="3" width="2" height="4" fill={brownDark} />
      {/* head outline */}
      <rect x="4" y="2" width="8" height="1" fill={ink} />
      <rect x="3" y="3" width="1" height="6" fill={ink} />
      <rect x="12" y="3" width="1" height="6" fill={ink} />
      <rect x="4" y="9" width="8" height="1" fill={ink} />
      {/* head fill */}
      <rect x="4" y="3" width="8" height="6" fill={tan} />
      {/* brown patch over right eye — gives it character */}
      <rect x="9" y="3" width="3" height="3" fill={brown} />
      {/* eyes */}
      <rect x="5" y="5" width="1" height="1" fill={ink} />
      <rect x="10" y="5" width="1" height="1" fill={ink} />
      {/* eye sparkles */}
      <rect x="5" y="4" width="1" height="1" fill={white} />
      <rect x="10" y="4" width="1" height="1" fill={white} />
      {/* snout */}
      <rect x="6" y="7" width="4" height="1" fill={tan} />
      <rect x="7" y="8" width="2" height="1" fill={ink} />
      {/* tongue out — sniffer at work */}
      <rect x="8" y="9" width="1" height="1" fill={pink} />
      {/* body — peeking under head */}
      <rect x="5" y="10" width="6" height="3" fill={tan} />
      <rect x="5" y="13" width="6" height="1" fill={ink} />
      {/* paws */}
      <rect x="5" y="14" width="2" height="2" fill={brownDark} />
      <rect x="9" y="14" width="2" height="2" fill={brownDark} />
      {/* tail mid-wag, sticking out right */}
      <rect x="11" y="11" width="2" height="1" fill={brownDark} />
      <rect x="13" y="10" width="1" height="2" fill={brownDark} />
    </>
  );
}

// ── Auditor: a watchful owl with big yellow eyes, ear tufts ─────────────
function Auditor() {
  const { ink, owl, owlLight, yellow, orange, white } = PALETTE;
  return (
    <>
      {/* ear tufts */}
      <rect x="3" y="1" width="1" height="2" fill={ink} />
      <rect x="4" y="2" width="1" height="1" fill={ink} />
      <rect x="12" y="1" width="1" height="2" fill={ink} />
      <rect x="11" y="2" width="1" height="1" fill={ink} />
      {/* head + body silhouette */}
      <rect x="3" y="3" width="10" height="1" fill={ink} />
      <rect x="2" y="4" width="1" height="9" fill={ink} />
      <rect x="13" y="4" width="1" height="9" fill={ink} />
      <rect x="3" y="13" width="10" height="1" fill={ink} />
      {/* feather body */}
      <rect x="3" y="4" width="10" height="9" fill={owl} />
      {/* belly highlight */}
      <rect x="6" y="9" width="4" height="3" fill={owlLight} />
      {/* eye discs (large, watchful) */}
      <rect x="4" y="5" width="3" height="3" fill={white} />
      <rect x="9" y="5" width="3" height="3" fill={white} />
      {/* yellow iris */}
      <rect x="5" y="6" width="2" height="2" fill={yellow} />
      <rect x="10" y="6" width="2" height="2" fill={yellow} />
      {/* pupils — judgmental */}
      <rect x="5" y="6" width="1" height="1" fill={ink} />
      <rect x="10" y="6" width="1" height="1" fill={ink} />
      {/* beak */}
      <rect x="7" y="8" width="2" height="1" fill={orange} />
      <rect x="7" y="9" width="2" height="1" fill={orange} />
      <rect x="7" y="10" width="1" height="1" fill={orange} />
      <rect x="8" y="10" width="1" height="1" fill={orange} />
      {/* feet */}
      <rect x="5" y="14" width="2" height="1" fill={orange} />
      <rect x="9" y="14" width="2" height="1" fill={orange} />
      <rect x="4" y="15" width="3" height="1" fill={ink} />
      <rect x="9" y="15" width="3" height="1" fill={ink} />
    </>
  );
}

// ── Planner: a clever fox face with pointed ears ────────────────────────
function Planner() {
  const { ink, fox, foxDark, cream, white } = PALETTE;
  return (
    <>
      {/* pointy ears */}
      <rect x="3" y="2" width="2" height="1" fill={ink} />
      <rect x="2" y="3" width="3" height="1" fill={ink} />
      <rect x="3" y="3" width="2" height="1" fill={fox} />
      <rect x="11" y="2" width="2" height="1" fill={ink} />
      <rect x="11" y="3" width="3" height="1" fill={ink} />
      <rect x="11" y="3" width="2" height="1" fill={fox} />
      {/* inner ear */}
      <rect x="3" y="3" width="1" height="1" fill={foxDark} />
      <rect x="12" y="3" width="1" height="1" fill={foxDark} />
      {/* head outline */}
      <rect x="3" y="4" width="10" height="1" fill={ink} />
      <rect x="2" y="5" width="1" height="6" fill={ink} />
      <rect x="13" y="5" width="1" height="6" fill={ink} />
      {/* face fill */}
      <rect x="3" y="5" width="10" height="6" fill={fox} />
      {/* white muzzle/cheeks */}
      <rect x="5" y="8" width="6" height="3" fill={cream} />
      <rect x="4" y="9" width="8" height="2" fill={cream} />
      {/* eyes — clever, narrow */}
      <rect x="5" y="6" width="2" height="1" fill={ink} />
      <rect x="9" y="6" width="2" height="1" fill={ink} />
      <rect x="5" y="7" width="1" height="1" fill={white} />
      <rect x="10" y="7" width="1" height="1" fill={white} />
      {/* nose */}
      <rect x="7" y="9" width="2" height="1" fill={ink} />
      {/* tapered chin */}
      <rect x="4" y="11" width="8" height="1" fill={ink} />
      <rect x="6" y="12" width="4" height="1" fill={ink} />
      {/* tail flicking up-right (signature fox shape) */}
      <rect x="13" y="11" width="2" height="1" fill={ink} />
      <rect x="14" y="9" width="1" height="3" fill={ink} />
      <rect x="13" y="11" width="2" height="1" fill={fox} />
      <rect x="14" y="9" width="1" height="2" fill={fox} />
      <rect x="14" y="8" width="1" height="1" fill={cream} />
    </>
  );
}
