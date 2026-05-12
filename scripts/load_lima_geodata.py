#!/usr/bin/env python3
"""
Load Lima Metropolitana reference geodata into PostGIS.

Sources:
  geo.districts       — OSM Overpass (admin_level=8, Lima Province) + hardcoded UBIGEO map
  geo.watersheds      — Hardcoded simplified polygons (Rímac, Chillón, Lurín)
  geo.quebradas       — Top-10 priority huayco gullies (manually curated)
  geo.infrastructure  — OSM Overpass (hospitals, schools, fire stations, bridges)

Usage:
    python scripts/load_lima_geodata.py
    DATABASE_URL=postgresql://costa:pass@localhost:5432/costa_resiliente python scripts/load_lima_geodata.py

Requires: asyncpg, httpx  (both in apps/workers venv)
Idempotent: INSERT ... ON CONFLICT DO NOTHING / DO UPDATE.
"""
import asyncio
import json
import os
import sys

import asyncpg
import httpx

DSN = os.getenv(
    "DATABASE_URL",
    "postgresql://costa:change_me_in_production@localhost:5432/costa_resiliente",
)
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
_OVERPASS_HEADERS = {
    "User-Agent": "costa-resiliente/0.1 (IEEE Response Quest; geodata loader)",
    "Accept": "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
}


# ── Lima districts UBIGEO mapping (INEI 2023) ────────────────────────────────
# Used to match OSM district names to official INEI codes.
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


DISTRICTS_QUERY = """
[out:json][timeout:120];
area["name"="Lima"]["admin_level"="4"]["boundary"="administrative"]->.lima;
(
  relation["admin_level"="8"]["boundary"="administrative"](area.lima);
);
out body;
>;
out skel qt;
"""


async def overpass_fetch(query: str, label: str) -> dict:
    print(f"  Querying Overpass for {label}...", end=" ", flush=True)
    body = "data=" + httpx.QueryParams({"data": query})["data"]
    for endpoint in OVERPASS_ENDPOINTS:
        for attempt in range(2):
            try:
                async with httpx.AsyncClient(timeout=120, headers=_OVERPASS_HEADERS) as client:
                    r = await client.post(endpoint, content=body)
                    r.raise_for_status()
                    data = r.json()
                    print(f"{len(data.get('elements', []))} elements ({endpoint.split('/')[2]})")
                    return data
            except Exception as exc:
                if attempt == 1:
                    print(f"  {endpoint.split('/')[2]}: {exc}")
                    break
                await asyncio.sleep(3)
    print("FAILED (all endpoints)")
    return {"elements": []}


def _build_polygon(relation: dict, nodes_by_id: dict, ways_by_id: dict) -> str | None:
    outer_refs = [m["ref"] for m in relation.get("members", []) if m.get("role") == "outer" and m.get("type") == "way"]
    rings = []
    for way_id in outer_refs:
        way = ways_by_id.get(way_id)
        if not way:
            continue
        coords = [(nodes_by_id[n]["lon"], nodes_by_id[n]["lat"]) for n in way.get("nodes", []) if n in nodes_by_id]
        if len(coords) >= 3:
            if coords[0] != coords[-1]:
                coords.append(coords[0])
            rings.append("((" + ", ".join(f"{x} {y}" for x, y in coords) + "))")
    return ("MULTIPOLYGON(" + ", ".join(rings) + ")") if rings else None


async def load_districts(conn: asyncpg.Connection) -> int:
    data = await overpass_fetch(DISTRICTS_QUERY, "Lima districts")
    elements = data.get("elements", [])
    nodes_by_id = {el["id"]: el for el in elements if el["type"] == "node"}
    ways_by_id = {el["id"]: el for el in elements if el["type"] == "way"}

    count = 0
    for rel in (el for el in elements if el["type"] == "relation"):
        tags = rel.get("tags", {})
        name = tags.get("name") or tags.get("name:es") or ""
        if not name:
            continue

        # Match to known UBIGEO by name
        ubigeo = next(
            (code for code, dname in LIMA_METRO_UBIGEOS.items()
             if dname.lower() in name.lower() or name.lower() in dname.lower()),
            str(tags.get("ref:inei") or f"15{rel['id'] % 10000:04d}").zfill(6)[:6],
        )
        pop = POPULATION_2017.get(ubigeo)
        wkt = _build_polygon(rel, nodes_by_id, ways_by_id)
        if not wkt:
            print(f"    skip {name} — no geometry")
            continue
        try:
            await conn.execute(
                """
                INSERT INTO geo.districts (ubigeo, name, province, region, geom, population)
                VALUES ($1, $2, 'Lima', 'Lima', ST_GeomFromText($3, 4326), $4)
                ON CONFLICT (ubigeo) DO UPDATE
                  SET name = EXCLUDED.name, geom = EXCLUDED.geom, population = EXCLUDED.population
                """,
                ubigeo, LIMA_METRO_UBIGEOS.get(ubigeo, name), wkt, pop,
            )
            await conn.execute(
                "UPDATE geo.districts SET area_km2 = ST_Area(geom::geography)/1e6 WHERE ubigeo=$1 AND area_km2 IS NULL",
                ubigeo,
            )
            count += 1
        except Exception as exc:
            print(f"    skip {name}: {exc}")

    return count


# ── Watersheds ───────────────────────────────────────────────────────────────

