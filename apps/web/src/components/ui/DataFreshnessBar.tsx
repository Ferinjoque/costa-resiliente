"use client";

import { useImerg, useFlood, useHuayco } from "@/lib/queries";
import { timeAgo } from "@/lib/utils";

export function DataFreshnessBar() {
  const { data: imerg } = useImerg();
  const { data: flood } = useFlood();
  const { data: huayco } = useHuayco();

  // Prefer data_updated_at (actual DB freshness) over retrieved_at (API call time)
  const items: { label: string; at: string | undefined }[] = [
    { label: "IMERG", at: imerg?.data_updated_at ?? imerg?.retrieved_at },
    { label: "SAR",   at: flood?.data_updated_at  ?? flood?.retrieved_at  },
    { label: "Huayco",at: huayco?.data_updated_at ?? huayco?.retrieved_at },
  ];

  return (
    <div
      className={[
        // Shared layout
        "flex items-center gap-3 px-3 py-1.5",
        "bg-surface-base/80 backdrop-blur-sm border border-slate-700",
        "text-xs text-slate-400 pointer-events-none",
        // Mobile: fixed above the bottom tab bar, full-width pill
        "fixed bottom-14 left-1/2 -translate-x-1/2 rounded-full z-10 whitespace-nowrap",
        // Desktop: absolute centered at bottom of main
        "sm:absolute sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2 sm:rounded-full",
      ].join(" ")}
      aria-label="Datos actualizados"
      role="status"
    >
      {items.map(({ label, at }) => (
        <span key={label} className="flex items-center gap-1">
          <span className="text-slate-400">{label}</span>
          <span className="text-slate-300">{timeAgo(at)}</span>
        </span>
      ))}
    </div>
  );
}
