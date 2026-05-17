"use client";

import { AlertTriangle, Waves, Mountain, MessageSquare, X, BarChart3 } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useFusion } from "@/lib/queries";
import { clsx } from "clsx";

const RISK_COLOR: Record<string, string> = {
  alto:     "border-red-500/50 bg-red-900/20 text-red-200",
  moderado: "border-amber-500/50 bg-amber-900/20 text-amber-200",
  bajo:     "border-green-600/40 bg-green-900/15 text-green-200",
};

const RISK_BADGE: Record<string, string> = {
  alto:     "bg-red-600 text-white",
  moderado: "bg-amber-600 text-white",
  bajo:     "bg-green-700 text-white",
};

const RISK_ICON: Record<string, string> = {
  alto: "🔴", moderado: "🟡", bajo: "🟢",
};

const T = {
  es: {
    title: "Análisis de riesgos",
    flood: "Inundación SAR",
    huayco: "Riesgo huayco",
    social: "Señales sociales",
    population: "Población",
    noData: "Sin datos activos",
    loading: "Calculando…",
    polygons: (n: number) => `${n} polígono${n !== 1 ? "s" : ""} activo${n !== 1 ? "s" : ""}`,
    km2: (v: number) => `${v.toFixed(1)} km²`,
    prob: (v: number) => `${(v * 100).toFixed(0)}%`,
    signals: (u: number, t: number) => `${u} urgente${u !== 1 ? "s" : ""} / ${t} total`,
    people: (n: number) => `~${n.toLocaleString("es-PE")} hab.`,
    riskLabels: { alto: "ALTO", moderado: "MODERADO", bajo: "BAJO" },
    huaycoLevels: { low: "Bajo", moderate: "Moderado", high: "Alto", very_high: "Muy alto" },
  },
  en: {
    title: "Risk analysis",
    flood: "SAR Flood",
    huayco: "Huayco risk",
    social: "Social signals",
    population: "Population",
    noData: "No active data",
    loading: "Computing…",
    polygons: (n: number) => `${n} active polygon${n !== 1 ? "s" : ""}`,
    km2: (v: number) => `${v.toFixed(1)} km²`,
    prob: (v: number) => `${(v * 100).toFixed(0)}%`,
    signals: (u: number, to: number) => `${u} urgent / ${to} total`,
    people: (n: number) => `~${n.toLocaleString("en-US")} pop.`,
    riskLabels: { alto: "HIGH", moderado: "MODERATE", bajo: "LOW" },
    huaycoLevels: { low: "Low", moderate: "Moderate", high: "High", very_high: "Very high" },
  },
};

export function FusionCallout() {
  const { scenario, setScenario, setActivePanel, locale } = useUIStore();
  const { data, isLoading } = useFusion(scenario.districtUbigeo);
  const t = T[locale];

  if (!scenario.districtUbigeo) return null;

  const dismiss = () =>
    setScenario({ districtUbigeo: null, districtName: null });

  const riskKey = data?.risk_level ?? "bajo";
  const colorClass = RISK_COLOR[riskKey] ?? RISK_COLOR.bajo;
  const badgeClass = RISK_BADGE[riskKey] ?? RISK_BADGE.bajo;

  return (
    <div
      className={clsx(
        "absolute bottom-6 left-2 sm:bottom-8 sm:left-4 z-20",
        "w-72 rounded-xl border shadow-xl text-xs backdrop-blur-sm panel-animate",
        colorClass,
      )}
      role="status"
      aria-live="polite"
      aria-label={t.title}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 border-b border-white/10">
        <div className="flex items-center gap-2 font-semibold text-[13px]">
          <AlertTriangle size={13} aria-hidden="true" />
          <span>{scenario.districtName ?? "Distrito"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {data && (
            <span className={clsx("text-[10px] font-bold px-1.5 py-0.5 rounded-full", badgeClass)}>
              {RISK_ICON[riskKey]} {t.riskLabels[riskKey as keyof typeof t.riskLabels]}
            </span>
          )}
          <button
            onClick={dismiss}
            aria-label="Cerrar"
            className="p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 flex flex-col gap-2">
        {isLoading && (
          <span className="text-slate-400">{t.loading}</span>
        )}

        {data && (
          <>
            {/* Population */}
            {data.district.population != null && (
              <Row icon="👥" label={t.population} value={t.people(data.district.population)} />
            )}

            {/* Flood */}
            <Row
              icon={<Waves size={11} />}
              label={t.flood}
              value={
                data.flood.active_polygon_count > 0
                  ? `${t.polygons(data.flood.active_polygon_count)} · ${t.km2(data.flood.overlap_km2)}`
                  : t.noData
              }
              dim={data.flood.active_polygon_count === 0}
            />

            {/* Huayco */}
            <Row
              icon={<Mountain size={11} />}
              label={t.huayco}
              value={
                data.huayco.highest_risk_level
                  ? `${t.huaycoLevels[data.huayco.highest_risk_level as keyof typeof t.huaycoLevels] ?? data.huayco.highest_risk_level}` +
                    (data.huayco.highest_probability != null
                      ? ` (${t.prob(data.huayco.highest_probability)})`
                      : "") +
                    (data.huayco.quebrada_name ? ` · ${data.huayco.quebrada_name}` : "")
                  : t.noData
              }
              dim={!data.huayco.highest_risk_level}
            />

            {/* Social */}
            <Row
              icon={<MessageSquare size={11} />}
              label={t.social}
              value={
                data.social.total_signals_3h > 0
                  ? t.signals(data.social.urgent_signals_3h, data.social.total_signals_3h)
                  : t.noData
              }
              dim={data.social.total_signals_3h === 0}
            />

            {/* Prose summary */}
            <p className="text-[10px] leading-snug opacity-70 pt-1 border-t border-white/10">
              {data.prose_es}
            </p>

            {/* Open dashboard link */}
            <button
              onClick={() => setActivePanel("dashboard")}
              className="mt-1 flex items-center gap-1 text-[10px] opacity-60 hover:opacity-100 transition-opacity underline underline-offset-2"
              aria-label="Ver análisis detallado en el panel de datos"
            >
              <BarChart3 size={9} aria-hidden="true" />
              {locale === "es" ? "Ver análisis completo" : "Full analysis"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  dim = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div className={clsx("flex items-start gap-2", dim && "opacity-50")}>
      <span className="shrink-0 mt-px opacity-70">{icon}</span>
      <span className="text-current/70 shrink-0">{label}:</span>
      <span className="font-medium break-words">{value}</span>
    </div>
  );
}
