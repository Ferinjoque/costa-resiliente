/**
 * Realistic demo data for Costa Resiliente — Lima El Niño Costero 2017 scenario.
 * Used as fallback when the API is unreachable or returns empty results.
 * Mirrors the auto_seed.py data so the UI looks live even without a backend.
 */

import type {
  Alert,
  FloodExposure,
  DecisionLogEntry,
  DistrictCollection,
  SocialSignalCollection,
  DistrictRiskSummary,
  DistrictDashboard,
  DistrictFusion,
  ImergCollection,
  FloodCollection,
  HuaycoCollection,
  InfraCollection,
  HazardCollection,
  StationCollection,
} from "@/lib/api";

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

// ─── IMERG watershed accumulations ───────────────────────────────────────────

export const DEMO_IMERG: ImergCollection = {
  type: "FeatureCollection",
  source: "NASA IMERG Early Run (demo)",
  retrieved_at: new Date(NOW).toISOString(),
  data_updated_at: hoursAgo(0.5),
  features: [
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[-76.60, -11.60], [-76.90, -11.60], [-76.90, -12.00], [-76.60, -12.00], [-76.60, -11.60]]] },
      properties: { id: 1, name: "Cuenca Rímac", river: "Rímac", latest_time: hoursAgo(0.5), acc_1h_mm: 2.8, acc_3h_mm: 8.4, acc_6h_mm: 14.2, acc_12h_mm: 28.6, acc_24h_mm: 42.1, acc_72h_mm: 63.4 },
    },
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[-77.20, -11.70], [-76.90, -11.70], [-76.90, -11.95], [-77.20, -11.95], [-77.20, -11.70]]] },
      properties: { id: 2, name: "Cuenca Chillón", river: "Chillón", latest_time: hoursAgo(0.5), acc_1h_mm: 1.9, acc_3h_mm: 6.1, acc_6h_mm: 11.8, acc_12h_mm: 22.4, acc_24h_mm: 31.7, acc_72h_mm: 48.2 },
    },
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[-76.75, -12.00], [-76.50, -12.00], [-76.50, -12.30], [-76.75, -12.30], [-76.75, -12.00]]] },
      properties: { id: 3, name: "Cuenca Lurín", river: "Lurín", latest_time: hoursAgo(0.5), acc_1h_mm: 0.4, acc_3h_mm: 1.2, acc_6h_mm: 2.8, acc_12h_mm: 5.1, acc_24h_mm: 8.6, acc_72h_mm: 14.3 },
    },
  ],
};

// ─── SAR flood polygons ───────────────────────────────────────────────────────

export const DEMO_FLOOD: FloodCollection = {
  type: "FeatureCollection",
  source: "Sentinel-1 SAR (demo — El Niño Costero 2017)",
  retrieved_at: new Date(NOW).toISOString(),
  data_updated_at: hoursAgo(3),
  features: [
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[-76.875, -11.975], [-76.850, -11.975], [-76.850, -11.990], [-76.875, -11.990], [-76.875, -11.975]]] },
      properties: { id: 1, district_id: 1, acquired_at: hoursAgo(3), area_km2: 1.8, confidence: 0.92, source: "sentinel-1" },
    },
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[-76.835, -11.965], [-76.820, -11.965], [-76.820, -11.982], [-76.835, -11.982], [-76.835, -11.965]]] },
      properties: { id: 2, district_id: 1, acquired_at: hoursAgo(3), area_km2: 1.2, confidence: 0.89, source: "sentinel-1" },
    },
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[-76.870, -11.960], [-76.855, -11.960], [-76.855, -11.970], [-76.870, -11.970], [-76.870, -11.960]]] },
      properties: { id: 3, district_id: 1, acquired_at: hoursAgo(3), area_km2: 1.2, confidence: 0.85, source: "sentinel-1" },
    },
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[-77.055, -11.870], [-77.038, -11.870], [-77.038, -11.885], [-77.055, -11.885], [-77.055, -11.870]]] },
      properties: { id: 4, district_id: 6, acquired_at: hoursAgo(2), area_km2: 2.1, confidence: 0.91, source: "sentinel-1" },
    },
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[-77.040, -11.885], [-77.025, -11.885], [-77.025, -11.900], [-77.040, -11.900], [-77.040, -11.885]]] },
      properties: { id: 5, district_id: 6, acquired_at: hoursAgo(2), area_km2: 0.7, confidence: 0.87, source: "sentinel-1" },
    },
  ],
};

// ─── Huayco susceptibility quebradas ─────────────────────────────────────────

export const DEMO_HUAYCO: HuaycoCollection = {
  type: "FeatureCollection",
  source: "Modelo XGBoost + SINPAD (demo)",
  retrieved_at: new Date(NOW).toISOString(),
  data_updated_at: hoursAgo(2),
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.845, -11.955] }, properties: { id: 1, name: "Jicamarca",    priority: 1, probability: 0.91, risk_level: "alto",     computed_at: hoursAgo(2), trigger_rain_24h_mm: 42 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-77.048, -11.878] }, properties: { id: 2, name: "Pedregal",     priority: 2, probability: 0.74, risk_level: "alto",     computed_at: hoursAgo(2), trigger_rain_24h_mm: 35 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.965, -12.038] }, properties: { id: 3, name: "Quirio",       priority: 3, probability: 0.61, risk_level: "moderado", computed_at: hoursAgo(2), trigger_rain_24h_mm: 30 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.915, -11.938] }, properties: { id: 4, name: "Canto Grande", priority: 4, probability: 0.38, risk_level: "moderado", computed_at: hoursAgo(2), trigger_rain_24h_mm: 35 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-77.028, -11.858] }, properties: { id: 5, name: "La Virgen",    priority: 5, probability: 0.25, risk_level: "bajo",     computed_at: hoursAgo(2), trigger_rain_24h_mm: 40 } },
  ],
};

