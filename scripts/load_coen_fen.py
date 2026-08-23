#!/usr/bin/env python3
"""
Load CENEPRED / COEN "Fenómeno El Niño 2023" responder assets into PostGIS.

Source:
  https://sig.cenepred.gob.pe/arcgis_server/rest/services/sectores/COEN_FEN_2023_10_5_1X/MapServer

This is the official COEN (Centro de Operaciones de Emergencia Nacional) El Niño
response layer set. Unlike the SIGRID portal — which is SSO-gated and whose WFS
endpoint now returns 404 — this ArcGIS REST service answers anonymously, so no
credentials are required and the load is reproducible by anyone.

Layers loaded (only asset classes OSM does not already cover, to avoid
duplicating geo.infrastructure rows):

  layer 1  AlmacenesNacionales  → type 'relief_warehouse'  (INDECI relief stock)
  layer 4  ComisariasBasicas    → type 'police_station'
  layer 5  ComisariasFamilia    → type 'police_station'

Bomberos (layer 3) is deliberately skipped: geo.infrastructure already carries
OSM fire_station points for Lima and merging the two would double-count.

Usage:
    python scripts/load_coen_fen.py
    DATABASE_URL=postgresql://costa:pass@localhost:5432/costa_resiliente python scripts/load_coen_fen.py

    docker exec -e DATABASE_URL="postgresql://costa:PASS@postgres:5432/costa_resiliente" \\
      costa-prefect-worker python /app/load_coen_fen.py

Requires: asyncpg, httpx  (both in apps/workers venv)
Idempotent: rows are keyed by (type, source_id) in properties; re-running updates
in place rather than duplicating.
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

MAPSERVER = (
    "https://sig.cenepred.gob.pe/arcgis_server/rest/services"
    "/sectores/COEN_FEN_2023_10_5_1X/MapServer"
)
SOURCE_LABEL = "CENEPRED COEN FEN 2023"

# Lima Metropolitana + Callao bounding box (WGS84): west, south, east, north
LIMA_BBOX = (-77.30, -12.60, -76.60, -11.50)

# layer id → (infrastructure type, human label)
LAYERS: dict[int, tuple[str, str]] = {
    1: ("relief_warehouse", "Almacén INDECI"),
    4: ("police_station", "Comisaría"),
    5: ("police_station", "Comisaría de familia"),
}

_TIMEOUT = httpx.Timeout(45.0, connect=15.0)
_HEADERS = {
    "User-Agent": "costa-resiliente/0.1 (IEEE Response Quest; COEN FEN loader)",
    "Accept": "application/json",
}


# The three layers do not share a schema: layer 1 uses distrito/direccion,
# layer 4 uses distrito/comisaria, layer 5 uses nombdist/id_dist/comisaria_.
_NAME_FIELDS = (
    "comisaria", "comisaria_", "nombre", "NOMBRE", "nom_comisa",
    "denominaci", "direccion", "ubicacion",
)
_DISTRICT_NAME_FIELDS = ("distrito", "DISTRITO", "nombdist", "NOMBDIST")
_UBIGEO_FIELDS = ("id_dist", "ID_DIST", "cod_dist", "ubigeo", "UBIGEO")


def _first(attrs: dict, keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = attrs.get(key)
        if value and str(value).strip():
            return str(value).strip()
    return None


def _name_for(layer_label: str, attrs: dict) -> str:
    """Best-effort display name from whichever descriptive field the layer carries."""
    name = _first(attrs, _NAME_FIELDS)
    if name:
        return name
    district = _first(attrs, _DISTRICT_NAME_FIELDS)
    return f"{layer_label} — {district}" if district else layer_label


async def fetch_layer(client: httpx.AsyncClient, layer_id: int) -> list[dict]:
    """Query one MapServer layer inside the Lima bbox, returning WGS84 features."""
    west, south, east, north = LIMA_BBOX
    params = {
        "where": "1=1",
        "geometry": f"{west},{south},{east},{north}",
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "outSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "*",
        "returnGeometry": "true",
        "f": "json",
    }
    resp = await client.get(f"{MAPSERVER}/{layer_id}/query", params=params)
    resp.raise_for_status()
    payload = resp.json()
    if "error" in payload:
        raise RuntimeError(f"layer {layer_id}: {payload['error']}")
    return payload.get("features", [])


async def load_layer(conn: asyncpg.Connection, client: httpx.AsyncClient, layer_id: int) -> int:
    infra_type, label = LAYERS[layer_id]
    try:
        features = await fetch_layer(client, layer_id)
    except Exception as exc:  # network / service outage must not abort the whole load
        print(f"  layer {layer_id} ({label}): FAILED — {exc}")
        return 0

    loaded = 0
    skipped_out_of_scope = 0
    for feat in features:
        geom = feat.get("geometry") or {}
        lon, lat = geom.get("x"), geom.get("y")
        if lon is None or lat is None:
            continue

        attrs = {k: v for k, v in (feat.get("attributes") or {}).items() if v not in (None, "")}
        district_name = _first(attrs, _DISTRICT_NAME_FIELDS)
        district_ubigeo = _first(attrs, _UBIGEO_FIELDS)
        # Only 6-digit INEI district codes are usable; layer 4's cod_inei is a
        # 4-char police code, not a UBIGEO.
        if district_ubigeo and not (len(district_ubigeo) == 6 and district_ubigeo.isdigit()):
            district_ubigeo = None
        source_id = str(attrs.get("objectid") or attrs.get("OBJECTID") or f"{layer_id}:{lon},{lat}")
        properties = {
            **attrs,
            "source": SOURCE_LABEL,
            "source_url": f"{MAPSERVER}/{layer_id}",
            "source_layer": layer_id,
            "source_id": source_id,
        }

        try:
            # Idempotent by (type, source_id): delete-then-insert keeps the load
            # re-runnable without a unique index on a JSONB path.
            await conn.execute(
                """
                DELETE FROM geo.infrastructure
                WHERE type = $1 AND properties->>'source_id' = $2
                  AND properties->>'source' = $3
                """,
                infra_type, source_id, SOURCE_LABEL,
            )
            # Only keep assets that resolve to a seeded district. The bbox is
            # deliberately loose, so it also catches Huarochirí / Cañete points
            # outside the locked Lima Metropolitana + Callao scope.
            #
            # District resolution is UBIGEO-first, then name, then geometry: the
            # seeded district polygons are simplified (Santiago de Surco reads
            # 12 km² against a real ~34 km²), so point-in-polygon alone drops well
            # over half of the real Lima assets. The source layers carry
            # authoritative INEI codes and district names, so prefer those.
            status = await conn.execute(
                """
                INSERT INTO geo.infrastructure (type, name, geom, properties, district_id)
                SELECT $1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, d.id
                FROM geo.districts d
                WHERE CASE
                        WHEN $7::text IS NOT NULL THEN d.ubigeo = $7::text
                        WHEN $6::text IS NOT NULL
                            THEN upper(unaccent(d.name)) = upper(unaccent($6::text))
                        ELSE ST_Contains(d.geom, ST_SetSRID(ST_MakePoint($3, $4), 4326))
                      END
                LIMIT 1
                """,
                infra_type, _name_for(label, attrs), float(lon), float(lat),
                json.dumps(properties, ensure_ascii=False),
                district_name, district_ubigeo,
            )
            if status.endswith("1"):
                loaded += 1
            else:
                skipped_out_of_scope += 1
        except Exception as exc:
            print(f"    skip {source_id}: {exc}")

    print(
        f"  layer {layer_id} ({label}) → {infra_type}: {loaded} loaded, "
        f"{skipped_out_of_scope} outside seeded districts, {len(features)} in bbox"
    )
    return loaded


async def main() -> None:
    print("Costa Resiliente — CENEPRED COEN FEN 2023 responder-asset loader")
    print(f"Source: {MAPSERVER}")
    print(f"Connecting to {DSN.split('@')[-1]}...\n")

    conn = await asyncpg.connect(DSN)
    total = 0
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
            for layer_id in sorted(LAYERS):
                total += await load_layer(conn, client, layer_id)

        rows = await conn.fetch(
            """
            SELECT type, COUNT(*) AS n
            FROM geo.infrastructure
            WHERE properties->>'source' = $1
            GROUP BY type ORDER BY n DESC
            """,
            SOURCE_LABEL,
        )
        print(f"\nLoaded {total} features this run. In database from {SOURCE_LABEL}:")
        for row in rows:
            print(f"  {row['type']:<20} {row['n']}")
        if total == 0:
            print("\nWARNING: nothing loaded — CENEPRED service may be unreachable.")
            sys.exit(1)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
