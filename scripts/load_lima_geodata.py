#!/usr/bin/env python3
"""
Sprint 1: Load Lima Metropolitana reference geodata into PostGIS.

Runs once (or on demand) to populate:
  geo.districts       — 43 Lima Province distritos from GADM v4.1
  geo.watersheds      — Rímac, Chillón, Lurín from HydroBASINS Level 8
  geo.quebradas       — 10 priority huayco gullies (manually curated)
  geo.infrastructure  — OSM hospitals, schools, fire stations, substations, bridges

Usage:
    pip install geopandas shapely requests psycopg2-binary sqlalchemy geoalchemy2
    python scripts/load_lima_geodata.py

Environment variables (or .env file):
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD

Idempotent: uses INSERT ... ON CONFLICT DO NOTHING where possible.
"""
import os
import json
import logging
import sys
import time
from pathlib import Path

import requests
import geopandas as gpd
import psycopg2
from psycopg2.extras import execute_values
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ─── DB connection ─────────────────────────────────────────────────────────────
def get_conn():
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        dbname=os.getenv("POSTGRES_DB", "costa_resiliente"),
        user=os.getenv("POSTGRES_USER", "costa"),
        password=os.getenv("POSTGRES_PASSWORD", "change_me_in_production"),
    )


# ─── GADM Lima Districts ───────────────────────────────────────────────────────
# GADM v4.1 GeoJSON for Peru ADM3 (district level)
GADM_PERU_ADM3_URL = (
    "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_PER_3.json.zip"
)
GADM_LOCAL = Path("data/fixtures/gadm41_PER_3.geojson")

# Lima Province INEI code prefix: "15"
LIMA_PROVINCE_CODES = {"15"}  # Lima Province

# Known Lima Metropolitana district UBIGEO codes (43 districts)
# Source: INEI tabla de ubigeos 2023
LIMA_METRO_UBIGEOS = {
    "150101": "Lima",            "150102": "Ancón",          "150103": "Ate",
    "150104": "Barranco",        "150105": "Breña",           "150106": "Carabayllo",
    "150107": "Chaclacayo",      "150108": "Chorrillos",      "150109": "Cieneguilla",
    "150110": "Comas",           "150111": "El Agustino",     "150112": "Independencia",
    "150113": "Jesús María",     "150114": "La Molina",       "150115": "La Victoria",
    "150116": "Lince",           "150117": "Los Olivos",      "150118": "Lurigancho",
    "150119": "Lurín",           "150120": "Magdalena del Mar","150121": "Magdalena Vieja",
    "150122": "Miraflores",      "150123": "Pachacámac",      "150124": "Pucusana",
    "150125": "Pueblo Libre",    "150126": "Puente Piedra",   "150127": "Punta Hermosa",
    "150128": "Punta Negra",     "150129": "Rímac",           "150130": "San Bartolo",
    "150131": "San Borja",       "150132": "San Isidro",      "150133": "San Juan de Lurigancho",
    "150134": "San Juan de Miraflores","150135": "San Luis",  "150136": "San Martín de Porres",
    "150137": "San Miguel",      "150138": "Santa Anita",     "150139": "Santa María del Mar",
    "150140": "Santa Rosa",      "150141": "Santiago de Surco","150142": "Surquillo",
    "150143": "Villa El Salvador","150144": "Villa María del Triunfo",
}

# INEI 2017 census population by UBIGEO (selected key districts)
POPULATION_2017 = {
    "150133": 1038495, "150110": 520450, "150136": 700178, "150101": 271814,
    "150141": 338509,  "150103": 630086, "150143": 393254, "150144": 398433,
    "150108": 325547,  "150106": 333045, "150126": 362285, "150118": 213386,
}


def download_gadm() -> gpd.GeoDataFrame:
    """Download or load cached GADM Peru ADM3."""
    if GADM_LOCAL.exists():
        log.info("Loading cached GADM from %s", GADM_LOCAL)
        return gpd.read_file(GADM_LOCAL)

    log.info("Downloading GADM Peru ADM3 (~25 MB)…")
    GADM_LOCAL.parent.mkdir(parents=True, exist_ok=True)
    zip_path = Path("data/fixtures/gadm41_PER_3.zip")
    r = requests.get(GADM_PERU_ADM3_URL, stream=True, timeout=120)
    r.raise_for_status()
    with open(zip_path, "wb") as f:
        for chunk in r.iter_content(8192):
            f.write(chunk)

    import zipfile
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall("data/fixtures/")

    # Find the GeoJSON inside the zip
    candidates = list(Path("data/fixtures/").glob("gadm41_PER_3*.json"))
    if not candidates:
        raise FileNotFoundError("GADM GeoJSON not found after extraction")
    candidates[0].rename(GADM_LOCAL)
    return gpd.read_file(GADM_LOCAL)


