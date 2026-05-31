/**
 * Minimal bilingual string table for Costa Resiliente.
 * Only strings judges see in the main UI flow.
 * FusionCallout has its own T object and is not duplicated here.
 */

export type Locale = "es" | "en";

const strings = {
  // Navigation
  nav: {
    map:       { es: "Mapa",      en: "Map" },
    alerts:    { es: "Alertas",   en: "Alerts" },
    dashboard: { es: "Datos",     en: "Data" },
    ask:       { es: "Consultar", en: "Ask" },
    log:       { es: "Registro",  en: "Log" },
    sources:   { es: "Info",      en: "Info" },
  },

  // Alerts panel
  alerts: {
    title:        { es: "Alertas",                   en: "Alerts" },
    noAlerts:     { es: "No hay alertas activas",    en: "No active alerts" },
    loading:      { es: "Cargando alertas…",         en: "Loading alerts…" },
    error:        { es: "Error al cargar alertas — mostrando datos de demostración", en: "Failed to load alerts — showing demo data" },
    acknowledge:  { es: "Reconocer alerta",          en: "Acknowledge alert" },
    personsAtRisk:{ es: "personas en zona inundada", en: "people in flood zone" },
    updated:      { es: "Actualizado",               en: "Updated" },
    liveSSE:      { es: "Actualización en tiempo real (SSE)", en: "Real-time updates (SSE)" },
    severity: {
      critical: { es: "Crítica",  en: "Critical" },
      high:     { es: "Alta",     en: "High" },
      medium:   { es: "Media",    en: "Medium" },
      low:      { es: "Baja",     en: "Low" },
    },
    type: {
      flood:          { es: "inundación",     en: "flood" },
      huayco:         { es: "huayco",         en: "huayco" },
      social_cluster: { es: "señal social",   en: "social signal" },
    },
  },

  // Dashboard panel
  dashboard: {
    titleCity:         { es: "Resumen Lima",          en: "Lima Overview" },
    lima:              { es: "Lima Metropolitana",    en: "Lima Metropolitan" },
    activeAlerts:      { es: "Alertas activas",       en: "Active alerts" },
    floodArea:         { es: "Área inundada",         en: "Flood area" },
    inhabitants:       { es: "hab.",                  en: "pop." },
    priorityDistricts: { es: "Distritos con alertas activas — selecciona uno",
                         en: "Districts with active alerts — select one" },
    people:            { es: "Población INEI",        en: "INEI Population" },
    rain24h:           { es: "Lluvia 24h (IMERG)",    en: "Rainfall 24h (IMERG)" },
    maxLast30d:        { es: "Máx. 30d:",             en: "Max 30d:" },
    noRecentData:      { es: "Sin datos recientes",   en: "No recent data" },
    historical:        { es: "Eventos históricos",    en: "Historical events" },
    sinpad:            { es: "SINPAD 2003–2020",      en: "SINPAD 2003–2020" },
    rain30d:           { es: "Lluvia diaria — últimos 30 días", en: "Daily rainfall — last 30 days" },
    alerts7d:          { es: "Alertas — últimos 7 días", en: "Alerts — last 7 days" },
    social24h:         { es: "Señales sociales — últimas 24h", en: "Social signals — last 24h" },
    nearbyStations:    { es: "Estaciones hidrométricas cercanas", en: "Nearby hydro stations" },
    noData:            { es: "Sin datos",             en: "No data" },
    loading:           { es: "Cargando datos…",       en: "Loading data…" },
    errorLoad:         { es: "Error al cargar",       en: "Load error" },
    today:             { es: "hoy",                   en: "today" },
    multihazard:       { es: "Análisis multiriesgo",  en: "Multi-hazard analysis" },
    noDistricts:       { es: "Sin distritos en alerta", en: "No districts in alert" },
    sarFlooded:        { es: "SAR inundado",          en: "SAR flooded" },
    sarPolygons:       { es: "polígono Sentinel-1",   en: "Sentinel-1 polygon" },
    sarPolygonsPlural: { es: "polígonos Sentinel-1",  en: "Sentinel-1 polygons" },
    edan:              { es: "EDAN",                  en: "EDAN" },
    edanCopied:        { es: "¡Copiado!",             en: "Copied!" },
    panelLabel:        { es: "Panel de estadísticas distritales", en: "District statistics panel" },
    nearStation:       { es: "Estaciones hidrométricas cercanas", en: "Nearby hydrometric stations" },
    threshold:         { es: "Umbral",                en: "Threshold" },
    exceeded:          { es: "superado",              en: "exceeded" },
    alertsBadge:       { es: "alert.",                en: "alert" },
    signalsBadge:      { es: "señ.",                  en: "sig." },
  },

  // Copilot / Ask panel
  ask: {
    title:       { es: "Copiloto",            en: "Copilot" },
    placeholder: { es: "Consulta en español…", en: "Ask in Spanish…" },
    query:       { es: "Consulta",            en: "Query" },
    response:    { es: "Respuesta",           en: "Response" },
    newQuery:    { es: "Nueva consulta",      en: "New query" },
    hint:        { es: "Pregunta en español sobre la situación actual",
                   en: "Ask in Spanish about the current situation" },
  },

  // Decision log
  log: {
    title:    { es: "Registro",              en: "Decision Log" },
    export:   { es: "Exportar registro a CSV", en: "Export log to CSV" },
    loading:  { es: "Cargando registro…",    en: "Loading log…" },
    error:    { es: "Error al cargar registro", en: "Failed to load log" },
    empty:    { es: "El registro de decisiones aparecerá aquí.",
                en: "Decision log entries will appear here." },
    footer:   { es: "Registro append-only · Exportación EDAN-Perú",
                en: "Append-only log · EDAN-Peru export" },
  },

  // Status bar
  status: {
    online:       { es: "EN LÍNEA",     en: "ONLINE" },
    offline:      { es: "DESCONECTADO", en: "OFFLINE" },
    connecting:   { es: "…",            en: "…" },
  },

  // Situation summary (SINAGERD levels)
  sinagerd: {
    emergency: { es: "EMERGENCIA", en: "EMERGENCY" },
    alert:     { es: "ALERTA",     en: "ALERT" },
    notice:    { es: "AVISO",      en: "NOTICE" },
    alerts:    { es: "alertas activas", en: "active alerts" },
    alert1:    { es: "alerta activa",   en: "active alert" },
    inFlood:   { es: "personas en zona inundada", en: "people in flood zone" },
    priority:  { es: "Distritos prioritarios",    en: "Priority districts" },
  },
} as const;

export type StringKey = keyof typeof strings;

export function t<K extends StringKey>(
  section: K,
  key: keyof (typeof strings)[K],
  locale: Locale,
): string {
  const entry = strings[section][key] as { es: string; en: string };
  return entry[locale];
}

/** Convenience hook — returns a bound translator for the given locale. */
export function useT(locale: Locale) {
  return <K extends StringKey>(section: K, key: keyof (typeof strings)[K]): string =>
    t(section, key, locale);
}
