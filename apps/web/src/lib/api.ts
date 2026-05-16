/**
 * Typed API client — wraps fetch calls to the FastAPI backend.
 * All paths relative to NEXT_PUBLIC_API_URL (default: http://localhost:8000).
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`API ${path} → ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ─── Districts ────────────────────────────────────────────────────────────────

export interface DistrictProperties {
  ubigeo: string;
  name: string;
  province: string;
  region: string;
  area_km2: number | null;
  population: number | null;
}

export interface DistrictFeature {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: DistrictProperties;
}

export interface DistrictCollection {
  type: "FeatureCollection";
  features: DistrictFeature[];
}

export interface DistrictListItem {
  ubigeo: string;
  name: string;
}

/** Returns full GeoJSON FeatureCollection of all 43 districts. */
export async function fetchDistricts(): Promise<DistrictCollection> {
  return get<DistrictCollection>("/api/v1/districts");
}

/** Derives a flat list (ubigeo + name) from the same endpoint. */
export async function fetchDistrictList(): Promise<DistrictListItem[]> {
  const fc = await fetchDistricts();
  return fc.features.map((f) => ({
    ubigeo: f.properties.ubigeo,
    name: f.properties.name,
  }));
}

// ─── IMERG ────────────────────────────────────────────────────────────────────

/** Properties on each IMERG watershed feature. */
export interface ImergProperties {
  id: number;
  name: string;
  river: string;
  latest_time: string | null;
  acc_1h_mm: number | null;
  acc_3h_mm: number | null;
  acc_6h_mm: number | null;
  acc_12h_mm: number | null;
  acc_24h_mm: number | null;
  acc_72h_mm: number | null;
}

export interface ImergFeature {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: ImergProperties;
}

export interface ImergCollection {
  type: "FeatureCollection";
  source?: string;
  source_url?: string;
  retrieved_at?: string;
  data_updated_at?: string;
  features: ImergFeature[];
}

/** Fetches IMERG per-watershed accumulations. `hours` must be 1|3|6|12|24|72. */
export function fetchImerg(hours = 24): Promise<ImergCollection> {
  return get<ImergCollection>(`/api/v1/layers/imerg/latest?hours=${hours}`);
}

// ─── Flood polygons ───────────────────────────────────────────────────────────

export interface FloodCollection {
  type: "FeatureCollection";
  source?: string;
  source_url?: string;
  retrieved_at?: string;
  data_updated_at?: string;
  features: GeoJSON.Feature[];
}

export function fetchFlood(): Promise<FloodCollection> {
  return get<FloodCollection>("/api/v1/layers/flood/latest");
}

// ─── Huayco susceptibility ────────────────────────────────────────────────────

export interface HuaycoProperties {
  id: number;
  name: string;
  priority: number;
  probability: number | null;
  risk_level: string | null;
  computed_at: string | null;
  trigger_rain_24h_mm: number | null;
}

export interface HuaycoFeature {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: HuaycoProperties;
}

export interface HuaycoCollection {
  type: "FeatureCollection";
  source?: string;
  source_url?: string;
  retrieved_at?: string;
  data_updated_at?: string;
  features: HuaycoFeature[];
}

export function fetchHuayco(): Promise<HuaycoCollection> {
  return get<HuaycoCollection>("/api/v1/layers/huayco/susceptibility");
}

// ─── Infrastructure ───────────────────────────────────────────────────────────

export interface InfraProperties {
  id: number;
  osm_id: string | null;
  type: string;
  name: string | null;
  district_id: number | null;
}

export interface InfraFeature {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: InfraProperties;
}

export interface InfraCollection {
  type: "FeatureCollection";
  source?: string;
  retrieved_at?: string;
  features: InfraFeature[];
}

export function fetchInfrastructure(type?: string): Promise<InfraCollection> {
  const q = type ? `?type=${encodeURIComponent(type)}` : "";
  return get<InfraCollection>(`/api/v1/layers/infrastructure${q}`);
}

// ─── Hazard zones (CENEPRED SIGRID) ──────────────────────────────────────────

export interface HazardProperties {
  id: number;
  name: string | null;
  hazard_type: string;
  level: string;
  source_layer: string | null;
  loaded_at: string | null;
}

export interface HazardFeature {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: HazardProperties;
}

export interface HazardCollection {
  type: "FeatureCollection";
  source?: string;
  source_url?: string;
  retrieved_at?: string;
  data_updated_at?: string;
  features: HazardFeature[];
}

