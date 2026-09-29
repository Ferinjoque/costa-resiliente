#!/usr/bin/env python3
"""
Load authoritative district boundaries and CENEPRED El Niño risk into PostGIS.

Source:
  https://sig.cenepred.gob.pe/arcgis_server/rest/services/FEN/ER_NINO2027_BD/MapServer
    layer 4  Riesgos a inundación           (flood risk, per district)
    layer 5  Riesgos a movimientos en masa  (mass-movement / huayco risk, per district)

CENEPRED's El Niño risk scenario, built on the rainfall of the 1983, 1998, 2017
and 2023 summers. Each feature is one district: official INEI UBIGEO, the
district polygon, 2017 census population, and the scenario's susceptibility,
vulnerability and risk levels. The service answers anonymously.

Why this replaces the earlier district load:
  * load_lima_geodata.py built polygons from OSM by closing every boundary WAY as
    its own ring instead of stitching the ways together. Districts came out as
    slivers and triangles (Villa El Salvador 3.3 km² against a real 35 km²).
  * San Juan de Lurigancho, San Juan de Miraflores and all 7 Callao districts
    were 5-point bounding boxes.
  * The 118 "Lima Región" districts carried invented codes (15{osm_id % 10000})
    rather than INEI UBIGEOs.

Rows are updated IN PLACE, keyed by UBIGEO (or, for the invented codes, by
district name), so geo.districts.id is preserved and every foreign key from
ops.alerts, geo.infrastructure, geo.shelters and social.signals keeps pointing
at the same district. Nothing is deleted.

Usage:
    python scripts/load_cenepred_districts.py                 # live fetch
    python scripts/load_cenepred_districts.py --from-dir DIR  # er_4.geojson / er_5.geojson

    docker cp scripts/load_cenepred_districts.py costa-prefect-worker:/app/
    MSYS_NO_PATHCONV=1 docker exec costa-prefect-worker python /app/load_cenepred_districts.py

Requires: asyncpg, httpx (both in apps/workers venv). Idempotent.
"""
import argparse
import asyncio
import json
import os
import sys
import unicodedata
from pathlib import Path

import asyncpg
import httpx

def _dsn() -> str:
    if url := os.getenv("DATABASE_URL"):
        return url
    try:  # inside the worker container: same connection settings as the ingest flows
        from costa_workers.ingest.social import _db_dsn
        return _db_dsn()
    except ImportError:
        return "postgresql://costa:change_me_in_production@localhost:5432/costa_resiliente"

MAPSERVER = (
    "https://sig.cenepred.gob.pe/arcgis_server/rest/services"
    "/FEN/ER_NINO2027_BD/MapServer"
)
SOURCE_LABEL = "CENEPRED Escenario de Riesgo FEN"

# Lima department (15) and Callao (07). Lima province is 1501.
WHERE = "ubigeo LIKE '15%' OR ubigeo LIKE '07%'"

LAYERS = {4: "flood", 5: "mass_movement"}

_HEADERS = {
    "User-Agent": "costa-resiliente/0.1 (IEEE Response Quest; CENEPRED district loader)",
    "Accept": "application/geo+json, application/json",
}
_TIMEOUT = httpx.Timeout(180.0, connect=20.0)

# Keep the names the product already uses for Lima Metropolitana / Callao.
# CENEPRED ships upper-case names without the accents operators expect.
_PROVINCE_NAMES = {
    "LIMA": "Lima", "CALLAO": "Callao", "BARRANCA": "Barranca",
    "CAJATAMBO": "Cajatambo", "CANTA": "Canta", "CAÑETE": "Cañete",
    "HUARAL": "Huaral", "HUAROCHIRI": "Huarochirí", "HUAURA": "Huaura",
    "OYON": "Oyón", "YAUYOS": "Yauyos",
}


def _norm(text: str) -> str:
    """Accent- and case-insensitive key for matching district names."""
    decomposed = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in decomposed if not unicodedata.combining(c)).upper().strip()