export const DEMO_ALERTS: Alert[] = [
  {
    id: 1,
    type: "huayco",
    severity: "critical",
    status: "active",
    title: "Riesgo crítico de huayco — Quebrada Jicamarca",
    description: "Precipitación acumulada 24h supera umbral (42 mm). Modelo XGBoost: probabilidad 0.91.",
    district_id: 1,
    lat: -11.955,
    lng: -76.845,
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
    lat: -11.982,
    lng: -76.860,
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
    lat: -11.878,
    lng: -77.048,
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
    lat: -11.970,
    lng: -76.790,
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
    lat: -12.090,
    lng: -76.950,
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
    lat: -11.938,
    lng: -76.915,
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
    lat: -11.958,
    lng: -76.862,
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
  "¿Cuáles son las alertas activas ahora?": {
    answer: "Alertas activas en Lima Metropolitana (4 alertas, estado EMERGENCIA):\n\n1. 🔴 **CRÍTICO** — Riesgo huayco Quebrada Jicamarca (Lurigancho): prob. 0.91, precipitación 24h sobre umbral.\n2. 🟠 **ALTO** — Inundación activa Sector Huachipa (Ate): 1.8 km² SAR detectado.\n3. 🟠 **ALTO** — Inundación Carabayllo sector norte: Río Chillón nivel 3.1 m (umbral 2.5 m).\n4. 🟡 **MEDIO** — Río Rímac elevado en Chosica: nivel 2.4 m (umbral 2.0 m).\n\nAcción recomendada: activar protocolo EDAN para quebrada Jicamarca.",
    intent: "flood_status",
    confidence: 0.97,
    query_plan: "active_alerts_summary",
    sources: [
      { id: 1, type: "huayco", severity: "critical", district: "Lurigancho", title: "Quebrada Jicamarca" },
      { id: 2, type: "flood",  severity: "high",     district: "Ate",        title: "Sector Huachipa" },
      { id: 3, type: "flood",  severity: "high",     district: "Carabayllo", title: "Río Chillón" },
    ],
  },
  "¿Qué distritos debo evacuar primero?": {
    answer: "Prioridad de evacuación basada en riesgo compuesto (SAR × IMERG × huayco × señales sociales):\n\n1. **Lurigancho-Chosica** — PRIORIDAD 1: quebrada Jicamarca con prob. huayco 0.91, 3 polígonos SAR activos, señales sociales urgentes.\n2. **Carabayllo norte** — PRIORIDAD 2: río Chillón sobre umbral, 2 asentamientos afectados.\n3. **Ate (sector Huachipa)** — PRIORIDAD 3: inundación contenida pero infraestructura vial comprometida.\n\nTotal estimado: ~52,000 personas en zonas de evacuación preventiva.\n\nFuente: Modelo de fusión Costa Resiliente + SINPAD 2003–2020.",
    intent: "evacuation_priority",
    confidence: 0.88,
    query_plan: "evacuation_priority_composite_risk",
    sources: [
      { district: "Lurigancho",  priority: 1, pop_at_risk: 28400, reason: "huayco_critical" },
      { district: "Carabayllo",  priority: 2, pop_at_risk: 14800, reason: "flood_high" },
      { district: "Ate",         priority: 3, pop_at_risk: 8800,  reason: "flood_moderate" },
    ],
  },
  "¿Cuánta precipitación es necesaria para activar un huayco en Jicamarca?": {
    answer: "Umbral de activación de huayco — Quebrada Jicamarca:\n\n• **Umbral crítico 24h**: 42 mm/24h (calibrado con eventos SINPAD 2003–2020).\n• **Precipitación actual**: 63.4 mm/72h en cuenca alta del Rímac.\n• **Última 24h**: 28.2 mm (67% del umbral crítico).\n• **Probabilidad modelo XGBoost**: 0.91 — RIESGO CRÍTICO.\n• **Variables adicionales**: suelo saturado (3 días consecutivos de lluvia), pendiente 35°, litología friable.\n\nEl umbral fue superado a las 03:00 Lima del 15 de marzo.\n\nFuente: Modelo XGBoost entrenado en SINPAD × IMERG NASA × DEM SRTM.",
    intent: "huayco_risk",
    confidence: 0.93,
    query_plan: "huayco_threshold_analysis",
    sources: [
      { quebrada: "Jicamarca", threshold_24h_mm: 42, current_24h_mm: 28.2, probability: 0.91, slope_deg: 35 },
    ],
  },
  "¿Cuál es el pronóstico para las próximas 24 horas?": {
    answer: "Pronóstico hidrometeorológico — Lima Metropolitana (próximas 24 h):\n\n• **Cuenca Rímac**: 18–24 mm adicionales previstos. Nivel Chosica podría alcanzar 2.9–3.1 m hacia las 20:00.\n• **Cuenca Chillón**: 12–16 mm. Carabayllo norte mantiene riesgo ALTO.\n• **Viento**: Brisa marina sin anomalías. Sin riesgo de lluvias costeras intensas.\n• **Temperatura**: Mínima 14 °C en cuencas altas, favorece saturación del suelo nocturna.\n\nVentana crítica: 02:00–08:00 Lima del 16 de marzo.\n\nFuente: SENAMHI pronóstico operacional + IMERG Early Run extrapolación.",
    intent: "weather_forecast",
    confidence: 0.85,
    query_plan: "forecast_24h_watershed",
    sources: [
      { watershed: "Rímac", forecast_mm: 21, window_h: 24, risk: "high" },
      { watershed: "Chillón", forecast_mm: 14, window_h: 24, risk: "high" },
      { station: "Chosica", projected_level_m: 3.0, at_utc: "03:00 +05" },
    ],
  },
  "¿Cuál es el estado del río Chillón?": {
    answer: "Río Chillón — estado actual (estación Puente Carabayllo, ANA):\n\n• **Nivel**: 3.1 m — **sobre umbral de alerta** (2.5 m).\n• **Caudal**: 142 m³/s — 2.3× la media histórica para la fecha.\n• **Tendencia**: Descendente en las últimas 2 horas (pico fue 3.4 m a las 04:30).\n• **Desborde**: Sector norte Carabayllo afectado, AA.HH. El Progreso y 14 de Febrero.\n• **Umbral evacuación**: 4.0 m (no alcanzado).\n\nFuente: ANA Observatorio Chirilu + señales sociales Telegram/Reddit.",
    intent: "river_level",
    confidence: 0.94,
    query_plan: "station_latest_reading",
    sources: [
      { station: "Puente Carabayllo", river: "Chillón", level_m: 3.1, flow_m3s: 142, threshold_m: 2.5, trend: "descending" },
      { aahh: "El Progreso", district: "Carabayllo", flooded: true, households: 340 },
    ],
  },
  "¿Dónde están los albergues más cercanos?": {
    answer: "Albergues habilitados — Lima Metropolitana (actualizados por INDECI/PCM):\n\n• **Coliseo Lurigancho** — cap. 800 personas, abierto, sin cupo crítico. (Lurigancho-Chosica)\n• **IE San Luis Gonzaga** — cap. 400 personas, habilitado. (Carabayllo)\n• **Loza deportiva Huachipa** — cap. 250 personas. Solo techo; alimentos en coordinación. (Ate)\n• **Cuartel Barbones** — cap. 1,200 personas (FFAA). En alerta, disponible si se activa EDAN.\n\nTotal capacidad disponible: ~2,650 personas.\nDemanda estimada actual: ~1,100 desplazados registrados.\n\nFuente: INDECI SIT / SINPAD reporte 15-Mar-2017.",
    intent: "evacuation_priority",
    confidence: 0.82,
    query_plan: "shelter_locations_capacity",
    sources: [
      { name: "Coliseo Lurigancho", capacity: 800, district: "Lurigancho", available: true },
      { name: "IE San Luis Gonzaga", capacity: 400, district: "Carabayllo", available: true },
      { name: "Loza deportiva Huachipa", capacity: 250, district: "Ate", available: true },
    ],
  },
  "¿Cómo se compara con El Niño de 1998?": {
    answer: "Comparación El Niño Costero 2017 vs. El Niño 1997–1998 (Lima Metropolitana):\n\n• **Temperatura mar (TSM)**: 2017 +2.8 °C anomalía costera vs. 1998 +3.1 °C en cuenca de Perú. Fenómeno local más focalizado.\n• **Lluvia acumulada Rímac (marzo)**: 2017 → 180 mm; 1998 → 142 mm. **2017 superó** a 1998 en cuenca baja.\n• **Eventos SINPAD**: 2017 registró 4,200 eventos en Lima vs. 1,800 en 1998 — mayor densidad de afectación urbana.\n• **Víctimas Lima**: 2017: 85 fallecidos; 1998: 61 fallecidos.\n• **Desborde Rímac 2017**: Pico 4.2 m (22-Mar). Estimado actual si tendencia continúa: 3.4–3.8 m el 16-Mar.\n\nFuente: SENAMHI datos históricos × SINPAD 2003–2020.",
    intent: "historical_comparison",
    confidence: 0.86,
    query_plan: "historical_event_comparison",
    sources: [
      { event: "El Niño 1998", march_rain_mm: 142, sinpad_events: 1800, casualties_lima: 61 },
      { event: "El Niño 2017", march_rain_mm: 180, sinpad_events: 4200, casualties_lima: 85 },
    ],
  },
  "¿Cuántas señales sociales urgentes hay ahora?": {
    answer: "Señales sociales urgentes — ventana 3 horas (triaje IA + Presidio PII):\n\n• **needs_help** (Ayuda urgente): 6 señales — Lurigancho (3), SJL (2), Ate (1).\n• **road_blocked** (Vía bloqueada): 5 señales — La Molina (2), Carabayllo (2), Lurigancho (1).\n• Total urgentes: **11 de 28 señales** en ventana de 48 h.\n\nFuentes activas: Bluesky (12), Reddit (8), Telegram (6), RSS (2).\nConfianza media de triaje: 0.82.\nPII detectado y anonimizado: 3 registros en 48 h.\n\nFuente: Costa Resiliente social pipeline + Presidio anonymizer.",
    intent: "social_signals",
    confidence: 0.88,
    query_plan: "social_urgent_count_3h",
    sources: [
      { label: "needs_help", count: 6, top_district: "Lurigancho" },
      { label: "road_blocked", count: 5, top_district: "La Molina" },
      { label: "infrastructure_damage", count: 4, top_district: "Carabayllo" },
    ],
  },
  "¿Qué rutas de evacuación están bloqueadas?": {
    answer: "Rutas de evacuación con bloqueo confirmado o sospechoso:\n\n🔴 **Bloqueadas** (señales sociales + análisis SAR):\n• Av. La Molina altura km 12 — huayco activo.\n• Carretera Central km 20 (Ñaña) — desborde cuneta, tráfico detenido.\n• Jr. Chosica–Lurigancho altura Puente Huachipa — agua sobre calzada.\n\n🟡 **Restricción parcial**:\n• Av. Independencia (Carabayllo) — un carril.\n• Autopista Ramiro Prialé km 8 — barro lateral.\n\nRuta alternativa recomendada: Autopista Ramiro Prialé → Evitamiento → Panamericana Sur.\n\nFuente: Señales Reddit/Telegram × OSM × análisis SAR Sentinel-1.",
    intent: "road_status",
    confidence: 0.79,
    query_plan: "road_blockage_social_sar",
    sources: [
      { road: "Carretera Central km 20", status: "blocked", source: "social+SAR" },
      { road: "Av. La Molina km 12", status: "blocked", source: "huayco" },
      { road: "Jr. Chosica–Lurigancho", status: "restricted", source: "SAR" },
    ],
  },
  "¿Qué estaciones hidrológicas están en alerta?": {
    answer: "Estaciones hidrológicas ANA/SENAMHI en nivel de alerta (Lima):\n\n🔴 **Alerta roja** (sobre umbral evacuación):\n• Estación Chosica (Rímac): 2.4 m / umbral 2.0 m — tendencia subiendo.\n\n🟠 **Alerta naranja**:\n• Puente Carabayllo (Chillón): 3.1 m / umbral 2.5 m — tendencia descendente.\n• Puente Los Ángeles (Rímac, Ate): 1.9 m / umbral 1.6 m.\n\n🟢 **Normal**:\n• Lurín (Manchay): 0.4 m / umbral 1.2 m.\n• Rímac en Santa Eulalia: 0.8 m — bajo, sin riesgo.\n\nFuente: ANA Observatorio Chirilu scraper en tiempo real.",
    intent: "river_level",
    confidence: 0.95,
    query_plan: "all_stations_status",
    sources: [
      { station: "Chosica", level_m: 2.4, threshold_m: 2.0, status: "alert_red" },
      { station: "Puente Carabayllo", level_m: 3.1, threshold_m: 2.5, status: "alert_orange" },
      { station: "Puente Los Ángeles", level_m: 1.9, threshold_m: 1.6, status: "alert_orange" },
    ],
  },
  "¿Cuál es el riesgo en San Juan de Lurigancho?": {
    answer: "Evaluación de riesgo — San Juan de Lurigancho (ubigeo 150133):\n\n• **Nivel de riesgo**: MODERADO.\n• **Inundación SAR**: 0.8 km² en sector Zárate–Las Flores.\n• **Huayco**: Sin quebradas en zona crítica. Histórico SINPAD: 12 eventos 2003–2020.\n• **Señales sociales**: 5 en 3 h, 2 urgentes (needs_help sector Canto Rey).\n• **Población en riesgo**: ~11,772 hab. en zona SAR.\n• **Infraestructura**: 2 colegios en zona inundada, 0 hospitales afectados.\n\nAcción recomendada: vigilancia y preposicionamiento de recursos. Sin evacuación masiva por ahora.\n\nFuente: Costa Resiliente fusión multicapa.",
    intent: "flood_status",
    confidence: 0.87,
    query_plan: "district_risk_composite",
    sources: [
      { district: "San Juan de Lurigancho", risk_level: "moderado", flood_km2: 0.8, pop_at_risk: 11772 },
      { signal_type: "needs_help", count: 2, sector: "Canto Rey" },
    ],
  },
  "¿Qué pasó en el evento El Niño Costero 2017?": {
    answer: "El Niño Costero 2017 — Lima Metropolitana (resumen ejecutivo):\n\n• **Período crítico**: 15 de enero al 30 de abril de 2017.\n• **Lluvia Rímac cuenca baja (marzo)**: 180 mm — récord histórico para el mes.\n• **Eventos SINPAD solo Lima**: 4,218 registros (huaycos, inundaciones, derrumbes).\n• **Afectados**: 330,000 personas en Lima Metropolitana.\n• **Pérdidas**: 85 fallecidos, 18,000 viviendas colapsadas o inhabitables.\n• **Pico Rímac**: 4.2 m en Chosica (22-Mar-2017, 04:15 Lima).\n• **Distritos más afectados**: Lurigancho-Chosica, Carabayllo, SJL, Chaclacayo, Ate.\n\nCosta Resiliente replica esta escenografía con datos reales IMERG + SINPAD para entrenamiento.\n\nFuente: SENAMHI × INDECI × SINPAD.",
    intent: "historical_comparison",
    confidence: 0.98,
    query_plan: "el_nino_2017_summary",
    sources: [
      { event: "El Niño Costero 2017", peak_level_m: 4.2, affected_people: 330000, deaths: 85 },
      { month: "Marzo 2017", rainfall_mm: 180, sinpad_events: 4218 },
    ],
  },
  "¿Cuántos recursos de respuesta están desplegados?": {
    answer: "Recursos de respuesta activos — Lima Metropolitana (15-Mar-2017):\n\n• **Personal INDECI**: 240 efectivos en campo (Lurigancho: 80, Carabayllo: 60, Ate: 60, SJL: 40).\n• **Vehículos**: 18 camiones cisterna, 12 volquetes, 6 ambulancias, 3 helicópteros SAR.\n• **Equipos de búsqueda y rescate**: 4 equipos USAR, 1 equipo con perros de búsqueda.\n• **Alimentos**: 3,200 raciones distribuidas. Déficit estimado 800 raciones.\n• **Agua potable**: 12 cisternas operando en Lurigancho y Carabayllo.\n\nBrecha crítica: Déficit de 400 carpas de emergencia en Lurigancho.\n\nFuente: INDECI COEN reporte de turno 14:00.",
    intent: "resource_status",
    confidence: 0.83,
    query_plan: "resource_deployment_summary",
    sources: [
      { resource: "personal_indeci", count: 240, deployed_districts: 4 },
      { resource: "camiones_cisterna", count: 18, operational: 15 },
      { resource: "raciones_alimentos", available: 3200, deficit: 800 },
    ],
  },
  "¿Qué daños hay en infraestructura vial?": {
    answer: "Daños en infraestructura vial — Lima Metropolitana:\n\n🔴 **Colapso** (requiere intervención inmediata):\n• Puente Peatonal Ñaña — socavamiento de base, cerrado al tránsito.\n• Carretera Central km 23 (Chosica) — derrumbe talud, corte total.\n\n🟠 **Daño mayor** (tránsito reducido):\n• Av. Lurigancho sector km 8–11 — baches y erosión.\n• Carretera Carabayllo–Canta km 4 — deslizamiento lateral.\n\n🟡 **Daño menor**:\n• 14 vías menores con lodo acumulado en Ate y SJL.\n\nCosto estimado de emergencia: S/ 8.2 millones (MVCS estimado preliminar).\n\nFuente: MTC reportes de campo + señales sociales.",
    intent: "infrastructure_impact",
    confidence: 0.81,
    query_plan: "road_damage_assessment",
    sources: [
      { infrastructure: "Puente Ñaña", status: "collapsed", district: "Lurigancho" },
      { infrastructure: "Carretera Central km 23", status: "blocked", district: "Lurigancho" },
      { infrastructure: "Av. Lurigancho km 8-11", status: "damaged", district: "Lurigancho" },
    ],
  },

  // ─── English-locale responses (matched by suggestion click) ──────────────────

  "What are the active alerts right now?": {
    answer: "Currently active alerts — Lima Metropolitan Area:\n\n1. **[CRITICAL] Huayco — Quebrada Jicamarca** (Lurigancho): XGBoost probability 0.91, 63 mm rain in 72h exceeds 42 mm threshold. Preventive evacuation recommended.\n2. **[HIGH] SAR Flood — Huachipa** (Ate): 1.8 km² active flood polygon, 24,600 people in flood zone.\n3. **[HIGH] Chillón River Overflow** (Carabayllo): Level 3.1 m at Carabayllo station (threshold: 2.5 m).\n4. **[HIGH] Social Cluster — SJL sector 3**: 12 urgent help signals in 3h, geo-clustered, PII redacted.\n\n**SINAGERD Level: EMERGENCY** — 1 critical alert active.\n\nSource: SAR Sentinel-1 + ANA stations + Bluesky/Reddit triage.",
    intent: "flood_status",
    confidence: 0.92,
    query_plan: "active_alerts_summary",
    sources: [
      { district: "Lurigancho", alert_type: "huayco", severity: "critical", huayco_prob: 0.91 },
      { district: "Ate", alert_type: "flood", severity: "high", flood_area_km2: 1.8 },
      { district: "Carabayllo", alert_type: "flood", severity: "high", river_level_m: 3.1 },
    ],
  },
  "Which districts should I evacuate first?": {
    answer: "Evacuation priority order — Lima Metropolitan Area (current risk × population density):\n\n1. **Lurigancho-Chosica** — CRITICAL. Quebrada Jicamarca activation imminent. 28,400 people in SAR flood zone. Recommend immediate evacuation of Canto Grande and Jicamarca sectors.\n2. **Carabayllo** — HIGH. Chillón at 3.1 m (threshold 2.5 m). 19,800 affected. Pre-position in Av. Túpac Amaru shelters.\n3. **Ate** — HIGH. Huachipa 1.8 km² flooded. 24,600 affected. Carretera Central closure forces alternative routes.\n\n**Recommendation**: Deploy INDECI USAR teams to Jicamarca now. Alert shelters: Colegio Los Pinos (Lurigancho, cap. 400), Estadio Carabayllo (cap. 800).\n\nSource: SINPAD 2003–2020 + SAR polygons + INEI 2017 population grid.",
    intent: "evacuation_priority",
    confidence: 0.95,
    query_plan: "evacuation_priority_by_risk_density",
    sources: [
      { district: "Lurigancho", priority: 1, affected_population: 28400, shelter_capacity: 1200 },
      { district: "Carabayllo", priority: 2, affected_population: 19800, shelter_capacity: 800 },
      { district: "Ate", priority: 3, affected_population: 24600, shelter_capacity: 600 },
    ],
  },
  "Which districts have the highest risk right now?": {
    answer: "Highest-risk districts — Lima Metropolitan Area:\n\n1. **Lurigancho** — ALTO: 3 active SAR flood polygons (4.2 km²), critical huayco alert in Quebrada Jicamarca (prob. 0.91).\n2. **Carabayllo** — ALTO: Chillón river overflow, north sector, level 3.1 m (threshold: 2.5 m), 2 active polygons.\n3. **Ate** — ALTO: Active flood in Huachipa 1.8 km², rising trend at Puente Los Ángeles station.\n\nTotal: 4 active alerts, ~84,572 people in risk zones.\n\nSource: SAR Sentinel-1 × ANA stations × INEI population.",
    intent: "flood_status",
    confidence: 0.92,
    query_plan: "flood_status_by_district",
    sources: [
      { district: "Lurigancho", flood_area_km2: 4.2, alert_count: 2, severity: "critical" },
      { district: "Carabayllo", flood_area_km2: 2.8, alert_count: 1, severity: "high" },
      { district: "Ate", flood_area_km2: 1.9, alert_count: 1, severity: "high" },
    ],
  },
  "What is the forecast for the next 24 hours?": {
    answer: "72-hour rainfall forecast — Lima watersheds (SENAMHI WRF model):\n\n• **+6h**: Rímac 8.5 mm — LOW risk\n• **+12h**: Rímac 15.8 mm — MODERATE risk, huayco prob. 28%\n• **+24h**: Rímac 31.2 mm — **HIGH risk**, huayco prob. 52%\n• **+48h**: Rímac 48.5 mm — **HIGH risk**, prob. 71% ⚠️ exceeds 42 mm threshold\n• **+72h**: Rímac 64.2 mm — **HIGH risk**, prob. 82%\n\n**PRE-ALERT**: Huayco activation threshold (42 mm) will be exceeded at the +24h mark.\n\n**Recommendation**: Pre-position USAR teams in Jicamarca and activate shelter protocols in Lurigancho and Carabayllo sectors.\n\nSource: SENAMHI WRF model + NASA IMERG Early Run.",
    intent: "rainfall_forecast",
    confidence: 0.88,
    query_plan: "rainfall_forecast_72h",
    sources: [
      { watershed: "Rímac", hours_24: 31.2, hours_48: 48.5, hours_72: 64.2, threshold_mm: 42 },
      { watershed: "Chillón", hours_24: 18.7, hours_48: 28.3, hours_72: 38.9, threshold_mm: 35 },
    ],
  },
  "Which evacuation routes are blocked?": {
    answer: "Blocked and compromised evacuation routes — Lima Metropolitan Area:\n\n🔴 **Collapsed / Impassable**:\n• Ñaña Pedestrian Bridge — undermined foundation, closed to all traffic.\n• Carretera Central km 23 (Chosica) — landslide, total road cut.\n\n🟠 **Reduced capacity** (use with caution):\n• Av. Lurigancho km 8–11 — potholes and erosion, no heavy vehicles.\n• Carabayllo–Canta Road km 4 — lateral landslide, single lane.\n\n**Active alternative routes**:\n• Central Highway → Ramiro Prialé (avoid km 23).\n• Lurigancho: use Av. Las Torres + Canto Grande connector.\n• Carabayllo: route through Av. Universitaria Norte.\n\nSource: MTC field reports + social signals (road_blocked label).",
    intent: "infrastructure_impact",
    confidence: 0.85,
    query_plan: "road_damage_assessment",
    sources: [
      { infrastructure: "Puente Ñaña", status: "collapsed", district: "Lurigancho" },
      { infrastructure: "Carretera Central km 23", status: "blocked", district: "Lurigancho" },
      { infrastructure: "Av. Lurigancho km 8-11", status: "damaged", district: "Lurigancho" },
    ],
  },
  "How many urgent social signals are there now?": {
    answer: "Social signals — last 24 hours (AI-triaged, PII redacted via Presidio):\n\n• **Total signals**: 87 across 15 districts.\n• **Urgent (needs_help)**: 23 — concentrated in Lurigancho (8), Ate (6), Carabayllo (5).\n• **Road blocked**: 14 — 7 confirmed by infrastructure report.\n• **Infrastructure damage**: 12 — bridges, schools, water mains.\n• **Weather observation**: 38 — consistent with IMERG rainfall data.\n\n**Sources**: Bluesky (42), Reddit r/Peru + r/Lima (28), Telegram Senamhi_Peru (17).\n**Average triage confidence**: 0.82 (XGBoost classifier).\n\nAll signals geolocated within ±500m accuracy.",
    intent: "social_signals",
    confidence: 0.87,
    query_plan: "social_signals_summary_24h",
    sources: [
      { source: "bluesky", count: 42, urgent: 12, confidence: 0.84 },
      { source: "reddit", count: 28, urgent: 7, confidence: 0.79 },
      { source: "telegram", count: 17, urgent: 4, confidence: 0.88 },
    ],
  },
  "Which hydrological stations are on alert?": {
    answer: "ANA hydrological station status — Lima watersheds:\n\n🔴 **Alert** (threshold exceeded):\n• **ANA-Chosica** (Rímac): 2.4 m — threshold 2.0 m ⚠️, flow 185 m³/s, rising trend.\n• **ANA-Carabayllo** (Chillón): 3.1 m — threshold 2.5 m ⚠️, flow 148 m³/s.\n\n🟡 **Warning** (near threshold):\n• **ANA-Chaclacayo** (Rímac): 1.8 m — threshold 1.5 m, flow 121 m³/s.\n• **ANA-Huachipa** (Rímac): 1.9 m — threshold 1.8 m, flow 89 m³/s.\n\n🟢 **Normal**:\n• **ANA-Lurín** (Lurín): 0.6 m — threshold 1.2 m, flow 12 m³/s.\n\nSource: ANA Observatorio Chirilu (scraper, 15 min interval) + SENAMHI.",
    intent: "station_status",
    confidence: 0.91,
    query_plan: "station_alert_status",
    sources: [
      { station: "ANA-Chosica", river: "Rímac", level_m: 2.4, threshold_m: 2.0, status: "alert" },
      { station: "ANA-Carabayllo", river: "Chillón", level_m: 3.1, threshold_m: 2.5, status: "alert" },
      { station: "ANA-Chaclacayo", river: "Rímac", level_m: 1.8, threshold_m: 1.5, status: "warning" },
    ],
  },
  "How many people are in active flood zones?": {
    answer: "Population exposure estimate — active SAR flood zones (PostGIS cross-reference):\n\n• **Total affected**: ~84,572 people across 4 districts.\n• **Lurigancho-Chosica**: ~28,400 pop. in SAR zone (4.2 km²).\n• **Carabayllo**: ~19,800 pop. in SAR zone (2.8 km²).\n• **Ate**: ~24,600 pop. in SAR zone (1.9 km²).\n• **San Juan de Lurigancho**: ~11,772 pop. in SAR zone (0.8 km²).\n\n**Methodology**: SAR Sentinel-1 flood polygons × district boundaries × INEI 2017 population grid (100m resolution).\n\nNote: Figure represents people within flood polygon extent — actual evacuees may be lower depending on elevation within zone.",
    intent: "flood_status",
    confidence: 0.91,
    query_plan: "flood_exposure_population",
    sources: [
      { district: "Lurigancho", affected_population: 28400, overlap_km2: 4.2 },
      { district: "Carabayllo", affected_population: 19800, overlap_km2: 2.8 },
      { district: "Ate", affected_population: 24600, overlap_km2: 1.9 },
    ],
  },
};

// ─── Critical infrastructure (OSM) ───────────────────────────────────────────

export const DEMO_INFRASTRUCTURE: InfraCollection = {
  type: "FeatureCollection",
  source: "OpenStreetMap (demo)",
  retrieved_at: new Date(NOW).toISOString(),
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.868, -11.983] }, properties: { id: 1, osm_id: "way/123456", type: "hospital",    name: "Hospital Huachipa",           district_id: 1 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.830, -11.970] }, properties: { id: 2, osm_id: "way/234567", type: "hospital",    name: "Centro de Salud Ñaña",        district_id: 1 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-77.048, -11.882] }, properties: { id: 3, osm_id: "way/345678", type: "hospital",    name: "Posta Pedregal",              district_id: 6 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-77.032, -12.045] }, properties: { id: 4, osm_id: "way/456789", type: "hospital",    name: "Hospital Casimiro Ulloa",     district_id: null } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.860, -11.978] }, properties: { id: 5, osm_id: "way/567890", type: "school",      name: "IE 1228 Leoncio Prado",      district_id: 1 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.845, -11.968] }, properties: { id: 6, osm_id: "way/678901", type: "school",      name: "IE 1230 Sulpicio García",    district_id: 1 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-77.053, -11.875] }, properties: { id: 7, osm_id: "way/789012", type: "school",      name: "IE 2085 San Agustín",        district_id: 6 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.870, -11.972] }, properties: { id: 8, osm_id: "way/890123", type: "bridge",      name: "Puente Huachipa",            district_id: 1 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.825, -11.962] }, properties: { id: 9, osm_id: "way/901234", type: "bridge",      name: "Puente Ñaña",                district_id: 1 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-77.042, -11.891] }, properties: { id: 10, osm_id: "way/012345", type: "substation", name: "Subestación Carabayllo Norte", district_id: 6 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-77.018, -11.865] }, properties: { id: 11, osm_id: "way/112233", type: "fire_station", name: "Compañía de Bomberos Carabayllo",  district_id: 6 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.858, -11.981] }, properties: { id: 12, osm_id: "way/223344", type: "shelter",      name: "Coliseo Lurigancho (albergue)",  district_id: 1 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-77.044, -11.878] }, properties: { id: 13, osm_id: "way/334455", type: "shelter",      name: "IE San Luis Gonzaga (albergue)", district_id: 6 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.908, -12.040] }, properties: { id: 14, osm_id: "way/445566", type: "shelter",      name: "Loza Deportiva Huachipa",        district_id: 2 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.923, -11.993] }, properties: { id: 15, osm_id: "way/556677", type: "fire_station", name: "Compañía de Bomberos SJL",        district_id: null } },
  ],
};

