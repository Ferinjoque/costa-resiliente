"use client";

import { useImerg, useFlood, useHuayco, useApiHealth } from "@/lib/queries";
import { useUIStore } from "@/store/ui";
import { timeAgo } from "@/lib/utils";
import { clsx } from "clsx";

export function DataFreshnessBar() {
  const { data: imerg } = useImerg();
  const { data: flood } = useFlood();
  const { data: huayco } = useHuayco();
  const { data: health, isError: apiDown, isFetching } = useApiHealth();
  const { locale } = useUIStore();

  const items: { label: string; at: string | undefined }[] = [
    { label: "IMERG", at: imerg?.data_updated_at ?? imerg?.retrieved_at },
    { label: "SAR",   at: flood?.data_updated_at  ?? flood?.retrieved_at  },
    { label: "Huayco",at: huayco?.data_updated_at ?? huayco?.retrieved_at },
  ];

  const online = health?.status === "ok" && !apiDown;

  return (
    <div
      className={[
        "flex items-center gap-3 px-3 py-1.5",
        "bg-surface-base/80 backdrop-blur-sm border border-slate-700",
        "text-xs text-slate-400 pointer-events-none",
        "fixed bottom-14 left-1/2 -translate-x-1/2 rounded-full z-10 whitespace-nowrap",
        "sm:absolute sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2 sm:rounded-full",
      ].join(" ")}
      aria-label="Estado del sistema y actualización de datos"
      role="status"
    >
      {/* Connection dot */}
      <span className="flex items-center gap-1">
        <span
          className={clsx(
            "inline-block w-1.5 h-1.5 rounded-full",
            isFetching ? "bg-yellow-400 animate-pulse" :
            online ? "bg-green-400" : "bg-red-500"
          )}
          aria-hidden="true"
        />
        <span className={online ? "text-green-400" : apiDown ? "text-red-400" : "text-slate-400"}>
          {isFetching ? "…" : online
            ? (locale === "en" ? "ONLINE" : "EN LÍNEA")
            : (locale === "en" ? "OFFLINE" : "DESCONECTADO")}
        </span>
      </span>

      <span className="text-slate-600" aria-hidden="true">·</span>

      {online && items.map(({ label, at }) => (
        <span key={label} className="flex items-center gap-1">
          <span className="text-slate-400">{label}</span>
          <span className="text-slate-300">{timeAgo(at)}</span>
        </span>
      ))}
    </div>
  );
}
