// Open Graph cover image — auto-served as the og:image for the site root
// AND a downloadable 1200×630 PNG you can pull straight from Vercel
// (open `<your-url>/opengraph-image` in a browser, right-click → save).
//
// Auto-injected into <meta property="og:image"> by Next.js convention, so
// any link to walletyeet shared on Twitter / Discord / Slack renders this.
// <Written by AI.>

import { ImageResponse } from "next/og";
import { renderMascotCells, MASCOT_GRID } from "@/lib/mascotCells";

export const alt =
  "WalletYeet — AI agents reorg your wallet to multiple destinations in one EIP-7702 signature";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "edge";

export default function OG() {
  // 16-wide grid × 24px per pixel = 384px mascot. Leaves room for text.
  const PIXEL = 24;
  const MASCOT_SIZE = MASCOT_GRID * PIXEL;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          background:
            "linear-gradient(135deg, #FFE4D2 0%, #E8D5FF 50%, #C8E6FF 100%)",
          padding: "60px 80px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* mascot column */}
        <div
          style={{
            position: "relative",
            width: MASCOT_SIZE,
            height: MASCOT_SIZE,
            display: "flex",
            flexShrink: 0,
          }}
        >
          {renderMascotCells(PIXEL)}
        </div>

        {/* text column */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            marginLeft: 60,
            flex: 1,
          }}
        >
          <div
            style={{
              fontSize: 96,
              fontWeight: 900,
              color: "#1A1733",
              letterSpacing: "-2px",
              lineHeight: 0.95,
            }}
          >
            Yeet the mess.
          </div>
          <div
            style={{
              fontSize: 96,
              fontWeight: 900,
              color: "#FF7A3D",
              letterSpacing: "-2px",
              lineHeight: 0.95,
              marginTop: 8,
            }}
          >
            Keep the value.
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: "#5C5276",
              marginTop: 32,
              lineHeight: 1.35,
              maxWidth: 640,
            }}
          >
            AI agents · multi-destination · one EIP-7702 signature
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#7B6F92",
              marginTop: 36,
              letterSpacing: "2px",
              textTransform: "uppercase",
            }}
          >
            ETHGlobal Open Agents · Sepolia · 2026
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
