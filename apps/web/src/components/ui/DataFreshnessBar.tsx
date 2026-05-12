"use client";

import { useImerg, useFlood, useHuayco } from "@/lib/queries";
import { timeAgo } from "@/lib/utils";

export function DataFreshnessBar() {
  const { data: imerg } = useImerg();
  const { data: flood } = useFlood();
  const { data: huayco } = useHuayco();

  const items: { label: string; at: string | undefined }[] = [
    { label: "IMERG", at: imerg?.retrieved_at },
    { label: "SAR", at: flood?.retrieved_at },
    { label: "Huayco", at: huayco?.retrieved_at },
  ];

  return (
    <div
      className="hidden sm:flex absolute bottom-4 left-1/2 -translate-x-1/2 z-10 items-center gap-3 px-3 py-1.5 bg-surface-base/80 backdrop-blur-sm border border-slate-700 rounded-full text-xs text-slate-400 pointer-events-none"
      aria-label="Datos actualizados"
    >
      {items.map(({ label, at }) => (
        <span key={label} className="flex items-center gap-1">
          <span className="text-slate-500">{label}</span>
          <span className="text-slate-300">{timeAgo(at)}</span>
        </span>
      ))}
    </div>
  );
}
