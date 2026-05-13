"""
load_sigrid.py — Load CENEPRED SIGRID hazard zone polygons into geo.hazard_zones.

CENEPRED SIGRID is Peru's national disaster risk information system.
This script fetches flood and landslide/huayco hazard polygons for the Lima
Metropolitana bounding box and loads them into PostGIS.

Data source: https://sigrid.cenepred.gob.pe / https://sig.cenepred.gob.pe
License: Datos Abiertos del Estado Peruano (open government data)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODE 1 — ArcGIS REST (recommended, requires session token):

  Step 1: Log into https://sigrid.cenepred.gob.pe/sigridv3/mapa
  Step 2: Open DevTools → Network → copy any "token=..." value from
          a Cartografia_Peligros or Informacion_CENEPRED request.
  Step 3: Run immediately (token expires with your browser session):

  docker exec -e DATABASE_URL="postgresql://costa:change_me_in_production@postgres:5432/costa_resiliente" \\
    costa-prefect-worker python /app/load_sigrid.py \\
    --arcgis-token "PASTE_TOKEN_HERE"

  To target a specific service:
    --arcgis-service Cartografia_Peligros   (default)
    --arcgis-service Informacion_CENEPRED

MODE 2 — Local shapefile (if you downloaded from SIGRID's export):

  python scripts/load_sigrid.py --shapefile path/to/hazard.shp \\
      --hazard-type flood --level muy_alto

MODE 3 — WFS / IDEPeru auto (usually unreachable — government infra is down):

  python scripts/load_sigrid.py   (tries WFS then IDEPeru direct URLs)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Requirements (already in apps/workers/pyproject.toml):
    geopandas, shapely, sqlalchemy, psycopg2-binary, requests
"""

import argparse
import logging
import os
import sys
import tempfile
import zipfile
from pathlib import Path

import geopandas as gpd
import requests
from shapely.geometry import mapping
from sqlalchemy import create_engine, text

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── Lima Metropolitana bounding box (WGS84) ────────────────────────────────────
LIMA_BBOX = (-77.2, -12.5, -76.7, -11.7)  # west, south, east, north

# ── CENEPRED SIGRID GeoServer WFS endpoint ────────────────────────────────────
SIGRID_WFS_BASE = "https://sigrid.cenepred.gob.pe/geoserver/ows"

# WFS layer names → (hazard_type, level) mapping
# Source: SIGRID WFS GetCapabilities, confirmed layer names as of 2025
SIGRID_LAYERS = [
    ("sigrid:peligro_inundacion_muy_alto",   "flood",     "muy_alto"),
    ("sigrid:peligro_inundacion_alto",        "flood",     "alto"),
    ("sigrid:peligro_inundacion_medio",       "flood",     "medio"),
    ("sigrid:peligro_movmasa_muy_alto",       "landslide", "muy_alto"),
    ("sigrid:peligro_movmasa_alto",           "landslide", "alto"),
    ("sigrid:peligro_movmasa_medio",          "landslide", "medio"),
]

# Alternative direct download URLs (IDEPeru / CENEPRED open data)
# These are stable GeoJSON/Shapefile exports — use if WFS is unreachable.
CENEPRED_DIRECT_URLS = [
    # Flood hazard Lima (IDEPeru portal)
    "https://www.geoidep.gob.pe/api/v2/collections/peligro_inundacion_muyalto/items?bbox=-77.2,-12.5,-76.7,-11.7&f=geojson&limit=5000",
    # Landslide/huayco hazard Lima
    "https://www.geoidep.gob.pe/api/v2/collections/peligro_movmasa_muyalto/items?bbox=-77.2,-12.5,-76.7,-11.7&f=geojson&limit=5000",
]


ARCGIS_BASE = "https://sig.cenepred.gob.pe/arcgis_server/rest/services/sigrid"

# Keywords to identify hazard polygon layers from ArcGIS layer names
HAZARD_KEYWORDS = ["peligro", "inundacion", "inundación", "deslizamiento",
                   "huayco", "movimiento", "riesgo", "aluvion", "aluvión"]

# Lima bounding box in WGS84 — passed as esriGeometryEnvelope with inSR=4326
LIMA_ENVELOPE = {
    "xmin": -77.2, "ymin": -12.5,
    "xmax": -76.7, "ymax": -11.7,
}

