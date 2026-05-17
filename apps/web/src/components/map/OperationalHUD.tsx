"use client";

import { useEffect, useState } from "react";
import { useUIStore } from "@/store/ui";
import { useAlerts, useFloodExposure, useApiHealth, useSocialSignals } from "@/lib/queries";
import { clsx } from "clsx";

function limaTime(): string {
  return new Date().toLocaleTimeString("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

type SinagerdLevel = "EMERGENCIA" | "ALERTA" | "AVISO" | "NORMAL";

function deriveSinagerdLevel(
  criticalCount: number,
  highCount: number,
  activeCount: number,
): SinagerdLevel {
  if (criticalCount > 0) return "EMERGENCIA";
  if (highCount > 1 || activeCount > 4) return "ALERTA";
  if (activeCount > 0) return "AVISO";
  return "NORMAL";
}

const LEVEL_CONFIG: Record<SinagerdLevel, { dot: string; badge: string; text: string }> = {
  EMERGENCIA: {
    dot: "bg-red-500 animate-pulse",
    badge: "bg-red-900/50 border-red-500/70 text-red-300",
    text: "text-red-300",
  },
  ALERTA: {
    dot: "bg-orange-400 animate-pulse",
    badge: "bg-orange-900/40 border-orange-500/60 text-orange-300",
    text: "text-orange-300",
  },
  AVISO: {
    dot: "bg-yellow-400",
    badge: "bg-yellow-900/30 border-yellow-600/50 text-yellow-300",
    text: "text-yellow-300",
  },
  NORMAL: {
    dot: "bg-green-400",
    badge: "bg-green-900/20 border-green-700/40 text-green-400",
    text: "text-green-400",
  },
};

export function OperationalHUD() {
  const { locale, scenario } = useUIStore();
  const { data: alerts = [] } = useAlerts();
  const { data: exposure } = useFloodExposure();
  const { data: health, isError: apiDown } = useApiHealth();
  const { data: socialData } = useSocialSignals(48);

  const [clock, setClock] = useState(limaTime);
  useEffect(() => {
    const id = setInterval(() => setClock(limaTime()), 1000);
    return () => clearInterval(id);
  }, []);

  const active = alerts.filter((a) => a.status === "active");
  const critical = active.filter((a) => a.severity === "critical").length;
  const high = active.filter((a) => a.severity === "high").length;
  const level = deriveSinagerdLevel(critical, high, active.length);
  const cfg = LEVEL_CONFIG[level];

  const floodKm2 = exposure?.districts.reduce((s, d) => s + d.overlap_km2, 0) ?? 0;
  const affectedPop = exposure?.total_affected_population ?? 0;
  const urgentSocial = socialData?.features.filter(
    (f) => f.properties.triage_label === "needs_help" || f.properties.triage_label === "road_blocked",
  ).length ?? 0;

  const online = health?.status === "ok" && !apiDown;

  const levelLabel = locale === "es"
    ? { EMERGENCIA: "EMERGENCIA", ALERTA: "ALERTA", AVISO: "AVISO", NORMAL: "NORMAL" }[level]
    : { EMERGENCIA: "EMERGENCY", ALERTA: "ALERT", AVISO: "NOTICE", NORMAL: "NORMAL" }[level];

  return (
    <div
      className={[
        "absolute top-[70px] left-1/2 -translate-x-1/2 z-10",
        "hidden sm:flex items-center gap-0 rounded-xl",
        "bg-surface-base/85 backdrop-blur-md shadow-xl",
        "text-xs font-mono transition-all duration-500",
        level === "EMERGENCIA"
          ? "border border-red-500/50 emergency-glow"
          : level === "ALERTA"
          ? "border border-orange-500/40"
          : "border border-slate-700/80",
      ].join(" ")}
      role="status"
      aria-label="Estado operacional SINAGERD"
    >
      {/* SINAGERD level badge */}
      <div
        className={clsx(
          "flex items-center gap-1.5 px-3 py-2 rounded-l-xl border-r border-slate-700/60",
          cfg.badge,
        )}
      >
        <span className={clsx("inline-block w-2 h-2 rounded-full shrink-0", cfg.dot)} aria-hidden="true" />
        <span className="font-bold tracking-wider text-[11px]">{levelLabel}</span>
      </div>

      {/* Metric: active alerts */}
      <div className="flex items-center gap-1 px-3 py-2 border-r border-slate-700/60">
        <span className="text-slate-400">{locale === "es" ? "Alertas" : "Alerts"}</span>
        <span className={clsx("font-semibold ml-1", active.length > 0 ? cfg.text : "text-slate-400")}>
          {active.length}
        </span>
        {critical > 0 && (
          <span className="ml-0.5 text-[9px] bg-red-800/60 text-red-300 px-1 rounded">
            {critical} crít.
          </span>
        )}
      </div>

      {/* Metric: flood area */}
      {floodKm2 > 0 && (
        <div className="flex items-center gap-1 px-3 py-2 border-r border-slate-700/60">
          <span className="text-slate-400">SAR</span>
          <span className="text-blue-300 font-semibold ml-1">{floodKm2.toFixed(1)} km²</span>
        </div>
      )}

      {/* Metric: affected population */}
      {affectedPop > 0 && (
        <div className="flex items-center gap-1 px-3 py-2 border-r border-slate-700/60">
          <span className="text-slate-400">{locale === "es" ? "Pob." : "Pop."}</span>
          <span className="text-purple-300 font-semibold ml-1">
            ~{affectedPop >= 1000 ? `${(affectedPop / 1000).toFixed(0)}k` : affectedPop}
          </span>
        </div>
      )}

      {/* Metric: urgent social signals (3h) */}
      {urgentSocial > 0 && (
        <div className="flex items-center gap-1 px-3 py-2 border-r border-slate-700/60">
          <span className="text-slate-400">{locale === "es" ? "Social" : "Social"}</span>
          <span className="text-orange-300 font-semibold ml-1">{urgentSocial}</span>
        </div>
      )}

      {/* Replay mode badge */}
      {scenario.isReplayMode && (
        <div className="flex items-center gap-1 px-3 py-2 border-r border-slate-700/60">
          <span className="text-[10px] bg-amber-600/40 text-amber-300 border border-amber-600/50 px-1.5 py-0.5 rounded-full">
            REPLAY {scenario.replayDate ?? "2017"}
          </span>
        </div>
      )}

      {/* Lima clock */}
      <div className="flex items-center gap-1 px-3 py-2">
        <span className="text-slate-500">Lima</span>
        <span className="text-slate-300 tabular-nums">{clock}</span>
        {!online && (
          <span className="ml-1.5 text-[9px] bg-slate-700 text-slate-400 border border-slate-600 px-1 rounded" aria-label="API offline">
            DEMO
          </span>
        )}
      </div>
    </div>
  );
}
