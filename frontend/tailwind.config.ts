import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // soft pastel palette — light theme, slight cotton-candy hint
        cream: "#FFF7F0",
        peach: {
          50: "#FFF1E6",
          100: "#FFE0CC",
          200: "#FFC9A8",
          300: "#FFB088",
          400: "#FF9466",
          500: "#FF7A3D",
        },
        mint: {
          50: "#E8FBF3",
          100: "#C8F5E0",
          200: "#9BE9C4",
          300: "#6FDDA8",
          400: "#3FCD8A",
          500: "#1FB370",
        },
        sky: {
          50: "#E8F4FF",
          100: "#C8E3FF",
          200: "#9BCDFF",
          300: "#6FB6FF",
          400: "#3F9CFF",
          500: "#1F7FE8",
        },
        lilac: {
          50: "#F4ECFF",
          100: "#E2D2FF",
          200: "#CCB1FF",
          300: "#B58FFF",
          400: "#9C6CFF",
          500: "#8348FF",
        },
        ink: {
          900: "#1A1733",
          700: "#3B3760",
          500: "#6F6A91",
          300: "#A8A4C2",
          100: "#E1DEEE",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        pixel: ["var(--font-pixel)", "monospace"],
      },
      boxShadow: {
        cute: "0 8px 24px -8px rgba(131, 72, 255, 0.18), 0 2px 6px -2px rgba(131, 72, 255, 0.08)",
        pop: "0 0 0 2px #1A1733, 4px 4px 0 0 #1A1733",
        "pop-sm": "0 0 0 2px #1A1733, 2px 2px 0 0 #1A1733",
        "pop-peach": "0 0 0 2px #1A1733, 4px 4px 0 0 #FF7A3D",
        "pop-mint": "0 0 0 2px #1A1733, 4px 4px 0 0 #3FCD8A",
        "pop-sky": "0 0 0 2px #1A1733, 4px 4px 0 0 #3F9CFF",
        "pop-lilac": "0 0 0 2px #1A1733, 4px 4px 0 0 #9C6CFF",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        bounceY: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px) rotate(-2deg)" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" },
        },
        sparkle: {
          "0%, 100%": { transform: "scale(1) rotate(0deg)", opacity: "0.6" },
          "50%": { transform: "scale(1.2) rotate(180deg)", opacity: "1" },
        },
        "yeet-x": {
          "0%": { transform: "translate(0,0) rotate(0)", opacity: "1" },
          "60%": { transform: "translate(60vw, -30vh) rotate(720deg)", opacity: "1" },
          "100%": { transform: "translate(120vw, -60vh) rotate(1440deg)", opacity: "0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.95)", opacity: "0.7" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
      },
      animation: {
        float: "float 4s ease-in-out infinite",
        bounceY: "bounceY 2.4s ease-in-out infinite",
        wiggle: "wiggle 1.6s ease-in-out infinite",
        sparkle: "sparkle 2.2s ease-in-out infinite",
        "yeet-x": "yeet-x 1.4s cubic-bezier(.33,.0,.66,.33) forwards",
        "fade-up": "fade-up 0.45s ease-out both",
        shimmer: "shimmer 2.4s linear infinite",
        "pulse-ring": "pulse-ring 1.6s cubic-bezier(0.215,0.61,0.355,1) infinite",
        scanline: "scanline 2.5s linear infinite",
      },
      backgroundImage: {
        "grid-light":
          "radial-gradient(circle at 1px 1px, rgba(131, 72, 255, 0.08) 1px, transparent 0)",
        "shimmer-light":
          "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
      },
    },
  },
  plugins: [],
};

export default config;