// ─── Historical hazard zones (SINPAD-derived) ─────────────────────────────────

export const DEMO_HAZARD: HazardCollection = {
  type: "FeatureCollection",
  source: "SINPAD 2003-2020 (demo — densidad histórica eventos)",
  retrieved_at: new Date(NOW).toISOString(),
  features: [
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[-76.880, -11.960], [-76.840, -11.960], [-76.840, -11.995], [-76.880, -11.995], [-76.880, -11.960]]] },
      properties: { id: 1, name: "Zona riesgo inundación Lurigancho-Chosica", hazard_type: "flood", level: "alto",     source_layer: "sinpad_density_2017", loaded_at: hoursAgo(48) },
    },
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[-77.060, -11.865], [-77.030, -11.865], [-77.030, -11.900], [-77.060, -11.900], [-77.060, -11.865]]] },
      properties: { id: 2, name: "Zona riesgo huayco Carabayllo", hazard_type: "huayco", level: "alto",     source_layer: "sinpad_density_2017", loaded_at: hoursAgo(48) },
    },
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[-76.975, -11.990], [-76.950, -11.990], [-76.950, -12.020], [-76.975, -12.020], [-76.975, -11.990]]] },
      properties: { id: 3, name: "Zona riesgo inundación Ate-Huachipa", hazard_type: "flood", level: "alto",     source_layer: "sinpad_density_2017", loaded_at: hoursAgo(48) },
    },
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[-77.115, -11.875], [-77.085, -11.875], [-77.085, -11.900], [-77.115, -11.900], [-77.115, -11.875]]] },
      properties: { id: 4, name: "Zona riesgo inundación Puente Piedra", hazard_type: "flood", level: "moderado", source_layer: "sinpad_density_2017", loaded_at: hoursAgo(48) },
    },
    {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[-76.930, -11.930], [-76.900, -11.930], [-76.900, -11.960], [-76.930, -11.960], [-76.930, -11.930]]] },
      properties: { id: 5, name: "Zona riesgo huayco San Juan de Lurigancho", hazard_type: "huayco", level: "moderado", source_layer: "sinpad_density_2017", loaded_at: hoursAgo(48) },
    },
  ],
};

