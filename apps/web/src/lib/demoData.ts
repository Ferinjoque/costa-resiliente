/**
 * Realistic demo data for Costa Resiliente — Lima El Niño Costero 2017 scenario.
 * Used as fallback when the API is unreachable or returns empty results.
 * Mirrors the auto_seed.py data so the UI looks live even without a backend.
 */

import type { Alert, FloodExposure, DecisionLogEntry, DistrictCollection } from "@/lib/api";

/**
 * Simplified bounding-box districts for the 15 most operationally relevant
 * Lima Metropolitana districts. Shown when the /api/v1/districts endpoint fails.
 * Coordinates match the auto_seed.py fixtures (INEI 2017 centroids, simplified polygons).
 */
function bbox(w: number, n: number, e: number, s: number) {
  return { type: "MultiPolygon" as const, coordinates: [[[[w, n], [e, n], [e, s], [w, s], [w, n]]]] };
}

export const DEMO_DISTRICTS: DistrictCollection = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { ubigeo: "150133", name: "San Juan de Lurigancho", province: "Lima", region: "Lima", area_km2: 131.25, population: 1038495 }, geometry: bbox(-77.00, -11.90, -76.80, -12.06) },
    { type: "Feature", properties: { ubigeo: "150103", name: "Ate", province: "Lima", region: "Lima", area_km2: 77.72, population: 630086 }, geometry: bbox(-76.97, -11.97, -76.87, -12.10) },
    { type: "Feature", properties: { ubigeo: "150136", name: "San Martín de Porres", province: "Lima", region: "Lima", area_km2: 36.77, population: 700178 }, geometry: bbox(-77.13, -11.95, -77.05, -12.02) },
    { type: "Feature", properties: { ubigeo: "150110", name: "Comas", province: "Lima", region: "Lima", area_km2: 48.75, population: 520450 }, geometry: bbox(-77.10, -11.89, -76.99, -11.97) },
    { type: "Feature", properties: { ubigeo: "150118", name: "Lurigancho", province: "Lima", region: "Lima", area_km2: 236.47, population: 213386 }, geometry: bbox(-76.82, -11.85, -76.55, -11.99) },
    { type: "Feature", properties: { ubigeo: "150106", name: "Carabayllo", province: "Lima", region: "Lima", area_km2: 346.88, population: 333045 }, geometry: bbox(-77.10, -11.82, -76.97, -11.93) },
    { type: "Feature", properties: { ubigeo: "150126", name: "Puente Piedra", province: "Lima", region: "Lima", area_km2: 71.18, population: 362285 }, geometry: bbox(-77.12, -11.83, -77.03, -11.90) },
    { type: "Feature", properties: { ubigeo: "150108", name: "Chorrillos", province: "Lima", region: "Lima", area_km2: 38.94, population: 325547 }, geometry: bbox(-77.03, -12.13, -76.97, -12.22) },
    { type: "Feature", properties: { ubigeo: "150101", name: "Lima", province: "Lima", region: "Lima", area_km2: 21.98, population: 271814 }, geometry: bbox(-77.07, -12.02, -77.01, -12.07) },
    { type: "Feature", properties: { ubigeo: "150107", name: "Chaclacayo", province: "Lima", region: "Lima", area_km2: 37.63, population: 43694 }, geometry: bbox(-76.79, -11.96, -76.73, -12.01) },
    { type: "Feature", properties: { ubigeo: "150114", name: "La Molina", province: "Lima", region: "Lima", area_km2: 65.75, population: 171646 }, geometry: bbox(-76.97, -12.07, -76.93, -12.12) },
    { type: "Feature", properties: { ubigeo: "150141", name: "Santiago de Surco", province: "Lima", region: "Lima", area_km2: 34.84, population: 338509 }, geometry: bbox(-77.00, -12.10, -76.95, -12.15) },
    { type: "Feature", properties: { ubigeo: "150138", name: "Santa Anita", province: "Lima", region: "Lima", area_km2: 10.65, population: 228422 }, geometry: bbox(-76.99, -12.03, -76.96, -12.07) },
    { type: "Feature", properties: { ubigeo: "150144", name: "Villa María del Triunfo", province: "Lima", region: "Lima", area_km2: 70.57, population: 398433 }, geometry: bbox(-76.97, -12.15, -76.90, -12.23) },
    { type: "Feature", properties: { ubigeo: "150143", name: "Villa El Salvador", province: "Lima", region: "Lima", area_km2: 35.46, population: 393254 }, geometry: bbox(-76.96, -12.15, -76.92, -12.23) },
  ],
};

