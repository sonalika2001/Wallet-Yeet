{/* <Created by AI.> */}
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";
export const runtime = "edge";

// Pixel-art astronaut head icon — same vibe as the in-app Mascot, rendered
// as a 32×32 PNG via a 16×16 SVG grid scaled up. Uses inline divs because
// ImageResponse doesn't support raw SVG children.
export default function Icon() {
  // Pixel grid: each cell is 2×2 px in the 32×32 output.
  const PX = 2;
  const cell = (x: number, y: number, color: string, key: string) => (
    <div
      key={key}
      style={{
        position: "absolute",
        left: x * PX,
        top: y * PX,
        width: PX,
        height: PX,
        background: color,
      }}
    />
  );

  const INK = "#1A1733";
  const GLASS = "#E8F4FF";
  const PEACH = "#FFB088";
  const LILAC = "#9C6CFF";
  const SKY = "#3F9CFF";
  const ORANGE = "#FF7A3D";
  const MINT = "#3FCD8A";
  const WHITE = "#FFFFFF";

  // Build the cells array imperatively to keep it readable.
  const cells: JSX.Element[] = [];
  let k = 0;

  // helmet outline
  for (let x = 4; x < 12; x++) cells.push(cell(x, 2, INK, `${k++}`));
  for (let y = 3; y < 9; y++) cells.push(cell(3, y, INK, `${k++}`));
  for (let y = 3; y < 9; y++) cells.push(cell(12, y, INK, `${k++}`));
  for (let x = 4; x < 12; x++) cells.push(cell(x, 9, INK, `${k++}`));
  // helmet glass
  for (let y = 3; y < 9; y++)
    for (let x = 4; x < 12; x++) cells.push(cell(x, y, GLASS, `${k++}`));
  // visor reflection
  for (let x = 5; x < 11; x++) cells.push(cell(x, 4, PEACH, `${k++}`));
  for (let x = 5; x < 11; x++) cells.push(cell(x, 5, LILAC, `${k++}`));
  for (let x = 5; x < 11; x++) cells.push(cell(x, 6, SKY, `${k++}`));
  // eye sparkles
  cells.push(cell(6, 5, WHITE, `${k++}`));
  cells.push(cell(9, 5, WHITE, `${k++}`));
  // body
  for (let x = 5; x < 11; x++) cells.push(cell(x, 10, INK, `${k++}`));
  for (let y = 11; y < 14; y++)
    for (let x = 4; x < 12; x++) cells.push(cell(x, y, WHITE, `${k++}`));
  for (let y = 11; y < 14; y++) cells.push(cell(4, y, INK, `${k++}`));
  for (let y = 11; y < 14; y++) cells.push(cell(11, y, INK, `${k++}`));
  for (let x = 4; x < 12; x++) cells.push(cell(x, 14, INK, `${k++}`));
  // chest pixels
  cells.push(cell(7, 12, ORANGE, `${k++}`));
  cells.push(cell(8, 12, ORANGE, `${k++}`));
  cells.push(cell(7, 13, MINT, `${k++}`));
  cells.push(cell(8, 13, MINT, `${k++}`));
  // feet
  cells.push(cell(5, 15, INK, `${k++}`));
  cells.push(cell(6, 15, INK, `${k++}`));
  cells.push(cell(9, 15, INK, `${k++}`));
  cells.push(cell(10, 15, INK, `${k++}`));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #FFE4D2 0%, #E8D5FF 50%, #C8E6FF 100%)",
          position: "relative",
          display: "flex",
        }}
      >
        {cells}
      </div>
    ),
    { ...size },
  );
}
