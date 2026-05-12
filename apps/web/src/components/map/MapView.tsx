"use client";

import { useRef, useEffect, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useUIStore } from "@/store/ui";
import {
  useDistricts,
  useImerg,
  useFlood,
  useHuayco,
  useInfrastructure,
} from "@/lib/queries";

const LIMA_CENTER: [number, number] = [-76.97, -12.05];
const LIMA_ZOOM = 10;

// ─── PMTiles protocol registration ───────────────────────────────────────────
let protocolRegistered = false;
function ensurePMTilesProtocol() {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
}

// ─── IMERG colour ramp stops (value, colour pairs for interpolate) ────────────
const IMERG_COLOR_RAMP = [
  0,    "#1e3a5f",
  5,    "#2563eb",
  20,   "#38bdf8",
  50,   "#fbbf24",
  100,  "#f97316",
  200,  "#dc2626",
] as const;

// ─── Map accumulation window hours → property name ───────────────────────────
const ACC_WINDOWS = [1, 3, 6, 12, 24, 72] as const;
type AccWindow = (typeof ACC_WINDOWS)[number];

function closestAccWindow(hours: number): AccWindow {
  return ACC_WINDOWS.reduce((prev, curr) =>
    Math.abs(curr - hours) < Math.abs(prev - hours) ? curr : prev
  ) as AccWindow;
}

function accProp(hours: number): string {
  return `acc_${closestAccWindow(hours)}h_mm`;
}

// ─── Huayco risk palette ──────────────────────────────────────────────────────
const HUAYCO_COLOR: Record<string, string> = {
  low: "#22c55e",
  moderate: "#f59e0b",
  high: "#f97316",
  very_high: "#dc2626",
};