def _level(raw: str | None) -> str | None:
    """'Muy alto' / 'Muy Alto' / 'Alta' → muy_alto / alto (one vocabulary for both hazards)."""
    if not raw:
        return None
    key = _norm(raw).replace(" ", "_").lower()
    return {"alta": "alto", "media": "medio", "baja": "bajo", "muy_alta": "muy_alto"}.get(key, key)


def _title(name: str) -> str:
    small = {"de", "del", "la", "las", "los", "y", "el"}
    words = name.lower().split()
    return " ".join(w if (i and w in small) else w.capitalize() for i, w in enumerate(words))


async def fetch_layer(client: httpx.AsyncClient, layer_id: int) -> list[dict]:
    resp = await client.get(
        f"{MAPSERVER}/{layer_id}/query",
        params={"where": WHERE, "outFields": "*", "outSR": "4326", "f": "geojson"},
    )
    resp.raise_for_status()
    payload = resp.json()
    if "error" in payload:
        raise RuntimeError(f"layer {layer_id}: {payload['error']}")
    return payload.get("features", [])


def read_layer(directory: Path, layer_id: int) -> list[dict]:
    path = directory / f"er_{layer_id}.geojson"
    return json.loads(path.read_text(encoding="utf-8")).get("features", [])


def _risk_row(hazard: str, props: dict) -> dict:
    if hazard == "flood":
        return {
            "risk_level": _level(props.get("nriesgo_in")),
            "vulnerability": _level(props.get("nvuln_in")),
            "risk_value": props.get("vriesgo_in"),
            "susceptibility": _level(props.get("niv_sinu")),
            "exposed_homes": props.get("viv_sinu"),
            "exposed_schools": props.get("iiee_sinu"),
            "exposed_health": props.get("eess_sinu"),
        }
    return {
        "risk_level": _level(props.get("nriesgo_mm")),
        "vulnerability": _level(props.get("vuln_mm")),
        "risk_value": props.get("vriesgo_mm"),
        "susceptibility": _level(props.get("npel_mm")),
        "exposed_homes": props.get("vivsm_ma_a"),
        "exposed_schools": props.get("iiee_smm"),
        "exposed_health": props.get("eess_smm"),
    }


async def upsert_districts(conn: asyncpg.Connection, features: list[dict]) -> dict[str, int]:
    stats = {"updated": 0, "remapped": 0, "inserted": 0}
    existing = await conn.fetch("SELECT id, ubigeo, name, province FROM geo.districts")
    by_ubigeo = {r["ubigeo"]: r for r in existing}
    real_codes = {f["properties"]["ubigeo"] for f in features}
    # Rows whose code is not a real INEI UBIGEO, matchable only by name.
    invented: dict[str, list] = {}
    for r in existing:
        if r["ubigeo"] not in real_codes:
            invented.setdefault(_norm(r["name"]), []).append(r)

    for feat in features:
        p = feat["properties"]
        ubigeo = p["ubigeo"]
        province = _PROVINCE_NAMES.get(_norm(p["nombprov"]), _title(p["nombprov"]))
        geojson = json.dumps(feat["geometry"])
        area = p.get("adist_km2")
        pop = p.get("pob_2017")

        row = by_ubigeo.get(ubigeo)
        if row is None:
            candidates = invented.get(_norm(p["nombdist"]), [])
            if len(candidates) == 1:
                row = candidates.pop()
                stats["remapped"] += 1
            else:
                stats["inserted"] += 1
        else:
            stats["updated"] += 1

        if row is not None:
            # Keep an existing (curated, accented) name for Lima/Callao, where the
            # product's names are already correct; take CENEPRED's otherwise.
            name = row["name"] if ubigeo.startswith(("1501", "0701")) else _title(p["nombdist"])
            await conn.execute(
                """
                UPDATE geo.districts
                SET ubigeo = $2, name = $3, province = $4, region = $5,
                    geom = ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($6), 4326))),
                    area_km2 = $7, population = $8
                WHERE id = $1
                """,
                row["id"], ubigeo, name, province,
                "Callao" if ubigeo.startswith("07") else "Lima",
                geojson, area, pop,
            )
        else:
            await conn.execute(
                """
                INSERT INTO geo.districts (ubigeo, name, province, region, geom, area_km2, population)
                VALUES ($1, $2, $3, $4,
                        ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))), $6, $7)
                """,
                ubigeo, _title(p["nombdist"]), province,
                "Callao" if ubigeo.startswith("07") else "Lima",
                geojson, area, pop,
            )
    stats["unmatched_invented"] = sum(len(v) for v in invented.values())
    return stats