const NOW = Date.now();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

export const DEMO_ALERTS: Alert[] = [
  {
    id: 1,
    type: "huayco",
    severity: "critical",
    status: "active",
    title: "Riesgo crítico de huayco — Quebrada Jicamarca",
    description: "Precipitación acumulada 24h supera umbral (42 mm). Modelo XGBoost: probabilidad 0.91.",
    district_id: 1,
    created_at: hoursAgo(1),
    updated_at: hoursAgo(1),
  },
  {
    id: 2,
    type: "flood",
    severity: "high",
    status: "active",
    title: "Inundación activa — Sector Huachipa",
    description: "Desborde del río Rímac detectado por Sentinel-1 (SAR). Área afectada: ~1.8 km².",
    district_id: 2,
    created_at: hoursAgo(2.5),
    updated_at: hoursAgo(2.5),
  },
  {
    id: 3,
    type: "flood",
    severity: "high",
    status: "active",
    title: "Inundación — Carabayllo sector norte",
    description: "Río Chillón sobre umbral de alerta. Nivel: 3.1 m (alerta: 2.5 m). 3 asentamientos afectados.",
    district_id: 3,
    created_at: hoursAgo(3.5),
    updated_at: hoursAgo(3.5),
  },
  {
    id: 4,
    type: "flood",
    severity: "medium",
    status: "active",
    title: "Nivel del río Rímac elevado — Estación Chosica",
    description: "Nivel actual: 2.4 m (umbral de alerta: 2.0 m). Tendencia ascendente.",
    district_id: 4,
    created_at: hoursAgo(4),
    updated_at: hoursAgo(4),
  },
  {
    id: 5,
    type: "social_cluster",
    severity: "medium",
    status: "active",
    title: "Cluster social — reportes de bloqueo vial en La Molina",
    description: "8 publicaciones geolocalizadas en 15 min. Triage: 6 × road_blocked.",
    district_id: null,
    created_at: hoursAgo(0.5),
    updated_at: hoursAgo(0.5),
  },
  {
    id: 6,
    type: "huayco",
    severity: "low",
    status: "active",
    title: "Alerta temprana — Quebrada Canto Grande",
    description: "Precipitación 24h: 18 mm (umbral: 35 mm). Susceptibilidad moderada.",
    district_id: 5,
    created_at: hoursAgo(3),
    updated_at: hoursAgo(3),
  },
  {
    id: 7,
    type: "flood",
    severity: "high",
    status: "acknowledged",
    title: "Inundación contenida — Sector Ñaña",
    description: "Desborde menor controlado por defensa ribereña. Monitoreo continuo activo.",
    district_id: 6,
    created_at: hoursAgo(8),
    updated_at: hoursAgo(6),
  },
];

export const DEMO_EXPOSURE: FloodExposure = {
  retrieved_at: new Date(NOW).toISOString(),
  source: "Sentinel-1 SAR × INEI 2017 (demo)",
  total_affected_population: 84_572,
  districts: [
    {
      district_id: 1,
      district_name: "Lurigancho",
      population: 213_386,
      flood_polygon_count: 3,
      overlap_km2: 4.2,
      latest_scene_at: hoursAgo(3),
    },
    {
      district_id: 3,
      district_name: "Carabayllo",
      population: 333_045,
      flood_polygon_count: 2,
      overlap_km2: 2.8,
      latest_scene_at: hoursAgo(2),
    },
    {
      district_id: 2,
      district_name: "Ate",
      population: 630_086,
      flood_polygon_count: 2,
      overlap_km2: 1.9,
      latest_scene_at: hoursAgo(3.5),
    },
    {
      district_id: 4,
      district_name: "San Juan de Lurigancho",
      population: 1_038_495,
      flood_polygon_count: 1,
      overlap_km2: 0.8,
      latest_scene_at: hoursAgo(4),
    },
  ],
};

