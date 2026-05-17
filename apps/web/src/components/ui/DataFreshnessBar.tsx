"use client";

import { useImerg, useFlood, useHuayco } from "@/lib/queries";
import { useUIStore } from "@/store/ui";
import { timeAgo } from "@/lib/utils";

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
      {items.map(({ label, at }, i) => (
        <span key={label} className="flex items-center gap-1.5">
          {i > 0 && (
            <span className="w-px h-3" style={{ background: "oklch(80% 0 0 / 0.2)" }} aria-hidden="true" />
          )}
          <span className="text-2xs font-bold uppercase tracking-widest" style={{ color: "oklch(80% 0 0 / 0.4)" }}>
            {label}
          </span>
          <span className="text-2xs font-mono tabular-nums" style={{ color: "oklch(80% 0 0 / 0.55)" }}>
            {timeAgo(at)}
          </span>
        </span>
      ))}
    </div>
  );
}
