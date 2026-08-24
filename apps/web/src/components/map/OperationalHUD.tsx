"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useAlerts, useFloodExposure, useApiHealth, useSocialSignals, useScraperHealth, useImerg } from "@/lib/queries";
import { URGENT_SOCIAL_LABELS } from "@/lib/constants";
import { clsx } from "clsx";

// ─── HUD: solid surface chip anchored top-right ───────────────────────────────
// Felt/Linear style: a single opaque card that lists key metrics.
// No glass, no backdrop-blur. Positioned so it doesn't fight the ScenarioPanel.

function limaTime(): string {
  return new Date().toLocaleTimeString("es-PE", {
    timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

type SinagerdLevel = "EMERGENCIA" | "ALERTA" | "AVISO" | "NORMAL";

const LEVEL_CONFIG: Record<SinagerdLevel, {
  bg: string; text: string; dot: string; labelEs: string; labelEn: string;
}> = {
  EMERGENCIA: { bg: "bg-danger-soft",  text: "text-danger",         dot: "bg-danger",       labelEs: "EMERGENCIA", labelEn: "EMERGENCY" },
  ALERTA:     { bg: "bg-warn-soft",    text: "text-warn-muted",     dot: "bg-warn",         labelEs: "ALERTA",     labelEn: "ALERT" },
  AVISO:      { bg: "bg-warn-soft/60", text: "text-warn-muted",     dot: "bg-warn",         labelEs: "AVISO",      labelEn: "NOTICE" },
  NORMAL:     { bg: "bg-ok-soft",      text: "text-ok-muted",       dot: "bg-ok",           labelEs: "NORMAL",     labelEn: "NORMAL" },
};

export function OperationalHUD() {
  const { locale, scenario } = useUIStore();
  const { data: alerts = [] } = useAlerts();
  const { data: exposure } = useFloodExposure();
  const { data: health, isError: apiDown, isLoading: healthLoading } = useApiHealth();
  const { data: socialData } = useSocialSignals(48);
  const { data: scraperHealth } = useScraperHealth();
  const { data: imergData, isError: imergError } = useImerg(72);

  const [clock, setClock] = useState("");
  useEffect(() => {
    setClock(limaTime());
    const id = setInterval(() => setClock(limaTime()), 1000);
    return () => clearInterval(id);
  }, []);

  const active = alerts.filter((a) => a.status === "active");
  const critical = active.filter((a) => a.severity === "critical").length;
  const high     = active.filter((a) => a.severity === "high").length;

  // Max 72h rainfall computed first so it can influence SINAGERD level
  const maxRain72h = imergData?.features.reduce((mx, f) => {
    const v = f.properties.acc_72h_mm ?? 0;
    return v > mx ? v : mx;
  }, 0) ?? 0;
  // Only attribute a watershed name when rainfall is actually above zero to avoid
  // false attribution when maxRain72h=0 (find() matches first feature with 0mm).
  const maxRainWs = maxRain72h > 0
    ? imergData?.features.find((f) => (f.properties.acc_72h_mm ?? 0) === maxRain72h)?.properties.name ?? ""
    : "";
  const rainLevel: "ok" | "warn" | "danger" = maxRain72h >= 50 ? "danger" : maxRain72h >= 25 ? "warn" : "ok";

  // Factor in rainfall for SINAGERD level (consistent with health API, CityOverview, SituationBrief)
  let level: SinagerdLevel =
    critical > 0         ? "EMERGENCIA" :
    high > 1 || active.length > 4 ? "ALERTA" :
    active.length > 0    ? "AVISO" :
                           "NORMAL";
  if (maxRain72h >= 50) level = "EMERGENCIA";
  else if (maxRain72h >= 25 && (level === "AVISO" || level === "NORMAL")) level = "ALERTA";
  else if (maxRain72h >= 15 && level === "NORMAL") level = "AVISO";

  const cfg = LEVEL_CONFIG[level];
  const floodKm2   = exposure?.districts.reduce((s, d) => s + d.overlap_km2, 0) ?? 0;
  const affectedPop = exposure?.total_affected_population ?? 0;
  const urgentSocial = socialData?.features.filter(
    (f) => URGENT_SOCIAL_LABELS.has(f.properties.triage_label ?? ""),
  ).length ?? 0;
  const online = health?.status === "ok" && !apiDown;

  // Scraper degradation: count offline sources for an at-a-glance chip.
  // Exclude best-effort / long-cadence sources (reddit, telegram, flood/SAR)
  // from the degradation calculation: they're expected offline between acquisitions.
  const _SCRAPER_CORE_KEYS = new Set(["bluesky", "rss", "imerg", "stations", "alerts"]);
  const scraperSources = scraperHealth?.sources
    ? Object.entries(scraperHealth.sources)
        .filter(([k]) => _SCRAPER_CORE_KEYS.has(k))
        .map(([, v]) => v)
    : [];
  const offlineSources = scraperSources.filter((s) => s.status === "offline").length;
  const staleSources = scraperSources.filter((s) => s.status === "stale").length;
  const scraperLevel: "ok" | "warn" | "danger" =
    offlineSources >= 3 ? "danger" : (offlineSources > 0 || staleSources > 2) ? "warn" : "ok";

  return (
    /* Desktop only; mobile gets SituationBrief */
    <div
      className="hidden sm:flex absolute top-4 right-4 z-10 items-center gap-1 pointer-events-none"
      role="status"
      aria-label="SINAGERD operational status"
    >
      {/* Status level pill */}
      <div
        className={clsx(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-strong bg-surface shadow-card",
          "pointer-events-auto",
        )}
      >
        {/* EMERGENCIA pulses fast (0.8s) to draw operator attention; other non-NORMAL levels pulse at default (2s) */}
        <span
          className={clsx("w-2 h-2 rounded-full shrink-0", cfg.dot,
            level === "EMERGENCIA" ? "[animation:pulse_0.8s_cubic-bezier(0.4,0,0.6,1)_infinite]"
            : level !== "NORMAL" ? "animate-pulse" : ""
          )}
          aria-hidden="true"
        />
        <span className={clsx("text-xs font-semibold tracking-wide", cfg.text)}>
          {locale === "es" ? cfg.labelEs : cfg.labelEn}
        </span>
      </div>

      {/* Metrics */}
      <div className="flex items-center bg-surface border border-border-strong rounded-xl shadow-card pointer-events-auto overflow-hidden">
        <HudMetric
          value={String(active.length)}
          label={locale === "es" ? "alertas" : "alerts"}
          danger={active.length > 0}
          border
        />
        {critical > 0 && (
          <HudMetric
            value={String(critical)}
            label={locale === "es" ? "críticas" : "critical"}
            danger
            border
          />
        )}
        {floodKm2 > 0 && (
          <HudMetric value={`${floodKm2.toFixed(1)}`} label="km² SAR" border />
        )}
        {affectedPop > 0 && (
          <HudMetric
            value={affectedPop >= 1000 ? `${(affectedPop / 1000).toFixed(0)}k` : String(affectedPop)}
            label={locale === "es" ? "pob." : "pop."}
            border
          />
        )}
        {urgentSocial > 0 && (
          <HudMetric value={String(urgentSocial)} label={locale === "es" ? "señales" : "signals"} border />
        )}
        {/* Rainfall data-gap chip: shown when IMERG fetch failed so operator knows data is missing */}
        {imergError && (
          <div
            className="flex items-center gap-1 px-2.5 py-1.5 border-r border-border-subtle"
            title={locale === "es" ? "Datos de lluvia IMERG no disponibles, verifica conexión" : "IMERG rainfall data unavailable, check connection"}
          >
            <span className="text-2xs font-bold uppercase tracking-widest text-ink-subtle">
              {locale === "es" ? "LLUVIA?" : "RAIN?"}
            </span>
          </div>
        )}
        {/* Rainfall chip: only show when above AVISO threshold (≥25 mm/72h) */}
        {!imergError && rainLevel !== "ok" && maxRain72h > 0 && (
          <div
            className={clsx(
              "flex items-center gap-1 px-2.5 py-1.5 border-r border-border-subtle",
            )}
            title={locale === "es"
              ? `Lluvia 72h: ${maxRain72h.toFixed(0)} mm${maxRainWs ? ` (${maxRainWs})` : ""}, ${rainLevel === "danger" ? "⚠ EMERGENCIA ANA (>50mm)" : "ALERTA ANA (>25mm)"}`
              : `72h rain: ${maxRain72h.toFixed(0)} mm${maxRainWs ? ` (${maxRainWs})` : ""}, ${rainLevel === "danger" ? "⚠ ANA EMERGENCY (>50mm)" : "ANA ALERT (>25mm)"}`}
          >
            <span className="text-xs font-mono tabular-nums">
              <span className={rainLevel === "danger" ? "text-danger font-bold" : "text-warn-muted font-semibold"}>
                {maxRain72h.toFixed(0)}
              </span>
              <span className="text-ink-muted text-2xs"> mm</span>
            </span>
          </div>
        )}
        {/* Scraper degradation chip (only when not ok) */}
        {scraperLevel !== "ok" && scraperHealth && (
          <button
            type="button"
            onClick={() => useUIStore.getState().setActivePanel("sources")}
            className={clsx(
              "flex items-center gap-1 px-2.5 py-1.5 border-r border-border-subtle",
              "hover:bg-surface-sunken transition-colors",
            )}
            title={locale === "es"
              ? `Fuentes clave: ${offlineSources} sin datos, ${staleSources} con retraso (Bluesky/RSS/IMERG/estaciones/alertas). Click para detalles.`
              : `Core feeds: ${offlineSources} offline, ${staleSources} stale (Bluesky/RSS/IMERG/stations/alerts). Click for details.`}
            aria-label={locale === "es" ? "Estado de fuentes degradado" : "Data source status degraded"}
          >
            {/* Fast pulse (0.8s) for danger: matches EMERGENCIA HUD urgency signal */}
            <span
              className={clsx(
                "w-1.5 h-1.5 rounded-full shrink-0",
                scraperLevel === "danger"
                  ? "bg-danger [animation:pulse_0.8s_cubic-bezier(0.4,0,0.6,1)_infinite]"
                  : "bg-warn",
              )}
              aria-hidden="true"
            />
            <span className={clsx(
              "text-2xs font-bold uppercase tracking-widest",
              scraperLevel === "danger" ? "text-danger" : "text-warn-muted",
            )}>
              {locale === "es" ? "FUENTES" : "FEEDS"}
            </span>
            <span className="text-2xs font-mono tabular-nums text-ink-subtle">
              {offlineSources > 0 ? `-${offlineSources}` : `~${staleSources}`}
            </span>
          </button>
        )}
        {/* Clock */}
        <div className="flex items-center gap-1.5 px-3 py-1.5">
          <span
            className={clsx(
              "w-1.5 h-1.5 rounded-full shrink-0",
              online ? "bg-ok live-dot" : "bg-ink-subtle",
            )}
            aria-hidden="true"
          />
          <span className="text-xs font-mono tabular-nums text-ink-muted">{clock}</span>
          {scenario.isReplayMode && (
            // The tutorial drops the console into the 2017 replay, and the only
            // way back used to be a small chip inside the Scenario panel. This
            // badge is always on screen, so it is where the exit belongs.
            <button
              onClick={() => useUIStore.getState().setScenario({ isReplayMode: false, replayDate: null })}
              className="ml-1 flex items-center gap-1 text-2xs font-semibold text-warn bg-warn-soft px-2 py-0.5 rounded-full hover:bg-warn/20 transition-colors"
              title={locale === "es" ? "Volver a datos en vivo" : "Return to live data"}
              aria-label={locale === "es" ? "Salir de la simulación El Niño 2017" : "Exit the El Niño 2017 simulation"}
            >
              {locale === "es" ? "SIMULACIÓN 2017" : "SIMULATION 2017"}
              <X size={9} strokeWidth={2.5} aria-hidden="true" />
              {locale === "es" ? "Salir" : "Exit"}
            </button>
          )}
          {/* Show DEMO badge only when we have a confirmed error, not during initial load */}
          {apiDown && !healthLoading && (
            <span className="ml-1 text-2xs font-semibold text-warn bg-warn-soft px-1.5 py-0.5 rounded-full animate-pulse" title={locale === "en" ? "API unavailable, showing demo data" : "API no disponible, mostrando datos de demostración"}>
              {locale === "en" ? "NO CONNECTION" : "SIN CONEXIÓN"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function HudMetric({
  value,
  label,
  danger = false,
  border = false,
}: {
  value: string;
  label: string;
  danger?: boolean;
  border?: boolean;
}) {
  return (
    <div className={clsx("flex items-baseline gap-1 px-3 py-1.5", border && "border-r border-border-subtle")}>
      <span className={clsx("text-sm font-bold font-mono tabular-nums", danger ? "text-danger" : "text-ink")}>
        {value}
      </span>
      <span className="text-2xs text-ink-subtle">{label}</span>
    </div>
  );
}
