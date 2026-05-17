"use client";

import {
  BarChart3, Droplets, AlertTriangle, Users, History, Radio,
  TrendingUp, Waves, Brain, CheckCircle2, Copy, Check,
} from "lucide-react";
import { useState } from "react";
import { useUIStore } from "@/store/ui";
import {
  useDistrictDashboard, useDistrictRiskSummary, useAlerts,
  useFloodExposure, useFusion, useDecisionLog, useSocialSignals,
} from "@/lib/queries";
import { clsx } from "clsx";
import type { AlertTrendDay, SocialBreakdown } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import {
  DEMO_FORECAST, HUAYCO_THRESHOLD_MM, DEMO_RESOURCES,
  type ForecastStep, type ResourceCategory,
} from "@/lib/demoData";
import {
  SEVERITY_CRITICAL, SEVERITY_HIGH, SEVERITY_MEDIUM, SEVERITY_LOW,
  COSTA_300, COSTA_400,
} from "@/lib/colors";
import {
  Panel, PanelHeader, PanelTitle, SectionLabel,
  Button, Badge, Divider, EmptyState,
} from "@/components/ui/primitives";

// ANA alert thresholds per station code (meters)
const STATION_THRESHOLDS: Record<string, number> = {
  "ANA-CHOSICA":        2.0,
  "ANA-CHACLACAYO":     1.5,
  "ANA-PUENTE-ANGELES": 1.7,
  "ANA-CARABAYLLO":     2.5,
  "ANA-HUACHIPA":       1.8,
};

// ─── Sparkline SVG ────────────────────────────────────────────────────────────

function Sparkline({
  values,
  color = COSTA_300,
  height = 32,
}: {
  values: number[];
  color?: string;
  height?: number;
}) {
  if (values.length < 2) return null;
  const w = 120;
  const max = Math.max(...values, 0.01);
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = height - (v / max) * height;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={`0,${height} ${pts} ${w},${height}`}
        fill={color}
        fillOpacity={0.12}
        stroke="none"
      />
    </svg>
  );
}

// ─── Mini bar chart ───────────────────────────────────────────────────────────

