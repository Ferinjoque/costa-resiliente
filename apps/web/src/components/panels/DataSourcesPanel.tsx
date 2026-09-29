"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  ExternalLink,
  Globe,
  X,
  RefreshCw,
} from "lucide-react";
import { clsx } from "clsx";
import { useUIStore } from "@/store/ui";
import { useScraperHealth, useHuaycoModelCard } from "@/lib/queries";
import type { ScraperSourceHealth } from "@/lib/api";
import {
  PanelHeader,
  PanelTitle,
  SectionLabel,
  Pill,
  Divider,
} from "@/components/ui/primitives";

// ─── Types & data ──────────────────────────────────────────────────────────────

interface Source {
  id: string;
  name: string;
  provider: string;
  coverage: string;
  latency: string;
  url: string;
  notes?: string;
  status?: "ok" | "warn" | "danger";
  healthKey?: string; // maps to ScraperHealth.sources key
}

const SOURCES: Source[] = [
  {
    id: "sentinel1",
    name: "Sentinel-1 SAR",
    provider: "ESA / Microsoft Planetary Computer",
    coverage: "Lima AOI: 10 m resolución",
    latency: "~3 h tras adquisición",
    url: "https://planetarycomputer.microsoft.com/dataset/sentinel-1-grd",
    notes: "Ingesta implementada; sin checkpoint SAR publicable, los polígonos del mapa son de escenario.",
    status: "warn",
    healthKey: "flood",
  },
  {
    id: "open-meteo",
    name: "Open-Meteo (condiciones actuales)",
    provider: "Open-Meteo, CC BY 4.0",
    coverage: "Temperatura, humedad, viento y ráfagas en 5 puntos de Lima y Callao",
    latency: "~15 min",
    url: "https://open-meteo.com/",
    notes: "Sin API key ni cuenta. Alimenta los avisos de calor, frío, viento, niebla y tormenta.",
    status: "ok",
    healthKey: "weather",
  },
  {
    id: "imerg",
    name: "NASA IMERG Early Run V07",
    provider: "NASA GES DISC",
    coverage: "Global: 0.1° (~11 km), cada 30 min",
    latency: "~4-5 h tras observación",
    url: "https://gpm.nasa.gov/data/imerg",
    notes: "Observación real por cuenca, cada hora (token Earthdata). La capa de lluvia del mapa muestra el escenario de demostración; la observación real va en la barra de frescura y el SITREP.",
    status: "ok",
    healthKey: "imerg",
  },
  {
    id: "ana",
    name: "ANA Observatorio Chirilu + SNIRH",
    provider: "Autoridad Nacional del Agua, Perú",
    coverage: "Estaciones cuencas Rímac, Chillón, Lurín",
    latency: "30 min (scraper)",
    url: "https://observatoriochirilu.ana.gob.pe",
    notes: "Scraper HTML: puede ser frágil si el sitio cambia su estructura.",
    status: "warn",
    healthKey: "stations",
  },
  {
    id: "senamhi",
    name: "SENAMHI",
    provider: "Servicio Nacional de Meteorología e Hidrología",
    coverage: "Estaciones meteorológicas Lima",
    latency: "30 min (scraper)",
    url: "https://www.senamhi.gob.pe",
    status: "ok",
    healthKey: "stations",
  },
  {
    id: "sinpad",
    name: "INDECI SINPAD 2003-2020",
    provider: "Instituto Nacional de Defensa Civil",
    coverage: "2 063 eventos Lima: inundación y huayco",
    latency: "Histórico (estático)",
    url: "https://sinpad2.indeci.gob.pe",
    notes: "Base de peligro derivada de densidad histórica. SIGRID nativo requiere autenticación SSO.",
    status: "warn",
  },
  {
    id: "cenepred-er",
    name: "CENEPRED: Escenario de riesgo El Niño",
    provider: "Centro Nacional de Estimación, Prevención y Reducción del Riesgo de Desastres",
    coverage: "Riesgo por inundación y por movimientos en masa, límites oficiales INEI: 178 distritos de Lima y Callao",
    latency: "Estudio oficial (estático)",
    url: "https://sig.cenepred.gob.pe/arcgis_server/rest/services/FEN/ER_NINO2027_BD/MapServer",
    notes: "Servicio ArcGIS público, sin credenciales. Es la clasificación del Estado, no una estimación nuestra.",
    status: "ok",
  },
  {
    id: "cenepred-coen",
    name: "CENEPRED / COEN FEN 2023",
    provider: "Centro de Operaciones de Emergencia Nacional",
    coverage: "Comisarías PNP y almacenes nacionales de INDECI (144 activos)",
    latency: "Estático",
    url: "https://sig.cenepred.gob.pe/arcgis_server/rest/services/sectores/COEN_FEN_2023_10_5_1X/MapServer",
    status: "ok",
  },
  {
    id: "osm",
    name: "OpenStreetMap",
    provider: "OpenStreetMap Contributors / Overpass API",
    coverage: "Hospitales, escuelas, puentes, subestaciones, bomberos (43k+ puntos)",
    latency: "Actualización manual",
    url: "https://overpass-api.de",
    status: "ok",
  },
  {
    id: "bluesky",
    name: "Bluesky Jetstream v2",
    provider: "Bluesky PBC (AT Protocol)",
    coverage: "Firehose público: publicaciones con palabras clave de desastre",
    latency: "Tiempo real (lotes de 15 min)",
    url: "https://bsky.app",
    status: "ok",
    healthKey: "bluesky",
  },
  {
    id: "rss",
    name: "RSS: 6 medios peruanos",
    provider: "RPP, Andina, Canal N, El Comercio, La República, Peru21",
    coverage: "Noticias filtradas por palabras clave: últimas 48 h",
    latency: "15 min",
    url: "https://andina.pe/agencia/rss.aspx",
    status: "ok",
    healthKey: "rss",
  },
  {
    id: "reddit",
    name: "Reddit (r/Peru, r/Lima, r/Chosica)",
    provider: "Reddit Inc.",
    coverage: "Publicaciones recientes con palabras clave",
    latency: "15 min (API JSON pública)",
    url: "https://www.reddit.com/r/Peru",
    status: "ok",
    healthKey: "reddit",
  },
  {
    id: "telegram",
    name: "Telegram: Senamhi_Peru",
    provider: "Canal oficial SENAMHI en Telegram",
    coverage: "Alertas hidrometeorológicas oficiales",
    latency: "15 min",
    url: "https://t.me/Senamhi_Peru",
    status: "ok",
    healthKey: "telegram",
  },
];

