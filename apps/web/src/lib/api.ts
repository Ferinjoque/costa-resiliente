/**
 * Typed API client: wraps fetch calls to the FastAPI backend.
 * All paths relative to NEXT_PUBLIC_API_URL (default: http://localhost:8000).
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const LS_TOKEN = "cr_auth_token";

/** Browser-session identifier for decision log grouping (changes on page reload). */
export const BROWSER_SESSION_ID = `cr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Registered by the auth store on mount; called whenever any request returns 401. */
let _on401: (() => void) | null = null;
export function register401Handler(cb: () => void) {
  _on401 = cb;
}

/**
 * Session generation. Requests issued before a login can land after it, the
 * dashboard fires several authenticated queries the moment it mounts, and an
 * unauthenticated visitor gets 401s back while they are still typing their
 * password. Without this guard those late 401s ran the global handler and
 * logged the operator out immediately after a successful sign-in.
 *
 * Every request captures the generation it was issued under; a 401 only signs
 * the operator out if that generation is still current.
 */
let _authGeneration = 0;
export function bumpAuthGeneration() {
  _authGeneration += 1;
}

function handle401(generation: number) {
  if (generation === _authGeneration) _on401?.();
}

/** Thrown by get()/post() when the server returns 429 Too Many Requests. */
export class RateLimitError extends Error {
  retryAfter: number;
  constructor(retryAfterSecs = 60) {
    super(`Rate limited: retry in ${retryAfterSecs}s`);
    this.retryAfter = retryAfterSecs;
    this.name = "RateLimitError";
  }
}

/** Thrown when the server returns 401 Unauthorized (session expired / invalid token). */
export class AuthError extends Error {
  constructor(path = "") {
    super(`Unauthorized${path ? `: ${path}` : ""}`);
    this.name = "AuthError";
  }
}

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem(LS_TOKEN);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const generation = _authGeneration;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(4_000),
    headers: { Accept: "application/json", ...getAuthHeaders(), ...init?.headers },
  });
  if (res.status === 401) {
    handle401(generation);
    throw new AuthError(path);
  }
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60", 10);
    throw new RateLimitError(retryAfter);
  }
  if (!res.ok) {
    throw new Error(`API ${path} → ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const generation = _authGeneration;
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    signal: AbortSignal.timeout(30_000),
    headers: { Accept: "application/json", ...getAuthHeaders() },
  });
  if (res.status === 401) { handle401(generation); throw new AuthError(path); }
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60", 10);
    throw new RateLimitError(retryAfter);
  }
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status} ${res.statusText}`);
}

async function post<T>(
  path: string,
  body: unknown,
  timeoutMs = 30_000,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const generation = _authGeneration;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "Content-Type": "application/json", Accept: "application/json", ...getAuthHeaders(), ...extraHeaders },
    body: JSON.stringify(body),
  });
  if (res.status === 401) { handle401(generation); throw new AuthError(path); }
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60", 10);
    throw new RateLimitError(retryAfter);
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as { detail?: string }).detail ?? `API ${path} → ${res.status}`);
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
  province?: string;
}

/** Returns full GeoJSON FeatureCollection of districts. province='Lima' = Lima Metropolitana only. */
export async function fetchDistricts(province?: string): Promise<DistrictCollection> {
  const url = province
    ? `/api/v1/districts?province=${encodeURIComponent(province)}`
    : "/api/v1/districts";
  return get<DistrictCollection>(url);
}

/** Derives a flat list (ubigeo + name) from the same endpoint. */
export async function fetchDistrictList(province?: string): Promise<DistrictListItem[]> {
  const fc = await fetchDistricts(province);
  return fc.features.map((f) => ({
    ubigeo: f.properties.ubigeo,
    name: f.properties.name,
    province: f.properties.province,
  }));
}

/** Returns distinct provinces with district counts. */
export async function fetchProvinces(): Promise<{ provinces: Array<{province: string; region: string; district_count: number}>; default_province: string }> {
  return get("/api/v1/districts/provinces");
}

export interface ScraperSourceHealth {
  label: string;
  schedule: string;
  count: number;
  last_seen_at: string | null;
  status: "ok" | "stale" | "offline" | "error";
  error?: string;
}

export interface ScraperHealth {
  retrieved_at: string;
  overall_status: "ok" | "stale" | "offline";
  redis?: { status: "ok" | "offline" };
  sources: Record<string, ScraperSourceHealth>;
  // Session 23: enriched with operational alert context
  active_alerts?: number;
  critical_alerts?: number;
  sinagerd_level?: string;
}

export async function fetchScraperHealth(): Promise<ScraperHealth> {
  return get<ScraperHealth>("/api/v1/health/scraper");
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
export function fetchImerg(hours = 24, replayDate?: string | null): Promise<ImergCollection> {
  const params = new URLSearchParams({ hours: String(hours) });
  if (replayDate) params.set("at", replayDate);
  return get<ImergCollection>(`/api/v1/layers/imerg/latest?${params}`);
}

// ─── Flood polygons ───────────────────────────────────────────────────────────

export interface FloodCollection {
  type: "FeatureCollection";
  source?: string;
  source_url?: string;
  retrieved_at?: string;
  data_updated_at?: string;
  /** True when any served polygon is a scenario fixture, not a real detection. */
  is_demo_data?: boolean;
  features: GeoJSON.Feature[];
}

export function fetchFlood(replayDate?: string | null): Promise<FloodCollection> {
  const params = replayDate ? `?at=${encodeURIComponent(replayDate)}` : "";
  return get<FloodCollection>(`/api/v1/layers/flood/latest${params}`);
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
  model_version: string | null;
  /** True when this score is a scenario value rather than model output. */
  is_demo_data: boolean;
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
  is_demo_data?: boolean;
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
  /** Matching rows before the 2,000-row response cap, so callers can disclose it. */
  total_available?: number;
  truncated?: boolean;
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
  description?: string | null;
  district_id: number | null;
  district_name?: string | null;
  province?: string | null;
  lat?: number | null;
  lng?: number | null;
  source_refs?: { source?: string; label?: string; url?: string | null } | null;
  created_at: string;
  updated_at: string;
  status: string;
  age_seconds?: number | null;
}

export interface AlertFilters {
  status?: string;
  province?: string;
  district?: string;
}

export function fetchAlerts(filters?: AlertFilters): Promise<Alert[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.province) params.set("province", filters.province);
  if (filters?.district) params.set("district", filters.district);
  const q = params.size > 0 ? `?${params.toString()}` : "";
  return get<Alert[]>(`/api/v1/alerts${q}`);
}

export function actOnAlert(
  alertId: number,
  action: "acknowledge" | "escalate" | "false_positive" | "close",
  operatorId: string,
  note?: string,
): Promise<{ alert_id: number; new_status: string }> {
  return post(`/api/v1/alerts/${alertId}/action`, { operator_id: operatorId, action, note });
}

export async function logDecision(entry: {
  operator_id: string;
  action_type: string;
  alert_id?: number | null;
  payload: Record<string, unknown>;
  session_id?: string | null;
}): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/v1/alerts/log`, {
      method: "POST",
      signal: AbortSignal.timeout(5_000),
      headers: { "Content-Type": "application/json", Accept: "application/json", ...getAuthHeaders() },
      body: JSON.stringify(entry),
    });
  } catch (err) {
    // Network / timeout: best-effort, do not block the operator action
    console.warn("[logDecision] network error (best-effort):", err);
    return;
  }
  if (!res.ok) {
    // Server rejected the write (4xx / 5xx): throw so callers can surface this
    throw new Error(`Decision log write failed: HTTP ${res.status}`);
  }
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

