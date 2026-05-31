"use client";

import { useImerg, useFlood, useHuayco } from "@/lib/queries";
import { useUIStore } from "@/store/ui";
import { timeAgo, stalenessLevel } from "@/lib/utils";

// Staleness thresholds in minutes per layer
const STALE_THRESHOLDS: Record<string, number> = {
  IMERG: 70,   // 30min schedule × 2 grace
  SAR: 360,    // daily revisit, 6h grace
  Huayco: 240, // derived from SAR, 4h grace
};

// Color tokens by staleness level
const LEVEL_COLORS: Record<string, { label: string; time: string; dot: string }> = {
  ok:    { label: "oklch(80% 0 0 / 0.45)", time: "oklch(80% 0 0 / 0.6)", dot: "bg-ok/70" },
  warn:  { label: "oklch(78% 0.15 80 / 0.7)", time: "oklch(78% 0.15 80 / 0.85)", dot: "bg-warn/70" },
  stale: { label: "oklch(65% 0.18 25 / 0.8)", time: "oklch(65% 0.18 25 / 0.9)", dot: "bg-danger/60" },
};

// Compact freshness strip on the map canvas — dark surface, minimal.
export function DataFreshnessBar() {
  const { data: imerg }  = useImerg();
  const { data: flood }  = useFlood();
  const { data: huayco } = useHuayco();
  const { locale }       = useUIStore();

  const items = [
    { label: "IMERG",  at: imerg?.data_updated_at  ?? imerg?.retrieved_at  },
    { label: "SAR",    at: flood?.data_updated_at  ?? flood?.retrieved_at  },
    { label: "Huayco", at: huayco?.data_updated_at ?? huayco?.retrieved_at },
  ];

  return (
    <div
      className="hidden sm:flex items-center gap-3 absolute bottom-[42px] left-1/2 -translate-x-1/2 z-10 pointer-events-none select-none"
      aria-label={locale === "en" ? "Data freshness" : "Frescura de datos"}
      role="status"
    >
      {items.map(({ label, at }, i) => {
        const level = stalenessLevel(at, STALE_THRESHOLDS[label] ?? 60);
        const colors = LEVEL_COLORS[level];
        const ageText = at ? timeAgo(at) : (locale === "en" ? "no data" : "sin datos");
        const titleText = at
          ? (locale === "en" ? `${label}: last update ${ageText}` : `${label}: última actualización ${ageText}`)
          : (locale === "en" ? `${label}: no data received` : `${label}: sin datos recibidos`);

        return (
          <span key={label} className="flex items-center gap-1.5" title={titleText}>
            {i > 0 && (
              <span className="w-px h-3" style={{ background: "oklch(80% 0 0 / 0.2)" }} aria-hidden="true" />
            )}
            {level !== "ok" && (
              <span className={`w-1 h-1 rounded-full shrink-0 ${colors.dot}`} aria-hidden="true" />
            )}
            <span className="text-2xs font-bold uppercase tracking-widest" style={{ color: colors.label }}>
              {label}
            </span>
            <span className="text-2xs font-mono tabular-nums" style={{ color: colors.time }}>
              {ageText}
            </span>
          </span>
        );
      })}
    </div>
  );
}
