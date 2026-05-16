/**
 * Realistic demo data for Costa Resiliente — Lima El Niño Costero 2017 scenario.
 * Used as fallback when the API is unreachable or returns empty results.
 * Mirrors the auto_seed.py data so the UI looks live even without a backend.
 */

import type { Alert, FloodExposure, DecisionLogEntry } from "@/lib/api";

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