function BarMini({ days }: { days: AlertTrendDay[] }) {
  if (!days.length) return null;
  const buckets: Record<string, { critical: number; high: number; medium: number; low: number }> = {};
  for (const d of days) {
    if (!buckets[d.day]) buckets[d.day] = { critical: 0, high: 0, medium: 0, low: 0 };
    const sev = d.severity as keyof typeof buckets[string];
    if (sev in buckets[d.day]) buckets[d.day][sev] += d.count;
  }
  const entries = Object.entries(buckets).slice(-7);
  const maxTotal = Math.max(...entries.map(([, v]) => v.critical + v.high + v.medium + v.low), 1);
  const SEV_COLOR = { critical: SEVERITY_CRITICAL, high: SEVERITY_HIGH, medium: SEVERITY_MEDIUM, low: COSTA_400 };
  const w = 120;
  const bw = Math.floor(w / entries.length) - 2;

  return (
    <svg width={w} height={32} viewBox={`0 0 ${w} 32`} aria-hidden="true">
      {entries.map(([, v], i) => {
        let y = 32;
        return (
          <g key={i}>
            {(["critical", "high", "medium", "low"] as const).map((sev) => {
              const h = (v[sev] / maxTotal) * 32;
              y -= h;
              return h > 0 ? (
                <rect
                  key={sev}
                  x={i * (bw + 2)}
                  y={y}
                  width={bw}
                  height={h}
                  fill={SEV_COLOR[sev]}
                  rx={1}
                />
              ) : null;
            })}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Social pill ──────────────────────────────────────────────────────────────

const LABEL_TEXT: Record<string, { es: string; en: string }> = {
  needs_help:            { es: "Ayuda",           en: "Needs help" },
  infrastructure_damage: { es: "Infraestructura", en: "Infra damage" },
  road_blocked:          { es: "Vía bloqueada",   en: "Road blocked" },
  weather_observation:   { es: "Meteorología",    en: "Weather" },
};

const LABEL_PILL_CLS: Record<string, string> = {
  needs_help:            "bg-danger-soft text-danger",
  infrastructure_damage: "bg-warn-soft text-warn-muted",
  road_blocked:          "bg-warn-soft text-warn-muted",
  weather_observation:   "bg-accent-soft text-accent",
};

function SocialPill({ item, locale }: { item: SocialBreakdown; locale: Locale }) {
  const label = LABEL_TEXT[item.label]?.[locale] ?? item.label.replace(/_/g, " ");
  const cls = LABEL_PILL_CLS[item.label] ?? "bg-surface-sunken text-ink-muted";
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", cls)}>
      {label}
      <span className="font-semibold">{item.count}</span>
    </span>
  );
}

// ─── EDAN report generator ────────────────────────────────────────────────────

function EDANReportButton() {
  const { locale } = useUIStore();
  const tr = useT(locale);
  const [copied, setCopied] = useState(false);
  const { data: alerts = [] } = useAlerts();
  const { data: exposure } = useFloodExposure();
  const { data: summary } = useDistrictRiskSummary();

  function buildReport(): string {
    const locale_tag = locale === "en" ? "en-US" : "es-PE";
    const now = new Date().toLocaleString(locale_tag, { timeZone: "America/Lima" });
    const active = alerts.filter((a) => a.status === "active");
    const critical = active.filter((a) => a.severity === "critical");
    const high = active.filter((a) => a.severity === "high");
    const floodArea = exposure?.districts.reduce((s, d) => s + d.overlap_km2, 0) ?? 0;
    const affectedPop = exposure?.total_affected_population ?? 0;
    const highRiskDistricts = summary?.features
      .filter((f) => f.properties.risk_level === "alto")
      .map((f) => f.properties.name).join(", ") ?? "—";

    const level = critical.length > 0 ? "EMERGENCIA" : high.length > 1 ? "ALERTA" : active.length > 0 ? "AVISO" : "NORMAL";

    const RULE = "═══════════════════════════════════════════";
    const RULE_THIN = "─────────────────────────────────────────────";
    const popFormatted = `${affectedPop > 1000 ? (affectedPop / 1000).toFixed(0) + "k" : affectedPop}`;

    const lines = locale === "en" ? [
      RULE,
      "SITUATION REPORT — COSTA RESILIENTE",
      `Date / Time: ${now} (Lima, Peru)`,
      `SINAGERD level: ${level}`,
      "Generated by: Costa Resiliente platform",
      RULE,
      "",
      "1. EXECUTIVE SUMMARY",
      `   Active alerts:        ${active.length} (${critical.length} critical, ${high.length} high)`,
      `   SAR flooded area:     ${floodArea.toFixed(1)} km²`,
      `   Pop. at risk (est.):  ~${popFormatted} inhabitants`,
      `   High-risk districts:  ${highRiskDistricts || "None"}`,
      "",
      "2. ACTIVE ALERTS",
      ...active.slice(0, 5).map((a, i) =>
        `   ${i + 1}. [${a.severity.toUpperCase()}] ${a.title}${a.description ? "\n      " + a.description : ""}`
      ),
      active.length > 5 ? `   ... and ${active.length - 5} more alerts` : "",
      "",
      "3. DATA SOURCES",
      "   • SAR: Sentinel-1 (Microsoft Planetary Computer)",
      "   • Rainfall: NASA IMERG Early Run v07B",
      "   • Hydrology: ANA Observatorio Chirilu + SENAMHI",
      "   • Social: Bluesky + RSS + Reddit + Telegram",
      "",
      RULE_THIN,
      "FOR OFFICIAL USE — EDAN-PERÚ FORM",
      "System: Costa Resiliente v1.0 (IEEE Response Quest 2026)",
      RULE,
    ] : [
      RULE,
      "REPORTE DE SITUACIÓN — COSTA RESILIENTE",
      `Fecha/Hora: ${now} (Lima, Perú)`,
      `Nivel SINAGERD: ${level}`,
      "Generado por: Plataforma Costa Resiliente",
      RULE,
      "",
      "1. RESUMEN EJECUTIVO",
      `   Alertas activas:    ${active.length} (${critical.length} críticas, ${high.length} altas)`,
      `   Área inundada SAR:  ${floodArea.toFixed(1)} km²`,
      `   Pob. en riesgo est: ~${popFormatted} habitantes`,
      `   Distritos riesgo alto: ${highRiskDistricts || "Ninguno"}`,
      "",
      "2. ALERTAS ACTIVAS",
      ...active.slice(0, 5).map((a, i) =>
        `   ${i + 1}. [${a.severity.toUpperCase()}] ${a.title}${a.description ? "\n      " + a.description : ""}`
      ),
      active.length > 5 ? `   ... y ${active.length - 5} alertas más` : "",
      "",
      "3. DATOS DE FUENTES",
      "   • SAR: Sentinel-1 (Microsoft Planetary Computer)",
      "   • Lluvia: NASA IMERG Early Run v07B",
      "   • Hidrología: ANA Observatorio Chirilu + SENAMHI",
      "   • Social: Bluesky + RSS + Reddit + Telegram",
      "",
      RULE_THIN,
      "PARA USO OFICIAL — FORMULARIO EDAN-PERÚ",
      "Sistema: Costa Resiliente v1.0 (IEEE Response Quest 2026)",
      RULE,
    ];

    return lines.filter((l) => l !== "").join("\n");
  }

  async function handleCopy() {
    const report = buildReport();
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <button
      onClick={handleCopy}
      className="text-xs text-ink-subtle hover:text-accent flex items-center gap-1.5 transition-colors"
      aria-label={locale === "es" ? "Copiar reporte EDAN-Perú al portapapeles" : "Copy EDAN-Peru report to clipboard"}
      title={locale === "es" ? "Generar reporte EDAN-Perú" : "Generate EDAN-Peru report"}
    >
      {copied
        ? <Check size={13} className="text-accent" />
        : <Copy size={13} />}
      {copied ? tr("dashboard", "edanCopied") : tr("dashboard", "edan")}
    </button>
  );
}

// ─── Situation summary banner ─────────────────────────────────────────────────

function SituationSummary() {
  const { locale } = useUIStore();
  const { data: alerts = [] } = useAlerts();
  const { data: exposure } = useFloodExposure();
  const { data: summary } = useDistrictRiskSummary();

  const activeAlerts = alerts.filter((a) => a.status === "active");
  const criticalAlerts = activeAlerts.filter((a) => a.severity === "critical");
  const highAlerts = activeAlerts.filter((a) => a.severity === "high");
  const affectedPop = exposure?.total_affected_population ?? 0;
  const highRiskDistricts = summary?.features.filter(
    (f) => f.properties.risk_level === "alto",
  ) ?? [];

  if (!activeAlerts.length && !affectedPop) return null;

  const sinagerdLevel =
    criticalAlerts.length > 0 ? "EMERGENCIA"
    : highAlerts.length > 2 || highRiskDistricts.length > 3 ? "ALERTA"
    : activeAlerts.length > 0 ? "AVISO"
    : null;

  if (!sinagerdLevel) return null;

  const levelLabel = locale === "es"
    ? { EMERGENCIA: "EMERGENCIA", ALERTA: "ALERTA", AVISO: "AVISO" }[sinagerdLevel]
    : { EMERGENCIA: "EMERGENCY", ALERTA: "ALERT", AVISO: "NOTICE" }[sinagerdLevel];

  const topDistricts = highRiskDistricts.slice(0, 3).map((f) => f.properties.name);
  const alertLabel = locale === "es"
    ? `${activeAlerts.length} alerta${activeAlerts.length !== 1 ? "s" : ""} activa${activeAlerts.length !== 1 ? "s" : ""}`
    : `${activeAlerts.length} active alert${activeAlerts.length !== 1 ? "s" : ""}`;

  const lines: string[] = [];
  if (activeAlerts.length) lines.push(alertLabel);
  if (affectedPop > 0)
    lines.push(`~${affectedPop > 1000 ? `${(affectedPop / 1000).toFixed(0)}k` : affectedPop} ${locale === "es" ? "personas en zona inundada" : "people in flood zone"}`);
  if (topDistricts.length)
    lines.push(`${locale === "es" ? "Distritos prioritarios" : "Priority districts"}: ${topDistricts.join(", ")}`);

  const bannerCls =
    sinagerdLevel === "EMERGENCIA"
      ? "bg-danger-soft border border-danger/20"
      : sinagerdLevel === "ALERTA"
        ? "bg-warn-soft border border-warn/20"
        : "bg-surface-sunken border border-border";

  const levelCls =
    sinagerdLevel === "EMERGENCIA" ? "text-danger font-semibold"
    : sinagerdLevel === "ALERTA"   ? "text-warn-muted font-semibold"
    :                                "text-ink-muted font-semibold";

  return (
    <div className={clsx("rounded-xl px-4 py-3", bannerCls)}>
      <p className="text-2xs font-semibold tracking-caps uppercase text-ink-subtle mb-1">
        SINAGERD · <span className={levelCls}>{levelLabel}</span>
      </p>
      <ul className="space-y-0.5">
        {lines.map((line, i) => (
          <li key={i} className="text-sm text-ink leading-snug">{line}</li>
        ))}
      </ul>
    </div>
  );
}

// ─── Lima-wide overview metrics ───────────────────────────────────────────────

function CityOverview() {
  const { locale } = useUIStore();
  const tr = useT(locale);
  const { data: alerts = [] } = useAlerts();
  const { data: exposure } = useFloodExposure();
  const { data: summary } = useDistrictRiskSummary();

  const activeCount = alerts.filter((a) => a.status === "active").length;
  const floodArea = exposure?.districts.reduce((sum, d) => sum + d.overlap_km2, 0) ?? 0;
  const affectedPop = exposure?.total_affected_population ?? 0;
  const altoCount = summary?.features.filter((f) => f.properties.risk_level === "alto").length ?? 0;
  const moderadoCount = summary?.features.filter((f) => f.properties.risk_level === "moderado").length ?? 0;

  return (
    <section aria-label={tr("dashboard", "lima")}>
      <SectionLabel className="mb-3">{tr("dashboard", "lima")}</SectionLabel>

      <div className="grid grid-cols-2 gap-4 py-4">
        {/* Active alerts */}
        <div>
          <p className={clsx(
            "text-3xl font-bold font-mono tabular-nums leading-none",
            activeCount > 0 ? "text-danger" : "text-ink",
          )}>
            {activeCount}
          </p>
          <p className="text-xs text-ink-muted mt-1">{tr("dashboard", "activeAlerts")}</p>
        </div>

        {/* Flood area */}
        <div>
          <p className="text-3xl font-bold font-mono tabular-nums leading-none text-accent">
            {floodArea.toFixed(1)}
            <span className="text-base font-normal text-ink-subtle ml-1">km²</span>
          </p>
          <p className="text-xs text-ink-muted mt-1">{tr("dashboard", "floodArea")}</p>
        </div>

        {/* Affected population */}
        <div>
          <p className="text-3xl font-bold font-mono tabular-nums leading-none text-ink">
            {affectedPop > 0
              ? affectedPop > 1000
                ? `~${(affectedPop / 1000).toFixed(0)}k`
                : String(affectedPop)
              : "—"}
          </p>
          <p className="text-xs text-ink-muted mt-1">
            {locale === "es" ? "Pob. en riesgo" : "Pop. at risk"}
          </p>
        </div>

        {/* Risk district breakdown */}
        {(altoCount > 0 || moderadoCount > 0) && (
          <div>
            <p className="text-3xl font-bold font-mono tabular-nums leading-none text-ink">
              {altoCount + moderadoCount}
            </p>
            <p className="text-xs text-ink-muted mt-1">
              {locale === "es" ? "distritos en alerta" : "districts on alert"}
            </p>
            <p className="text-xs mt-1">
              {altoCount > 0 && (
                <span className="text-danger font-medium">
                  {altoCount} {locale === "es" ? "alto" : "high"}
                </span>
              )}
              {altoCount > 0 && moderadoCount > 0 && (
                <span className="text-ink-subtle"> · </span>
              )}
              {moderadoCount > 0 && (
                <span className="text-warn-muted font-medium">
                  {moderadoCount} {locale === "es" ? "moderado" : "moderate"}
                </span>
              )}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Top-risk district list ───────────────────────────────────────────────────

function TopRiskList() {
  const { locale } = useUIStore();
  const tr = useT(locale);
  const { data: summary } = useDistrictRiskSummary();
  const { setScenario } = useUIStore();

  const at_risk = summary?.features
    .filter((f) => f.properties.risk_level !== "bajo")
    .sort((a, b) => {
      const order = { alto: 2, moderado: 1, bajo: 0 };
      return order[b.properties.risk_level] - order[a.properties.risk_level];
    })
    .slice(0, 8) ?? [];

  if (!at_risk.length) {
    return (
      <EmptyState
        title={locale === "es" ? "Sin distritos en alerta" : "No districts on alert"}
        body={tr("dashboard", "noDistricts")}
        icon={<CheckCircle2 size={14} />}
      />
    );
  }

  const RISK_DOT: Record<string, string> = {
    alto:     "bg-danger",
    moderado: "bg-warn",
    bajo:     "bg-ink-subtle",
  };

  return (
    <ul className="space-y-0.5">
      {at_risk.map((f) => (
        <li key={f.properties.ubigeo}>
          <button
            onClick={() =>
              setScenario({
                districtUbigeo: f.properties.ubigeo,
                districtName: f.properties.name,
              })
            }
            className="w-full flex items-center gap-2.5 text-left px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <span
              className={clsx("h-2 w-2 rounded-full shrink-0", RISK_DOT[f.properties.risk_level])}
              aria-hidden="true"
            />
            <span className="text-sm text-ink flex-1 truncate">{f.properties.name}</span>
            {f.properties.active_alerts > 0 && (
              <Badge count={f.properties.active_alerts} variant="danger" />
            )}
            {f.properties.urgent_social_3h > 0 && (
              <Badge count={f.properties.urgent_social_3h} variant="warn" />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─── MetricCard — simple row layout ──────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  valueCls,
}: {
  icon: typeof AlertTriangle;
  label: string;
  value: string;
  sub: string;
  color: string;
  valueCls?: string;
}) {
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-ink-subtle">{label}</p>
        {sub && <p className="text-xs text-ink-subtle mt-0.5 leading-tight line-clamp-1">{sub}</p>}
      </div>
      <p className={clsx("text-sm font-semibold tabular-nums shrink-0 ml-3", valueCls ?? "text-ink")}>
        {value}
      </p>
    </div>
  );
}

// ─── District detail view ─────────────────────────────────────────────────────

const SEVERITY_BADGE_CLS: Record<string, string> = {
  critical: "bg-danger-soft text-danger",
  high:     "bg-warn-soft text-warn-muted",
  medium:   "bg-warn-soft/60 text-warn-muted",
  low:      "bg-accent-soft text-accent",
};

function DistrictDetail({ ubigeo }: { ubigeo: string }) {
  const { locale } = useUIStore();
  const tr = useT(locale);
  const { data, isLoading, isError } = useDistrictDashboard(ubigeo);
  const { data: fusion } = useFusion(ubigeo);

  if (isLoading)
    return <p className="text-xs text-ink-muted px-1 py-4 text-center">{tr("dashboard", "loading")}</p>;
  if (isError || !data)
    return <p className="text-xs text-danger px-1 py-4 text-center">{tr("dashboard", "errorLoad")}</p>;

  const imergValues = data.imerg_trend_30d.map((d) => d.acc_24h_mm);
  const maxImerg = Math.max(...imergValues, 0);
  const latestImerg = imergValues.at(-1) ?? 0;
  const activeAlerts = data.active_alerts.filter((a) => a.status === "active");

  const FUSION_SUNKEN_CLS: Record<string, string> = {
    alto:     "bg-danger-soft",
    moderado: "bg-warn-soft",
    bajo:     "bg-accent-soft",
  };
  const FUSION_RISK_CLS: Record<string, string> = {
    alto: "text-danger", moderado: "text-warn-muted", bajo: "text-accent",
  };

  const sarPolygonLabel = (n: number) =>
    locale === "es"
      ? `${n} ${n !== 1 ? tr("dashboard", "sarPolygonsPlural") : tr("dashboard", "sarPolygons")}`
      : `${n} Sentinel-1 ${n !== 1 ? "polygons" : "polygon"}`;

  return (
    <div className="space-y-4">
      {/* AI fusion prose */}
      {fusion?.prose_es && (
        <div className={clsx(
          "rounded-xl px-4 py-3",
          FUSION_SUNKEN_CLS[fusion.risk_level] ?? "bg-surface-sunken",
        )}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Brain size={10} className={FUSION_RISK_CLS[fusion.risk_level] ?? "text-ink-muted"} aria-hidden="true" />
            <p className="text-2xs font-semibold tracking-caps uppercase text-ink-subtle">
              {tr("dashboard", "multihazard")}
            </p>
            <span className={clsx(
              "ml-auto text-2xs font-bold uppercase",
              FUSION_RISK_CLS[fusion.risk_level],
            )}>
              {fusion.risk_level.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-ink leading-relaxed">
            {locale === "en" && fusion.prose_en ? fusion.prose_en : fusion.prose_es}
          </p>
        </div>
      )}

      {/* Active alerts list */}
      {activeAlerts.length > 0 && (
        <div>
          <p className="text-xs text-ink-muted mb-1.5 flex items-center gap-1">
            <AlertTriangle size={10} aria-hidden="true" />
            {tr("dashboard", "activeAlerts")} ({activeAlerts.length})
          </p>
          <ul className="space-y-1">
            {activeAlerts.map((a) => (
              <li key={a.id} className="flex items-start gap-2 bg-surface-sunken rounded-lg px-2.5 py-1.5">
                <span className={clsx(
                  "mt-0.5 shrink-0 text-2xs font-bold rounded px-1 py-0.5",
                  SEVERITY_BADGE_CLS[a.severity],
                )}>
                  {a.severity.slice(0, 4).toUpperCase()}
                </span>
                <p className="text-xs text-ink leading-snug line-clamp-2">{a.title}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Metric rows */}
      <div>
        <MetricCard
          icon={Droplets}
          label={tr("dashboard", "rain24h")}
          value={latestImerg > 0 ? `${latestImerg.toFixed(1)} mm` : "— mm"}
          sub={maxImerg > 0 ? `${tr("dashboard", "maxLast30d")} ${maxImerg.toFixed(1)} mm` : tr("dashboard", "noRecentData")}
          color="text-accent"
          valueCls="text-accent"
        />
        <MetricCard
          icon={Users}
          label={tr("dashboard", "people")}
          value={data.district.population ? data.district.population.toLocaleString(locale === "es" ? "es-PE" : "en-US") : "—"}
          sub={data.district.area_km2 ? `${data.district.area_km2.toFixed(1)} km²` : ""}
          color="text-ink"
        />
        <MetricCard
          icon={History}
          label={tr("dashboard", "historical")}
          value={String(data.sinpad_historical_events)}
          sub={tr("dashboard", "sinpad")}
          color="text-warn-muted"
          valueCls="text-warn-muted"
        />
        {fusion?.flood.overlap_km2 != null && fusion.flood.overlap_km2 > 0 && (
          <MetricCard
            icon={Waves}
            label={tr("dashboard", "sarFlooded")}
            value={`${fusion.flood.overlap_km2.toFixed(1)} km²`}
            sub={sarPolygonLabel(fusion.flood.active_polygon_count)}
            color="text-accent"
            valueCls="text-accent"
          />
        )}
      </div>

      {/* IMERG 30-day sparkline */}
      {imergValues.length > 1 && (
        <div className="bg-surface-sunken rounded-xl px-3 py-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-ink-muted flex items-center gap-1">
              <TrendingUp size={10} aria-hidden="true" /> {tr("dashboard", "rain30d")}
            </p>
            <p className="text-xs text-accent font-mono tabular-nums">{latestImerg.toFixed(1)} mm {tr("dashboard", "today")}</p>
          </div>
          <Sparkline values={imergValues} color={COSTA_300} />
        </div>
      )}

      {/* Alerts 7-day bar chart */}
      {data.alerts_trend_7d.length > 0 && (
        <div className="bg-surface-sunken rounded-xl px-3 py-2.5">
          <p className="text-xs text-ink-muted mb-1.5 flex items-center gap-1">
            <AlertTriangle size={10} aria-hidden="true" /> {tr("dashboard", "alerts7d")}
          </p>
          <BarMini days={data.alerts_trend_7d} />
        </div>
      )}

      {/* Social signals 24h */}
      {data.social_24h.length > 0 && (
        <div>
          <p className="text-xs text-ink-muted mb-1.5 flex items-center gap-1">
            <Radio size={10} aria-hidden="true" /> {tr("dashboard", "social24h")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.social_24h.map((s) => (
              <SocialPill key={s.label} item={s} locale={locale} />
            ))}
          </div>
        </div>
      )}

      {/* Hydro stations */}
      {data.stations.length > 0 && (
        <div>
          <p className="text-xs text-ink-muted mb-1.5">{tr("dashboard", "nearbyStations")}</p>
          <div className="space-y-1">
            {data.stations.map((st) => {
              const threshold = STATION_THRESHOLDS[st.code] ?? null;
              const overThreshold = threshold != null && st.level_m != null && st.level_m >= threshold;
              return (
                <div
                  key={st.code}
                  className={clsx(
                    "flex items-center justify-between rounded-xl px-3 py-2",
                    overThreshold
                      ? "bg-warn-soft border border-warn/20"
                      : "bg-surface-sunken",
                  )}
                >
                  <div>
                    <div className="flex items-center gap-1">
                      {overThreshold && <AlertTriangle size={9} className="text-warn-muted shrink-0" aria-hidden="true" />}
                      <p className={clsx("text-xs font-medium", overThreshold ? "text-warn-muted" : "text-ink")}>
                        {st.name}
                      </p>
                    </div>
                    <p className="text-2xs text-ink-subtle mt-0.5">{st.river} · {st.source.toUpperCase()}</p>
                    {overThreshold && threshold != null && (
                      <p className="text-2xs text-warn-muted mt-0.5">
                        {tr("dashboard", "threshold")} {threshold.toFixed(1)} m {tr("dashboard", "exceeded")}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {st.level_m != null && (
                      <p className={clsx("text-xs font-mono tabular-nums", overThreshold ? "text-warn-muted" : "text-accent")}>
                        {st.level_m.toFixed(2)} m
                      </p>
                    )}
                    {st.flow_m3s != null && (
                      <p className="text-2xs text-ink-subtle font-mono tabular-nums">{st.flow_m3s.toFixed(1)} m³/s</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 72h Rainfall Forecast ────────────────────────────────────────────────────

const RISK_STEP_COLOR: Record<ForecastStep["risk"], { fill: string; stroke: string; valueCls: string }> = {
  bajo:     { fill: SEVERITY_LOW,    stroke: SEVERITY_LOW,      valueCls: "text-accent" },
  moderado: { fill: SEVERITY_MEDIUM, stroke: SEVERITY_MEDIUM,   valueCls: "text-warn-muted" },
  alto:     { fill: SEVERITY_HIGH,   stroke: SEVERITY_CRITICAL, valueCls: "text-danger" },
};

function ForecastChart({ steps }: { steps: ForecastStep[] }) {
  const W = 220; const H = 48;
  const values = steps.map((s) => s.rimac_mm);
  const maxVal = Math.max(...values, HUAYCO_THRESHOLD_MM + 10);
  const toY = (v: number) => H - (v / maxVal) * (H - 4) - 2;
  const toX = (i: number) => (i / (steps.length - 1)) * W;

  const pts = steps.map((s, i) => `${toX(i)},${toY(s.rimac_mm)}`).join(" ");
  const threshY = toY(HUAYCO_THRESHOLD_MM);

  const segments: { x1: number; y1: number; x2: number; y2: number; risk: ForecastStep["risk"] }[] = [];
  for (let i = 0; i < steps.length - 1; i++) {
    segments.push({
      x1: toX(i), y1: toY(steps[i].rimac_mm),
      x2: toX(i + 1), y2: toY(steps[i + 1].rimac_mm),
      risk: steps[i + 1].risk,
    });
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="w-full">
      <line x1={0} y1={threshY} x2={W} y2={threshY} stroke={SEVERITY_HIGH} strokeWidth={0.75} strokeDasharray="3,3" opacity={0.6} />
      <polyline
        points={`0,${H} ${pts} ${W},${H}`}
        fill={COSTA_300}
        fillOpacity={0.08}
        stroke="none"
      />
      {segments.map((seg, i) => (
        <line
          key={i}
          x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
          stroke={RISK_STEP_COLOR[seg.risk].stroke}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
      {steps.map((s, i) => (
        <circle
          key={i}
          cx={toX(i)} cy={toY(s.rimac_mm)}
          r={2.5}
          fill={RISK_STEP_COLOR[s.risk].fill}
          stroke="transparent"
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}

function ForecastSection({ locale }: { locale: Locale }) {
  const steps = DEMO_FORECAST;
  const firstAlert = steps.find((s) => s.rimac_mm >= HUAYCO_THRESHOLD_MM);

  const label = {
    title:    { es: "Pronóstico 72h — Cuenca Rímac",  en: "72h Forecast — Rímac Watershed" },
    source:   { es: "SENAMHI · WRF",                  en: "SENAMHI · WRF" },
    preAlert: { es: "PRE-ALERTA",                     en: "PRE-ALERT" },
    thresh:   { es: "Umbral huayco",                  en: "Huayco threshold" },
    at:       { es: "en",                             en: "at" },
    prob:     { es: "prob.",                          en: "prob." },
    rim:      { es: "Rímac · mm acumulado",           en: "Rímac · accumulated mm" },
    risk: {
      bajo:     { es: "BAJO",  en: "LOW" },
      moderado: { es: "MOD",   en: "MOD" },
      alto:     { es: "ALTO",  en: "HIGH" },
    },
  } as const;
  const L = (obj: { es: string; en: string }) => obj[locale];

  return (
    <section>
      <Divider className="mb-4" />
      <div className="flex items-baseline justify-between mb-3">
        <SectionLabel>{L(label.title)}</SectionLabel>
        <p className="font-mono text-2xs text-ink-subtle">{L(label.source)}</p>
      </div>

      <div className="mb-3">
        <ForecastChart steps={steps} />
        <div className="flex justify-between px-0.5 mt-1">
          {steps.map((s) => (
            <span key={s.hours} className="font-mono text-2xs text-ink-subtle tabular-nums">+{s.hours}h</span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 mb-3">
        {steps.map((step) => {
          const cfg = RISK_STEP_COLOR[step.risk];
          return (
            <div key={step.hours} className="text-center">
              <p className={clsx("font-bold font-mono tabular-nums text-base leading-none", cfg.valueCls)}>
                {step.rimac_mm.toFixed(0)}
              </p>
              <p className="text-2xs text-ink-subtle mt-1">{L(label.risk[step.risk])}</p>
            </div>
          );
        })}
      </div>

      <div className="flex items-baseline justify-between">
        <span className="text-2xs text-ink-subtle">{L(label.rim)}</span>
        <span className="text-2xs text-danger">{L(label.thresh)} {HUAYCO_THRESHOLD_MM} mm</span>
      </div>

      {firstAlert && (
        <div className="mt-3 pl-3 border-l-2 border-danger">
          <p className="text-2xs font-semibold tracking-caps uppercase text-danger mb-1">{L(label.preAlert)}</p>
          <p className="text-xs text-ink leading-snug">
            {L(label.thresh)} {L(label.at)} +{firstAlert.hours}h —{" "}
            <span className="font-mono tabular-nums">{firstAlert.rimac_mm.toFixed(0)} mm</span>{" "}
            ({(firstAlert.huayco_prob * 100).toFixed(0)}% {L(label.prob)})
          </p>
        </div>
      )}
      <Divider className="mt-4" />
    </section>
  );
}

// ─── Resource deployment status ───────────────────────────────────────────────

const STATUS_BAR_CLS: Record<ResourceCategory["status"], string> = {
  ok:      "bg-accent",
  partial: "bg-warn",
  deficit: "bg-danger",
};

function ResourceStatus({ locale }: { locale: Locale }) {
  const label = {
    title:  { es: "Recursos desplegados", en: "Deployed Resources" },
    source: { es: "INDECI COEN",          en: "INDECI COEN" },
  } as const;
  const L = (obj: { es: string; en: string }) => obj[locale];

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <SectionLabel>{L(label.title)}</SectionLabel>
        <p className="font-mono text-2xs text-ink-subtle">{L(label.source)}</p>
      </div>
      <ul className="space-y-3">
        {DEMO_RESOURCES.map((r) => {
          const pct = Math.min((r.deployed / r.count) * 100, 100);
          return (
            <li key={r.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-2">
              <span className="font-mono text-2xs text-ink-subtle tabular-nums" aria-hidden="true">
                {r.icon}
              </span>
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs text-ink truncate">{L(r.label)}</span>
                  <span className="font-mono text-2xs text-ink-subtle tabular-nums shrink-0 ml-2">
                    {r.deployed}/{r.count}
                  </span>
                </div>
                <div className="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                  <div
                    className={clsx("h-full rounded-full transition-all", STATUS_BAR_CLS[r.status])}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <span className="text-2xs text-ink-subtle">{L(r.unit)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─── Incident timeline (city-wide) ───────────────────────────────────────────

const TYPE_ICON_MAP: Record<string, string> = {
  flood: "[SAR]", huayco: "[HUA]", social_cluster: "[SOC]",
};

const LOG_ICON: Record<string, string> = {
  social_signal_received: "RX",
  resource_dispatch:      "OUT",
  protocol_step:          "OK",
  map_pin:                "PIN",
  acknowledge:            "ACK",
  escalate:               "ESC",
  false_positive:         "FP",
};

function IncidentTimeline({ locale }: { locale: Locale }) {
  const { data: alerts = [] } = useAlerts();
  const { data: log = [] } = useDecisionLog(20);
  const { data: socialData } = useSocialSignals(6);

  type EventItem = { id: string; time: string; text: string; dotCls: string };

  const events: EventItem[] = [];

  for (const a of alerts.slice(0, 4)) {
    events.push({
      id: `a-${a.id}`,
      time: a.created_at,
      text: `${TYPE_ICON_MAP[a.type] ?? "[ALT]"} ${a.title}`,
      dotCls:
        a.severity === "critical" ? "bg-danger"
        : a.severity === "high"   ? "bg-warn"
        :                           "bg-warn/60",
    });
  }

  for (const entry of log.slice(0, 6)) {
    const icon = LOG_ICON[entry.action_type] ?? "LOG";
    const payload = entry.payload as Record<string, unknown>;
    const desc =
      entry.action_type === "resource_dispatch"      ? `[${icon}] ${payload.resource_name ?? payload.resource}`
      : entry.action_type === "social_signal_received" ? `[${icon}] ${payload.district}: ${payload.label}`
      : entry.action_type === "protocol_step"          ? `[${icon}] ${payload.label}`
      : `[${icon}] ${entry.action_type.replace(/_/g, " ")}`;
    events.push({ id: `l-${entry.id}`, time: entry.logged_at, text: desc, dotCls: "bg-ink-subtle" });
  }

  for (const f of (socialData?.features ?? []).filter(
    (f) => f.properties.triage_label === "needs_help" || f.properties.triage_label === "road_blocked",
  ).slice(0, 3)) {
    const src = f.properties.source ?? "?";
    const txt = f.properties.text?.slice(0, 55) ?? f.properties.triage_label;
    events.push({
      id: `s-${f.properties.id}`,
      time: f.properties.ingested_at,
      text: `[SOC] ${src}: ${txt}`,
      dotCls: "bg-accent",
    });
  }

  events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  const top = events.slice(0, 9);

  if (top.length === 0) return null;

  const title = locale === "es" ? "Cronología del incidente" : "Incident timeline";
  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <History size={10} className="text-ink-subtle" aria-hidden="true" />
        <SectionLabel>{title}</SectionLabel>
      </div>
      <ol className="space-y-1.5" aria-label={title}>
        {top.map((ev) => (
          <li key={ev.id} className="flex items-start gap-2">
            <span className={clsx("w-2 h-2 rounded-full shrink-0 mt-1", ev.dotCls)} aria-hidden="true" />
            <p className="text-xs text-ink leading-snug flex-1 min-w-0 truncate">{ev.text}</p>
            <time className="text-2xs text-ink-subtle shrink-0 font-mono tabular-nums">{formatTime(ev.time)}</time>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function DistrictDashboardPanel() {
  const { activePanel, scenario, locale } = useUIStore();
  const tr = useT(locale);
  if (activePanel !== "dashboard") return null;

  const title = scenario.districtName ?? tr("dashboard", "titleCity");

  return (
    <aside
      className={clsx(
        // Mobile: sheet from bottom
        "fixed bottom-14 left-0 right-0 h-[80vh] rounded-t-2xl",
        "bg-surface border-t border-border-strong shadow-panel z-20",
        // Desktop: flush right panel
        "sm:absolute sm:top-0 sm:right-0 sm:bottom-auto sm:left-auto",
        "sm:h-full sm:w-[400px] sm:rounded-none sm:border-t-0",
        "sm:border-l sm:border-border-strong",
        "flex flex-col panel-animate",
      )}
      aria-label={tr("dashboard", "panelLabel")}
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2.5 pb-1" aria-hidden="true">
        <div className="w-10 h-[3px] bg-border-strong rounded-full" />
      </div>

      {/* Header */}
      <PanelHeader border className="px-5 pt-4 pb-3 gap-2">
        <BarChart3 size={15} className="text-ink-muted shrink-0" aria-hidden="true" />
        <PanelTitle>{title}</PanelTitle>
        {scenario.districtUbigeo && (
          <span className="font-mono text-2xs text-ink-subtle tabular-nums shrink-0">
            {scenario.districtUbigeo}
          </span>
        )}
        <EDANReportButton />
      </PanelHeader>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {scenario.districtUbigeo ? (
          <DistrictDetail ubigeo={scenario.districtUbigeo} />
        ) : (
          <>
            <SituationSummary />
            <Divider />
            <CityOverview />
            <Divider />
            <IncidentTimeline locale={locale} />
            <ForecastSection locale={locale} />
            <ResourceStatus locale={locale} />
            <Divider />
            <div>
              <SectionLabel className="mb-3">
                {tr("dashboard", "priorityDistricts")}
              </SectionLabel>
              <TopRiskList />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
