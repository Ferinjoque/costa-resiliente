"use client";

import { BarChart3, Droplets, AlertTriangle, Users, History, Radio, TrendingUp, Waves, Mountain, Zap, Brain, CheckCircle2, Copy, Check, CloudRain, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useUIStore } from "@/store/ui";
import { useDistrictDashboard, useDistrictRiskSummary, useAlerts, useFloodExposure, useFusion } from "@/lib/queries";
import { clsx } from "clsx";
import type { AlertTrendDay, SocialBreakdown } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { DEMO_FORECAST, HUAYCO_THRESHOLD_MM, DEMO_RESOURCES, type ForecastStep, type ResourceCategory } from "@/lib/demoData";

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
  color = "#38bdf8",
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
  const SEV_COLOR = { critical: "#dc2626", high: "#f97316", medium: "#fbbf24", low: "#38bdf8" };
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

const LABEL_COLOR: Record<string, string> = {
  needs_help:            "bg-red-900/40 text-red-300 border-red-700/50",
  infrastructure_damage: "bg-orange-900/40 text-orange-300 border-orange-700/50",
  road_blocked:          "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
  weather_observation:   "bg-blue-900/40 text-blue-300 border-blue-700/50",
};

function SocialPill({ item, locale }: { item: SocialBreakdown; locale: Locale }) {
  const label = LABEL_TEXT[item.label]?.[locale] ?? item.label.replace(/_/g, " ");
  const cls = LABEL_COLOR[item.label] ?? "bg-slate-800 text-slate-300 border-slate-600";
  return (
    <span className={clsx("inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-[11px]", cls)}>
      {label}
      <span className="font-semibold">{item.count}</span>
    </span>
  );
}

