"use client";

import { BarChart3, Droplets, AlertTriangle, Users, History, Radio, TrendingUp, Waves, Mountain, Zap } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useDistrictDashboard, useDistrictRiskSummary, useAlerts, useFloodExposure } from "@/lib/queries";
import { clsx } from "clsx";
import type { ImergTrendDay, AlertTrendDay, SocialBreakdown } from "@/lib/api";

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
  const activeCount = alerts.filter((a) => a.status === "active").length;
  const criticalCount = alerts.filter((a) => a.severity === "critical" && a.status === "active").length;
  const floodArea = exposure?.districts.reduce((sum, d) => sum + d.overlap_km2, 0) ?? 0;
  const affectedPop = exposure?.total_affected_population ?? 0;

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

function DistrictDetail({ ubigeo }: { ubigeo: string }) {
  const { data, isLoading, isError } = useDistrictDashboard(ubigeo);

  if (isLoading)
    return <p className="text-xs text-slate-400 px-1 py-4 text-center">Cargando datos…</p>;
  if (isError || !data)
    return <p className="text-xs text-red-400 px-1 py-4 text-center">Error al cargar</p>;

  const imergValues = data.imerg_trend_30d.map((d) => d.acc_24h_mm);
  const maxImerg = Math.max(...imergValues, 0);
  const latestImerg = imergValues.at(-1) ?? 0;

  return (
    <div className="space-y-4">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          icon={AlertTriangle}
          label="Alertas activas"
          value={String(data.active_alerts.length)}
          sub={data.active_alerts[0]?.title.slice(0, 32) + (data.active_alerts[0]?.title.length > 32 ? "…" : "") || "Sin alertas"}
          color="text-red-400"
        />
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
            {data.stations.map((st) => (
              <div
                key={st.code}
                className="flex items-center justify-between bg-surface-panel rounded-lg px-2.5 py-1.5"
              >
                <div>
                  <p className="text-xs text-slate-200">{st.name}</p>
                  <p className="text-[10px] text-slate-500">{st.river} · {st.source.toUpperCase()}</p>
                </div>
                <div className="text-right">
                  {st.level_m != null && (
                    <p className="text-xs text-blue-300 font-mono">{st.level_m.toFixed(2)} m</p>
                  )}
                  {st.flow_m3s != null && (
                    <p className="text-[10px] text-slate-400 font-mono">{st.flow_m3s.toFixed(1)} m³/s</p>
                  )}
                </div>
              </div>
            ))}
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