# Hazard level keywords → normalised level string
LEVEL_MAP = {
    "muy alto": "muy_alto", "muyalto": "muy_alto", "muy_alto": "muy_alto",
    "alto": "alto",
    "medio": "medio",
    "bajo": "bajo",
}


def _detect_level(name: str) -> str:
    name_l = name.lower()
    for kw, level in LEVEL_MAP.items():
        if kw in name_l:
            return level
    return "alto"


def _detect_hazard_type(name: str) -> str:
    name_l = name.lower()
    if "inundac" in name_l or "flood" in name_l or "desborde" in name_l:
        return "flood"
    if "huayco" in name_l or "aluvion" in name_l or "aluvión" in name_l:
        return "huayco"
    if "desliz" in name_l or "movim" in name_l or "masa" in name_l:
        return "landslide"
    return "hazard"


def arcgis_enumerate_layers(service: str, token: str) -> list[dict]:
    """List all polygon layers in an ArcGIS MapServer service."""
    url = f"{ARCGIS_BASE}/{service}/MapServer"
    try:
        resp = requests.get(url, params={"f": "json", "token": token}, timeout=20)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            log.error("ArcGIS error: %s", data["error"])
            return []
        layers = data.get("layers", [])
        log.info("Service %s: %d layers found", service, len(layers))
        for lyr in layers:
            log.info("  Layer %s: %s", lyr.get("id"), lyr.get("name"))
        return layers
    except Exception as exc:
        log.warning("enumerate_layers failed: %s", exc)
        return []


def arcgis_query_layer(
    service: str, layer_id: int, token: str, page_size: int = 1000
) -> gpd.GeoDataFrame | None:
    """Query a single ArcGIS layer for Lima features, handling pagination."""
    import json

    url = f"{ARCGIS_BASE}/{service}/MapServer/{layer_id}/query"
    envelope_str = json.dumps(LIMA_ENVELOPE)
    all_features: list[dict] = []
    offset = 0

    while True:
        params = {
            "where": "1=1",
            "geometry": envelope_str,
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "*",
            "returnGeometry": "true",
            "outSR": "4326",
            "resultOffset": offset,
            "resultRecordCount": page_size,
            "f": "geojson",
            "token": token,
        }
        try:
            resp = requests.get(url, params=params, timeout=60)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            log.warning("  query layer %s offset=%d failed: %s", layer_id, offset, exc)
            break

        if "error" in data:
            log.warning("  ArcGIS query error: %s", data["error"])
            break

        features = data.get("features", [])
        all_features.extend(features)
        log.info("  Layer %s: fetched %d features (offset=%d)", layer_id, len(features), offset)

        if len(features) < page_size:
            break
        offset += page_size

    if not all_features:
        return None

    gdf = gpd.GeoDataFrame.from_features(all_features, crs="EPSG:4326")
    return gdf


def fetch_arcgis_service(service: str, token: str) -> list[tuple[gpd.GeoDataFrame, str, str, str]]:
    """
    Enumerate layers in a service, detect hazard ones, query Lima features.
    Returns list of (gdf, hazard_type, level, source_layer).
    """
    layers = arcgis_enumerate_layers(service, token)
    results = []

    for lyr in layers:
        name = lyr.get("name", "")
        lid = lyr.get("id")
        name_l = name.lower()

        # Skip group layers (no geometry) and non-hazard layers
        if lyr.get("type") == "Group Layer":
            continue
        if not any(kw in name_l for kw in HAZARD_KEYWORDS):
            log.debug("Skipping non-hazard layer: %s", name)
            continue

        hazard_type = _detect_hazard_type(name)
        level = _detect_level(name)
        source_layer = f"arcgis:{service}/{lid}"

        log.info("Querying hazard layer %s: %s [%s/%s]", lid, name, hazard_type, level)
        gdf = arcgis_query_layer(service, lid, token)
        if gdf is not None and not gdf.empty:
            results.append((gdf, hazard_type, level, source_layer))
        else:
            log.warning("  No Lima features in layer %s", name)

    return results


def get_db_engine():
    url = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://{user}:{pw}@{host}:{port}/{db}".format(
            user=os.getenv("POSTGRES_USER", "costa"),
            pw=os.getenv("POSTGRES_PASSWORD", "change_me_in_production"),
            host=os.getenv("POSTGRES_HOST", "postgres"),
            port=os.getenv("POSTGRES_PORT", "5432"),
            db=os.getenv("POSTGRES_DB", "costa_resiliente"),
        ),
    )
    return create_engine(url)