// ─── Social signal pins (map layer) ──────────────────────────────────────────

export const DEMO_SOCIAL_SIGNALS: SocialSignalCollection = {
  type: "FeatureCollection",
  source: "demo",
  retrieved_at: new Date(NOW).toISOString(),
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.85, -11.97] }, properties: { id: 1, source: "bluesky", triage_label: "needs_help", triage_confidence: 0.88, ingested_at: hoursAgo(0.5), district_id: 1, district_name: "Lurigancho", text: "Familia atrapada en 2do piso sector Ñaña, agua llega al metro. Necesitamos bote urgente. [PII eliminado]" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.86, -11.96] }, properties: { id: 2, source: "bluesky", triage_label: "road_blocked", triage_confidence: 0.81, ingested_at: hoursAgo(0.8), district_id: 1, district_name: "Lurigancho", text: "Carretera Central km 21 totalmente cortada por derrumbe. Vehículos varados hace 3h. Desvíen por antigua vía." } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-77.05, -11.87] }, properties: { id: 3, source: "reddit", triage_label: "road_blocked", triage_confidence: 0.75, ingested_at: hoursAgo(1.2), district_id: 6, district_name: "Carabayllo", text: "Av. Universitaria bloqueada altura Chillón. Huayco cruzó la pista. Policía no ha llegado todavía." } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-77.06, -11.88] }, properties: { id: 4, source: "bluesky", triage_label: "infrastructure_damage", triage_confidence: 0.79, ingested_at: hoursAgo(1.5), district_id: 6, district_name: "Carabayllo", text: "Muro de contención quebrada Pedregal colapsó. Lodo ingresa a manzana 3. Aprox 15 casas afectadas." } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.93, -12.06] }, properties: { id: 5, source: "bluesky", triage_label: "road_blocked", triage_confidence: 0.83, ingested_at: hoursAgo(0.3), district_id: null, district_name: "La Molina", text: "Acceso a La Molina por Av. Raúl Ferrero cortado. Agua baja con mucha fuerza. No pasen por ahí." } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.93, -12.05] }, properties: { id: 6, source: "telegram", triage_label: "road_blocked", triage_confidence: 0.91, ingested_at: hoursAgo(0.4), district_id: null, district_name: "La Molina", text: "URGENTE: Puente sobre acequia Surco cedió. No cruzar. Desvío por Av. Separadora Industrial." } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.91, -11.94] }, properties: { id: 7, source: "bluesky", triage_label: "weather_observation", triage_confidence: 0.67, ingested_at: hoursAgo(2.1), district_id: null, district_name: "San Juan de Lurigancho", text: "Lluvia intensa desde las 3am en SJL, no para. El Río Huaycoloro subió mucho. Vigilen la zona baja." } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.92, -11.95] }, properties: { id: 8, source: "reddit", triage_label: "needs_help", triage_confidence: 0.84, ingested_at: hoursAgo(1.0), district_id: null, district_name: "San Juan de Lurigancho", text: "Adulto mayor sin poder evacuar, vive solo, zona inundada Zárate. Teléfono [PII eliminado]. ¿Quién puede ir?" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-76.96, -12.04] }, properties: { id: 9, source: "bluesky", triage_label: "infrastructure_damage", triage_confidence: 0.73, ingested_at: hoursAgo(3.0), district_id: 2, district_name: "Ate", text: "Colegio [nombre eliminado] en Ate con paredes fisuradas post-lluvia. Dirección pide inspección antes de reabrir." } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-77.01, -11.90] }, properties: { id: 10, source: "telegram", triage_label: "needs_help", triage_confidence: 0.92, ingested_at: hoursAgo(0.1), district_id: null, district_name: "Comas", text: "Quebrada Canto Grande activa, piedras y lodo bajando. 2 viviendas evacuadas, vecinos piden más ayuda. [PII eliminado]" } },
  ],
};

