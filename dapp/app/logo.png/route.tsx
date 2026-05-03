// Square 512×512 logo — accessible at `/logo.png` on the deployed site.
// Use it as your ETHGlobal submission logo or anywhere else you need a
// square brand mark. Right-click → Save Image As after opening the URL.
//
// <Written by AI.>

import { ImageResponse } from "next/og";
import { renderMascotCells, MASCOT_GRID } from "@/lib/mascotCells";

export const runtime = "edge";

export async function GET() {
  // 16-wide grid × 18px per pixel = 288px mascot, centered with margin.
  const PIXEL = 18;
  const MASCOT_SIZE = MASCOT_GRID * PIXEL;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #FFE4D2 0%, #E8D5FF 50%, #C8E6FF 100%)",
          padding: 40,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            position: "relative",
            width: MASCOT_SIZE,
            height: MASCOT_SIZE,
            display: "flex",
          }}
        >
          {renderMascotCells(PIXEL)}
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: "#1A1733",
            letterSpacing: "-1px",
            marginTop: 24,
          }}
        >
          WalletYeet
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
