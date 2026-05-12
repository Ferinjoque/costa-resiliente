"use client";

import { useRef, useEffect } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useUIStore } from "@/store/ui";

const LIMA_CENTER: [number, number] = [-76.97, -12.05];
const LIMA_ZOOM = 10;

// PMTiles protocol registration (self-hosted basemap)
let protocolRegistered = false;
function ensurePMTilesProtocol() {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
}

export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const { activeLayers } = useUIStore();

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    ensurePMTilesProtocol();

    const apiBase = process.env.NEXT_PUBLIC_MINIO_URL ?? "http://localhost:9000";

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      // Self-hosted PMTiles basemap — served from MinIO pmtiles bucket
      // Fallback to blank dark style if not yet generated
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          basemap: {
            type: "vector",
            url: `pmtiles://${apiBase}/pmtiles/lima-basemap.pmtiles`,
          },
        },
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
      maxBounds: [[-78.0, -13.0], [-75.5, -11.0]],
      attributionControl: false,
    });

    map.current.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right"
    );
    map.current.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right"
    );
    map.current.addControl(new maplibregl.ScaleControl(), "bottom-left");

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  return (
    <div
      ref={mapContainer}
      className="map-container"
      aria-label="Mapa operacional de Lima Metropolitana"
      role="application"
    />
  );
}
