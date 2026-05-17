"use client";

import { useImerg, useFlood, useHuayco } from "@/lib/queries";
import { useUIStore } from "@/store/ui";
import { timeAgo } from "@/lib/utils";

// Connection mode + replay badge are owned by OperationalHUD on desktop and
// SituationBrief on mobile. This bar surfaces only per-layer freshness pills.
export function DataFreshnessBar() {
  const { data: imerg } = useImerg();
  const { data: flood } = useFlood();
  const { data: huayco } = useHuayco();
  const { locale } = useUIStore();

  const items: { label: string; at: string | undefined }[] = [
    { label: "IMERG",  at: imerg?.data_updated_at  ?? imerg?.retrieved_at },
    { label: "SAR",    at: flood?.data_updated_at  ?? flood?.retrieved_at },
    { label: "Huayco", at: huayco?.data_updated_at ?? huayco?.retrieved_at },
  ];

  const ariaLabel = locale === "en" ? "Data freshness by layer" : "Frescura de datos por capa";

  return (
    <div
      className={[
        // Mobile: pinned just above the bottom tab bar
        "fixed bottom-16 left-1/2 -translate-x-1/2 z-10",
        // Desktop: pinned above the LiveTicker (28px) with a small breathing gap
        "sm:absolute sm:bottom-10 sm:left-1/2 sm:-translate-x-1/2",
        "flex items-center gap-2 px-3 py-1 rounded-full whitespace-nowrap",
        "bg-surface-base/80 backdrop-blur-sm border border-slate-700/70",
        "text-[11px] text-slate-400 pointer-events-none",
      ].join(" ")}
      aria-label={ariaLabel}
      role="status"
    >
      {items.map(({ label, at }, i) => (
        <span key={label} className="flex items-center gap-1">
          {i > 0 && <span className="text-slate-700" aria-hidden="true">·</span>}
          <span className="text-slate-500">{label}</span>
          <span className="text-slate-300 tabular-nums">{timeAgo(at)}</span>
        </span>
      ))}
    </div>
  );
}
