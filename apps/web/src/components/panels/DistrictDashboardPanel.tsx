"use client";

import { BarChart3, Droplets, AlertTriangle, Users, History, Radio, TrendingUp, Waves, Mountain, Zap, Brain, CheckCircle2 } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useDistrictDashboard, useDistrictRiskSummary, useAlerts, useFloodExposure, useFusion } from "@/lib/queries";
import { clsx } from "clsx";
import type { AlertTrendDay, SocialBreakdown } from "@/lib/api";

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
      {/* Area fill */}
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

function BarMini({
  days,
}: {
  days: AlertTrendDay[];
}) {
  if (!days.length) return <p className="text-xs text-slate-500">Sin datos</p>;
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

const LABEL_ES: Record<string, string> = {
  needs_help: "Ayuda",
  infrastructure_damage: "Infraestructura",
  road_blocked: "Vía bloqueada",
  weather_observation: "Meteorología",
};
const LABEL_COLOR: Record<string, string> = {
  needs_help: "bg-red-900/40 text-red-300 border-red-700/50",
  infrastructure_damage: "bg-orange-900/40 text-orange-300 border-orange-700/50",
  road_blocked: "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
  weather_observation: "bg-blue-900/40 text-blue-300 border-blue-700/50",
};

function SocialPill({ item }: { item: SocialBreakdown }) {
  const label = LABEL_ES[item.label] ?? item.label;
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

  // Derive SINAGERD alert level
  const sinagerdLevel =
    criticalAlerts.length > 0 ? "EMERGENCIA"
    : highAlerts.length > 2 || highRiskDistricts.length > 3 ? "ALERTA"
    : activeAlerts.length > 0 ? "AVISO"
    : null;

  const levelColor =
    sinagerdLevel === "EMERGENCIA" ? "border-red-500/60 bg-red-900/20 text-red-200"
    : sinagerdLevel === "ALERTA" ? "border-orange-500/50 bg-orange-900/20 text-orange-200"
    : "border-yellow-600/40 bg-yellow-900/15 text-yellow-200";

  const topDistricts = highRiskDistricts.slice(0, 3).map((f) => f.properties.name);

  const lines: string[] = [];
  if (activeAlerts.length)
    lines.push(`${activeAlerts.length} alerta${activeAlerts.length !== 1 ? "s" : ""} activa${activeAlerts.length !== 1 ? "s" : ""}`);
  if (affectedPop > 0)
    lines.push(`~${affectedPop > 1000 ? `${(affectedPop / 1000).toFixed(0)}k` : affectedPop} personas en zona inundada`);
  if (topDistricts.length)
    lines.push(`Distritos prioritarios: ${topDistricts.join(", ")}`);

  return (
    <div className={clsx("mb-3 rounded-lg border px-3 py-2.5", levelColor)}>
      <div className="flex items-center gap-1.5 mb-1">
        <Zap size={10} aria-hidden="true" />
        <p className="text-[10px] font-bold tracking-wide uppercase">
          SINAGERD · {sinagerdLevel}
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
      <p className="text-[10px] text-slate-500 uppercase tracking-wide">Lima Metropolitana</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-red-900/25 border border-red-700/40 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <AlertTriangle size={10} className="text-red-400" />
            <p className="text-[10px] text-slate-400">Alertas activas</p>
          </div>
          <p className="text-xl font-bold text-red-300">{activeCount}</p>
          {criticalCount > 0 && (
            <p className="text-[10px] text-red-400">{criticalCount} crítica{criticalCount !== 1 ? "s" : ""}</p>
          )}
        </div>
        <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Waves size={10} className="text-blue-400" />
            <p className="text-[10px] text-slate-400">Área inundada</p>
          </div>
          <p className="text-xl font-bold text-blue-300">{floodArea.toFixed(1)} km²</p>
          {affectedPop > 0 && (
            <p className="text-[10px] text-blue-400">
              ~{affectedPop > 1000 ? `${(affectedPop / 1000).toFixed(0)}k` : affectedPop} hab.
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
                  <span className="text-slate-300">{altoCount} distr. riesgo alto</span>
                </span>
              )}
              {moderadoCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-orange-400 shrink-0" />
                  <span className="text-slate-400">{moderadoCount} moderado</span>
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
    return <p className="text-xs text-slate-400 px-1">Sin distritos en alerta</p>;
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
                {f.properties.active_alerts} alert.
              </span>
            )}
            {f.properties.urgent_social_3h > 0 && (
              <span className="text-[10px] bg-orange-900/50 text-orange-300 px-1.5 rounded-full">
                {f.properties.urgent_social_3h} señ.
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
  const { data, isLoading, isError } = useDistrictDashboard(ubigeo);
  const { data: fusion } = useFusion(ubigeo);

  if (isLoading)
    return <p className="text-xs text-slate-400 px-1 py-4 text-center">Cargando datos…</p>;
  if (isError || !data)
    return <p className="text-xs text-red-400 px-1 py-4 text-center">Error al cargar</p>;

  const imergValues = data.imerg_trend_30d.map((d) => d.acc_24h_mm);
  const maxImerg = Math.max(...imergValues, 0);
  const latestImerg = imergValues.at(-1) ?? 0;
  const activeAlerts = data.active_alerts.filter((a) => a.status === "active");

  const RISK_BORDER: Record<string, string> = {
    alto: "border-red-500/50 bg-red-900/15",
    moderado: "border-orange-500/40 bg-orange-900/10",
    bajo: "border-green-700/30 bg-green-900/10",
  };
  const RISK_TEXT: Record<string, string> = {
    alto: "text-red-300", moderado: "text-orange-300", bajo: "text-green-400",
  };

  return (
    <div className="space-y-4">
      {/* AI fusion prose */}
      {fusion?.prose_es && (
        <div className={clsx("rounded-lg border px-3 py-2.5", RISK_BORDER[fusion.risk_level] ?? "border-slate-700 bg-surface-panel")}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Brain size={10} className={RISK_TEXT[fusion.risk_level] ?? "text-slate-400"} aria-hidden="true" />
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Análisis multiriesgo
            </p>
            <span className={clsx("ml-auto text-[9px] font-bold uppercase px-1 py-0.5 rounded", RISK_TEXT[fusion.risk_level])}>
              {fusion.risk_level.toUpperCase()}
            </span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">{fusion.prose_es}</p>
        </div>
      )}

      {/* Active alerts list */}
      {activeAlerts.length > 0 && (
        <div>
          <p className="text-[11px] text-slate-400 mb-1.5 flex items-center gap-1">
            <AlertTriangle size={10} /> Alertas activas ({activeAlerts.length})
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
          label="Lluvia 24h (IMERG)"
          value={latestImerg > 0 ? `${latestImerg.toFixed(1)} mm` : "— mm"}
          sub={maxImerg > 0 ? `Máx. 30d: ${maxImerg.toFixed(1)} mm` : "Sin datos recientes"}
          color="text-blue-400"
        />
        <MetricCard
          icon={Users}
          label="Población INEI"
          value={data.district.population ? data.district.population.toLocaleString("es-PE") : "—"}
          sub={data.district.area_km2 ? `${data.district.area_km2.toFixed(1)} km²` : ""}
          color="text-slate-300"
        />
        <MetricCard
          icon={History}
          label="Eventos históricos"
          value={String(data.sinpad_historical_events)}
          sub="SINPAD 2003–2020"
          color="text-amber-400"
        />
        {fusion?.flood.overlap_km2 != null && fusion.flood.overlap_km2 > 0 && (
          <MetricCard
            icon={Waves}
            label="SAR inundado"
            value={`${fusion.flood.overlap_km2.toFixed(1)} km²`}
            sub={`${fusion.flood.active_polygon_count} polígono${fusion.flood.active_polygon_count !== 1 ? "s" : ""} Sentinel-1`}
            color="text-cyan-400"
          />
        )}
      </div>

      {/* IMERG 30-day sparkline */}
      {imergValues.length > 1 && (
        <div className="bg-surface-panel rounded-lg px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <TrendingUp size={10} /> Lluvia diaria — últimos 30 días
            </p>
            <p className="text-[10px] text-blue-400">{latestImerg.toFixed(1)} mm hoy</p>
          </div>
          <Sparkline values={imergValues} color="#38bdf8" />
        </div>
      )}

      {/* Alerts 7-day bar chart */}
      {data.alerts_trend_7d.length > 0 && (
        <div className="bg-surface-panel rounded-lg px-3 py-2">
          <p className="text-[11px] text-slate-400 mb-1 flex items-center gap-1">
            <AlertTriangle size={10} /> Alertas — últimos 7 días
          </p>
          <BarMini days={data.alerts_trend_7d} />
        </div>
      )}

      {/* Social signals 24h */}
      {data.social_24h.length > 0 && (
        <div>
          <p className="text-[11px] text-slate-400 mb-1.5 flex items-center gap-1">
            <Radio size={10} /> Señales sociales — últimas 24h
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.social_24h.map((s) => (
              <SocialPill key={s.label} item={s} />
            ))}
          </div>
        </div>
      )}

      {/* Hydro stations */}
      {data.stations.length > 0 && (
        <div>
          <p className="text-[11px] text-slate-400 mb-1.5">Estaciones hidrométricas cercanas</p>
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
                      <p className="text-[9px] text-orange-400 mt-0.5">Umbral {threshold.toFixed(1)} m superado</p>
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

// ─── Main panel ───────────────────────────────────────────────────────────────

export function DistrictDashboardPanel() {
  const { activePanel, scenario } = useUIStore();
  if (activePanel !== "dashboard") return null;

  return (
    <aside
      className={[
        "fixed bottom-14 left-0 right-0 h-[75vh] rounded-t-2xl",
        "sm:absolute sm:top-4 sm:right-4 sm:bottom-4 sm:left-auto sm:h-auto sm:w-80 sm:max-w-sm sm:rounded-xl",
        "bg-surface-raised border border-slate-700 shadow-xl z-20 flex flex-col",
      ].join(" ")}
      aria-label="Panel de estadísticas distritales"
    >
      <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
        <div className="w-8 h-1 rounded-full bg-slate-600" />
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
        <BarChart3 size={15} className="text-costa-500" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-white">
          {scenario.districtName ?? "Resumen Lima"}
        </h2>
        {scenario.districtUbigeo && (
          <span className="ml-auto text-[10px] text-slate-500">{scenario.districtUbigeo}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {scenario.districtUbigeo ? (
          <DistrictDetail ubigeo={scenario.districtUbigeo} />
        ) : (
          <>
            <SituationSummary />
            <CityOverview />
            <p className="text-[11px] text-slate-400 mb-2 flex items-center gap-1">
              <Mountain size={10} />
              Distritos con alertas activas — selecciona uno
            </p>
            <TopRiskList />
          </>
        )}
      </div>
    </aside>
  );
}