/**
 * Fetch a protected file endpoint with the stored Bearer token and trigger a
 * browser download via a temporary object URL.
 * Returns true on success, false on any failure (caller can show toast).
 */
export async function downloadAuthenticatedFile(
  path: string,
  filename: string,
  mimeHint?: string,
): Promise<boolean> {
  const generation = _authGeneration;
  const headers: Record<string, string> = { ...getAuthHeaders() };
  if (mimeHint) headers["Accept"] = mimeHint;
  try {
    const res = await fetch(`${BASE}${path}`, { headers, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) {
      if (res.status === 401) handle401(generation);
      console.error(`downloadAuthenticatedFile: ${path} → ${res.status}`);
      return false;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return true;
  } catch (err) {
    console.error("downloadAuthenticatedFile failed:", err);
    return false;
  }
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
  source_id?: string | null;
  triage_label: string | null;
  triage_confidence: number | null;
  published_at?: string | null;
  ingested_at: string;
  district_id: number | null;
  district_name: string | null;
  text?: string;
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

// ─── Health check ────────────────────────────────────────────────────────────

export interface ApiHealth {
  status: string;
  version: string;
  sinagerd_level: "EMERGENCIA" | "ALERTA" | "AVISO" | "NORMAL";
  active_alerts: number;
  max_rain_72h_mm: number | null;
  rain_level: "emergencia" | "alerta" | "aviso" | "normal";
}

export async function fetchHealth(): Promise<ApiHealth> {
  return get<ApiHealth>("/api/v1/health");
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

export function mintShareToken(scenario: ScenarioSnapshot): Promise<MintShareResponse> {
  return post<MintShareResponse>("/api/v1/share", { scenario }, 30_000);
}

export function fetchShareToken(token: string): Promise<ResolveShareResponse> {
  return get<ResolveShareResponse>(`/api/v1/share/${encodeURIComponent(token)}`);
}

// ─── District risk summary (map fills) ───────────────────────────────────────

export interface DistrictRiskProperties {
  ubigeo: string;
  name: string;
  population: number | null;
  risk_level: "bajo" | "moderado" | "alto";
  active_alerts: number;
  social_3h: number;
  urgent_social_3h: number;
}

export interface DistrictRiskFeature {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: DistrictRiskProperties;
}

export interface DistrictRiskSummary {
  type: "FeatureCollection";
  retrieved_at: string;
  features: DistrictRiskFeature[];
}

export function fetchDistrictRiskSummary(): Promise<DistrictRiskSummary> {
  return get<DistrictRiskSummary>("/api/v1/districts/risk-summary");
}

// ─── District dashboard ───────────────────────────────────────────────────────

export interface DashboardAlert {
  id: number;
  type: string;
  severity: string;
  status: string;
  title: string;
  created_at: string;
}

export interface AlertTrendDay {
  day: string;
  severity: string;
  count: number;
}

export interface SocialBreakdown {
  label: string;
  count: number;
}

export interface ImergTrendDay {
  day: string;
  acc_24h_mm: number;
  acc_72h_mm: number;
}

export interface DashboardStation {
  code: string;
  name: string;
  source: string;
  river: string;
  latest_time: string | null;
  level_m: number | null;
  flow_m3s: number | null;
  rain_mm: number | null;
}

export interface DistrictDashboard {
  retrieved_at: string;
  district: {
    ubigeo: string;
    name: string;
    population: number | null;
    area_km2: number | null;
  };
  active_alerts: DashboardAlert[];
  alerts_trend_7d: AlertTrendDay[];
  social_24h: SocialBreakdown[];
  imerg_trend_30d: ImergTrendDay[];
  stations: DashboardStation[];
  sinpad_historical_events: number;
}

export function fetchDistrictDashboard(ubigeo: string): Promise<DistrictDashboard> {
  return get<DistrictDashboard>(`/api/v1/districts/${encodeURIComponent(ubigeo)}/dashboard`);
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
  trigger_rain_24h_mm: number | null;
  computed_at: string | null;
  data_status: "available" | "not_computed";
}

export interface FusionSocial {
  total_signals_3h: number;
  urgent_signals_3h: number;
}

export interface FusionRainfall {
  watershed: string | null;
  acc_72h_mm: number | null;
  acc_24h_mm: number | null;
  level: "emergencia" | "alerta" | "aviso" | "normal" | null;
}

export interface DistrictFusion {
  retrieved_at: string;
  district: FusionDistrict;
  risk_level: "bajo" | "moderado" | "alto";
  prose_es: string;
  prose_en?: string;
  flood: FusionFlood;
  huayco: FusionHuayco;
  social: FusionSocial;
  rainfall?: FusionRainfall;
}

export function fetchDistrictFusion(ubigeo: string): Promise<DistrictFusion> {
  return get<DistrictFusion>(`/api/v1/fusion/${encodeURIComponent(ubigeo)}`);
}

// ─── Hydro stations layer ─────────────────────────────────────────────────────

export interface StationProperties {
  id: number;
  code: string;
  name: string;
  source: string;
  river: string;
  alert_threshold_m: number | null;
  level_m: number | null;
  flow_m3s: number | null;
  rain_mm: number | null;
  latest_time: string | null;
  status: "normal" | "alert" | "warning" | "unknown";
  /** True for seeded scenario gauges (their station code carries -DEMO). */
  is_demo_data?: boolean;
  /** False when the gauge has no reading at all: a gap, not a zero. */
  has_reading?: boolean;
}

export interface StationCollection {
  type: "FeatureCollection";
  retrieved_at: string;
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: StationProperties;
  }>;
}

export function fetchStations(): Promise<StationCollection> {
  return get<StationCollection>("/api/v1/layers/stations");
}

// ─── Current weather ──────────────────────────────────────────────────────────

export interface WeatherWarning {
  kind: "heat" | "cold" | "wind" | "fog" | "thunderstorm" | "heavy_rain";
  severity: "warn" | "danger";
  label_es: string;
  label_en: string;
  detail_es: string;
  detail_en: string;
}

export interface WeatherProperties {
  id: number;
  name: string;
  watershed_name: string | null;
  observed_at: string | null;
  temperature_c: number | null;
  apparent_temperature_c: number | null;
  humidity_pct: number | null;
  precipitation_mm: number | null;
  wind_speed_kmh: number | null;
  wind_gusts_kmh: number | null;
  wind_direction_deg: number | null;
  weather_code: number | null;
  condition: { es: string; en: string };
  warnings: WeatherWarning[];
  source: string | null;
}

export interface WeatherCollection {
  type: "FeatureCollection";
  source: string;
  source_url: string;
  attribution: string;
  retrieved_at: string;
  data_updated_at: string | null;
  warnings: WeatherWarning[];
  max_severity: "warn" | "danger" | null;
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] } | null;
    properties: WeatherProperties;
  }>;
}

