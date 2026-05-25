"use client";

import { X } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useFusion } from "@/lib/queries";
import { Button, Pill, Divider } from "@/components/ui/primitives";

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
    fullAnalysis: "Análisis completo",
    close: "Cerrar",
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
    fullAnalysis: "Full analysis",
    close: "Close",
  },
};

function riskPillVariant(riskKey: string): "danger" | "warn" | "ok" {
  if (riskKey === "alto") return "danger";
  if (riskKey === "moderado") return "warn";
  return "ok";
}

export function FusionCallout() {
  const { scenario, setScenario, setActivePanel, activePanel, locale } = useUIStore();
  const { data, isLoading, isError } = useFusion(scenario.districtUbigeo);
  const t = T[locale];

  if (!scenario.districtUbigeo || activePanel === "dashboard") return null;

  const dismiss = () =>
    setScenario({ districtUbigeo: null, districtName: null });

  const riskKey = data?.risk_level ?? "bajo";

  return (
    <aside
      className="absolute top-14 right-4 z-20 w-[260px] bg-surface border border-border-strong rounded-2xl shadow-panel overflow-hidden panel-animate sm:top-4 sm:right-auto sm:left-[296px]"
      role="status"
      aria-live="polite"
      aria-label={t.title}
    >
      {/* Header */}
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-ink truncate flex-1">
          {scenario.districtName ?? "Distrito"}
        </span>
        {data && (
          <Pill variant={riskPillVariant(riskKey)}>
            {t.riskLabels[riskKey as keyof typeof t.riskLabels]}
          </Pill>
        )}
        <Button
          variant="ghost"
          size="xs"
          onClick={dismiss}
          aria-label={t.close}
          className="shrink-0 -mr-1"
        >
          <X size={12} />
        </Button>
      </header>

      {/* Body */}
      <div className="px-4 py-3">
        {isLoading && (
          <p className="text-xs text-ink-muted">{t.loading}</p>
        )}

        {!isLoading && isError && (
          <p className="text-xs text-danger">{locale === "es" ? "No se pudo cargar el análisis" : "Could not load analysis"}</p>
        )}

        {data && (
          <>
            {/* Data rows — section 1: population */}
            {data.district.population != null && (
              <FRow label={t.population} value={t.people(data.district.population)} />
            )}

            <Divider className="my-2" />

            {/* Data rows — section 2: hazards */}
            <FRow
              label={t.flood}
              value={
                data.flood.active_polygon_count > 0
                  ? `${t.polygons(data.flood.active_polygon_count)} · ${t.km2(data.flood.overlap_km2)}`
                  : t.noData
              }
              dim={data.flood.active_polygon_count === 0}
            />
            <FRow
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
            <FRow
              label={t.social}
              value={
                data.social.total_signals_3h > 0
                  ? t.signals(data.social.urgent_signals_3h, data.social.total_signals_3h)
                  : t.noData
              }
              dim={data.social.total_signals_3h === 0}
            />

            <Divider className="my-2" />

            {/* Prose */}
            <p className="text-xs text-ink-muted leading-relaxed italic">
              {locale === "en" && data.prose_en ? data.prose_en : data.prose_es}
            </p>

            {/* Full analysis link */}
            <button
              onClick={() => setActivePanel("dashboard")}
              className="mt-2 text-xs text-accent hover:underline"
              aria-label={locale === "es" ? "Ver análisis detallado en el panel de datos" : "Open detailed analysis panel"}
            >
              {t.fullAnalysis} →
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

function FRow({
  label,
  value,
  dim = false,
}: {
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div className={`flex items-baseline gap-2 py-0.5 ${dim ? "opacity-50" : ""}`}>
      <span className="text-xs text-ink-subtle w-24 shrink-0">{label}</span>
      <span className="text-sm text-ink font-medium tabular-nums leading-snug">{value}</span>
    </div>
  );
}