// ─── District risk summary (map fill layer) ───────────────────────────────────

const RISK_OVERRIDES: Record<string, { risk_level: "bajo" | "moderado" | "alto"; active_alerts: number; social_3h: number; urgent_social_3h: number }> = {
  "150118": { risk_level: "alto",     active_alerts: 3, social_3h: 8, urgent_social_3h: 6 }, // Lurigancho
  "150103": { risk_level: "alto",     active_alerts: 2, social_3h: 3, urgent_social_3h: 2 }, // Ate
  "150106": { risk_level: "alto",     active_alerts: 2, social_3h: 4, urgent_social_3h: 3 }, // Carabayllo
  "150133": { risk_level: "moderado", active_alerts: 1, social_3h: 5, urgent_social_3h: 2 }, // San Juan de Lurigancho
  "150126": { risk_level: "moderado", active_alerts: 0, social_3h: 1, urgent_social_3h: 0 }, // Puente Piedra
  "150107": { risk_level: "moderado", active_alerts: 0, social_3h: 2, urgent_social_3h: 1 }, // Chaclacayo
  "150110": { risk_level: "moderado", active_alerts: 0, social_3h: 1, urgent_social_3h: 0 }, // Comas
};

export const DEMO_DISTRICT_RISK_SUMMARY: DistrictRiskSummary = {
  type: "FeatureCollection",
  retrieved_at: new Date(NOW).toISOString(),
  features: DEMO_DISTRICTS.features.map((f) => {
    const override = RISK_OVERRIDES[f.properties.ubigeo] ?? { risk_level: "bajo" as const, active_alerts: 0, social_3h: 0, urgent_social_3h: 0 };
    return {
      type: "Feature" as const,
      geometry: f.geometry,
      properties: {
        ubigeo: f.properties.ubigeo,
        name: f.properties.name,
        population: f.properties.population,
        ...override,
      },
    };
  }),
};

