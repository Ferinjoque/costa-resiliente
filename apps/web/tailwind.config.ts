import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Severity palette — WCAG AA contrast on dark backgrounds
        severity: {
          critical: "#ef4444",  // red-500
          high:     "#f97316",  // orange-500
          medium:   "#eab308",  // yellow-500
          low:      "#22c55e",  // green-500
        },
        // Brand
        costa: {
          50:  "#f0f9ff",
          100: "#e0f2fe",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          900: "#0c4a6e",
        },
        // Dark operational surface
        surface: {
          base:   "#0f172a",  // slate-900
          raised: "#1e293b",  // slate-800
          panel:  "#334155",  // slate-700
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "scan": "scan 4s linear infinite",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.25s ease-out",
      },
      keyframes: {
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 8px rgba(239,68,68,0.4), 0 0 20px rgba(239,68,68,0.15)" },
          "50%": { boxShadow: "0 0 16px rgba(239,68,68,0.7), 0 0 40px rgba(239,68,68,0.3)" },
        },
        "scan": {
          "0%": { backgroundPosition: "0% 0%" },
          "100%": { backgroundPosition: "0% 100%" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
