"use client";

import { AlertTriangle, Waves, Users, ChevronRight, Zap } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useAlerts, useFloodExposure, useDistrictRiskSummary } from "@/lib/queries";
import { clsx } from "clsx";

const LEVEL_CFG = {
  EMERGENCIA: {
    badge: "bg-severity-critical text-white",
    border: "border-severity-critical/60",
    bg: "bg-severity-critical/15",
    dot: "bg-severity-critical animate-pulse",
    label: { es: "EMERGENCIA", en: "EMERGENCY" },
  },
  ALERTA: {
    badge: "bg-severity-high text-white",
    border: "border-severity-high/50",
    bg: "bg-severity-high/10",
    dot: "bg-severity-high animate-pulse",
    label: { es: "ALERTA", en: "ALERT" },
  },
  AVISO: {
    badge: "bg-severity-medium text-white",
    border: "border-severity-medium/40",
    bg: "bg-severity-medium/10",
    dot: "bg-severity-medium",
    label: { es: "AVISO", en: "NOTICE" },
  },
  NORMAL: {
    badge: "bg-severity-low text-white",
    border: "border-severity-low/40",
    bg: "bg-severity-low/10",
    dot: "bg-severity-low",
    label: { es: "NORMAL", en: "NORMAL" },
  },
};

type Level = keyof typeof LEVEL_CFG;

export function SituationBrief() {
  const { activePanel, setActivePanel, scenario, locale } = useUIStore();
  const { data: alerts = [] } = useAlerts();
  const { data: exposure } = useFloodExposure();
  const { data: summary } = useDistrictRiskSummary();

  if (activePanel !== "map" || scenario.districtUbigeo) return null;

  const active = alerts.filter((a) => a.status === "active");
  const critical = active.filter((a) => a.severity === "critical").length;
  const high = active.filter((a) => a.severity === "high").length;

  const level: Level =
    critical > 0 ? "EMERGENCIA"
    : high > 1 || active.length > 4 ? "ALERTA"
    : active.length > 0 ? "AVISO"
    : "NORMAL";

  const cfg = LEVEL_CFG[level];

  const floodKm2 = exposure?.districts.reduce((s, d) => s + d.overlap_km2, 0) ?? 0;
  const affectedPop = exposure?.total_affected_population ?? 0;

  const topDistrict = summary?.features
    .filter((f) => f.properties.risk_level !== "bajo")
    .sort((a, b) => {
      const o = { alto: 2, moderado: 1, bajo: 0 };
      return o[b.properties.risk_level] - o[a.properties.risk_level];
    })[0];

  const bullets: { icon: React.ReactNode; text: string }[] = [];

  if (active.length > 0) {
    bullets.push({
      icon: <AlertTriangle size={10} className="text-severity-critical shrink-0 mt-px" />,
      text: locale === "es"
        ? `${active.length} alerta${active.length !== 1 ? "s" : ""} activa${active.length !== 1 ? "s" : ""}${critical > 0 ? ` · ${critical} crítica${critical !== 1 ? "s" : ""}` : ""}`
        : `${active.length} active alert${active.length !== 1 ? "s" : ""}${critical > 0 ? ` · ${critical} critical` : ""}`,
    });
  }

  if (floodKm2 > 0) {
    bullets.push({
      icon: <Waves size={10} className="text-costa-400 shrink-0 mt-px" />,
      text: locale === "es"
        ? `${floodKm2.toFixed(1)} km² inundados (SAR Sentinel-1)`
        : `${floodKm2.toFixed(1)} km² flooded (SAR Sentinel-1)`,
    });
  }

  if (affectedPop > 0) {
    bullets.push({
      icon: <Users size={10} className="text-sand-300 shrink-0 mt-px" />,
      text: locale === "es"
        ? `~${affectedPop >= 1000 ? `${(affectedPop / 1000).toFixed(0)}k` : affectedPop} personas en zona de riesgo`
        : `~${affectedPop >= 1000 ? `${(affectedPop / 1000).toFixed(0)}k` : affectedPop} people in risk zones`,
    });
  }

  return (
    <div
      className={clsx(
        // Mobile-only — desktop uses OperationalHUD as canonical situational surface
        "absolute bottom-20 right-3 z-10 sm:hidden",
        "w-64 rounded-xl border shadow-xl backdrop-blur-md text-xs panel-animate",
        "bg-surface-base/88",
        cfg.border,
      )}
      role="status"
      aria-label={locale === "es" ? "Resumen de situación" : "Situation brief"}
    >
      {/* Header */}
      <div className={clsx("flex items-center gap-2 px-3 py-2 rounded-t-xl border-b border-white/10", cfg.bg)}>
        <span className={clsx("w-2 h-2 rounded-full shrink-0", cfg.dot)} aria-hidden="true" />
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Zap size={10} className="shrink-0 opacity-70" aria-hidden="true" />
          <span className="text-[10px] text-slate-300 font-medium uppercase tracking-wide truncate">
            {locale === "es" ? "Situación actual" : "Current situation"}
          </span>
        </div>
        <span className={clsx("font-display text-[11px] font-bold tracking-ops px-1.5 py-0.5 rounded-full shrink-0 leading-none", cfg.badge)}>
          {cfg.label[locale]}
        </span>
      </div>

      {/* Bullets */}
      {bullets.length > 0 ? (
        <ul className="px-3 py-2.5 space-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-1.5 text-slate-300">
              {b.icon}
              <span className="leading-snug">{b.text}</span>
            </li>
          ))}
          {topDistrict && (
            <li className="pt-1.5 mt-0.5 border-t border-slate-700/50 text-slate-400 leading-snug">
              {locale === "es"
                ? `Prioridad 1: ${topDistrict.properties.name}`
                : `Priority 1: ${topDistrict.properties.name}`}
            </li>
          )}
        </ul>
      ) : (
        <p className="px-3 py-3 text-slate-400">
          {locale === "es" ? "Sin alertas activas." : "No active alerts."}
        </p>
      )}

      {/* Actions */}
      <div className="flex border-t border-slate-700/60 rounded-b-xl overflow-hidden">
        <button
          onClick={() => setActivePanel("alerts")}
          className="flex-1 flex items-center justify-center gap-1 py-2 text-[10px] text-slate-300 hover:bg-surface-panel hover:text-white transition-colors"
          aria-label={locale === "es" ? "Ver panel de alertas" : "Open alerts panel"}
        >
          <AlertTriangle size={10} />
          {locale === "es" ? "Alertas" : "Alerts"}
          <ChevronRight size={9} className="opacity-40" />
        </button>
        <div className="w-px bg-slate-700/60" />
        <button
          onClick={() => setActivePanel("ask")}
          className="flex-1 flex items-center justify-center gap-1 py-2 text-[10px] text-slate-300 hover:bg-surface-panel hover:text-white transition-colors"
          aria-label={locale === "es" ? "Abrir copiloto" : "Open copilot"}
        >
          <span className="font-display text-costa-300 text-[10px] font-bold tracking-ops">AI</span>
          {locale === "es" ? "Copiloto" : "Copilot"}
          <ChevronRight size={9} className="opacity-40" />
        </button>
      </div>
    </div>
  );
}