// ─── District dashboard (per-district detail panel) ───────────────────────────

function makeTrend7d(): { day: string; severity: string; count: number }[] {
  const severities = ["high", "high", "critical", "high", "medium", "high", "critical"];
  const counts     = [2, 3, 1, 2, 1, 2, 1];
  return Array.from({ length: 7 }, (_, i) => ({
    day: new Date(NOW - (6 - i) * 86_400_000).toISOString().slice(0, 10),
    severity: severities[i],
    count: counts[i],
  }));
}

function makeImerg30d(): { day: string; acc_24h_mm: number; acc_72h_mm: number }[] {
  const base = [2, 3, 1, 5, 8, 14, 22, 18, 28, 35, 42, 31, 25, 19, 12, 8, 5, 3, 7, 11, 15, 22, 31, 28, 19, 14, 10, 7, 4, 6];
  return Array.from({ length: 30 }, (_, i) => {
    const mm = base[i] ?? 5;
    return {
      day: new Date(NOW - (29 - i) * 86_400_000).toISOString().slice(0, 10),
      acc_24h_mm: mm,
      acc_72h_mm: mm * 2.8,
    };
  });
}

export const DEMO_DASHBOARDS: Record<string, DistrictDashboard> = {
  "150118": {
    retrieved_at: new Date(NOW).toISOString(),
    district: { ubigeo: "150118", name: "Lurigancho", population: 213_386, area_km2: 236.47 },
    active_alerts: [
      { id: 1, type: "huayco",  severity: "critical", status: "active", title: "Riesgo crítico de huayco — Quebrada Jicamarca", created_at: hoursAgo(1) },
      { id: 2, type: "flood",   severity: "high",     status: "active", title: "Inundación activa — Sector Huachipa",            created_at: hoursAgo(2.5) },
      { id: 7, type: "flood",   severity: "high",     status: "acknowledged", title: "Inundación contenida — Sector Ñaña",       created_at: hoursAgo(8) },
    ],
    alerts_trend_7d: makeTrend7d(),
    social_24h: [
      { label: "needs_help",           count: 2 },
      { label: "road_blocked",         count: 3 },
      { label: "infrastructure_damage",count: 2 },
      { label: "weather_observation",  count: 1 },
    ],
    imerg_trend_30d: makeImerg30d(),
    stations: [
      { code: "ANA-CHOSICA", name: "Chosica",    source: "ANA", river: "Rímac",  latest_time: hoursAgo(0.25), level_m: 2.4, flow_m3s: 185, rain_mm: 8.2 },
      { code: "ANA-CHACLACAYO", name: "Chaclacayo", source: "ANA", river: "Rímac", latest_time: hoursAgo(0.25), level_m: 1.8, flow_m3s: 142, rain_mm: 6.1 },
    ],
    sinpad_historical_events: 47,
  },
  "150103": {
    retrieved_at: new Date(NOW).toISOString(),
    district: { ubigeo: "150103", name: "Ate", population: 630_086, area_km2: 77.72 },
    active_alerts: [
      { id: 2, type: "flood", severity: "high", status: "active", title: "Inundación activa — Sector Huachipa", created_at: hoursAgo(2.5) },
    ],
    alerts_trend_7d: makeTrend7d().map(d => ({ ...d, count: Math.max(0, d.count - 1) })),
    social_24h: [
      { label: "road_blocked",          count: 2 },
      { label: "infrastructure_damage", count: 1 },
    ],
    imerg_trend_30d: makeImerg30d().map(d => ({ ...d, acc_24h_mm: d.acc_24h_mm * 0.7, acc_72h_mm: d.acc_72h_mm * 0.7 })),
    stations: [
      { code: "ANA-PUENTE-ANGELES", name: "Puente Los Ángeles", source: "ANA", river: "Rímac", latest_time: hoursAgo(0.5), level_m: 1.9, flow_m3s: 130, rain_mm: 5.5 },
    ],
    sinpad_historical_events: 31,
  },
};