async def upsert_risk(conn: asyncpg.Connection, hazard: str, layer_id: int, features: list[dict]) -> int:
    count = 0
    for feat in features:
        p = feat["properties"]
        r = _risk_row(hazard, p)
        if not r["risk_level"]:
            continue
        await conn.execute(
            """
            INSERT INTO geo.cenepred_risk
                (ubigeo, hazard, risk_level, vulnerability, risk_value, susceptibility,
                 exposed_homes, exposed_schools, exposed_health, population_2017,
                 source, source_url, raw, loaded_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb, NOW())
            ON CONFLICT (ubigeo, hazard) DO UPDATE SET
                risk_level = EXCLUDED.risk_level, vulnerability = EXCLUDED.vulnerability,
                risk_value = EXCLUDED.risk_value, susceptibility = EXCLUDED.susceptibility,
                exposed_homes = EXCLUDED.exposed_homes, exposed_schools = EXCLUDED.exposed_schools,
                exposed_health = EXCLUDED.exposed_health, population_2017 = EXCLUDED.population_2017,
                raw = EXCLUDED.raw, loaded_at = NOW()
            """,
            p["ubigeo"], hazard, r["risk_level"], r["vulnerability"], r["risk_value"],
            r["susceptibility"], r["exposed_homes"], r["exposed_schools"], r["exposed_health"],
            p.get("pob_2017"), SOURCE_LABEL, f"{MAPSERVER}/{layer_id}",
            json.dumps(p, ensure_ascii=False),
        )
        count += 1
    return count


async def reassign_points(conn: asyncpg.Connection) -> None:
    """Point features were assigned to districts by containment in the broken polygons."""
    # CENEPRED COEN assets were matched on their own authoritative UBIGEO, so leave them.
    extra = {"geo.infrastructure": "AND COALESCE(t.properties->>'source', '') NOT LIKE 'CENEPRED%'"}
    for table in ("geo.infrastructure", "geo.shelters", "ops.alerts", "social.signals"):
        status = await conn.execute(f"""
            UPDATE {table} t SET district_id = d.id
            FROM geo.districts d
            WHERE t.geom IS NOT NULL
              -- Only real INEI districts: a leftover row with an invented code
              -- can overlap its real counterpart and make the match ambiguous.
              AND d.ubigeo IN (SELECT ubigeo FROM geo.cenepred_risk)
              AND ST_Contains(d.geom, t.geom)
              AND t.district_id IS DISTINCT FROM d.id
              {extra.get(table, "")}
        """)
        print(f"  {table} district_id reassigned: {status}")


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-dir", type=Path, help="read er_4.geojson / er_5.geojson instead of fetching")
    args = parser.parse_args()

    layers: dict[int, list[dict]] = {}
    if args.from_dir:
        for layer_id in LAYERS:
            layers[layer_id] = read_layer(args.from_dir, layer_id)
    else:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
            for layer_id in LAYERS:
                layers[layer_id] = await fetch_layer(client, layer_id)
    for layer_id, feats in layers.items():
        print(f"  layer {layer_id} ({LAYERS[layer_id]}): {len(feats)} districts")
    if not layers[4]:
        print("No features returned; nothing changed.")
        return 1

    conn = await asyncpg.connect(_dsn())
    try:
        migration = Path(__file__).resolve().parent.parent / "infra/postgres/migration_cenepred_risk.sql"
        if migration.exists():
            await conn.execute(migration.read_text(encoding="utf-8").replace("SET client_encoding = 'UTF8';", ""))
        async with conn.transaction():
            stats = await upsert_districts(conn, layers[4])
            print(f"  geo.districts: {stats}")
            for layer_id, hazard in LAYERS.items():
                n = await upsert_risk(conn, hazard, layer_id, layers[layer_id])
                print(f"  geo.cenepred_risk[{hazard}]: {n} rows")
            await reassign_points(conn)
    finally:
        await conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
