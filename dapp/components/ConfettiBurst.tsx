"use client";

import { useEffect, useRef } from "react";

//<Written by AI.>
// Tiny canvas-free confetti — uses absolutely-positioned divs and CSS
// transforms. Pretty enough for the Yeet completion moment without
// adding a 30kb dependency.
const COLORS = [
  "#FF7A3D",
  "#3FCD8A",
  "#3F9CFF",
  "#9C6CFF",
  "#FFB088",
  "#FFC9A8",
];

interface Piece {
  id: number;
  left: number; // %
  delay: number; // s
  duration: number; // s
  color: string;
  rotation: number;
  size: number;
}

export function ConfettiBurst({ count = 80 }: { count?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const piecesRef = useRef<Piece[]>([]);

  if (piecesRef.current.length === 0) {
    piecesRef.current = Array.from({ length: count }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 1.4 + Math.random() * 1.6,
      color: COLORS[i % COLORS.length],
      rotation: Math.floor(Math.random() * 360),
      size: 6 + Math.floor(Math.random() * 8),
    }));
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (ref.current) ref.current.style.opacity = "0";
    }, 3500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden transition-opacity duration-1000"
    >
      <style>{`
        @keyframes wy-confetti-fall {
          0% { transform: translate(0, -10vh) rotate(0deg); opacity: 1; }
          100% { transform: translate(var(--dx, 0), 110vh) rotate(720deg); opacity: 0.85; }
        }
      `}</style>
      {piecesRef.current.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            top: 0,
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.4,
            background: p.color,
            borderRadius: 2,
            transform: `rotate(${p.rotation}deg)`,
            // small random horizontal drift so they fan out
            ["--dx" as string]: `${(Math.random() - 0.5) * 60}vw`,
            animation: `wy-confetti-fall ${p.duration}s cubic-bezier(.18,.6,.4,1) ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}