// ─── Multi-hazard fusion callout (per district) ───────────────────────────────

export const DEMO_FUSIONS: Record<string, DistrictFusion> = {
  "150118": {
    retrieved_at: new Date(NOW).toISOString(),
    district: { ubigeo: "150118", name: "Lurigancho", population: 213_386 },
    risk_level: "alto",
    prose_es: "Lurigancho-Chosica presenta riesgo ALTO. Tres polígonos de inundación SAR activos cubren 4.2 km². Alerta crítica de huayco en quebrada Jicamarca (probabilidad 0.91). Ocho señales sociales en las últimas 3 horas, de las cuales 6 son urgentes (needs_help, road_blocked). Nivel del río Rímac en Chosica: 2.4 m, sobre el umbral de alerta (2.0 m).",
    prose_en: "Lurigancho-Chosica is at HIGH risk. Three active SAR flood polygons cover 4.2 km². Critical huayco alert on Quebrada Jicamarca (probability 0.91). Eight social signals in the last 3 hours, 6 urgent (needs_help, road_blocked). Rímac river at Chosica: 2.4 m, above alert threshold (2.0 m).",
    flood:  { active_polygon_count: 3, overlap_km2: 4.2, latest_scene_at: hoursAgo(3) },
    huayco: { highest_risk_level: "alto", highest_probability: 0.91, quebrada_name: "Jicamarca", computed_at: hoursAgo(2) },
    social: { total_signals_3h: 8, urgent_signals_3h: 6 },
  },
  "150103": {
    retrieved_at: new Date(NOW).toISOString(),
    district: { ubigeo: "150103", name: "Ate", population: 630_086 },
    risk_level: "alto",
    prose_es: "Ate presenta riesgo ALTO. Inundación activa en sector Huachipa detectada por SAR Sentinel-1 (1.9 km²). Señales sociales reportan daño en infraestructura vial. Estación Puente Los Ángeles: nivel 1.9 m, tendencia ascendente.",
    prose_en: "Ate is at HIGH risk. Active flood in Huachipa sector detected by Sentinel-1 SAR (1.9 km²). Social signals report road infrastructure damage. Puente Los Ángeles station: 1.9 m, rising trend.",
    flood:  { active_polygon_count: 2, overlap_km2: 1.9, latest_scene_at: hoursAgo(3.5) },
    huayco: { highest_risk_level: "moderado", highest_probability: 0.61, quebrada_name: "Quirio", computed_at: hoursAgo(4) },
    social: { total_signals_3h: 3, urgent_signals_3h: 2 },
  },
  "150106": {
    retrieved_at: new Date(NOW).toISOString(),
    district: { ubigeo: "150106", name: "Carabayllo", population: 333_045 },
    risk_level: "alto",
    prose_es: "Carabayllo presenta riesgo ALTO. Desborde del río Chillón sector norte: nivel 3.1 m (umbral de alerta: 2.5 m). Dos polígonos SAR activos (2.8 km²). Probabilidad de huayco en quebrada Pedregal: 0.74.",
    prose_en: "Carabayllo is at HIGH risk. Chillón river overflowing at northern sector: 3.1 m (alert threshold: 2.5 m). Two active SAR polygons (2.8 km²). Huayco probability on Quebrada Pedregal: 0.74.",
    flood:  { active_polygon_count: 2, overlap_km2: 2.8, latest_scene_at: hoursAgo(2) },
    huayco: { highest_risk_level: "alto", highest_probability: 0.74, quebrada_name: "Pedregal", computed_at: hoursAgo(3) },
    social: { total_signals_3h: 4, urgent_signals_3h: 3 },
  },
};

// ─── ANA/SENAMHI hydro stations (map layer) ──────────────────────────────────

export const DEMO_STATIONS: StationCollection = {
  type: "FeatureCollection",
  retrieved_at: new Date(NOW).toISOString(),
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-76.699, -11.923] },
      properties: {
        id: 1, code: "ANA-CHOSICA", name: "Chosica",
        source: "ANA", river: "Rímac",
        alert_threshold_m: 2.0,
        level_m: 2.4, flow_m3s: 185, rain_mm: 8.2,
        latest_time: hoursAgo(0.25),
        status: "alert",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-76.763, -11.979] },
      properties: {
        id: 2, code: "ANA-CHACLACAYO", name: "Chaclacayo",
        source: "ANA", river: "Rímac",
        alert_threshold_m: 1.5,
        level_m: 1.8, flow_m3s: 142, rain_mm: 6.1,
        latest_time: hoursAgo(0.25),
        status: "alert",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-76.929, -12.003] },
      properties: {
        id: 3, code: "ANA-PUENTE-ANGELES", name: "Puente Los Ángeles",
        source: "ANA", river: "Rímac",
        alert_threshold_m: 1.7,
        level_m: 1.9, flow_m3s: 130, rain_mm: 5.5,
        latest_time: hoursAgo(0.5),
        status: "alert",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-77.095, -11.852] },
      properties: {
        id: 4, code: "ANA-CARABAYLLO", name: "Carabayllo",
        source: "ANA", river: "Chillón",
        alert_threshold_m: 2.5,
        level_m: 3.1, flow_m3s: 220, rain_mm: 11.3,
        latest_time: hoursAgo(0.3),
        status: "alert",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-76.620, -11.860] },
      properties: {
        id: 5, code: "SENAMHI-MATUCANA", name: "Matucana",
        source: "SENAMHI", river: "Rímac",
        alert_threshold_m: 2.8,
        level_m: 1.9, flow_m3s: 95, rain_mm: 18.4,
        latest_time: hoursAgo(1.0),
        status: "warning",
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-77.130, -12.100] },
      properties: {
        id: 6, code: "ANA-VILLA-MARIA", name: "Lurín (Villa María)",
        source: "ANA", river: "Lurín",
        alert_threshold_m: 1.5,
        level_m: 0.6, flow_m3s: 12, rain_mm: 2.1,
        latest_time: hoursAgo(0.5),
        status: "normal",
      },
    },
  ],
};