def load_districts(conn) -> int:
    """Load 43 Lima Metropolitana districts into geo.districts."""
    log.info("Loading Lima districts…")
    gdf = download_gadm()

    # Filter to Lima Province districts
    # GADM field: GID_2 = "PER.15_1" for Lima Province (ADM2)
    lima_gdf = gdf[gdf["GID_2"].str.startswith("PER.15_") & ~gdf["GID_2"].str.startswith("PER.15_2")]

    # Map GID_3 to UBIGEO: GADM uses its own codes; we build a name-based match
    records = []
    for _, row in lima_gdf.iterrows():
        district_name = row.get("NAME_3", "")
        # Find matching UBIGEO by name (fuzzy-tolerant)
        ubigeo = None
        for code, name in LIMA_METRO_UBIGEOS.items():
            if name.lower() in district_name.lower() or district_name.lower() in name.lower():
                ubigeo = code
                break
        if ubigeo is None:
            log.warning("No UBIGEO match for GADM district: %s", district_name)
            continue

        geom_wkt = row.geometry.wkt
        pop = POPULATION_2017.get(ubigeo, None)
        records.append((ubigeo, LIMA_METRO_UBIGEOS[ubigeo], geom_wkt, pop))

    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO geo.districts (ubigeo, name, geom, population)
            VALUES %s
            ON CONFLICT (ubigeo) DO UPDATE
              SET geom = EXCLUDED.geom,
                  population = EXCLUDED.population
            """,
            [(u, n, f"ST_SetSRID(ST_GeomFromText('{g}'), 4326)", p)
             for u, n, g, p in records],
            template="(%s, %s, %s, %s)",
        )
        # Recompute area_km2
        cur.execute("""
            UPDATE geo.districts
            SET area_km2 = ST_Area(geom::geography) / 1e6
            WHERE area_km2 IS NULL
        """)
    conn.commit()
    log.info("Loaded %d Lima districts", len(records))
    return len(records)


# ─── Watersheds (HydroBASINS + manual) ────────────────────────────────────────
# We use a manually curated GeoJSON for the 3 Lima watersheds as HydroBASINS
# requires an account. The fixture is small enough to commit.
WATERSHEDS_FIXTURE = Path("data/fixtures/lima_watersheds.geojson")

WATERSHEDS_FALLBACK = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {"name": "Rímac", "river": "Rímac",
                           "outlet_lat": -12.052, "outlet_lon": -77.116},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [-77.2, -12.05], [-76.7, -12.05],
                    [-76.7, -11.7],  [-77.2, -11.7], [-77.2, -12.05]
                ]]
            }
        },
        {
            "type": "Feature",
            "properties": {"name": "Chillón", "river": "Chillón",
                           "outlet_lat": -11.97, "outlet_lon": -77.14},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [-77.2, -11.97], [-76.85, -11.97],
                    [-76.85, -11.7], [-77.2, -11.7], [-77.2, -11.97]
                ]]
            }
        },
        {
            "type": "Feature",
            "properties": {"name": "Lurín", "river": "Lurín",
                           "outlet_lat": -12.27, "outlet_lon": -76.88},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [-76.88, -12.5], [-76.7, -12.5],
                    [-76.7, -12.0], [-76.88, -12.0], [-76.88, -12.5]
                ]]
            }
        },
    ]
}


def load_watersheds(conn) -> int:
    """Load Lima watershed polygons into geo.watersheds."""
    log.info("Loading Lima watersheds…")
    if WATERSHEDS_FIXTURE.exists():
        with open(WATERSHEDS_FIXTURE) as f:
            fc = json.load(f)
    else:
        log.warning("No watersheds fixture found — using approximate bounding boxes")
        fc = WATERSHEDS_FALLBACK
        WATERSHEDS_FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        with open(WATERSHEDS_FIXTURE, "w") as f:
            json.dump(fc, f, indent=2)

    records = []
    for feat in fc["features"]:
        p = feat["properties"]
        geom = shape(feat["geometry"])
        records.append((
            p["name"], p["river"],
            f"ST_SetSRID(ST_GeomFromText('{geom.wkt}'), 4326)",
            p.get("outlet_lat"), p.get("outlet_lon"),
        ))

    with conn.cursor() as cur:
        for name, river, geom_sql, lat, lon in records:
            cur.execute(
                f"""
                INSERT INTO geo.watersheds (name, river, geom, outlet_lat, outlet_lon)
                VALUES (%s, %s, {geom_sql}, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (name, river, lat, lon),
            )
        cur.execute("""
            UPDATE geo.watersheds
            SET area_km2 = ST_Area(geom::geography) / 1e6
            WHERE area_km2 IS NULL
        """)
    conn.commit()
    log.info("Loaded %d watersheds", len(records))
    return len(records)