export interface CopilotDemoResponse {
  answer: string;
  intent: string;
  confidence: number;
  query_plan: string;
  sources: Array<Record<string, unknown>>;
}

export const DEMO_COPILOT_RESPONSES: Record<string, CopilotDemoResponse> = {
  "¿Cuáles son los distritos en mayor riesgo ahora?": {
    answer: "Actualmente los distritos con mayor riesgo son:\n\n1. **Lurigancho-Chosica** — riesgo ALTO: 3 polígonos de inundación SAR activos (4.2 km²), alerta crítica de huayco en quebrada Jicamarca (probabilidad 0.91).\n2. **Carabayllo** — riesgo ALTO: desborde del río Chillón sector norte, nivel 3.1 m (umbral: 2.5 m), 2 polígonos activos.\n3. **Ate** — riesgo ALTO: inundación activa en Huachipa 1.8 km², tendencia ascendente en estación Puente Los Ángeles.\n\nTotal: 4 alertas activas, ~84,572 personas en zona de riesgo.",
    intent: "flood_status",
    confidence: 0.92,
    query_plan: "flood_status_by_district",
    sources: [
      { district: "Lurigancho", flood_area_km2: 4.2, alert_count: 2, severity: "critical" },
      { district: "Carabayllo", flood_area_km2: 2.8, alert_count: 1, severity: "high" },
      { district: "Ate", flood_area_km2: 1.9, alert_count: 1, severity: "high" },
    ],
  },
  "¿Qué quebradas tienen riesgo alto de huayco?": {
    answer: "Las quebradas con riesgo alto de huayco en las últimas 24 horas:\n\n• **Quebrada Jicamarca** (Lurigancho): probabilidad 0.91 — precipitación 24h superó umbral (42 mm). EVACUACIÓN PREVENTIVA recomendada.\n• **Quebrada Pedregal** (Carabayllo): probabilidad 0.74 — suelo saturado, slope 28°.\n• **Quebrada Quirio** (Ate): probabilidad 0.61 — señales sociales de bloqueo vial confirmadas.\n\nFuente: Modelo XGBoost entrenado en SINPAD 2003–2020 + IMERG NASA.",
    intent: "huayco_risk",
    confidence: 0.89,
    query_plan: "huayco_high_risk_quebradas",
    sources: [
      { quebrada: "Jicamarca", probability: 0.91, district: "Lurigancho", threshold_mm: 42 },
      { quebrada: "Pedregal", probability: 0.74, district: "Carabayllo", slope_deg: 28 },
      { quebrada: "Quirio", probability: 0.61, district: "Ate", social_signals: 3 },
    ],
  },
  "¿Cuánta lluvia acumulada hubo en el Rímac en las últimas 72h?": {
    answer: "Lluvia acumulada en la cuenca del Rímac (últimas 72 horas, fuente NASA IMERG Early Run):\n\n• **Total cuenca**: 63.4 mm — muy por encima del umbral de alerta (42 mm).\n• **Pico**: 28.2 mm en la madrugada del 15 de marzo (03:00–06:00 Lima).\n• **Estación Chosica (ANA)**: nivel del río 2.4 m, caudal 185 m³/s.\n• **Estación Chaclacayo**: nivel 1.8 m, tendencia ascendente.\n\nEstado: ALERTA HIDROLÓGICA activa para cuenca Rímac.",
    intent: "rainfall_accumulation",
    confidence: 0.94,
    query_plan: "imerg_72h_watershed",
    sources: [
      { watershed: "Rímac", accumulation_mm: 63.4, hours: 72, threshold_mm: 42 },
      { station: "Chosica", level_m: 2.4, flow_m3s: 185, status: "alert" },
    ],
  },
  "¿Cuántas personas están en zona de inundación activa?": {
    answer: "Estimación de población en zona de inundación activa (cruce SAR × INEI 2017):\n\n• **Total afectado**: ~84,572 personas en 4 distritos.\n• **Lurigancho-Chosica**: ~28,400 hab. en zona SAR (4.2 km²).\n• **Carabayllo**: ~19,800 hab. en zona SAR (2.8 km²).\n• **Ate**: ~24,600 hab. en zona SAR (1.9 km²).\n• **San Juan de Lurigancho**: ~11,772 hab. en zona SAR (0.8 km²).\n\nFuente: Polígonos SAR Sentinel-1 × distritos × población INEI 2017.",
    intent: "flood_status",
    confidence: 0.91,
    query_plan: "flood_exposure_population",
    sources: [
      { district: "Lurigancho", affected_population: 28400, overlap_km2: 4.2 },
      { district: "Carabayllo", affected_population: 19800, overlap_km2: 2.8 },
      { district: "Ate", affected_population: 24600, overlap_km2: 1.9 },
    ],
  },
  "¿Qué infraestructura crítica está en zona inundada?": {
    answer: "Infraestructura crítica en zonas SAR inundadas:\n\n• **3 hospitales** en zona de riesgo: Hospital Huachipa (Ate), Centro Salud Ñaña (Lurigancho), Posta Pedregal (Carabayllo).\n• **7 escuelas** con patio inundado en Ate y Lurigancho.\n• **2 puentes** bajo monitoreo: Puente Huachipa (tráfico restringido), Puente Ñaña (flujo reducido).\n• **1 subestación eléctrica** en zona amarilla (riesgo bajo-moderado) en Carabayllo.\n\nFuente: OSM × polígonos SAR Sentinel-1.",
    intent: "infrastructure_impact",
    confidence: 0.87,
    query_plan: "infrastructure_in_flood_zone",
    sources: [
      { name: "Hospital Huachipa", type: "hospital", district: "Ate", in_flood: true },
      { name: "Puente Huachipa", type: "bridge", district: "Ate", in_flood: true },
      { name: "Subestación Carabayllo Norte", type: "substation", district: "Carabayllo", in_flood: false },
    ],
  },
  "¿Cuál es el nivel del río Rímac en Chosica?": {
    answer: "Estación Chosica (ANA, cuenca Rímac):\n\n• **Nivel actual**: 2.4 m — sobre el umbral de alerta (2.0 m).\n• **Caudal**: 185 m³/s — tendencia ascendente en las últimas 3 horas.\n• **Última lectura**: hace 15 minutos.\n• **Umbral de evacuación**: 3.5 m (aún no alcanzado).\n• **Registro histórico El Niño 2017**: máximo 4.2 m el 22 de marzo de 2017.\n\nFuente: ANA Observatorio Chirilu (scraper hidrometría).",
    intent: "river_level",
    confidence: 0.96,
    query_plan: "station_latest_reading",
    sources: [
      { station: "Chosica", river: "Rímac", level_m: 2.4, flow_m3s: 185, alert_threshold_m: 2.0, status: "alert" },
    ],
  },
};

export const DEMO_DECISION_LOG: DecisionLogEntry[] = [
  {
    id: 1,
    logged_at: hoursAgo(0.2),
    operator_id: "operador-coen-01",
    action_type: "query",
    alert_id: null,
    payload: { query: "¿Cuáles son los distritos en mayor riesgo ahora?" },
    session_id: "demo",
  },
  {
    id: 2,
    logged_at: hoursAgo(0.5),
    operator_id: "operador-coen-01",
    action_type: "alert_acknowledge",
    alert_id: 7,
    payload: { note: "Defensa ribereña confirmó contención. Monitoreo activo." },
    session_id: "demo",
  },
  {
    id: 3,
    logged_at: hoursAgo(1.1),
    operator_id: "operador-coen-01",
    action_type: "query",
    alert_id: null,
    payload: { query: "¿Cuántas personas están en zona de inundación activa?" },
    session_id: "demo",
  },
  {
    id: 4,
    logged_at: hoursAgo(2.0),
    operator_id: "operador-coer-lima",
    action_type: "alert_escalate",
    alert_id: 1,
    payload: { note: "Probabilidad huayco 91% — activar protocolo evacuación preventiva quebrada Jicamarca." },
    session_id: "demo",
  },
];
