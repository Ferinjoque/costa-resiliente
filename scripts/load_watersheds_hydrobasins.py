#!/usr/bin/env python3
"""
Replace the hand-drawn Rímac / Chillón / Lurín watershed polygons with real
drainage basins derived from HydroBASINS.

Source:
  HydroBASINS v1c, South America, Pfafstetter level 8
  https://www.hydrosheds.org/products/hydrobasins
  Lehner, B., Grill G. (2013). Hydrol. Process. 27(15): 2171-2186.
  Licence: free for non-commercial and commercial use, with attribution.

Method: for each river, start from a sub-basin known to lie on it, follow
NEXT_DOWN to the sub-basin that drains to the sea, then take every sub-basin
whose downstream chain reaches that outlet, and dissolve them. That is the
river's full catchment by construction, not an approximation drawn by hand.

Why: the old polygons were six-vertex hexagons. The "Rímac" one covered all of
central Lima down to Miraflores, so a rainfall EMERGENCIA in the upper basin
turned every district on the map ALTO, and the choropleth said nothing.

geo.watersheds rows are UPDATED in place by name, so the ids that
hydro.imerg_accumulations and geo.quebradas reference are preserved.

Usage:
    python scripts/load_watersheds_hydrobasins.py --shp PATH/hybas_sa_lev08_v1c.shp
    python scripts/load_watersheds_hydrobasins.py --shp ... --dry-run   # print areas only
"""
import argparse
import asyncio
import json
import os
import sys

import asyncpg
import geopandas as gpd
from shapely.geometry import MultiPolygon, Point, mapping

# A point on each river's main channel, well inside its catchment.
RIVERS = {
    "Rímac":   Point(-76.700, -11.940),   # Chosica
    "Chillón": Point(-76.830, -11.670),   # Santa Rosa de Quives
    "Lurín":   Point(-76.780, -12.100),   # Cieneguilla
}
# Published catchment areas (ANA), used as a sanity check on the derivation.
EXPECTED_KM2 = {"Rímac": 3503.0, "Chillón": 2444.0, "Lurín": 1677.0}

BBOX = (-77.4, -12.7, -75.8, -11.0)   # west, south, east, north: all three basins


def _dsn() -> str:
    if url := os.getenv("DATABASE_URL"):
        return url
    try:
        from costa_workers.ingest.social import _db_dsn
        return _db_dsn()
    except ImportError:
        return "postgresql://costa:change_me_in_production@localhost:5432/costa_resiliente"


def derive(shp: str) -> dict[str, MultiPolygon]:
    basins = gpd.read_file(shp, bbox=BBOX)
    next_down = dict(zip(basins["HYBAS_ID"], basins["NEXT_DOWN"]))

    def outlet(hid: int) -> int:
        seen = set()
        while next_down.get(hid, 0) not in (0, None) and next_down[hid] in next_down and hid not in seen:
            seen.add(hid)
            hid = next_down[hid]
        return hid

    outlets = {hid: outlet(hid) for hid in basins["HYBAS_ID"]}
    result: dict[str, MultiPolygon] = {}
    for river, pt in RIVERS.items():
        hit = basins[basins.contains(pt)]
        if hit.empty:
            raise RuntimeError(f"{river}: no sub-basin contains {pt.wkt}")
        target = outlets[int(hit.iloc[0]["HYBAS_ID"])]
        members = basins[basins["HYBAS_ID"].map(outlets) == target]
        geom = members.geometry.union_all()
        result[river] = geom if isinstance(geom, MultiPolygon) else MultiPolygon([geom])
    return result


def area_km2(geom: MultiPolygon) -> float:
    return float(gpd.GeoSeries([geom], crs=4326).to_crs(32718).area.iloc[0] / 1e6)


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--shp", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    basins = derive(args.shp)
    for river, geom in basins.items():
        a = area_km2(geom)
        drift = abs(a - EXPECTED_KM2[river]) / EXPECTED_KM2[river]
        print(f"  {river}: {a:,.0f} km² (ANA {EXPECTED_KM2[river]:,.0f}, {drift:.0%} off)")
        if drift > 0.25:
            print(f"  {river}: derived area is more than 25% off the published figure; aborting.")
            return 1
    if args.dry_run:
        return 0

    conn = await asyncpg.connect(_dsn())
    try:
        async with conn.transaction():
            for river, geom in basins.items():
                status = await conn.execute(
                    """
                    UPDATE geo.watersheds
                    SET geom = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)),
                        area_km2 = $3
                    WHERE name = $1
                    """,
                    river, json.dumps(mapping(geom)), round(area_km2(geom), 1),
                )
                print(f"  geo.watersheds[{river}]: {status}")
    finally:
        await conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