def fetch_wfs_layer(layer_name: str, bbox: tuple) -> gpd.GeoDataFrame | None:
    """Fetch one WFS layer clipped to bbox. Returns None if unreachable."""
    west, south, east, north = bbox
    params = {
        "service": "WFS",
        "version": "1.1.0",
        "request": "GetFeature",
        "typeName": layer_name,
        "outputFormat": "application/json",
        "srsName": "EPSG:4326",
        "bbox": f"{south},{west},{north},{east},EPSG:4326",
        "maxFeatures": "10000",
    }
    try:
        log.info("WFS fetch: %s", layer_name)
        resp = requests.get(SIGRID_WFS_BASE, params=params, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("features"):
            log.warning("  → empty response")
            return None
        gdf = gpd.GeoDataFrame.from_features(data["features"], crs="EPSG:4326")
        log.info("  → %d features", len(gdf))
        return gdf
    except Exception as exc:
        log.warning("  → WFS failed (%s)", exc)
        return None


def fetch_direct_geojson(url: str) -> gpd.GeoDataFrame | None:
    """Fetch GeoJSON from IDEPeru or other direct URL."""
    try:
        log.info("Direct fetch: %s", url[:80])
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("features"):
            return None
        gdf = gpd.GeoDataFrame.from_features(data["features"], crs="EPSG:4326")
        log.info("  → %d features", len(gdf))
        return gdf
    except Exception as exc:
        log.warning("  → Direct fetch failed (%s)", exc)
        return None


def load_shapefile(path: str) -> gpd.GeoDataFrame:
    """Load a local shapefile or GeoJSON."""
    log.info("Loading shapefile: %s", path)
    gdf = gpd.read_file(path)
    if gdf.crs and gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(epsg=4326)
    gdf = gdf.cx[LIMA_BBOX[0]:LIMA_BBOX[2], LIMA_BBOX[1]:LIMA_BBOX[3]]
    log.info("  → %d features after Lima clip", len(gdf))
    return gdf


def normalize_geometry(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Ensure all geometries are MultiPolygon (required by DB schema)."""
    from shapely.geometry import MultiPolygon, Polygon

    def to_multi(geom):
        if geom is None:
            return None
        if isinstance(geom, Polygon):
            return MultiPolygon([geom])
        if isinstance(geom, MultiPolygon):
            return geom
        # Buffer by 0 to fix invalid geometries
        fixed = geom.buffer(0)
        if isinstance(fixed, Polygon):
            return MultiPolygon([fixed])
        return fixed

    gdf = gdf.copy()
    gdf["geometry"] = gdf["geometry"].apply(to_multi)
    return gdf[gdf["geometry"].notna()]


def insert_features(
    engine,
    gdf: gpd.GeoDataFrame,
    hazard_type: str,
    level: str,
    source_layer: str,
    replace: bool = False,
):
    """Upsert features into geo.hazard_zones."""
    if gdf.empty:
        log.warning("No features to insert for %s/%s", hazard_type, level)
        return

    gdf = normalize_geometry(gdf)
    name_col = next(
        (c for c in gdf.columns if c.lower() in ("nombre", "name", "nom")),
        None,
    )

    with engine.begin() as conn:
        if replace:
            conn.execute(
                text(
                    "DELETE FROM geo.hazard_zones "
                    "WHERE hazard_type = :ht AND level = :lv AND source_layer = :sl"
                ),
                {"ht": hazard_type, "lv": level, "sl": source_layer},
            )
            log.info("Cleared existing rows for %s/%s/%s", hazard_type, level, source_layer)

        inserted = 0
        for _, row in gdf.iterrows():
            geom = row["geometry"]
            if geom is None or geom.is_empty:
                continue
            name = str(row[name_col]) if name_col and row[name_col] else None
            conn.execute(
                text("""
                    INSERT INTO geo.hazard_zones
                        (name, hazard_type, level, source_layer, geom)
                    VALUES
                        (:name, :hazard_type, :level, :source_layer,
                         ST_SetSRID(ST_GeomFromText(:wkt), 4326))
                """),
                {
                    "name": name,
                    "hazard_type": hazard_type,
                    "level": level,
                    "source_layer": source_layer,
                    "wkt": geom.wkt,
                },
            )
            inserted += 1

    log.info("Inserted %d rows → geo.hazard_zones [%s/%s]", inserted, hazard_type, level)


def main():
    parser = argparse.ArgumentParser(description="Load CENEPRED SIGRID hazard zones")
    parser.add_argument(
        "--arcgis-token", metavar="TOKEN",
        help="SIGRID ArcGIS session token (copy from browser DevTools while logged in)",
    )
    parser.add_argument(
        "--arcgis-service", default="Cartografia_Peligros",
        help="ArcGIS MapServer service name (default: Cartografia_Peligros)",
    )
    parser.add_argument(
        "--shapefile", "-s",
        help="Path to local shapefile or GeoJSON (skips WFS download)",
    )
    parser.add_argument(
        "--hazard-type", "-t",
        default="flood",
        choices=["flood", "landslide", "huayco", "earthquake"],
        help="Hazard type when loading from --shapefile",
    )
    parser.add_argument(
        "--level", "-l",
        default="muy_alto",
        choices=["muy_alto", "alto", "medio", "bajo"],
        help="Hazard level when loading from --shapefile",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Delete existing rows for the same hazard_type/level before inserting",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and parse data but do not write to DB",
    )
    args = parser.parse_args()

    engine = get_db_engine()

    # ── Mode 0: ArcGIS REST with session token ────────────────────────────────
    if args.arcgis_token:
        log.info("Mode: ArcGIS REST — service=%s", args.arcgis_service)
        results = fetch_arcgis_service(args.arcgis_service, args.arcgis_token)
        if not results:
            log.error("No hazard layers found or all were empty. Try --arcgis-service Informacion_CENEPRED")
            # Try second service automatically
            log.info("Trying Informacion_CENEPRED as fallback…")
            results = fetch_arcgis_service("Informacion_CENEPRED", args.arcgis_token)

        if not results:
            log.error("Both services returned no hazard data. Token may be expired.")
            sys.exit(1)

        for gdf, hazard_type, level, source_layer in results:
            log.info("Found %d features: %s/%s from %s", len(gdf), hazard_type, level, source_layer)
            if not args.dry_run:
                insert_features(engine, gdf, hazard_type, level, source_layer, replace=args.replace)
            else:
                log.info("[dry-run] Would insert %d features", len(gdf))
        log.info("ArcGIS SIGRID load complete.")
        return

    # ── Mode 1: local shapefile ────────────────────────────────────────────────
    if args.shapefile:
        gdf = load_shapefile(args.shapefile)
        if not args.dry_run:
            insert_features(
                engine, gdf,
                hazard_type=args.hazard_type,
                level=args.level,
                source_layer=f"local:{Path(args.shapefile).name}",
                replace=args.replace,
            )
        else:
            log.info("[dry-run] Would insert %d features", len(gdf))
        return

    # ── Mode 2: WFS + direct URL auto-download ────────────────────────────────
    any_success = False
    for layer_name, hazard_type, level in SIGRID_LAYERS:
        gdf = fetch_wfs_layer(layer_name, LIMA_BBOX)

        if gdf is None:
            log.info("Trying direct IDEPeru URL for %s/%s…", hazard_type, level)
            # Try corresponding direct URL
            for url in CENEPRED_DIRECT_URLS:
                if hazard_type in url or level in url:
                    gdf = fetch_direct_geojson(url)
                    if gdf is not None:
                        break

        if gdf is None:
            log.warning("Skipping %s/%s — no data source available", hazard_type, level)
            continue

        if not args.dry_run:
            insert_features(
                engine, gdf,
                hazard_type=hazard_type,
                level=level,
                source_layer=layer_name,
                replace=args.replace,
            )
            any_success = True
        else:
            log.info("[dry-run] %s/%s → %d features", hazard_type, level, len(gdf))
            any_success = True

    if not any_success:
        log.error(
            "\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "  SIGRID WFS and IDEPeru URLs are both unreachable.\n"
            "  Manual download instructions:\n"
            "\n"
            "  1. Visit https://sigrid.cenepred.gob.pe/sigridv3/mapa\n"
            "  2. Select: Peligros → Inundación (Muy Alto) → Lima\n"
            "  3. Export as Shapefile (.zip)\n"
            "  4. Run:\n"
            "       python scripts/load_sigrid.py \\\n"
            "         --shapefile path/to/downloaded.shp \\\n"
            "         --hazard-type flood --level muy_alto --replace\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        )
        sys.exit(1)

    log.info("SIGRID load complete.")


if __name__ == "__main__":
    main()