const GROUPS: { labelEs: string; labelEn: string; ids: string[] }[] = [
  { labelEs: "Teledetección",              labelEn: "Remote sensing",       ids: ["sentinel1", "imerg"] },
  { labelEs: "Meteorología",               labelEn: "Weather",              ids: ["open-meteo"] },
  { labelEs: "Estaciones e institucional", labelEn: "Stations & institutional", ids: ["ana", "senamhi", "cenepred-er", "cenepred-coen", "sinpad"] },
  { labelEs: "Infraestructura",            labelEn: "Infrastructure",       ids: ["osm"] },
  { labelEs: "Señales sociales",           labelEn: "Social signals",       ids: ["bluesky", "rss", "reddit", "telegram"] },
];

const STATUS_LABEL: Record<string, { es: string; en: string }> = {
  ok:     { es: "Activo",    en: "Active"  },
  warn:   { es: "Frágil",    en: "Fragile" },
  danger: { es: "Bloqueado", en: "Blocked" },
};

function formatAgo(isoDate: string | null, locale: "es" | "en"): string {
  if (!isoDate) return locale === "es" ? "nunca" : "never";
  const mins = Math.round((Date.now() - new Date(isoDate).getTime()) / 60000);
  if (mins < 1) return locale === "es" ? "ahora" : "now";
  if (mins < 60) return locale === "es" ? `hace ${mins} min` : `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return locale === "es" ? `hace ${hrs} h` : `${hrs}h ago`;
}

// ─── SourceRow ─────────────────────────────────────────────────────────────────

function SourceRow({
  source,
  locale,
  health,
}: {
  source: Source;
  locale: "es" | "en";
  health?: ScraperSourceHealth;
}) {
  const [open, setOpen] = useState(false);

  const liveStatus: "ok" | "warn" | "danger" | undefined = health
    ? health.status === "ok" ? "ok"
    : health.status === "stale" ? "warn"
    : "danger"
    : undefined;

  const status = liveStatus ?? source.status ?? "ok";
  const statusLabel = STATUS_LABEL[status]?.[locale] ?? status;

  const coverageLabel = locale === "es" ? "Cobertura"  : "Coverage";
  const latencyLabel  = locale === "es" ? "Latencia"   : "Latency";

  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors text-left gap-3"
        aria-expanded={open}
        aria-controls={`source-body-${source.id}`}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink truncate">{source.name}</p>
          <p className="text-xs text-ink-muted truncate">{source.provider}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Pill variant={status as "ok" | "warn" | "danger"}>{statusLabel}</Pill>
          {open
            ? <ChevronUp  size={13} className="text-ink-subtle" aria-hidden="true" />
            : <ChevronDown size={13} className="text-ink-subtle" aria-hidden="true" />
          }
        </div>
      </button>

      {open && (
        <div
          id={`source-body-${source.id}`}
          className="px-4 pb-4 space-y-2"
        >
          {/* Coverage */}
          <div className="flex items-start gap-2">
            <Globe size={12} className="text-ink-subtle mt-0.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wide mb-0.5">
                {coverageLabel}
              </p>
              <p className="text-xs text-ink-muted leading-snug">{source.coverage}</p>
            </div>
          </div>

          {/* Latency + live last-seen */}
          <div className="flex items-start gap-2">
            <Clock size={12} className="text-ink-subtle mt-0.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wide mb-0.5">
                {latencyLabel}
              </p>
              <p className="text-xs font-mono text-ink-muted">{source.latency}</p>
              {health && (
                <p className="text-xs text-ink-subtle mt-0.5">
                  {locale === "es" ? "Último dato" : "Last seen"}:{" "}
                  <span className={clsx(
                    "font-mono",
                    health.status === "ok" ? "text-ok" :
                    health.status === "stale" ? "text-warn-muted" : "text-danger"
                  )}>
                    {formatAgo(health.last_seen_at, locale)}
                  </span>
                  {" · "}{health.count.toLocaleString()} {locale === "es" ? "registros" : "records"}
                </p>
              )}
            </div>
          </div>

          {/* Notes */}
          {source.notes && (
            <div className="flex items-start gap-2 bg-warn-soft rounded-lg px-2.5 py-2">
              <AlertTriangle size={12} className="text-warn-muted mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-xs text-ink-muted leading-snug">{source.notes}</p>
            </div>
          )}

          {/* Link */}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent rounded"
            aria-label={
              locale === "es"
                ? `Abrir ${source.name} en nueva pestaña`
                : `Open ${source.name} in new tab`
            }
          >
            <ExternalLink size={11} aria-hidden="true" />
            {source.url.replace(/^https?:\/\//, "").split("/")[0]}
          </a>
        </div>
      )}
    </li>
  );
}

// ─── DataSourcesPanel ─────────────────────────────────────────────────────────

export function DataSourcesPanel() {
  const { activePanel, setActivePanel, locale } = useUIStore();
  const { data: scraperHealth, isError: healthError, isFetching: healthFetching, refetch: refetchHealth } = useScraperHealth();

  if (activePanel !== "sources") return null;

  const title = locale === "es" ? "Fuentes de datos" : "Data sources";

  const getLiveStatus = (s: Source): "ok" | "warn" | "danger" => {
    if (!scraperHealth || !s.healthKey) return s.status ?? "ok";
    const h = scraperHealth.sources[s.healthKey];
    if (!h) return s.status ?? "ok";
    return h.status === "ok" ? "ok" : h.status === "stale" ? "warn" : "danger";
  };

  const okCount     = SOURCES.filter((s) => getLiveStatus(s) === "ok").length;
  const warnCount   = SOURCES.filter((s) => getLiveStatus(s) === "warn").length;
  const dangerCount = SOURCES.filter((s) => getLiveStatus(s) === "danger").length;

  const sourceMap = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

  return (
    <aside
      className={[
        "fixed bottom-14 left-0 right-0 h-[70vh] rounded-t-2xl",
        "sm:absolute sm:top-0 sm:right-0 sm:h-full sm:w-[360px] sm:rounded-none sm:bottom-auto sm:left-auto",
        "bg-surface border-t border-border-strong sm:border-t-0 sm:border-l shadow-panel z-20 flex flex-col panel-animate",
      ].join(" ")}
      aria-label={title}
      role="complementary"
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
        <div className="w-8 h-1 rounded-full bg-border-strong" />
      </div>

      {/* Header */}
      <PanelHeader>
        <Database size={15} className="text-accent shrink-0" aria-hidden="true" />
        <PanelTitle>{title}</PanelTitle>
        <span className="text-xs font-mono tabular-nums text-ink-subtle bg-surface-sunken rounded px-1.5 py-0.5 shrink-0">
          {SOURCES.length}
        </span>
        <button
          onClick={() => setActivePanel("map")}
          className="ml-auto p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={locale === "es" ? "Cerrar panel" : "Close panel"}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </PanelHeader>

      {/* Grouped source list */}
      <div
        className="flex-1 overflow-y-auto"
        role="list"
        aria-label={locale === "es" ? "Fuentes de datos" : "Data sources"}
      >
        {GROUPS.map((group, gi) => {
          const groupSources = group.ids
            .map((id) => sourceMap[id])
            .filter(Boolean) as Source[];
          if (groupSources.length === 0) return null;

          return (
            <div key={group.labelEn}>
              {gi > 0 && <Divider />}
              <div className="px-4 pt-3 pb-1">
                <SectionLabel>
                  {locale === "es" ? group.labelEs : group.labelEn}
                </SectionLabel>
              </div>
              <ul>
                {groupSources.map((s) => (
                  <SourceRow
                    key={s.id}
                    source={s}
                    locale={locale}
                    health={s.healthKey ? scraperHealth?.sources[s.healthKey] : undefined}
                  />
                ))}
              </ul>
            </div>
          );
        })}

        <Divider />
        <ModelCard locale={locale} />
        <Divider />
        <KnownLimitations locale={locale} />
      </div>

      {/* Footer: status summary + privacy */}
      <div className="border-t border-border px-4 py-3 flex flex-col gap-1.5">
        {/* Status dots */}
        <div className="flex items-center gap-3">
          <StatusDot color="bg-ok"          count={okCount}     label={locale === "es" ? "activas"    : "active"}  />
          <StatusDot color="bg-warn-muted"  count={warnCount}   label={locale === "es" ? "frágiles"   : "fragile"} />
          <StatusDot color="bg-danger"      count={dangerCount} label={locale === "es" ? "bloqueadas" : "blocked"} />
          <button
            onClick={() => refetchHealth()}
            disabled={healthFetching}
            className="ml-auto flex items-center gap-1 text-[10px] text-ink-subtle hover:text-ink transition-colors disabled:opacity-40 rounded focus-visible:outline-2 focus-visible:outline-accent"
            aria-label={locale === "es" ? "Actualizar estado de fuentes" : "Refresh source status"}
          >
            <RefreshCw size={9} className={healthFetching ? "animate-spin" : ""} aria-hidden="true" />
            {healthError
              ? <span className="text-danger">{locale === "es" ? "error" : "error"}</span>
              : scraperHealth
                ? formatAgo(scraperHealth.retrieved_at, locale)
                : (locale === "es" ? "actualizar" : "refresh")}
          </button>
        </div>
        {/* Privacy / retention */}
        <p className="text-[10px] text-ink-subtle">
          {locale === "es"
            ? "PII redactado (presidio) · retención 7 días"
            : "PII redacted (presidio) · 7-day retention"}
        </p>
        {/* Redis health */}
        {scraperHealth?.redis && (
          <p className={clsx(
            "text-[10px]",
            scraperHealth.redis.status === "ok" ? "text-ok-muted" : "text-danger",
          )}>
            Redis: {scraperHealth.redis.status === "ok"
              ? (locale === "es" ? "conectado" : "connected")
              : (locale === "es" ? "desconectado ⚠" : "offline ⚠")}
          </p>
        )}
        {/* SINAGERD level from scraper health (Session 23 enrichment) */}
        {scraperHealth?.sinagerd_level && (
          <p className={clsx(
            "text-[10px] font-semibold",
            scraperHealth.sinagerd_level === "EMERGENCIA" ? "text-danger"
            : scraperHealth.sinagerd_level === "ALERTA" ? "text-warn-muted"
            : "text-ok-muted",
          )}>
            SINAGERD: {scraperHealth.sinagerd_level}
            {scraperHealth.critical_alerts
              ? ` · ${scraperHealth.critical_alerts} ${locale === "es" ? "crítica(s)" : "critical"}` : ""}
          </p>
        )}
      </div>
    </aside>
  );
}

/**
 * What the system does not know.
 *
 * The repository documentation was already explicit about these gaps, but none
 * of it reached the operator, who sees only the map. An emergency console that
 * hides its own limitations is worse than one with fewer features: someone can
 * evacuate a quebrada on a number this text exists to qualify.
 */
const LIMITATIONS: { es: string; en: string }[] = [
  {
    es: "Puntos de huayco por quebrada: valores del escenario de demostración. La probabilidad real por distrito la da la capa \"Huaycos: modelo entrenado\", validada en 2017-2020.",
    en: "Per-quebrada huayco points: demo scenario values. The real per-district probability is the \"Debris flows: trained model\" layer, validated on 2017-2020.",
  },
  {
    es: "Inundación SAR: los polígonos en el mapa son sintéticos y están rotulados como tales. No existe un checkpoint Sen1Floods11 publicable para SAR; la ruta de inferencia está implementada y probada, a la espera de pesos.",
    en: "SAR flood: the polygons on the map are synthetic and labelled as such. No publishable Sen1Floods11 SAR checkpoint exists; the inference path is implemented and tested, awaiting weights.",
  },
  {
    es: "Lluvia IMERG: la capa del mapa muestra el escenario de demostración. La observación real de la NASA (Early Run, ~4-5 h de latencia) se ingiere cada hora y aparece en la barra de frescura y el SITREP.",
    en: "IMERG rainfall: the map layer shows the demo scenario. The real NASA observation (Early Run, ~4-5 h latency) is ingested hourly and shown in the freshness bar and the SITREP.",
  },
  {
    es: "Peligro histórico: derivado de densidad de eventos SINPAD 2003-2020, no de los polígonos SIGRID de CENEPRED, cuyo portal exige SSO. La clasificación oficial de CENEPRED sí está disponible, pero a nivel de distrito, no de zona.",
    en: "Historical hazard: derived from SINPAD 2003-2020 event density, not CENEPRED's SIGRID polygons, whose portal requires SSO. CENEPRED's official classification is available, but per district, not per zone.",
  },
  {
    es: "Reddit y Telegram operan en modo best-effort y pueden quedar sin datos recientes sin que ello indique una falla del sistema.",
    en: "Reddit and Telegram run best-effort and may go without recent data without that indicating a system failure.",
  },
];

/**
 * The trained mass-movement model, with its held-out numbers next to the
 * rain-free baseline, so a reader can see what the rainfall actually adds.
 */
function ModelCard({ locale }: { locale: "es" | "en" }) {
  const [open, setOpen] = useState(false);
  const { data } = useHuaycoModelCard();
  if (!data) return null;
  const t = data.metrics.test_2017_2020;
  const b = data.metrics.baseline_no_rain_2017_2020;
  const es = locale === "es";
  const x = (m: { pr_auc: number; pr_auc_random: number }) => (m.pr_auc / m.pr_auc_random).toFixed(1);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-surface-hover transition-colors text-left"
      >
        <BrainCircuit size={13} strokeWidth={1.75} className="text-accent shrink-0" aria-hidden="true" />
        <span className="text-xs font-semibold text-ink flex-1">
          {es ? "Modelo de huaycos entrenado" : "Trained debris-flow model"}
        </span>
        <span className="text-2xs text-ink-subtle tabular-nums">AUC {t.roc_auc.toFixed(2)}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 flex flex-col gap-2 text-[11px] leading-snug text-ink-muted">
          <p>
            {es
              ? `XGBoost que estima la probabilidad de un huayco, deslizamiento o derrumbe en cada distrito en las próximas 72 h, a partir de la lluvia (ERA5) y la susceptibilidad de CENEPRED. Etiquetas: ${data.metrics.labels.replace("SINPAD/INDECI 2003-2020: ", "inventario SINPAD/INDECI: ")}.`
              : `XGBoost estimating the probability of a debris flow, landslide or rockfall in each district within 72 h, from rainfall (ERA5) and CENEPRED susceptibility. Labels: SINPAD/INDECI inventory.`}
          </p>
          <p>
            {es
              ? `Entrenado con las temporadas ${data.metrics.train_seasons}; evaluado en ${data.metrics.test_seasons}, que el modelo nunca vio (incluye El Niño costero 2017).`
              : `Trained on the ${data.metrics.train_seasons} seasons; tested on ${data.metrics.test_seasons}, never seen in training (includes the 2017 coastal El Niño).`}
          </p>
          <table className="w-full tabular-nums">
            <thead>
              <tr className="text-2xs text-ink-subtle">
                <th className="text-left font-normal">{es ? "Prueba 2017-2020" : "Test 2017-2020"}</th>
                <th className="text-right font-normal">ROC-AUC</th>
                <th className="text-right font-normal">{es ? "PR-AUC vs azar" : "PR-AUC vs chance"}</th>
                <th className="text-right font-normal">{es ? "Eventos en 10% superior" : "Events in top 10%"}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="text-ink">
                <td>{es ? "Modelo" : "Model"}</td>
                <td className="text-right font-semibold">{t.roc_auc.toFixed(2)}</td>
                <td className="text-right font-semibold">{x(t)}×</td>
                <td className="text-right font-semibold">{Math.round(t.events_in_top_decile * 100)}%</td>
              </tr>
              <tr>
                <td>{es ? "Sin lluvia (base)" : "No rain (baseline)"}</td>
                <td className="text-right">{b.roc_auc.toFixed(2)}</td>
                <td className="text-right">{x(b)}×</td>
                <td className="text-right">{Math.round(b.events_in_top_decile * 100)}%</td>
              </tr>
            </tbody>
          </table>
          <p className="text-2xs text-ink-subtle">
            {es
              ? `${t.events} eventos en prueba. Lluvia en celdas de 0.5°: resolución gruesa, el detalle espacial viene de CENEPRED y del historial del distrito. Versión ${data.version}.`
              : `${t.events} test events. Rain on 0.5° cells: coarse; spatial detail comes from CENEPRED and district history. Version ${data.version}.`}
          </p>
        </div>
      )}
    </div>
  );
}

function KnownLimitations({ locale }: { locale: "es" | "en" }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-surface-hover transition-colors text-left"
      >
        <AlertTriangle size={13} strokeWidth={1.75} className="text-warn-muted shrink-0" aria-hidden="true" />
        <span className="text-xs font-semibold text-ink flex-1">
          {locale === "es" ? "Limitaciones conocidas" : "Known limitations"}
        </span>
        <span className="text-2xs text-ink-subtle tabular-nums">{LIMITATIONS.length}</span>
      </button>
      {open && (
        <ul className="px-4 pb-3 flex flex-col gap-2">
          {LIMITATIONS.map((item, i) => (
            <li key={i} className="text-[11px] leading-snug text-ink-muted flex gap-2">
              <span className="text-warn-muted shrink-0" aria-hidden="true">•</span>
              <span>{locale === "es" ? item.es : item.en}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusDot({
  color,
  count,
  label,
}: {
  color: string;
  count: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", color)} aria-hidden="true" />
      <span className="text-[10px] tabular-nums text-ink-subtle">
        <span className="font-semibold text-ink">{count}</span> {label}
      </span>
    </div>
  );
}