export function fetchWeather(): Promise<WeatherCollection> {
  return get<WeatherCollection>("/api/v1/layers/weather");
}

// ─── Shelters ─────────────────────────────────────────────────────────────────

export interface ShelterProperties {
  id: number;
  name: string;
  ubigeo: string | null;
  shelter_type: string;
  capacity: number | null;
  address: string | null;
  indeci_code: string | null;
  district_name: string | null;
  notes: string | null;
}

export interface ShelterFeature {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: ShelterProperties;
}

export interface ShelterCollection {
  type: "FeatureCollection";
  source: string;
  retrieved_at: string;
  count: number;
  features: ShelterFeature[];
}

export function fetchShelters(): Promise<ShelterCollection> {
  return get<ShelterCollection>("/api/v1/layers/shelters");
}

// ─── Notification subscribers ────────────────────────────────────────────────

export interface NotificationSubscriber {
  id: number;
  channel: "webhook" | "email" | "sms" | "sms_stub";
  target: string;
  label: string;
  severity_min: string;
  district_filter: string | null;
  active: boolean;
  created_by: string;
  created_at: string;
}

export interface NotificationDelivery {
  id: number;
  subscriber_id: number;
  alert_id: number | null;
  trigger_event: string;
  status: "pending" | "delivered" | "failed" | "skipped";
  attempts: number;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
}

