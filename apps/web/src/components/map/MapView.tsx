"use client";

import { useRef, useEffect, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useUIStore } from "@/store/ui";
import {
  useDistricts, useImerg, useFlood, useHuayco,
  useInfrastructure, useHazard, useSocialSignals, useDistrictRiskSummary,
  useFloodExposure, useStations, useAlerts,
} from "@/lib/queries";
import type { FloodExposure } from "@/lib/api";

const LIMA_CENTER: [number, number] = [-76.97, -12.05];
const LIMA_ZOOM = 10;

let protocolRegistered = false;
function ensurePMTilesProtocol() {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const IMERG_COLOR_RAMP = [
  0, "#1e3a5f", 5, "#2563eb", 20, "#38bdf8",
  50, "#fbbf24", 100, "#f97316", 200, "#dc2626",
] as const;

const ACC_WINDOWS = [1, 3, 6, 12, 24, 72] as const;
type AccWindow = (typeof ACC_WINDOWS)[number];
function closestAccWindow(h: number): AccWindow {
  return ACC_WINDOWS.reduce((p, c) => Math.abs(c - h) < Math.abs(p - h) ? c : p) as AccWindow;
}
function accProp(h: number): string { return `acc_${closestAccWindow(h)}h_mm`; }

const HUAYCO_COLOR: Record<string, string> = {
  low: "#22c55e", moderate: "#f59e0b", high: "#f97316", very_high: "#dc2626",
};

// Human-readable source names
const SOURCE_LABEL: Record<string, string> = {
  sinpad_historical:    "SINPAD histórico 2003–2020",
  sinpad:              "SINPAD – INDECI",
  sen1floods11:        "Sen1Floods11 (SAR U-Net)",
  planetary_computer:  "Microsoft Planetary Computer",
  senamhi:             "SENAMHI",
  ana:                 "ANA Observatorio Chirilu",
};
function srcLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return SOURCE_LABEL[String(raw)] ?? String(raw).replace(/_/g, " ");
}

// Truncate long strings (SAR scene IDs etc.)
function trunc(s: string | null | undefined, max = 22): string | null {
  if (!s) return null;
  return s.length > max ? `…${s.slice(-(max - 1))}` : s;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Read current activeLayers imperatively — avoids stale closure. */
function vis(key: string): "visible" | "none" {
  return useUIStore.getState().activeLayers.has(key) ? "visible" : "none";
}

/** Bounding box for any GeoJSON geometry. */
function geomBounds(geom: GeoJSON.Geometry): maplibregl.LngLatBoundsLike {
  let [minLng, minLat, maxLng, maxLat] = [Infinity, Infinity, -Infinity, -Infinity];
  function walk(c: unknown): void {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number") {
      const [lng, lat] = c as number[];
      if (lng < minLng) minLng = lng; if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng; if (lat > maxLat) maxLat = lat;
    } else { for (const ch of c) walk(ch); }
  }
  walk((geom as { coordinates: unknown }).coordinates);
  return [[minLng, minLat], [maxLng, maxLat]];
}

/** Build dark-theme popup HTML. */
function popupHtml(
  title: string,
  rows: Array<[string, string | number | null | undefined, string?]>,
  titleClass?: string,
): string {
  const body = rows
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v, vc]) =>
      `<div class="cr-row"><span class="cr-key">${k}</span><span class="cr-val${vc ? ` ${vc}` : ""}">${v}</span></div>`
    )
    .join("");
  return `<div class="cr-popup"><div class="cr-title${titleClass ? ` ${titleClass}` : ""}">${title}</div>${body}</div>`;
}

