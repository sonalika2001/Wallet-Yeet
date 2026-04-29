"use client";

import { cn } from "@/lib/utils";

// Mid-yeet pixel astronaut — pure SVG so it scales crisp at any size
// without bringing in an asset pipeline. Eyes blink and arms wiggle on
// hover. The visor reflects the WalletYeet brand gradient.
// <Written by AI.>
export function Mascot({
  size = 160,
  yeeting = false,
  variant = "bounce",
  showSparkles,
  className,
}: {
  size?: number;
  /** When true, the mascot gets launched off-screen (used after Execute) */
  yeeting?: boolean;
  /** "bounce" (default), "float" (gentle), "static" (no animation) */
  variant?: "bounce" | "float" | "static";
  /** Sparkles default to ON for size > 80, OFF for smaller */
  showSparkles?: boolean;
  className?: string;
}) {
  const sparklesOn = showSparkles ?? size > 80;
  // 16x16 grid scaled up — each "pixel" = size/16
  const px = size / 16;
  return (
    <div
      className={cn(
        "relative inline-block select-none",
        yeeting
          ? "animate-yeet-x"
          : variant === "float"
          ? "animate-float"
          : variant === "static"
          ? ""
          : "animate-bounceY",
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        className="pixelated"
        shapeRendering="crispEdges"
      >
        {/* helmet outline */}
        <rect x="4" y="2" width="8" height="1" fill="#1A1733" />
        <rect x="3" y="3" width="1" height="6" fill="#1A1733" />
        <rect x="12" y="3" width="1" height="6" fill="#1A1733" />
        <rect x="4" y="9" width="8" height="1" fill="#1A1733" />
        {/* helmet glass */}
        <rect x="4" y="3" width="8" height="6" fill="#E8F4FF" />
        {/* visor reflection (gradient stripe) */}
        <rect x="5" y="4" width="6" height="1" fill="#FFB088" />
        <rect x="5" y="5" width="6" height="1" fill="#9C6CFF" />
        <rect x="5" y="6" width="6" height="1" fill="#3F9CFF" />
        {/* eye sparkle */}
        <rect x="9" y="5" width="1" height="1" fill="#ffffff" />
        <rect x="6" y="5" width="1" height="1" fill="#ffffff" />
        {/* body suit */}
        <rect x="5" y="10" width="6" height="1" fill="#1A1733" />
        <rect x="4" y="11" width="8" height="3" fill="#FFFFFF" />
        <rect x="4" y="11" width="1" height="3" fill="#1A1733" />
        <rect x="11" y="11" width="1" height="3" fill="#1A1733" />
        <rect x="4" y="14" width="8" height="1" fill="#1A1733" />
        {/* chest button */}
        <rect x="7" y="12" width="2" height="1" fill="#FF7A3D" />
        <rect x="7" y="13" width="2" height="1" fill="#3FCD8A" />
        {/* arms in mid-yeet (one up, one back) */}
        <rect x="2" y="11" width="2" height="1" fill="#1A1733" />
        <rect x="2" y="12" width="2" height="1" fill="#FFFFFF" />
        <rect x="12" y="9" width="2" height="1" fill="#1A1733" />
        <rect x="12" y="10" width="2" height="1" fill="#FFFFFF" />
        {/* feet */}
        <rect x="5" y="15" width="2" height="1" fill="#1A1733" />
        <rect x="9" y="15" width="2" height="1" fill="#1A1733" />
      </svg>

      {sparklesOn && (
        <>
          {/* halo ring */}
          <div
            className="absolute -inset-2 rounded-full border-2 border-dashed border-lilac-300/60"
            style={{ animation: "spin 14s linear infinite" }}
          />
          {/* sparkles */}
          <span
            className="sparkle animate-sparkle"
            style={{ top: -8, right: -6, color: "#FF7A3D", fontSize: px * 1.2 }}
          >
            ✦
          </span>
          <span
            className="sparkle animate-sparkle"
            style={{
              bottom: -4,
              left: -10,
              color: "#9C6CFF",
              fontSize: px * 1.4,
              animationDelay: "0.6s",
            }}
          >
            ✧
          </span>
          <span
            className="sparkle animate-sparkle"
            style={{
              top: "40%",
              right: -16,
              color: "#3F9CFF",
              fontSize: px,
              animationDelay: "1.2s",
            }}
          >
            ✦
          </span>
        </>
      )}
    </div>
  );
}

// Mini avatar version for inline use (e.g. agent pipeline rows).
export function MiniMascot({ size = 32 }: { size?: number }) {
  return (
    <span
      className="inline-block align-middle"
      style={{ width: size, height: size }}
    >
      <Mascot size={size} />
    </span>
  );
}