export function fetchNotificationSubscribers(): Promise<NotificationSubscriber[]> {
  return get<NotificationSubscriber[]>("/api/v1/notifications");
}

export function fetchNotificationDeliveries(): Promise<NotificationDelivery[]> {
  return get<NotificationDelivery[]>("/api/v1/notifications/deliveries");
}

export function createNotificationSubscriber(
  body: Pick<NotificationSubscriber, "channel" | "target" | "label" | "severity_min"> & { district_filter?: string | null },
): Promise<NotificationSubscriber> {
  return post<NotificationSubscriber>("/api/v1/notifications", body);
}

export function deleteNotificationSubscriber(id: number): Promise<void> {
  return del(`/api/v1/notifications/${id}`);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface OperatorTokenResponse {
  access_token: string;
  token_type: string;
  operator_id: number;
  username: string;
  full_name: string;
  role: string;
  district_ubigeo: string | null;
}

export interface OperatorOut {
  id: number;
  username: string;
  full_name: string;
  role: string;
  district_ubigeo: string | null;
  active: boolean;
  created_at: string;
}

export async function loginOperator(username: string, password: string): Promise<OperatorTokenResponse> {
  const form = new URLSearchParams({ username, password, grant_type: "password" });
  const res = await fetch(`${BASE}/api/v1/auth/token`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = (body as { detail?: string }).detail ?? "";
    const e = new Error(detail || `Error ${res.status}`);
    (e as Error & { httpStatus: number }).httpStatus = res.status;
    throw e;
  }
  return res.json();
}

export function fetchCurrentOperator(): Promise<OperatorOut> {
  return get<OperatorOut>("/api/v1/auth/me");
}

export function fetchOperators(): Promise<OperatorOut[]> {
  return get<OperatorOut[]>("/api/v1/auth/operators");
}

// ─── HITL Alert Proposals ─────────────────────────────────────────────────────

export interface AlertProposal {
  id: number;
  severity: "critical" | "high" | "medium" | "low";
  alert_type: string;
  district_ubigeo: string | null;
  district_name: string | null;
  title: string;
  summary: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  source_refs?: Array<Record<string, unknown>>;
}

export function fetchPendingProposals(): Promise<AlertProposal[]> {
  return get<AlertProposal[]>("/api/v1/proposals");
}

export function approveProposal(
  id: number,
  operatorId: string,
  notes?: string,
): Promise<{ alert_id: number; proposal_id: number; status: string }> {
  return post(`/api/v1/proposals/${id}/approve`, { operator_id: operatorId, notes });
}

export function rejectProposal(
  id: number,
  operatorId: string,
  notes?: string,
): Promise<{ proposal_id: number; status: string }> {
  return post(`/api/v1/proposals/${id}/reject`, { operator_id: operatorId, notes });
}

// ─── Field reports ────────────────────────────────────────────────────────────

export interface FieldReportPayload {
  operator_id: string;
  text: string;
  label: string;
  district_ubigeo?: string | null;
  session_id?: string | null;
}

export interface FieldReportResponse {
  signal_id: number;
  ingested_at: string | null;
  status: string;
}

export function submitFieldReport(body: FieldReportPayload): Promise<FieldReportResponse> {
  return post<FieldReportResponse>("/api/v1/social/field-report", body);
}