# ─── Priority Quebradas ────────────────────────────────────────────────────────
# Top-10 Lima quebradas per BRIEF.md — seed data for r.avaflow triggers
QUEBRADAS = [
    {"name": "Pedregal",     "watershed": "Rímac",   "priority": 1, "threshold_mm": 25.0},
    {"name": "Quirio",       "watershed": "Rímac",   "priority": 2, "threshold_mm": 20.0},
    {"name": "Corrales",     "watershed": "Rímac",   "priority": 3, "threshold_mm": 22.0},
    {"name": "Cashahuacra",  "watershed": "Rímac",   "priority": 4, "threshold_mm": 18.0},
    {"name": "Carossio",     "watershed": "Rímac",   "priority": 5, "threshold_mm": 15.0},
    {"name": "Huaycoloro",   "watershed": "Rímac",   "priority": 6, "threshold_mm": 30.0},
    {"name": "Carapongo",    "watershed": "Rímac",   "priority": 7, "threshold_mm": 20.0},
    {"name": "Cieneguilla",  "watershed": "Lurín",   "priority": 8, "threshold_mm": 18.0},
    {"name": "Ñaña",         "watershed": "Rímac",   "priority": 9, "threshold_mm": 22.0},
    {"name": "Yanacoto",     "watershed": "Rímac",   "priority": 10,"threshold_mm": 25.0},
]


def load_quebradas(conn) -> int:
    """Seed geo.quebradas with top-10 priority Lima quebradas."""
    log.info("Loading priority quebradas…")
    with conn.cursor() as cur:
        for q in QUEBRADAS:
            cur.execute("SELECT id FROM geo.watersheds WHERE name = %s", (q["watershed"],))
            row = cur.fetchone()
            watershed_id = row[0] if row else None
            cur.execute(
                """
                INSERT INTO geo.quebradas (name, watershed_id, priority, threshold_24h_mm)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (q["name"], watershed_id, q["priority"], q["threshold_mm"]),
            )
    conn.commit()
    log.info("Loaded %d quebradas", len(QUEBRADAS))
    return len(QUEBRADAS)


# ─── OSM Critical Infrastructure (Overpass API) ───────────────────────────────
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
LIMA_BBOX = (-12.5, -77.2, -11.7, -76.7)  # south, west, north, east (Overpass order)

# OSM amenity/tag → our type mapping
OSM_QUERIES = [
    ("hospital",      'amenity"="hospital'),
    ("school",        'amenity"="school'),
    ("fire_station",  'amenity"="fire_station'),
    ("substation",    'power"="substation'),
    ("bridge",        'highway"="bridge'),
]


def _overpass_query(tag: str, bbox: tuple) -> dict:
    """Run a single Overpass QL node/way query."""
    s, w, n, e = bbox
    query = f"""
    [out:json][timeout:60];
    (
      node["{tag}"]({s},{w},{n},{e});
      way["{tag}"]({s},{w},{n},{e});
    );
    out center;
    """
    time.sleep(1.5)  # polite rate limiting
    r = requests.post(OVERPASS_URL, data={"data": query}, timeout=90)
    r.raise_for_status()
    return r.json()


def load_infrastructure(conn) -> int:
    """Load OSM critical infrastructure points into geo.infrastructure."""
    log.info("Loading OSM infrastructure (Overpass API)…")
    total = 0

    with conn.cursor() as cur:
        for infra_type, tag in OSM_QUERIES:
            log.info("  Querying %s…", infra_type)
            try:
                data = _overpass_query(tag, LIMA_BBOX)
            except Exception as exc:
                log.warning("  Overpass failed for %s: %s", infra_type, exc)
                continue

            records = []
            for elem in data.get("elements", []):
                osm_id = elem["id"]
                name = elem.get("tags", {}).get("name", None)
                if elem["type"] == "node":
                    lat, lon = elem["lat"], elem["lon"]
                elif elem["type"] == "way" and "center" in elem:
                    lat, lon = elem["center"]["lat"], elem["center"]["lon"]
                else:
                    continue
                props = json.dumps(elem.get("tags", {}))
                records.append((osm_id, infra_type, name, lon, lat, props))

            if records:
                execute_values(
                    cur,
                    """
                    INSERT INTO geo.infrastructure (osm_id, type, name, geom, properties)
                    VALUES %s
                    ON CONFLICT DO NOTHING
                    """,
                    records,
                    template="(%s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s::jsonb)",
                )
                total += len(records)
                log.info("  Loaded %d %s features", len(records), infra_type)

    conn.commit()
    log.info("Infrastructure total: %d features", total)
    return total


# ─── Main ──────────────────────────────────────────────────────────────────────
def main():
    log.info("Connecting to PostGIS…")
    try:
        conn = get_conn()
    except Exception as exc:
        log.error("DB connection failed: %s", exc)
        log.error("Is the postgres container running? Try: docker compose up -d postgres")
        sys.exit(1)

    n_districts = load_districts(conn)
    n_watersheds = load_watersheds(conn)
    n_quebradas = load_quebradas(conn)
    n_infra = load_infrastructure(conn)

    conn.close()
    log.info(
        "Done. districts=%d watersheds=%d quebradas=%d infrastructure=%d",
        n_districts, n_watersheds, n_quebradas, n_infra,
    )


if __name__ == "__main__":
    main()