export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const { activeLayers, scenario } = useUIStore();

  // ─── Data queries ──────────────────────────────────────────────────────────
  const { data: districtGeoJSON } = useDistricts();
  const { data: imergData } = useImerg(scenario.timeWindowHours);
  const { data: floodData } = useFlood();
  const { data: huaycoData } = useHuayco();
  const { data: infraData } = useInfrastructure();

  // ─── Map initialisation ────────────────────────────────────────────────────
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    ensurePMTilesProtocol();

    const minioBase = process.env.NEXT_PUBLIC_MINIO_URL ?? "http://localhost:9000";

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#0f172a" },
          },
        ],
      },
      center: LIMA_CENTER,
      zoom: LIMA_ZOOM,
      maxBounds: [[-78.5, -13.5], [-74.5, -10.5]],
      attributionControl: false,
    });

    const m = map.current;

    m.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right"
    );
    m.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right"
    );
    m.addControl(new maplibregl.ScaleControl(), "bottom-left");

    // Attempt to load PMTiles basemap (graceful — fails silently if not generated yet)
    m.on("load", () => {
      try {
        m.addSource("basemap", {
          type: "vector",
          url: `pmtiles://${minioBase}/pmtiles/lima-basemap.pmtiles`,
        });
        m.addLayer({
          id: "basemap-roads",
          type: "line",
          source: "basemap",
          "source-layer": "roads",
          paint: { "line-color": "#334155", "line-width": 1 },
        });
        m.addLayer({
          id: "basemap-buildings",
          type: "fill",
          source: "basemap",
          "source-layer": "buildings",
          paint: { "fill-color": "#1e293b", "fill-opacity": 0.6 },
        });
      } catch {
        // PMTiles not yet generated — dark background fallback is fine
      }
    });

    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  // ─── Sync district boundaries ──────────────────────────────────────────────
  const addOrUpdateSource = useCallback(
    (id: string, data: GeoJSON.GeoJSON) => {
      const m = map.current;
      if (!m) return;
      const src = m.getSource(id);
      if (src && "setData" in src) {
        (src as maplibregl.GeoJSONSource).setData(data);
      } else if (!src) {
        m.addSource(id, { type: "geojson", data });
      }
    },
    []
  );

  useEffect(() => {
    const m = map.current;
    if (!m || !districtGeoJSON) return;

    const onLoad = () => {
      addOrUpdateSource("districts-src", districtGeoJSON);

      if (!m.getLayer("districts-fill")) {
        m.addLayer({
          id: "districts-fill",
          type: "fill",
          source: "districts-src",
          paint: {
            "fill-color": "#3b82f6",
            "fill-opacity": 0.08,
          },
        });
      }
      if (!m.getLayer("districts-outline")) {
        m.addLayer({
          id: "districts-outline",
          type: "line",
          source: "districts-src",
          paint: {
            "line-color": "#60a5fa",
            "line-width": 1,
            "line-opacity": 0.6,
          },
        });
      }
      if (!m.getLayer("districts-label")) {
        m.addLayer({
          id: "districts-label",
          type: "symbol",
          source: "districts-src",
          minzoom: 11,
          layout: {
            "text-field": ["get", "name"],
            "text-size": 10,
            "text-font": ["Open Sans Regular"],
          },
          paint: {
            "text-color": "#94a3b8",
            "text-halo-color": "#0f172a",
            "text-halo-width": 1,
          },
        });
      }
    };

    if (m.loaded()) {
      onLoad();
    } else {
      m.once("load", onLoad);
    }
  }, [districtGeoJSON, addOrUpdateSource]);

  // ─── Sync IMERG heatmap ────────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !imergData) return;

    const prop = accProp(scenario.timeWindowHours);
    const colorExpr = [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", prop], 0],
      ...IMERG_COLOR_RAMP,
    ] as unknown as maplibregl.ExpressionSpecification;

    const onLoad = () => {
      addOrUpdateSource("imerg-src", imergData);

      if (!m.getLayer("imerg-fill")) {
        m.addLayer(
          {
            id: "imerg-fill",
            type: "fill",
            source: "imerg-src",
            paint: {
              "fill-color": colorExpr,
              "fill-opacity": 0.55,
            },
          },
          m.getLayer("districts-outline") ? "districts-outline" : undefined
        );
      } else {
        // Update paint when time window changes
        m.setPaintProperty("imerg-fill", "fill-color", colorExpr);
      }
    };

    if (m.loaded()) {
      onLoad();
    } else {
      m.once("load", onLoad);
    }
  }, [imergData, scenario.timeWindowHours, addOrUpdateSource]);

  // ─── Sync flood polygons ───────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !floodData) return;

    const onLoad = () => {
      addOrUpdateSource("flood-src", floodData);

      if (!m.getLayer("flood-fill")) {
        m.addLayer({
          id: "flood-fill",
          type: "fill",
          source: "flood-src",
          paint: {
            "fill-color": "#2563eb",
            "fill-opacity": 0.5,
          },
        });
      }
    };

    if (m.loaded()) {
      onLoad();
    } else {
      m.once("load", onLoad);
    }
  }, [floodData, addOrUpdateSource]);

  // ─── Sync huayco susceptibility ────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !huaycoData) return;

    const onLoad = () => {
      addOrUpdateSource("huayco-src", huaycoData);

      if (!m.getLayer("huayco-circle")) {
        m.addLayer({
          id: "huayco-circle",
          type: "circle",
          source: "huayco-src",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "probability"], 0],
              0, 4,
              1, 12,
            ],
            "circle-color": [
              "match",
              ["get", "risk_level"],
              "low", HUAYCO_COLOR.low,
              "moderate", HUAYCO_COLOR.moderate,
              "high", HUAYCO_COLOR.high,
              "very_high", HUAYCO_COLOR.very_high,
              "#94a3b8",
            ],
            "circle-opacity": 0.85,
            "circle-stroke-color": "#0f172a",
            "circle-stroke-width": 1,
          },
        });
      }
    };

    if (m.loaded()) {
      onLoad();
    } else {
      m.once("load", onLoad);
    }
  }, [huaycoData, addOrUpdateSource]);

  // ─── Sync infrastructure ───────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !infraData) return;

    const onLoad = () => {
      addOrUpdateSource("infra-src", infraData);

      if (!m.getLayer("infra-circle")) {
        m.addLayer({
          id: "infra-circle",
          type: "circle",
          source: "infra-src",
          paint: {
            "circle-radius": 5,
            "circle-color": [
              "match",
              ["get", "category"],
              "hospital", "#f43f5e",
              "school", "#f59e0b",
              "bridge", "#a78bfa",
              "substation", "#fbbf24",
              "#64748b",
            ],
            "circle-opacity": 0.9,
            "circle-stroke-color": "#0f172a",
            "circle-stroke-width": 1,
          },
        });
      }
    };

    if (m.loaded()) {
      onLoad();
    } else {
      m.once("load", onLoad);
    }
  }, [infraData, addOrUpdateSource]);

  // ─── Layer visibility from Zustand store ──────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !m.loaded()) return;

    const layerMap: Record<string, string[]> = {
      districts: ["districts-fill", "districts-outline", "districts-label"],
      imerg: ["imerg-fill"],
      flood: ["flood-fill"],
      huayco: ["huayco-circle"],
      infrastructure: ["infra-circle"],
    };

    for (const [key, ids] of Object.entries(layerMap)) {
      const vis = activeLayers.has(key) ? "visible" : "none";
      for (const id of ids) {
        if (m.getLayer(id)) {
          m.setLayoutProperty(id, "visibility", vis);
        }
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