/** Replace active popup with a new one. */
function openPopup(
  m: maplibregl.Map,
  lngLat: maplibregl.LngLat,
  html: string,
  ref: React.MutableRefObject<maplibregl.Popup | null>,
) {
  ref.current?.remove();
  ref.current = new maplibregl.Popup({
    closeButton: true,
    className: "cr-map-popup",
    maxWidth: "260px",
  })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(m);
  ref.current.on("close", () => { ref.current = null; });
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const activePopup = useRef<maplibregl.Popup | null>(null);
  const exposureRef = useRef<FloodExposure | null>(null);
  const criticalMarkers = useRef<maplibregl.Marker[]>([]);
  const { activeLayers, scenario, is3DMode, flyToPoint, setFlyToPoint } = useUIStore();

  const { data: districtGeoJSON } = useDistricts();
  const { data: riskSummary } = useDistrictRiskSummary();
  const replayDate = scenario.isReplayMode ? (scenario.replayDate ?? undefined) : undefined;
  const { data: imergData } = useImerg(scenario.timeWindowHours, replayDate);
  const { data: floodData } = useFlood(replayDate);
  const { data: huaycoData } = useHuayco();
  const { data: infraData } = useInfrastructure();
  const { data: hazardData } = useHazard();
  const { data: socialData } = useSocialSignals(48);
  const { data: stationsData } = useStations();
  const { data: exposureData } = useFloodExposure();
  const { data: alertsData = [] } = useAlerts();

  // Keep ref in sync so click handler always has fresh exposure data
  useEffect(() => { exposureRef.current = exposureData ?? null; }, [exposureData]);

  // ─── Map init + unified interaction handlers ──────────────────────────────
  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    ensurePMTilesProtocol();

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: LIMA_CENTER,
      zoom: LIMA_ZOOM,
      maxBounds: [[-78.5, -13.5], [-74.5, -10.5]],
      attributionControl: false,
    });
    map.current = m;

    // Navigation: moved to bottom-right (below MapRadar, clear of the HUD top-right pills).
    // Attribution: bottom-left alongside scale so it clears the MapRadar widget.
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    m.addControl(new maplibregl.ScaleControl(), "bottom-left");

    m.once("load", () => {
      // Force recompute canvas size — prevents blank map when CSS settles after MapLibre init
      m.resize();

      // ── Priority click handler ─────────────────────────────────────────
      // Order: points (social/huayco/infra) → flood polygon → hazard polygon
      //        → district (select only, no popup) → empty (dismiss popup)
      m.on("click", (e) => {
        // 0a. Alert pins — operator-synthesized events, always check first
        if (m.getLayer("alerts-circle")) {
          const feats = m.queryRenderedFeatures(e.point, { layers: ["alerts-circle"] });
          if (feats.length) {
            const p = feats[0].properties as Record<string, string | number | null>;
            const SEV_ES: Record<string, string> = {
              critical: "Crítico", high: "Alto", medium: "Medio", low: "Bajo",
            };
            const TYPE_ES: Record<string, string> = {
              flood: "Inundación", huayco: "Huayco / deslizamiento",
              social_cluster: "Señal social", weather: "Meteorológica",
            };
            const sev = String(p.severity ?? "");
            const sevClass = sev === "critical" ? "cr-val-critical" : sev === "high" ? "cr-val-alert" : undefined;
            openPopup(m, e.lngLat, popupHtml(`⚠ ${String(p.title ?? "Alerta")}`, [
              ["Tipo",      p.type ? (TYPE_ES[String(p.type)] ?? String(p.type)) : null],
              ["Severidad", sev ? (SEV_ES[sev] ?? sev) : null, sevClass],
              ["Estado",    p.status ? String(p.status) : null],
            ], "cr-title-critical"), activePopup);
            return;
          }
        }

        // 0b. Hydro stations — smallest clickable target
        if (m.getLayer("stations-circle")) {
          const feats = m.queryRenderedFeatures(e.point, { layers: ["stations-circle"] });
          if (feats.length) {
            const p = feats[0].properties as Record<string, string | number | null>;
            const lvl = p.level_m != null ? Number(p.level_m) : null;
            const thr = p.alert_threshold_m != null ? Number(p.alert_threshold_m) : null;
            const overThr = lvl != null && thr != null && lvl >= thr;
            openPopup(m, e.lngLat, popupHtml(`Estación ${String(p.name ?? "—")}`, [
              ["Río",     p.river ? String(p.river) : null],
              ["Fuente",  p.source ? String(p.source).toUpperCase() : null],
              ["Nivel",   lvl != null ? `${lvl.toFixed(2)} m${overThr ? " ⚠ ALERTA" : ""}` : null, overThr ? "cr-val-alert" : undefined],
              ["Umbral",  thr != null ? `${thr.toFixed(1)} m` : null],
              ["Caudal",  p.flow_m3s != null ? `${Number(p.flow_m3s).toFixed(1)} m³/s` : null],
              ["Lluvia",  p.rain_mm != null ? `${Number(p.rain_mm).toFixed(1)} mm/h` : null],
            ], "cr-title-station"), activePopup);
            return;
          }
        }

        // 1a. Social clusters — click to zoom in
        if (m.getLayer("social-clusters")) {
          const clusterFeats = m.queryRenderedFeatures(e.point, { layers: ["social-clusters"] });
          if (clusterFeats.length) {
            const clusterId = clusterFeats[0].properties?.cluster_id as number | undefined;
            const src = m.getSource("social-src") as maplibregl.GeoJSONSource | undefined;
            if (src && clusterId != null) {
              src.getClusterExpansionZoom(clusterId).then((zoom) => {
                const coords = (clusterFeats[0].geometry as GeoJSON.Point).coordinates as [number, number];
                m.flyTo({ center: coords, zoom: zoom + 0.5, duration: 400 });
              }).catch(() => { /* ignore */ });
            }
            return;
          }
        }

        // 1. Point layers — small targets, highest priority
        const POINT_LAYERS = ["social-circle", "huayco-circle", "infra-circle"] as const;
        for (const lid of POINT_LAYERS) {
          if (!m.getLayer(lid)) continue;
          const feats = m.queryRenderedFeatures(e.point, { layers: [lid] });
          if (!feats.length) continue;
          const p = feats[0].properties as Record<string, string | number | null>;
          let html = "";

          if (lid === "social-circle") {
            const LABEL_ES: Record<string, string> = {
              needs_help:            "Solicitud de ayuda",
              infrastructure_damage: "Daño de infraestructura",
              road_blocked:          "Vía bloqueada",
              weather_observation:   "Observación meteorológica",
              false_alarm:           "Falsa alarma",
              irrelevant:            "Irrelevante",
            };
            const signalText = p.text ? String(p.text) : null;
            const labelEs = p.triage_label ? (LABEL_ES[String(p.triage_label)] ?? String(p.triage_label)) : null;
            html = popupHtml("Señal social", [
              ["Tipo", labelEs],
              ["Confianza", p.triage_confidence != null ? `${(Number(p.triage_confidence) * 100).toFixed(0)}%` : null],
              ["Fuente", p.source ? String(p.source) : null],
              ["Distrito", p.district_name ? String(p.district_name) : null],
              ...(signalText ? [["Mensaje", signalText.slice(0, 80) + (signalText.length > 80 ? "…" : "")] as [string, string]] : []),
            ]);
          } else if (lid === "huayco-circle") {
            const RISK: Record<string, string> = {
              low: "Bajo", moderate: "Moderado", high: "Alto", very_high: "Muy alto",
            };
            html = popupHtml(`Quebrada: ${p.name ?? "—"}`, [
              ["Nivel de riesgo", p.risk_level ? (RISK[String(p.risk_level)] ?? String(p.risk_level)) : null],
              ["Probabilidad",    p.probability != null ? `${(Number(p.probability) * 100).toFixed(0)}%` : null],
              ["Lluvia detonante 24h", p.trigger_rain_24h_mm != null ? `${p.trigger_rain_24h_mm} mm` : null],
            ]);
          } else if (lid === "infra-circle") {
            // ASCII tag prefix instead of emoji — renders consistently across
            // OS/browser combos and matches the SINAGERD-style chrome elsewhere.
            const TYPES: Record<string, string> = {
              hospital: "[H] Hospital",       school:       "[E] Colegio",
              bridge:   "[B] Puente",         substation:   "[P] Subestación",
              fire_station: "[F] Bomberos",   shelter:      "[A] Albergue",
            };
            html = popupHtml(String(p.name ?? "Infraestructura crítica"), [
              ["Tipo", p.type ? (TYPES[String(p.type)] ?? String(p.type)) : null],
              ["Distrito", p.district_id != null ? `ID ${p.district_id}` : null],
            ]);
          }

          if (html) { openPopup(m, e.lngLat, html, activePopup); return; }
        }

        // 2. Flood polygon
        if (m.getLayer("flood-fill")) {
          const feats = m.queryRenderedFeatures(e.point, { layers: ["flood-fill"] });
          if (feats.length) {
            const p = feats[0].properties as Record<string, string | number | null>;
            const districtId = p.district_id != null ? Number(p.district_id) : null;
            const expDistrict = districtId != null
              ? (exposureRef.current?.districts.find((d) => d.district_id === districtId) ?? null)
              : null;
            const exp = exposureRef.current;
            const totalOverlapKm2 = exp?.districts.reduce((s, d) => s + d.overlap_km2, 0) ?? 1;
            const districtAtRisk = expDistrict && totalOverlapKm2 > 0
              ? (expDistrict.overlap_km2 / totalOverlapKm2) * (exp?.total_affected_population ?? 0)
              : 0;
            const polyAtRisk = expDistrict && expDistrict.overlap_km2 > 0 && districtAtRisk > 0 && p.area_km2 != null
              ? Math.round((Number(p.area_km2) / expDistrict.overlap_km2) * districtAtRisk)
              : null;
            const popLabel = polyAtRisk != null && polyAtRisk > 0
              ? `~${polyAtRisk.toLocaleString("es-PE")} personas`
              : null;
            openPopup(m, e.lngLat, popupHtml("Inundación detectada (SAR)", [
              ["Distrito",   expDistrict?.district_name ?? null],
              ["Confianza",  p.confidence != null ? `${(Number(p.confidence) * 100).toFixed(0)}%` : null],
              ["Área",       p.area_km2 != null ? `${Number(p.area_km2).toFixed(2)} km²` : null],
              ["Pob. en riesgo", popLabel, popLabel ? "cr-val-alert" : undefined],
              ["Escena SAR", trunc(p.scene_id ? String(p.scene_id) : null)],
            ], "cr-title-flood"), activePopup);
            return;
          }
        }

        // 3. Hazard polygon
        if (m.getLayer("hazard-fill")) {
          const feats = m.queryRenderedFeatures(e.point, { layers: ["hazard-fill"] });
          if (feats.length) {
            const p = feats[0].properties as Record<string, string | null>;
            const LEVEL_ES: Record<string, string> = {
              muy_alto: "Muy alto", alto: "Alto", medio: "Medio", bajo: "Bajo",
            };
            const TYPE_ES: Record<string, string> = {
              flood: "Inundación", landslide: "Deslizamiento / huayco",
            };
            openPopup(m, e.lngLat, popupHtml(String(p.name ?? "Zona de peligro"), [
              ["Tipo de peligro", p.hazard_type ? (TYPE_ES[p.hazard_type] ?? p.hazard_type) : null],
              ["Nivel",           p.level ? (LEVEL_ES[p.level] ?? p.level) : null],
              ["Fuente",          srcLabel(p.source_layer)],
            ]), activePopup);
            return;
          }
        }

        // 4. District — select/deselect + auto-open dashboard
        if (m.getLayer("districts-fill")) {
          const feats = m.queryRenderedFeatures(e.point, { layers: ["districts-fill"] });
          if (feats.length) {
            const p = feats[0].properties as { ubigeo: string; name: string };
            const { setScenario, setActivePanel, scenario: sc } = useUIStore.getState();
            const toggling = sc.districtUbigeo === p.ubigeo;
            setScenario({
              districtUbigeo: toggling ? null : p.ubigeo,
              districtName:   toggling ? null : p.name,
            });
            // Auto-open dashboard so operator immediately sees district data
            if (!toggling) setActivePanel("dashboard");
            activePopup.current?.remove();
            activePopup.current = null;
            return;
          }
        }

        // 5. Empty space — dismiss popup
        activePopup.current?.remove();
        activePopup.current = null;
      });

      // ── Unified hover cursor ────────────────────────────────────────────
      m.on("mousemove", (e) => {
        const interactive = [
          "alerts-circle", "social-clusters", "social-circle", "huayco-circle", "infra-circle", "stations-circle",
          "flood-fill", "hazard-fill", "districts-fill",
        ].filter(l => m.getLayer(l));
        if (!interactive.length) { m.getCanvas().style.cursor = ""; return; }
        const feats = m.queryRenderedFeatures(e.point, { layers: interactive });
        m.getCanvas().style.cursor = feats.length ? "pointer" : "";
      });
    });

    return () => { m.remove(); map.current = null; };
  }, []);

  // ─── 3D mode — pitch map + extrusion layer ────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !m.loaded()) return;
    m.easeTo({ pitch: is3DMode ? 45 : 0, bearing: is3DMode ? -15 : 0, duration: 600 });

    if (is3DMode && m.getSource("flood-src") && !m.getLayer("flood-extrusion")) {
      m.addLayer({
        id: "flood-extrusion",
        type: "fill-extrusion",
        source: "flood-src",
        layout: { visibility: activeLayers.has("flood") ? "visible" : "none" },
        paint: {
          "fill-extrusion-color": "#2563eb",
          "fill-extrusion-opacity": 0.6,
          "fill-extrusion-height": [
            "interpolate", ["linear"],
            ["coalesce", ["get", "area_km2"], 0],
            0, 50, 5, 400, 20, 1200,
          ],
          "fill-extrusion-base": 0,
        },
      });
    } else if (!is3DMode && m.getLayer("flood-extrusion")) {
      m.removeLayer("flood-extrusion");
    }
  }, [is3DMode, activeLayers]);

  // ─── Close popup when context changes ─────────────────────────────────────
  useEffect(() => { activePopup.current?.remove(); activePopup.current = null; },
    [scenario.timeWindowHours]);
  useEffect(() => { activePopup.current?.remove(); activePopup.current = null; },
    [scenario.isReplayMode]);

  // ─── Fly to district when selected externally (dropdown, TopRiskList) ────────
  useEffect(() => {
    const m = map.current;
    if (!m || !scenario.districtUbigeo || !districtGeoJSON) return;
    activePopup.current?.remove(); activePopup.current = null;
    const feat = districtGeoJSON.features.find(
      (f) => f.properties.ubigeo === scenario.districtUbigeo
    );
    if (!feat) return;
    try {
      const bounds = geomBounds(feat.geometry) as [[number, number], [number, number]];
      m.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 700 });
    } catch {
      // ignore invalid bounds
    }
  }, [scenario.districtUbigeo, districtGeoJSON]);

  // ─── addOrUpdateSource helper ─────────────────────────────────────────────
  const addOrUpdateSource = useCallback((id: string, data: GeoJSON.GeoJSON) => {
    const m = map.current;
    if (!m) return;
    const src = m.getSource(id);
    if (src && "setData" in src) (src as maplibregl.GeoJSONSource).setData(data);
    else if (!src) m.addSource(id, { type: "geojson", data });
  }, []);

  // ─── Districts ────────────────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !districtGeoJSON) return;
    const setup = () => {
      addOrUpdateSource("districts-src", districtGeoJSON);
      if (m.getLayer("districts-fill")) return;
      m.addLayer({ id: "districts-fill", type: "fill", source: "districts-src",
        layout: { visibility: vis("districts") },
        paint: { "fill-color": "#3b82f6", "fill-opacity": 0.08 } });
      m.addLayer({ id: "districts-outline", type: "line", source: "districts-src",
        layout: { visibility: vis("districts") },
        paint: { "line-color": "#60a5fa", "line-width": 1, "line-opacity": 0.6 } });
      m.addLayer({ id: "districts-label", type: "symbol", source: "districts-src", minzoom: 11,
        layout: {
          visibility: vis("districts"),
          "text-field": ["get", "name"], "text-size": 10, "text-font": ["Open Sans Regular"],
        },
        paint: { "text-color": "#94a3b8", "text-halo-color": "#0f172a", "text-halo-width": 1 } });
      // Selected-district highlight (filter-driven, always present)
      m.addLayer({ id: "district-selected-fill", type: "fill", source: "districts-src",
        filter: ["==", ["get", "ubigeo"], ""],
        paint: { "fill-color": "#38bdf8", "fill-opacity": 0.2 } });
      m.addLayer({ id: "district-selected-outline", type: "line", source: "districts-src",
        filter: ["==", ["get", "ubigeo"], ""],
        paint: { "line-color": "#38bdf8", "line-width": 2.5 } });
    };
    if (m.loaded()) setup(); else m.once("load", setup);
  }, [districtGeoJSON, addOrUpdateSource]);

  // ─── District risk fills ──────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !riskSummary) return;
    const riskColor: maplibregl.ExpressionSpecification = [
      "match", ["get", "risk_level"],
      "alto",     "#dc2626",
      "moderado", "#f97316",
      "bajo",     "#22c55e",
      "#94a3b8",
    ];
    const setup = () => {
      addOrUpdateSource("risk-src", riskSummary);
      if (!m.getLayer("risk-fill")) {
        m.addLayer(
          {
            id: "risk-fill",
            type: "fill",
            source: "risk-src",
            layout: { visibility: "visible" },
            paint: { "fill-color": riskColor, "fill-opacity": 0.18 },
          },
          m.getLayer("districts-fill") ? "districts-fill" : undefined,
        );
        m.addLayer({
          id: "risk-outline",
          type: "line",
          source: "risk-src",
          filter: ["!=", ["get", "risk_level"], "bajo"],
          layout: { visibility: "visible" },
          paint: {
            "line-color": riskColor,
            "line-width": ["match", ["get", "risk_level"], "alto", 2, 1],
            "line-opacity": 0.7,
          },
        });
      } else {
        (m.getSource("risk-src") as maplibregl.GeoJSONSource)?.setData(riskSummary);
      }
    };
    if (m.loaded()) setup(); else m.once("load", setup);
  }, [riskSummary, addOrUpdateSource]);

  // ─── District zoom + highlight ────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !m.loaded()) return;
    const ubigeo = scenario.districtUbigeo;
    const f: maplibregl.FilterSpecification = ubigeo
      ? ["==", ["get", "ubigeo"], ubigeo]
      : ["==", ["get", "ubigeo"], ""];
    if (m.getLayer("district-selected-fill"))   m.setFilter("district-selected-fill", f);
    if (m.getLayer("district-selected-outline")) m.setFilter("district-selected-outline", f);
    if (!ubigeo) { m.flyTo({ center: LIMA_CENTER, zoom: LIMA_ZOOM, duration: 500 }); return; }
    const feat = districtGeoJSON?.features.find(d => d.properties?.ubigeo === ubigeo);
    if (feat?.geometry) m.fitBounds(geomBounds(feat.geometry), { padding: 60, maxZoom: 14, duration: 600 });
  }, [scenario.districtUbigeo, districtGeoJSON]);

  // ─── Fly to point (alert / social signal navigation) ─────────────────────
  useEffect(() => {
    if (!flyToPoint) return;
    const m = map.current;
    if (!m) return;
    m.flyTo({ center: flyToPoint, zoom: 14, duration: 700 });
    setFlyToPoint(null);
  }, [flyToPoint, setFlyToPoint]);

  // ─── IMERG ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !imergData) return;
    const prop = accProp(scenario.timeWindowHours);
    const colorExpr = [
      "interpolate", ["linear"], ["coalesce", ["get", prop], 0], ...IMERG_COLOR_RAMP,
    ] as unknown as maplibregl.ExpressionSpecification;
    const setup = () => {
      addOrUpdateSource("imerg-src", imergData);
      if (!m.getLayer("imerg-fill")) {
        m.addLayer({ id: "imerg-fill", type: "fill", source: "imerg-src",
          layout: { visibility: vis("imerg") },
          paint: { "fill-color": colorExpr, "fill-opacity": 0.55 } },
          m.getLayer("districts-outline") ? "districts-outline" : undefined);
      } else {
        m.setPaintProperty("imerg-fill", "fill-color", colorExpr);
      }
    };
    if (m.loaded()) setup(); else m.once("load", setup);
  }, [imergData, scenario.timeWindowHours, addOrUpdateSource]);

  // ─── Flood ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !floodData) return;
    const setup = () => {
      addOrUpdateSource("flood-src", floodData);
      if (m.getLayer("flood-fill")) return;
      m.addLayer({ id: "flood-fill", type: "fill", source: "flood-src",
        layout: { visibility: vis("flood") },
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.5 } });
      m.addLayer({ id: "flood-outline", type: "line", source: "flood-src",
        layout: { visibility: vis("flood") },
        paint: { "line-color": "#60a5fa", "line-width": 1, "line-opacity": 0.8 } });
    };
    if (m.loaded()) setup(); else m.once("load", setup);
  }, [floodData, addOrUpdateSource]);

  // ─── Huayco ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !huaycoData) return;
    const setup = () => {
      addOrUpdateSource("huayco-src", huaycoData);
      if (m.getLayer("huayco-circle")) return;
      m.addLayer({ id: "huayco-circle", type: "circle", source: "huayco-src",
        layout: { visibility: vis("huayco") },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["coalesce", ["get", "probability"], 0], 0, 5, 1, 16],
          "circle-color": [
            "match", ["get", "risk_level"],
            "low", HUAYCO_COLOR.low, "moderate", HUAYCO_COLOR.moderate,
            "high", HUAYCO_COLOR.high, "very_high", HUAYCO_COLOR.very_high, "#94a3b8",
          ],
          "circle-opacity": 0.85,
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 1.5,
        } });
    };
    if (m.loaded()) setup(); else m.once("load", setup);
  }, [huaycoData, addOrUpdateSource]);

  // ─── Infrastructure ───────────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !infraData) return;
    const setup = () => {
      addOrUpdateSource("infra-src", infraData);
      if (m.getLayer("infra-circle")) return;
      m.addLayer({ id: "infra-circle", type: "circle", source: "infra-src",
        layout: { visibility: vis("infrastructure") },
        paint: {
          "circle-radius": 5,
          "circle-color": [
            "match", ["get", "type"],
            "hospital", "#f43f5e", "school", "#f59e0b",
            "bridge", "#a78bfa", "substation", "#fbbf24",
            "fire_station", "#fb923c", "shelter", "#34d399", "#64748b",
          ],
          "circle-opacity": 0.9,
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 1,
        } });
    };
    if (m.loaded()) setup(); else m.once("load", setup);
  }, [infraData, addOrUpdateSource]);

  // ─── Social signal pins (with clustering) ────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !socialData) return;
    const labelColor: maplibregl.ExpressionSpecification = [
      "match", ["get", "triage_label"],
      "needs_help", "#ef4444", "infrastructure_damage", "#f97316",
      "road_blocked", "#f59e0b", "weather_observation", "#38bdf8", "#94a3b8",
    ];
    const v = vis("social");
    const setup = () => {
      const src = m.getSource("social-src");
      if (src && "setData" in src) {
        (src as maplibregl.GeoJSONSource).setData(socialData);
      } else if (!src) {
        m.addSource("social-src", { type: "geojson", data: socialData, cluster: true, clusterMaxZoom: 13, clusterRadius: 45 });
      }
      if (m.getLayer("social-clusters")) return;
      m.addLayer({ id: "social-clusters", type: "circle", source: "social-src",
        filter: ["has", "point_count"], layout: { visibility: v },
        paint: { "circle-radius": ["step", ["get", "point_count"], 12, 5, 16, 10, 20], "circle-color": "#f97316", "circle-opacity": 0.85, "circle-stroke-color": "#0f172a", "circle-stroke-width": 1.5 } });
      m.addLayer({ id: "social-cluster-count", type: "symbol", source: "social-src",
        filter: ["has", "point_count"], layout: { visibility: v, "text-field": ["get", "point_count_abbreviated"], "text-size": 10, "text-font": ["Open Sans Bold"] },
        paint: { "text-color": "#fff" } });
      m.addLayer({ id: "social-circle", type: "circle", source: "social-src",
        filter: ["!", ["has", "point_count"]], layout: { visibility: v },
        paint: {
          "circle-radius": 7,
          "circle-color": labelColor,
          "circle-opacity": 0.9,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        } });
    };
    if (m.loaded()) setup(); else m.once("load", setup);
  }, [socialData, addOrUpdateSource]);

  // ─── Hazard zones ─────────────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !hazardData) return;
    const levelColor: maplibregl.ExpressionSpecification = [
      "match", ["get", "level"],
      "muy_alto", "#dc2626", "alto", "#f97316", "medio", "#fbbf24", "bajo", "#84cc16", "#94a3b8",
    ];
    const setup = () => {
      addOrUpdateSource("hazard-src", hazardData);
      if (m.getLayer("hazard-fill")) return;
      m.addLayer({ id: "hazard-fill", type: "fill", source: "hazard-src",
        layout: { visibility: vis("hazard") },
        paint: { "fill-color": levelColor, "fill-opacity": 0.35 } },
        m.getLayer("districts-outline") ? "districts-outline" : undefined);
      m.addLayer({ id: "hazard-outline", type: "line", source: "hazard-src",
        layout: { visibility: vis("hazard") },
        paint: { "line-color": levelColor, "line-width": 1, "line-opacity": 0.7 } });
    };
    if (m.loaded()) setup(); else m.once("load", setup);
  }, [hazardData, addOrUpdateSource]);

  // ─── Hydro stations ───────────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !stationsData) return;
    const statusColor: maplibregl.ExpressionSpecification = [
      "match", ["get", "status"],
      "alert",   "#f97316",
      "warning", "#fbbf24",
      "normal",  "#22c55e",
      "#94a3b8",
    ];
    const setup = () => {
      addOrUpdateSource("stations-src", stationsData);
      if (m.getLayer("stations-circle")) return;
      m.addLayer({ id: "stations-circle", type: "circle", source: "stations-src",
        layout: { visibility: vis("stations") },
        paint: {
          "circle-radius": 7, "circle-color": statusColor,
          "circle-opacity": 0.9, "circle-stroke-color": "#0f172a", "circle-stroke-width": 1.5,
        } });
      m.addLayer({ id: "stations-label", type: "symbol", source: "stations-src", minzoom: 10,
        layout: {
          visibility: vis("stations"),
          "text-field": ["get", "name"], "text-size": 9, "text-font": ["Open Sans Regular"],
          "text-offset": [0, 1.2], "text-anchor": "top",
        },
        paint: { "text-color": "#e2e8f0", "text-halo-color": "#0f172a", "text-halo-width": 1 } });
    };
    if (m.loaded()) setup(); else m.once("load", setup);
  }, [stationsData, addOrUpdateSource]);

  // ─── Alert pins ───────────────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const features: GeoJSON.Feature[] = alertsData
      .filter((a) => a.lat != null && a.lng != null)
      .map((a) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [a.lng!, a.lat!] },
        properties: {
          id: a.id, type: a.type, severity: a.severity,
          title: a.title, status: a.status, description: a.description ?? null,
        },
      }));
    const geoJSON: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
    const severityColor: maplibregl.ExpressionSpecification = [
      "match", ["get", "severity"],
      "critical", "#dc2626", "high", "#f97316", "medium", "#f59e0b", "low", "#22c55e", "#94a3b8",
    ];
    const setup = () => {
      addOrUpdateSource("alerts-src", geoJSON);
      if (m.getLayer("alerts-halo")) return;
      m.addLayer({
        id: "alerts-halo",
        type: "circle",
        source: "alerts-src",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 16, 13, 26],
          "circle-color": severityColor,
          "circle-opacity": ["match", ["get", "status"], "active", 0.20, 0.08],
          "circle-stroke-width": 0,
        },
      });
      m.addLayer({
        id: "alerts-circle",
        type: "circle",
        source: "alerts-src",
        paint: {
          "circle-radius": [
            "match", ["get", "severity"], "critical", 11, "high", 9, "medium", 7, 6,
          ],
          "circle-color": severityColor,
          "circle-opacity": ["match", ["get", "status"], "active", 0.92, 0.45],
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 2,
        },
      });
    };
    if (m.loaded()) setup(); else m.once("load", setup);
  }, [alertsData, addOrUpdateSource]);

  // ─── Pulsing HTML markers for critical alerts ─────────────────────────────
  useEffect(() => {
    const m = map.current;
    // Remove previous markers
    criticalMarkers.current.forEach((mk) => mk.remove());
    criticalMarkers.current = [];
    if (!m) return;
    const criticals = alertsData.filter(
      (a) => a.severity === "critical" && a.status === "active" && a.lat != null && a.lng != null,
    );
    const add = () => {
      criticals.forEach((a) => {
        const el = document.createElement("div");
        el.className = "cr-critical-pulse";
        el.setAttribute("aria-hidden", "true");
        const mk = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([a.lng!, a.lat!])
          .addTo(m);
        criticalMarkers.current.push(mk);
      });
    };
    if (m.loaded()) add(); else m.once("load", add);
    return () => { criticalMarkers.current.forEach((mk) => mk.remove()); criticalMarkers.current = []; };
  }, [alertsData]);

  // ─── Layer visibility sync ────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const layerMap: Record<string, string[]> = {
      districts:      ["districts-fill", "districts-outline", "districts-label"],
      imerg:          ["imerg-fill"],
      flood:          ["flood-fill", "flood-outline"],
      huayco:         ["huayco-circle"],
      hazard:         ["hazard-fill", "hazard-outline"],
      infrastructure: ["infra-circle"],
      social:         ["social-clusters", "social-cluster-count", "social-circle"],
      stations:       ["stations-circle", "stations-label"],
    };
    for (const [key, ids] of Object.entries(layerMap)) {
      const v = activeLayers.has(key) ? "visible" : "none";
      for (const id of ids) {
        if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", v);
      }
    }
  }, [activeLayers]);

  return (
    <div
      ref={mapContainer}
      className="map-container"
      aria-label="Mapa operacional de Lima Metropolitana"
      role="application"
    />
  );
}