// ─── Auto-generated situation summary ────────────────────────────────────────

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

  const levelColor =
    sinagerdLevel === "EMERGENCIA" ? "border-red-500/60 bg-red-900/20 text-red-200"
    : sinagerdLevel === "ALERTA" ? "border-orange-500/50 bg-orange-900/20 text-orange-200"
    : "border-yellow-600/40 bg-yellow-900/15 text-yellow-200";

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

  return (
    <div className={clsx("mb-3 rounded-lg border px-3 py-2.5", levelColor)}>
      <div className="flex items-center gap-1.5 mb-1">
        <Zap size={10} aria-hidden="true" />
        <p className="text-[10px] font-bold tracking-wide uppercase">
          SINAGERD · {levelLabel}
        </p>
      </div>
      <ul className="space-y-0.5">
        {lines.map((line, i) => (
          <li key={i} className="text-xs opacity-90">{line}</li>
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
  const criticalCount = alerts.filter((a) => a.severity === "critical" && a.status === "active").length;
  const floodArea = exposure?.districts.reduce((sum, d) => sum + d.overlap_km2, 0) ?? 0;
  const affectedPop = exposure?.total_affected_population ?? 0;
  const altoCount = summary?.features.filter((f) => f.properties.risk_level === "alto").length ?? 0;
  const moderadoCount = summary?.features.filter((f) => f.properties.risk_level === "moderado").length ?? 0;

  return (
    <div className="mb-4 space-y-2">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{tr("dashboard", "lima")}</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-red-900/25 border border-red-700/40 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <AlertTriangle size={10} className="text-red-400" />
            <p className="text-[10px] text-slate-400">{tr("dashboard", "activeAlerts")}</p>
          </div>
          <p className="text-xl font-bold text-red-300">{activeCount}</p>
          {criticalCount > 0 && (
            <p className="text-[10px] text-red-400">
              {criticalCount} {locale === "es" ? `crítica${criticalCount !== 1 ? "s" : ""}` : `critical`}
            </p>
          )}
        </div>
        <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Waves size={10} className="text-blue-400" />
            <p className="text-[10px] text-slate-400">{tr("dashboard", "floodArea")}</p>
          </div>
          <p className="text-xl font-bold text-blue-300">{floodArea.toFixed(1)} km²</p>
          {affectedPop > 0 && (
            <p className="text-[10px] text-blue-400">
              ~{affectedPop > 1000 ? `${(affectedPop / 1000).toFixed(0)}k` : affectedPop} {tr("dashboard", "inhabitants")}
            </p>
          )}
        </div>
        {(altoCount > 0 || moderadoCount > 0) && (
          <div className="col-span-2 bg-surface-panel border border-slate-700/50 rounded-lg px-3 py-2 flex items-center gap-4">
            <CheckCircle2 size={10} className="text-slate-500 shrink-0" aria-hidden="true" />
            <div className="flex items-center gap-3 text-[11px]">
              {altoCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                  <span className="text-slate-300">
                    {altoCount} {locale === "es" ? "distr. riesgo alto" : "high-risk distr."}
                  </span>
                </span>
              )}
              {moderadoCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-orange-400 shrink-0" />
                  <span className="text-slate-400">
                    {moderadoCount} {locale === "es" ? "moderado" : "moderate"}
                  </span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
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
    return <p className="text-xs text-slate-400 px-1">{tr("dashboard", "noDistricts")}</p>;
  }

  const RISK_DOT = { alto: "bg-red-500", moderado: "bg-orange-400", bajo: "bg-green-500" };

  return (
    <ul className="space-y-1">
      {at_risk.map((f) => (
        <li key={f.properties.ubigeo}>
          <button
            onClick={() =>
              setScenario({
                districtUbigeo: f.properties.ubigeo,
                districtName: f.properties.name,
              })
            }
            className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-surface-panel transition-colors"
          >
            <span
              className={clsx(
                "h-2 w-2 rounded-full shrink-0",
                RISK_DOT[f.properties.risk_level],
              )}
            />
            <span className="text-xs text-slate-200 flex-1 truncate">{f.properties.name}</span>
            {f.properties.active_alerts > 0 && (
              <span className="text-[10px] bg-red-900/50 text-red-300 px-1.5 rounded-full">
                {f.properties.active_alerts} {tr("dashboard", "alertsBadge")}
              </span>
            )}
            {f.properties.urgent_social_3h > 0 && (
              <span className="text-[10px] bg-orange-900/50 text-orange-300 px-1.5 rounded-full">
                {f.properties.urgent_social_3h} {tr("dashboard", "signalsBadge")}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─── District detail view ─────────────────────────────────────────────────────

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-900/50 text-red-300 border-red-700/50",
  high:     "bg-orange-900/40 text-orange-300 border-orange-700/50",
  medium:   "bg-yellow-900/30 text-yellow-300 border-yellow-700/40",
  low:      "bg-blue-900/30 text-blue-300 border-blue-700/40",
};

function DistrictDetail({ ubigeo }: { ubigeo: string }) {
  const { locale } = useUIStore();
  const tr = useT(locale);
  const { data, isLoading, isError } = useDistrictDashboard(ubigeo);
  const { data: fusion } = useFusion(ubigeo);

  if (isLoading)
    return <p className="text-xs text-slate-400 px-1 py-4 text-center">{tr("dashboard", "loading")}</p>;
  if (isError || !data)
    return <p className="text-xs text-red-400 px-1 py-4 text-center">{tr("dashboard", "errorLoad")}</p>;

  const imergValues = data.imerg_trend_30d.map((d) => d.acc_24h_mm);
  const maxImerg = Math.max(...imergValues, 0);
  const latestImerg = imergValues.at(-1) ?? 0;
  const activeAlerts = data.active_alerts.filter((a) => a.status === "active");

  const RISK_BORDER: Record<string, string> = {
    alto:     "border-red-500/50 bg-red-900/15",
    moderado: "border-orange-500/40 bg-orange-900/10",
    bajo:     "border-green-700/30 bg-green-900/10",
  };
  const RISK_TEXT: Record<string, string> = {
    alto: "text-red-300", moderado: "text-orange-300", bajo: "text-green-400",
  };

  const sarPolygonLabel = (n: number) =>
    locale === "es"
      ? `${n} ${n !== 1 ? tr("dashboard", "sarPolygonsPlural") : tr("dashboard", "sarPolygons")}`
      : `${n} Sentinel-1 ${n !== 1 ? "polygons" : "polygon"}`;

  return (
    <div className="space-y-4">
      {/* AI fusion prose */}
      {fusion?.prose_es && (
        <div className={clsx("rounded-lg border px-3 py-2.5", RISK_BORDER[fusion.risk_level] ?? "border-slate-700 bg-surface-panel")}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Brain size={10} className={RISK_TEXT[fusion.risk_level] ?? "text-slate-400"} aria-hidden="true" />
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {tr("dashboard", "multihazard")}
            </p>
            <span className={clsx("ml-auto text-[9px] font-bold uppercase px-1 py-0.5 rounded", RISK_TEXT[fusion.risk_level])}>
              {fusion.risk_level.toUpperCase()}
            </span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            {locale === "en" && fusion.prose_en ? fusion.prose_en : fusion.prose_es}
          </p>
        </div>
      )}

      {/* Active alerts list */}
      {activeAlerts.length > 0 && (
        <div>
          <p className="text-[11px] text-slate-400 mb-1.5 flex items-center gap-1">
            <AlertTriangle size={10} /> {tr("dashboard", "activeAlerts")} ({activeAlerts.length})
          </p>
          <ul className="space-y-1">
            {activeAlerts.map((a) => (
              <li key={a.id} className="flex items-start gap-2 bg-surface-panel rounded-lg px-2.5 py-1.5">
                <span className={clsx("mt-0.5 shrink-0 text-[9px] font-bold border rounded px-1 py-0.5", SEVERITY_BADGE[a.severity])}>
                  {a.severity.slice(0, 4).toUpperCase()}
                </span>
                <p className="text-[11px] text-slate-200 leading-snug line-clamp-2">{a.title}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          icon={Droplets}
          label={tr("dashboard", "rain24h")}
          value={latestImerg > 0 ? `${latestImerg.toFixed(1)} mm` : "— mm"}
          sub={maxImerg > 0 ? `${tr("dashboard", "maxLast30d")} ${maxImerg.toFixed(1)} mm` : tr("dashboard", "noRecentData")}
          color="text-blue-400"
        />
        <MetricCard
          icon={Users}
          label={tr("dashboard", "people")}
          value={data.district.population ? data.district.population.toLocaleString(locale === "es" ? "es-PE" : "en-US") : "—"}
          sub={data.district.area_km2 ? `${data.district.area_km2.toFixed(1)} km²` : ""}
          color="text-slate-300"
        />
        <MetricCard
          icon={History}
          label={tr("dashboard", "historical")}
          value={String(data.sinpad_historical_events)}
          sub={tr("dashboard", "sinpad")}
          color="text-amber-400"
        />
        {fusion?.flood.overlap_km2 != null && fusion.flood.overlap_km2 > 0 && (
          <MetricCard
            icon={Waves}
            label={tr("dashboard", "sarFlooded")}
            value={`${fusion.flood.overlap_km2.toFixed(1)} km²`}
            sub={sarPolygonLabel(fusion.flood.active_polygon_count)}
            color="text-cyan-400"
          />
        )}
      </div>

      {/* IMERG 30-day sparkline */}
      {imergValues.length > 1 && (
        <div className="bg-surface-panel rounded-lg px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <TrendingUp size={10} /> {tr("dashboard", "rain30d")}
            </p>
            <p className="text-[10px] text-blue-400">{latestImerg.toFixed(1)} mm {tr("dashboard", "today")}</p>
          </div>
          <Sparkline values={imergValues} color="#38bdf8" />
        </div>
      )}

      {/* Alerts 7-day bar chart */}
      {data.alerts_trend_7d.length > 0 && (
        <div className="bg-surface-panel rounded-lg px-3 py-2">
          <p className="text-[11px] text-slate-400 mb-1 flex items-center gap-1">
            <AlertTriangle size={10} /> {tr("dashboard", "alerts7d")}
          </p>
          <BarMini days={data.alerts_trend_7d} />
        </div>
      )}

      {/* Social signals 24h */}
      {data.social_24h.length > 0 && (
        <div>
          <p className="text-[11px] text-slate-400 mb-1.5 flex items-center gap-1">
            <Radio size={10} /> {tr("dashboard", "social24h")}
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
          <p className="text-[11px] text-slate-400 mb-1.5">{tr("dashboard", "nearbyStations")}</p>
          <div className="space-y-1">
            {data.stations.map((st) => {
              const threshold = STATION_THRESHOLDS[st.code] ?? null;
              const overThreshold = threshold != null && st.level_m != null && st.level_m >= threshold;
              return (
                <div
                  key={st.code}
                  className={clsx(
                    "flex items-center justify-between rounded-lg px-2.5 py-1.5",
                    overThreshold
                      ? "bg-orange-900/30 border border-orange-600/50"
                      : "bg-surface-panel",
                  )}
                >
                  <div>
                    <div className="flex items-center gap-1">
                      {overThreshold && <AlertTriangle size={9} className="text-orange-400 shrink-0" />}
                      <p className={clsx("text-xs", overThreshold ? "text-orange-200" : "text-slate-200")}>{st.name}</p>
                    </div>
                    <p className="text-[10px] text-slate-500">{st.river} · {st.source.toUpperCase()}</p>
                    {overThreshold && threshold != null && (
                      <p className="text-[9px] text-orange-400 mt-0.5">
                        {tr("dashboard", "threshold")} {threshold.toFixed(1)} m {tr("dashboard", "exceeded")}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {st.level_m != null && (
                      <p className={clsx("text-xs font-mono", overThreshold ? "text-orange-300" : "text-blue-300")}>
                        {st.level_m.toFixed(2)} m
                      </p>
                    )}
                    {st.flow_m3s != null && (
                      <p className="text-[10px] text-slate-400 font-mono">{st.flow_m3s.toFixed(1)} m³/s</p>
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

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: typeof AlertTriangle;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="bg-surface-panel rounded-lg px-3 py-2">
      <div className="flex items-center gap-1 mb-1">
        <Icon size={11} className={color} aria-hidden="true" />
        <p className="text-[10px] text-slate-400">{label}</p>
      </div>
      <p className={clsx("text-lg font-semibold leading-tight", color)}>{value}</p>
      <p className="text-[10px] text-slate-500 mt-0.5 leading-tight line-clamp-1">{sub}</p>
    </div>
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
    const now = new Date().toLocaleString("es-PE", { timeZone: "America/Lima" });
    const active = alerts.filter((a) => a.status === "active");
    const critical = active.filter((a) => a.severity === "critical");
    const high = active.filter((a) => a.severity === "high");
    const floodArea = exposure?.districts.reduce((s, d) => s + d.overlap_km2, 0) ?? 0;
    const affectedPop = exposure?.total_affected_population ?? 0;
    const highRiskDistricts = summary?.features
      .filter((f) => f.properties.risk_level === "alto")
      .map((f) => f.properties.name).join(", ") ?? "—";

    const level = critical.length > 0 ? "EMERGENCIA" : high.length > 1 ? "ALERTA" : active.length > 0 ? "AVISO" : "NORMAL";

    return [
      "═══════════════════════════════════════════",
      "REPORTE DE SITUACIÓN — COSTA RESILIENTE",
      `Fecha/Hora: ${now} (Lima, Perú)`,
      `Nivel SINAGERD: ${level}`,
      "Generado por: Plataforma Costa Resiliente",
      "═══════════════════════════════════════════",
      "",
      "1. RESUMEN EJECUTIVO",
      `   Alertas activas:    ${active.length} (${critical.length} críticas, ${high.length} altas)`,
      `   Área inundada SAR:  ${floodArea.toFixed(1)} km²`,
      `   Pob. en riesgo est: ~${affectedPop > 1000 ? (affectedPop / 1000).toFixed(0) + "k" : affectedPop} habitantes`,
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
      "─────────────────────────────────────────────",
      "PARA USO OFICIAL — FORMULARIO EDAN-PERÚ",
      "Sistema: Costa Resiliente v1.0 (IEEE Response Quest 2026)",
      "═══════════════════════════════════════════",
    ].filter((l) => l !== "").join("\n");
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
      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-costa-400 transition-colors ml-auto"
      aria-label={locale === "es" ? "Copiar reporte EDAN-Perú al portapapeles" : "Copy EDAN-Peru report to clipboard"}
      title={locale === "es" ? "Generar reporte EDAN-Perú" : "Generate EDAN-Peru report"}
    >
      {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
      {copied ? tr("dashboard", "edanCopied") : tr("dashboard", "edan")}
    </button>
  );
}

// ─── 72h Rainfall Forecast ────────────────────────────────────────────────────

const RISK_STEP_COLOR: Record<ForecastStep["risk"], { fill: string; stroke: string; badge: string; badgeBg: string }> = {
  bajo:     { fill: "#22c55e", stroke: "#16a34a", badge: "text-green-300",  badgeBg: "bg-green-900/30" },
  moderado: { fill: "#fbbf24", stroke: "#d97706", badge: "text-yellow-300", badgeBg: "bg-yellow-900/30" },
  alto:     { fill: "#f97316", stroke: "#dc2626", badge: "text-red-300",    badgeBg: "bg-red-900/30" },
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
      {/* Threshold line */}
      <line x1={0} y1={threshY} x2={W} y2={threshY} stroke="#f97316" strokeWidth={0.75} strokeDasharray="3,3" opacity={0.6} />
      {/* Area fill */}
      <polyline
        points={`0,${H} ${pts} ${W},${H}`}
        fill="#38bdf8"
        fillOpacity={0.08}
        stroke="none"
      />
      {/* Colored segments */}
      {segments.map((seg, i) => (
        <line
          key={i}
          x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
          stroke={RISK_STEP_COLOR[seg.risk].stroke}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
      {/* Data points */}
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
    <div className="mb-4 bg-surface-panel rounded-xl px-3 py-2.5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-slate-300 font-medium flex items-center gap-1.5">
          <CloudRain size={11} className="text-blue-400" aria-hidden="true" />
          {L(label.title)}
        </p>
        <p className="text-[9px] text-slate-500">{L(label.source)}</p>
      </div>

      {/* Sparkline chart */}
      <div className="mb-2">
        <ForecastChart steps={steps} />
        <div className="flex justify-between px-0.5 mt-0.5">
          {steps.map((s) => (
            <span key={s.hours} className="text-[9px] text-slate-500">+{s.hours}h</span>
          ))}
        </div>
      </div>

      {/* Step bars */}
      <div className="grid grid-cols-5 gap-1 mb-2">
        {steps.map((step) => {
          const cfg = RISK_STEP_COLOR[step.risk];
          return (
            <div key={step.hours} className={clsx("rounded-md px-1 py-1 text-center", cfg.badgeBg)}>
              <p className={clsx("text-[11px] font-bold leading-none", cfg.badge)}>
                {step.rimac_mm.toFixed(0)}
              </p>
              <p className="text-[8px] text-slate-500 mt-0.5">{L(label.risk[step.risk])}</p>
            </div>
          );
        })}
      </div>

      {/* Legend row */}
      <div className="flex items-center justify-between">
        <p className="text-[9px] text-slate-500">{L(label.rim)}</p>
        <div className="flex items-center gap-1">
          <span className="inline-block w-3 border-t border-dashed border-orange-400" aria-hidden="true" />
          <span className="text-[9px] text-orange-400">{L(label.thresh)} {HUAYCO_THRESHOLD_MM} mm</span>
        </div>
      </div>

      {/* Pre-alert banner */}
      {firstAlert && (
        <div className="mt-2 rounded-lg border border-orange-500/50 bg-orange-900/20 px-2.5 py-1.5 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse shrink-0" aria-hidden="true" />
          <p className="text-[10px] text-orange-300">
            <span className="font-bold">{L(label.preAlert)}</span>
            {" "}{L(label.thresh)} {L(label.at)} +{firstAlert.hours}h
            {" "}— {firstAlert.rimac_mm.toFixed(0)} mm
            {" "}({(firstAlert.huayco_prob * 100).toFixed(0)}% {L(label.prob)})
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Resource deployment status ───────────────────────────────────────────────

const STATUS_STYLE: Record<ResourceCategory["status"], { dot: string; bar: string }> = {
  ok:      { dot: "bg-green-400",  bar: "bg-green-500" },
  partial: { dot: "bg-yellow-400", bar: "bg-yellow-500" },
  deficit: { dot: "bg-red-400",    bar: "bg-red-500" },
};

function ResourceStatus({ locale }: { locale: Locale }) {
  const label = {
    title:  { es: "Recursos desplegados", en: "Deployed Resources" },
    source: { es: "INDECI COEN",          en: "INDECI COEN" },
  } as const;
  const L = (obj: { es: string; en: string }) => obj[locale];

  return (
    <div className="mb-4 bg-surface-panel rounded-xl px-3 py-2.5">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[11px] text-slate-300 font-medium flex items-center gap-1.5">
          <ShieldCheck size={11} className="text-costa-400" aria-hidden="true" />
          {L(label.title)}
        </p>
        <p className="text-[9px] text-slate-500">{L(label.source)}</p>
      </div>
      <div className="space-y-1.5">
        {DEMO_RESOURCES.map((r) => {
          const cfg = STATUS_STYLE[r.status];
          const pct = Math.min((r.deployed / r.count) * 100, 100);
          return (
            <div key={r.id} className="flex items-center gap-2">
              <span className="text-[13px] leading-none w-5 text-center shrink-0" aria-hidden="true">{r.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-slate-300 truncate">{L(r.label)}</span>
                  <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-1">
                    {r.deployed}/{r.count} {L(r.unit)}
                  </span>
                </div>
                <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={clsx("h-full rounded-full", cfg.bar)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <span className={clsx("h-1.5 w-1.5 rounded-full shrink-0", cfg.dot)} aria-hidden="true" />
            </div>
          );
        })}
      </div>
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
      className={[
        "fixed bottom-14 left-0 right-0 h-[75vh] rounded-t-2xl",
        "sm:absolute sm:top-4 sm:right-4 sm:bottom-4 sm:left-auto sm:h-auto sm:w-80 sm:max-w-sm sm:rounded-xl",
        "bg-surface-raised border border-slate-700 shadow-xl z-20 flex flex-col panel-animate",
      ].join(" ")}
      aria-label={tr("dashboard", "panelLabel")}
    >
      <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
        <div className="w-8 h-1 rounded-full bg-slate-600" />
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
        <BarChart3 size={15} className="text-costa-500" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {scenario.districtUbigeo && (
          <span className="text-[10px] text-slate-500">{scenario.districtUbigeo}</span>
        )}
        <EDANReportButton />
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {scenario.districtUbigeo ? (
          <DistrictDetail ubigeo={scenario.districtUbigeo} />
        ) : (
          <>
            <SituationSummary />
            <CityOverview />
            <ForecastSection locale={locale} />
            <ResourceStatus locale={locale} />
            <p className="text-[11px] text-slate-400 mb-2 flex items-center gap-1">
              <Mountain size={10} />
              {tr("dashboard", "priorityDistricts")}
            </p>
            <TopRiskList />
          </>
        )}
      </div>
    </aside>
  );
}
