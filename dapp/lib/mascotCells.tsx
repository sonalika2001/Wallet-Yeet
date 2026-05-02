// Pixel-grid representation of the mascot, used by `next/og` ImageResponse
// routes (the OG cover image and the logo). next/og can't render raw <svg>,
// so we lay out absolute-positioned divs — one per pixel rect — at the
// requested scale. This file is the single source of truth for the mascot
// look outside of the in-app SVG component.
//
// Keep this in sync with `dapp/components/Mascot.tsx`. <Written by AI.>

import type { JSX } from "react";

interface Pixel {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

// Same 16×16 grid as Mascot.tsx — astronaut with MJ fedora + sparkly glove.
const MASCOT_PIXELS: Pixel[] = [
  // fedora (MJ tribute)
  { x: 5, y: 0, w: 6, h: 1, color: "#1A1733" },
  { x: 3, y: 1, w: 10, h: 1, color: "#1A1733" },
  // helmet outline
  { x: 4, y: 2, w: 8, h: 1, color: "#1A1733" },
  { x: 3, y: 3, w: 1, h: 6, color: "#1A1733" },
  { x: 12, y: 3, w: 1, h: 6, color: "#1A1733" },
  { x: 4, y: 9, w: 8, h: 1, color: "#1A1733" },
  // helmet glass
  { x: 4, y: 3, w: 8, h: 6, color: "#E8F4FF" },
  // visor reflection (gradient stripes)
  { x: 5, y: 4, w: 6, h: 1, color: "#FFB088" },
  { x: 5, y: 5, w: 6, h: 1, color: "#9C6CFF" },
  { x: 5, y: 6, w: 6, h: 1, color: "#3F9CFF" },
  // eye sparkles
  { x: 6, y: 5, w: 1, h: 1, color: "#FFFFFF" },
  { x: 9, y: 5, w: 1, h: 1, color: "#FFFFFF" },
  // body suit
  { x: 5, y: 10, w: 6, h: 1, color: "#1A1733" },
  { x: 4, y: 11, w: 8, h: 3, color: "#FFFFFF" },
  { x: 4, y: 11, w: 1, h: 3, color: "#1A1733" },
  { x: 11, y: 11, w: 1, h: 3, color: "#1A1733" },
  { x: 4, y: 14, w: 8, h: 1, color: "#1A1733" },
  // chest buttons
  { x: 7, y: 12, w: 2, h: 1, color: "#FF7A3D" },
  { x: 7, y: 13, w: 2, h: 1, color: "#3FCD8A" },
  // arms in mid-yeet
  { x: 2, y: 11, w: 2, h: 1, color: "#1A1733" },
  { x: 2, y: 12, w: 2, h: 1, color: "#FFFFFF" },
  { x: 12, y: 9, w: 2, h: 1, color: "#1A1733" },
  // sparkly white glove on the raised hand
  { x: 12, y: 10, w: 2, h: 1, color: "#FFFFFF" },
  { x: 14, y: 9, w: 1, h: 1, color: "#FFFFFF" },
  { x: 14, y: 8, w: 1, h: 1, color: "#FFE7C2" },
  // feet
  { x: 5, y: 15, w: 2, h: 1, color: "#1A1733" },
  { x: 9, y: 15, w: 2, h: 1, color: "#1A1733" },
];

/** Width/height in pixels of the mascot when rendered at this scale. */
export const MASCOT_GRID = 16;

/** Render the mascot as absolute-positioned divs scaled by `pixelSize`. */
export function renderMascotCells(pixelSize: number): JSX.Element[] {
  return MASCOT_PIXELS.map((p, i) => (
    <div
      key={i}
      style={{
        position: "absolute",
        left: p.x * pixelSize,
        top: p.y * pixelSize,
        width: p.w * pixelSize,
        height: p.h * pixelSize,
        background: p.color,
      }}
    />
  ));
}
