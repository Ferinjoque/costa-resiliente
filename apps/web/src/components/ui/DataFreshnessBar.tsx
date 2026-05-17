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
  const { locale, scenario } = useUIStore();

  const items: { label: string; at: string | undefined }[] = [
    { label: "IMERG", at: imerg?.data_updated_at ?? imerg?.retrieved_at },
    { label: "SAR",   at: flood?.data_updated_at  ?? flood?.retrieved_at  },
    { label: "Huayco",at: huayco?.data_updated_at ?? huayco?.retrieved_at },
  ];

  const online = health?.status === "ok" && !apiDown;
  const isDemo = !online;
  const isReplay = scenario.isReplayMode;

  return (
    <div
      className={[
        "flex items-center gap-2 px-3 py-1.5",
        "bg-surface-base/80 backdrop-blur-sm border border-slate-700",
        "text-xs text-slate-400 pointer-events-none",
        "fixed bottom-14 left-1/2 -translate-x-1/2 rounded-full z-10 whitespace-nowrap",
        "sm:absolute sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2 sm:rounded-full",
      ].join(" ")}
      aria-label="Estado del sistema y actualización de datos"
      role="status"
    >
      {/* Connection / mode indicator */}
      <span className="flex items-center gap-1">
        <span
          className={clsx(
            "inline-block w-1.5 h-1.5 rounded-full",
            isFetching ? "bg-yellow-400 animate-pulse" :
            isReplay ? "bg-amber-400" :
            online ? "bg-green-400 animate-pulse" : "bg-slate-500"
          )}
          aria-hidden="true"
        />
        <span className={clsx(
          isFetching ? "text-yellow-400" :
          isReplay ? "text-amber-400" :
          online ? "text-green-400" : "text-slate-500"
        )}>
          {isFetching ? "…" :
           isReplay ? `REPLAY ${scenario.replayDate?.slice(0, 7) ?? "2017"}` :
           online ? (locale === "en" ? "LIVE" : "EN VIVO") :
           "DEMO"}
        </span>
      </span>

      {/* Data freshness items — show in live mode and demo mode */}
      {items.map(({ label, at }) => (
        <span key={label} className="flex items-center gap-1">
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="text-slate-500">{label}</span>
          <span className="text-slate-400">{timeAgo(at)}</span>
        </span>
      ))}

      {/* Demo mode source hint */}
      {isDemo && !isReplay && (
        <span className="flex items-center gap-1 text-slate-500">
          <span className="text-slate-700" aria-hidden="true">·</span>
          <span>{locale === "en" ? "El Niño 2017 scenario" : "Escenario El Niño 2017"}</span>
        </span>
      )}
    </div>
  );
}
