"use client";

import { useUIStore } from "@/store/ui";
import { useAlerts } from "@/lib/queries";
import { clsx } from "clsx";

/**
 * Signature interaction: a low-key radar sweep anchored bottom-left of the
 * map surface. Suggests "data scanning Lima Metropolitana" without shouting.
 *
 * Design rules:
 *  - Stays out of the way of MapLegend (left) and ScenarioPanel (top-left).
 *  - One rotating beam + three faint range rings, ~80×80, low opacity.
 *  - Color picks up severity: critical alerts present → ochre/cinnabar wash;
 *    otherwise costa-300.
 *  - Honors prefers-reduced-motion via a media query that disables the
 *    spinning animation (the `radar` keyframe in tailwind.config).
 *  - Hidden when AlertsPanel is open (mobile bottom-sheet would overlap).
 */
export function MapRadar() {
  const { activePanel } = useUIStore();
  const { data: alerts = [] } = useAlerts();

  if (activePanel !== "map") return null;

  const active = alerts.filter((a) => a.status === "active");
  const critical = active.some((a) => a.severity === "critical");
  const high = active.some((a) => a.severity === "high");

  const tint = critical
    ? "oklch(60% 0.20 28)"   // severity-critical
    : high
      ? "oklch(70% 0.16 55)" // severity-high
      : "oklch(75% 0.105 208)"; // costa-300

  return (
    <div
      className={clsx(
        // Bottom-right, above the LiveTicker strip; mobile-hidden so it never
        // crowds the 375px viewport. AlertsPanel/Dashboard cannot occupy this
        // space because MapRadar only renders when activePanel === "map".
        // Sits above the LiveTicker (36px) and NavControl (~65px).
        // Right-side clear zone starts at ~120px from bottom.
        "hidden sm:block absolute bottom-32 right-5 z-10 pointer-events-none",
        "opacity-65 hover:opacity-100 transition-opacity",
      )}
      aria-hidden="true"
    >
      <svg width="84" height="84" viewBox="0 0 100 100" className="overflow-visible">
        {/* Range rings */}
        <circle cx="50" cy="50" r="46" fill="none" stroke={tint} strokeOpacity="0.15" strokeWidth="0.7" />
        <circle cx="50" cy="50" r="32" fill="none" stroke={tint} strokeOpacity="0.20" strokeWidth="0.7" />
        <circle cx="50" cy="50" r="18" fill="none" stroke={tint} strokeOpacity="0.30" strokeWidth="0.7" />

        {/* Cross-hair */}
        <line x1="50" y1="2"  x2="50" y2="98" stroke={tint} strokeOpacity="0.10" strokeWidth="0.5" />
        <line x1="2"  y1="50" x2="98" y2="50" stroke={tint} strokeOpacity="0.10" strokeWidth="0.5" />

        {/* Sweep beam: rotates via tailwind `animate-radar` keyframe */}
        <g
          className="origin-center"
          style={{
            transformOrigin: "50px 50px",
            animation: "radar 6s linear infinite",
          }}
        >
          <defs>
            <linearGradient id="cr-radar-beam" x1="50%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%"   stopColor={tint} stopOpacity="0.0" />
              <stop offset="70%"  stopColor={tint} stopOpacity="0.25" />
              <stop offset="100%" stopColor={tint} stopOpacity="0.55" />
            </linearGradient>
          </defs>
          <path
            d="M50 50 L96 50 A46 46 0 0 0 70 8 Z"
            fill="url(#cr-radar-beam)"
          />
        </g>

        {/* Center pip */}
        <circle cx="50" cy="50" r="1.5" fill={tint} />
      </svg>
    </div>
  );
}