WATERSHEDS = [
    ("Rímac",   "Rímac",   -12.053, -77.123, 3503.0,
     "MULTIPOLYGON(((-77.20 -11.90,-76.70 -11.90,-76.70 -12.15,-77.00 -12.20,-77.20 -12.10,-77.20 -11.90)))"),
    ("Chillón", "Chillón", -11.975, -77.115, 2444.0,
     "MULTIPOLYGON(((-77.20 -11.70,-76.90 -11.70,-76.85 -11.90,-77.05 -11.95,-77.20 -11.85,-77.20 -11.70)))"),
    ("Lurín",   "Lurín",   -12.283, -76.883, 1677.0,
     "MULTIPOLYGON(((-77.00 -12.20,-76.70 -12.20,-76.70 -12.50,-76.95 -12.50,-77.05 -12.35,-77.00 -12.20)))"),
]

# ── Quebradas ─────────────────────────────────────────────────────────────────
# Top-10 Lima quebradas — seed data for r.avaflow triggers
QUEBRADAS = [
    ("Pedregal",    "Rímac",  1, 25.0),
    ("Quirio",      "Rímac",  2, 20.0),
    ("Corrales",    "Rímac",  3, 22.0),
    ("Cashahuacra", "Rímac",  4, 18.0),
    ("Carossio",    "Rímac",  5, 15.0),
    ("Huaycoloro",  "Rímac",  6, 30.0),
    ("Carapongo",   "Rímac",  7, 20.0),
    ("Cieneguilla", "Lurín",  8, 18.0),
    ("Ñaña",        "Rímac",  9, 22.0),
    ("Yanacoto",    "Rímac", 10, 25.0),
]

# ── Infrastructure Overpass query ─────────────────────────────────────────────

INFRA_QUERY = """
[out:json][timeout:90][bbox:-12.5,-77.2,-11.7,-76.7];
(
  node["amenity"="hospital"];
  node["amenity"="clinic"];
  node["amenity"="fire_station"];
  node["amenity"="school"];
  way["amenity"="hospital"];
  way["amenity"="fire_station"];
  way["bridge"="yes"]["highway"~"primary|secondary|trunk"];
  node["emergency"="shelter"];
  node["power"="substation"];
);
out center;
"""

AMENITY_TO_TYPE = {
    "hospital": "hospital", "clinic": "hospital",
    "fire_station": "fire_station", "school": "school",
}


async def load_watersheds(conn: asyncpg.Connection) -> int:
    await conn.execute("TRUNCATE geo.watersheds RESTART IDENTITY CASCADE")
    for name, river, lat, lon, area, wkt in WATERSHEDS:
        await conn.execute(
            """
            INSERT INTO geo.watersheds (name, river, geom, area_km2, outlet_lat, outlet_lon)
            VALUES ($1,$2,ST_GeomFromText($3,4326),$4,$5,$6)
            """,
            name, river, wkt, area, lat, lon,
        )
    return len(WATERSHEDS)


async def load_quebradas(conn: asyncpg.Connection) -> int:
    await conn.execute("TRUNCATE geo.quebradas RESTART IDENTITY CASCADE")
    ws_map = {r["river"]: r["id"] for r in await conn.fetch("SELECT id, river FROM geo.watersheds")}
    for name, river, priority, threshold in QUEBRADAS:
        await conn.execute(
            """
            INSERT INTO geo.quebradas (name, watershed_id, priority, threshold_24h_mm)
            VALUES ($1,$2,$3,$4)
            """,
            name, ws_map.get(river), priority, threshold,
        )
    return len(QUEBRADAS)


async def load_infrastructure(conn: asyncpg.Connection) -> int:
    data = await overpass_fetch(INFRA_QUERY, "Lima infrastructure")
    count = 0
    for el in data.get("elements", []):
        tags = el.get("tags", {})
        amenity = tags.get("amenity", "")
        itype = (AMENITY_TO_TYPE.get(amenity)
                 or ("bridge" if tags.get("bridge") == "yes" else None)
                 or ("substation" if tags.get("power") == "substation" else None)
                 or ("shelter" if tags.get("emergency") == "shelter" else None))
        if not itype:
            continue
        if "center" in el:
            lat, lon = el["center"]["lat"], el["center"]["lon"]
        elif el["type"] == "node":
            lat, lon = el.get("lat"), el.get("lon")
        else:
            continue
        if lat is None:
            continue
        try:
            await conn.execute(
                """
                INSERT INTO geo.infrastructure (osm_id, type, name, geom, properties)
                VALUES ($1,$2,$3,ST_SetSRID(ST_MakePoint($4,$5),4326),$6)
                ON CONFLICT DO NOTHING
                """,
                el.get("id"), itype,
                tags.get("name") or tags.get("name:es") or itype,
                lon, lat, json.dumps({k: v for k, v in tags.items() if k != "name"}),
            )
            count += 1
        except Exception as exc:
            print(f"    skip {tags.get('name', itype)}: {exc}")
    return count


async def main() -> None:
    print("Costa Resiliente — Lima geodata loader")
    print(f"Connecting to {DSN.split('@')[-1]}...\n")
    conn = await asyncpg.connect(DSN)
    try:
        print("[1/4] Watersheds...", end=" ")
        print(f"{await load_watersheds(conn)}")

        print("[2/4] Quebradas...", end=" ")
        print(f"{await load_quebradas(conn)}")

        print("[3/4] Districts from OSM Overpass...")
        print(f"  {await load_districts(conn)} districts")

        print("[4/4] Infrastructure from OSM Overpass...")
        print(f"  {await load_infrastructure(conn)} POIs")

        row = await conn.fetchrow("""
            SELECT
              (SELECT COUNT(*) FROM geo.districts)      AS districts,
              (SELECT COUNT(*) FROM geo.watersheds)     AS watersheds,
              (SELECT COUNT(*) FROM geo.quebradas)      AS quebradas,
              (SELECT COUNT(*) FROM geo.infrastructure) AS infra
        """)
        print(f"\nTotals: {dict(row)}")
        print("Done. Run: python scripts/seed_demo_data.py")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