export function fetchHazard(hazardType?: string): Promise<HazardCollection> {
  const q = hazardType ? `?hazard_type=${encodeURIComponent(hazardType)}` : "";
  return get<HazardCollection>(`/api/v1/layers/hazard${q}`);
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export interface Alert {
  id: number;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  district_id: number | null;
  created_at: string;
  status: string;
}

export function fetchAlerts(status?: string): Promise<Alert[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return get<Alert[]>(`/api/v1/alerts${q}`);
}

export async function actOnAlert(
  alertId: number,
  action: "acknowledge" | "escalate" | "false_positive" | "close",
  operatorId: string,
  note?: string,
): Promise<{ alert_id: number; new_status: string }> {
  const res = await fetch(`${BASE}/api/v1/alerts/${alertId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ operator_id: operatorId, action, note }),
  });
  if (!res.ok) throw new Error(`actOnAlert → ${res.status}`);
  return res.json();
}

// ─── Decision log ─────────────────────────────────────────────────────────────

export interface DecisionLogEntry {
  id: number;
  logged_at: string;
  operator_id: string;
  action_type: string;
  alert_id: number | null;
  payload: Record<string, unknown>;
  session_id: string | null;
}

export function fetchDecisionLog(limit = 100): Promise<DecisionLogEntry[]> {
  return get<DecisionLogEntry[]>(`/api/v1/alerts/decision-log?limit=${limit}`);
}

export function decisionLogCsvUrl(): string {
  return `${BASE}/api/v1/alerts/decision-log/export`;
}

// ─── Flood exposure (population at risk) ──────────────────────────────────────

export interface ExposedDistrict {
  district_id: number;
  district_name: string;
  population: number | null;
  flood_polygon_count: number;
  overlap_km2: number;
  latest_scene_at: string | null;
}

export interface FloodExposure {
  retrieved_at: string;
  source: string;
  total_affected_population: number;
  districts: ExposedDistrict[];
}

export function fetchFloodExposure(): Promise<FloodExposure> {
  return get<FloodExposure>("/api/v1/layers/flood/exposure");
}

// ─── Social signal pins ───────────────────────────────────────────────────────

export interface SocialSignalProperties {
  id: number;
  source: string;
  triage_label: string | null;
  triage_confidence: number | null;
  ingested_at: string;
  district_id: number | null;
  district_name: string | null;
}

export interface SocialSignalFeature {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: SocialSignalProperties;
}

export interface SocialSignalCollection {
  type: "FeatureCollection";
  source?: string;
  retrieved_at?: string;
  data_updated_at?: string;
  features: SocialSignalFeature[];
}

export function fetchSocialSignals(
  hours = 48,
  label?: string,
): Promise<SocialSignalCollection> {
  const params = new URLSearchParams({ hours: String(hours) });
  if (label) params.set("label", label);
  return get<SocialSignalCollection>(`/api/v1/layers/social?${params}`);
}

// ─── SSE alerts stream ────────────────────────────────────────────────────────

export function alertsStreamUrl(): string {
  return `${BASE}/api/v1/alerts/stream`;
}

// ─── Share tokens ─────────────────────────────────────────────────────────────

export interface ScenarioSnapshot {
  districtUbigeo: string | null;
  districtName: string | null;
  timeWindowHours: number;
  isReplayMode: boolean;
  replayDate: string | null;
  activeLayers: string[];
}

export interface MintShareResponse {
  token: string;
  url: string;
  expires_at: string;
}

export interface ResolveShareResponse {
  scenario: ScenarioSnapshot;
  created_at: string;
  expires_at: string;
}

export async function mintShareToken(
  scenario: ScenarioSnapshot,
): Promise<MintShareResponse> {
  const res = await fetch(`${BASE}/api/v1/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ scenario }),
  });
  if (!res.ok) throw new Error(`mintShareToken → ${res.status}`);
  return res.json();
}

export function fetchShareToken(token: string): Promise<ResolveShareResponse> {
  return get<ResolveShareResponse>(`/api/v1/share/${encodeURIComponent(token)}`);
}

// ─── Multi-hazard fusion ──────────────────────────────────────────────────────

export interface FusionDistrict {
  ubigeo: string;
  name: string;
  population: number | null;
}

export interface FusionFlood {
  active_polygon_count: number;
  overlap_km2: number;
  latest_scene_at: string | null;
}

export interface FusionHuayco {
  highest_risk_level: string | null;
  highest_probability: number | null;
  quebrada_name: string | null;
  computed_at: string | null;
}

export interface FusionSocial {
  total_signals_3h: number;
  urgent_signals_3h: number;
}

export interface DistrictFusion {
  retrieved_at: string;
  district: FusionDistrict;
  risk_level: "bajo" | "moderado" | "alto";
  prose_es: string;
  flood: FusionFlood;
  huayco: FusionHuayco;
  social: FusionSocial;
}

export function fetchDistrictFusion(ubigeo: string): Promise<DistrictFusion> {
  return get<DistrictFusion>(`/api/v1/fusion/${encodeURIComponent(ubigeo)}`);
}