export const DEMO_DECISION_LOG: DecisionLogEntry[] = [
  {
    id: 1,
    logged_at: hoursAgo(0.1),
    operator_id: "operador-coen-01",
    action_type: "query",
    alert_id: null,
    payload: { query: "¿Cuáles son los distritos en mayor riesgo ahora?" },
    session_id: "demo",
  },
  {
    id: 2,
    logged_at: hoursAgo(0.3),
    operator_id: "operador-coen-01",
    action_type: "query",
    alert_id: null,
    payload: { query: "¿Qué rutas de evacuación están bloqueadas?" },
    session_id: "demo",
  },
  {
    id: 3,
    logged_at: hoursAgo(0.5),
    operator_id: "operador-coen-01",
    action_type: "alert_acknowledge",
    alert_id: 7,
    payload: { note: "Defensa ribereña confirmó contención sector Ñaña. Monitoreo activo." },
    session_id: "demo",
  },
  {
    id: 4,
    logged_at: hoursAgo(0.8),
    operator_id: "operador-coer-lima",
    action_type: "query",
    alert_id: null,
    payload: { query: "¿Dónde están los albergues más cercanos?" },
    session_id: "demo",
  },
  {
    id: 5,
    logged_at: hoursAgo(1.1),
    operator_id: "operador-coen-01",
    action_type: "query",
    alert_id: null,
    payload: { query: "¿Cuántas personas están en zona de inundación activa?" },
    session_id: "demo",
  },
  {
    id: 6,
    logged_at: hoursAgo(1.4),
    operator_id: "operador-coer-lima",
    action_type: "alert_escalate",
    alert_id: 1,
    payload: { note: "Prob. huayco 91% — activar evacuación preventiva Quebrada Jicamarca. Notificar INDECI COEN." },
    session_id: "demo",
  },
  {
    id: 7,
    logged_at: hoursAgo(2.2),
    operator_id: "operador-coen-01",
    action_type: "query",
    alert_id: null,
    payload: { query: "¿Cuál es el nivel del río Rímac en Chosica?" },
    session_id: "demo",
  },
  {
    id: 8,
    logged_at: hoursAgo(2.8),
    operator_id: "operador-coer-lima",
    action_type: "query",
    alert_id: null,
    payload: { query: "¿Qué infraestructura crítica está en zona inundada?" },
    session_id: "demo",
  },
  {
    id: 9,
    logged_at: hoursAgo(3.5),
    operator_id: "operador-coen-02",
    action_type: "alert_acknowledge",
    alert_id: 3,
    payload: { note: "INDECI Carabayllo confirmó desborde Chillón. Preposicionamiento de recursos en curso." },
    session_id: "demo",
  },
  {
    id: 10,
    logged_at: hoursAgo(4.2),
    operator_id: "operador-coer-lima",
    action_type: "query",
    alert_id: null,
    payload: { query: "¿Cuántos recursos de respuesta están desplegados?" },
    session_id: "demo",
  },
  {
    id: 11,
    logged_at: hoursAgo(5.0),
    operator_id: "operador-coen-01",
    action_type: "query",
    alert_id: null,
    payload: { query: "¿Cuál es el pronóstico para las próximas 24 horas?" },
    session_id: "demo",
  },
  {
    id: 12,
    logged_at: hoursAgo(6.3),
    operator_id: "operador-coen-02",
    action_type: "alert_escalate",
    alert_id: 2,
    payload: { note: "SAR confirma expansión inundación Huachipa a 2.1 km². Solicitar sobrevuelo CAMISEA." },
    session_id: "demo",
  },
  {
    id: 13,
    logged_at: hoursAgo(0.05),
    operator_id: "operador-coen-01",
    action_type: "resource_dispatch",
    alert_id: 1,
    payload: { resource: "usar", resource_name: "USAR Alfa" },
    session_id: "demo",
  },
  {
    id: 14,
    logged_at: hoursAgo(0.08),
    operator_id: "operador-coen-01",
    action_type: "resource_dispatch",
    alert_id: 1,
    payload: { resource: "bote", resource_name: "Bote Rescate" },
    session_id: "demo",
  },
  {
    id: 15,
    logged_at: hoursAgo(0.15),
    operator_id: "operador-coer-lima",
    action_type: "protocol_step",
    alert_id: 1,
    payload: { step: "s1", label: "Notificar COEN/INDECI por radio" },
    session_id: "demo",
  },
  {
    id: 16,
    logged_at: hoursAgo(0.2),
    operator_id: "sistema-auto",
    action_type: "social_signal_received",
    alert_id: null,
    payload: { source: "bluesky", label: "needs_help", district: "Lurigancho", confidence: 0.91 },
    session_id: "demo",
  },
  {
    id: 17,
    logged_at: hoursAgo(0.25),
    operator_id: "operador-coen-01",
    action_type: "protocol_step",
    alert_id: 1,
    payload: { step: "s2", label: "Evacuar Quebrada Jicamarca" },
    session_id: "demo",
  },
  {
    id: 18,
    logged_at: hoursAgo(0.35),
    operator_id: "sistema-auto",
    action_type: "social_signal_received",
    alert_id: null,
    payload: { source: "telegram", label: "road_blocked", district: "Ate", confidence: 0.87 },
    session_id: "demo",
  },
];

// ─── Resource deployment status (INDECI COEN, demo) ─────────────────────────

export type ResourceCategory = {
  id: string;
  icon: string;
  label: { es: string; en: string };
  count: number;
  unit: { es: string; en: string };
  deployed: number;
  status: "ok" | "partial" | "deficit";
};

export const DEMO_RESOURCES: ResourceCategory[] = [
  {
    id: "personnel",
    icon: "👷",
    label: { es: "Personal INDECI", en: "INDECI Personnel" },
    count: 240,
    unit: { es: "efectivos", en: "field agents" },
    deployed: 240,
    status: "ok",
  },
  {
    id: "helicopters",
    icon: "🚁",
    label: { es: "Helicópteros SAR", en: "SAR Helicopters" },
    count: 3,
    unit: { es: "activos", en: "active" },
    deployed: 3,
    status: "ok",
  },
  {
    id: "ambulances",
    icon: "🚑",
    label: { es: "Ambulancias", en: "Ambulances" },
    count: 6,
    unit: { es: "desp.", en: "deployed" },
    deployed: 6,
    status: "ok",
  },
  {
    id: "water",
    icon: "🚰",
    label: { es: "Cisternas agua", en: "Water Tankers" },
    count: 18,
    unit: { es: "operativas", en: "operational" },
    deployed: 15,
    status: "partial",
  },
  {
    id: "rations",
    icon: "🍱",
    label: { es: "Raciones alim.", en: "Food Rations" },
    count: 3200,
    unit: { es: "disp.", en: "avail." },
    deployed: 2400,
    status: "deficit",
  },
  {
    id: "shelters",
    icon: "🏫",
    label: { es: "Albergues cap.", en: "Shelter Capacity" },
    count: 4800,
    unit: { es: "cupos", en: "spaces" },
    deployed: 1640,
    status: "ok",
  },
];

// ─── 72h Rainfall Forecast (SENAMHI-derived, demo) ───────────────────────────

export type ForecastStep = {
  hours: number;
  rimac_mm: number;
  chilion_mm: number;
  lurin_mm: number;
  risk: "bajo" | "moderado" | "alto";
  huayco_prob: number;  // 0–1
};

/** Threshold above which huayco activation risk is significant (mm / step window). */
export const HUAYCO_THRESHOLD_MM = 42;

export const DEMO_FORECAST: ForecastStep[] = [
  { hours: 6,  rimac_mm: 8.5,  chilion_mm: 5.2,  lurin_mm: 1.8,  risk: "bajo",     huayco_prob: 0.15 },
  { hours: 12, rimac_mm: 15.8, chilion_mm: 9.4,  lurin_mm: 3.2,  risk: "moderado", huayco_prob: 0.28 },
  { hours: 24, rimac_mm: 31.2, chilion_mm: 18.7, lurin_mm: 5.6,  risk: "alto",     huayco_prob: 0.52 },
  { hours: 48, rimac_mm: 48.5, chilion_mm: 28.3, lurin_mm: 8.1,  risk: "alto",     huayco_prob: 0.71 },
  { hours: 72, rimac_mm: 64.2, chilion_mm: 38.9, lurin_mm: 11.4, risk: "alto",     huayco_prob: 0.82 },
];
