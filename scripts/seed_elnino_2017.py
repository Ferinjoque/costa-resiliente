"""
Seed ml.flood_polygons with pre-baked 2017 El Niño Costero fixtures.

Derives approximate flood extents from SINPAD 2017 Lima flood events.
Inserts synthetic Sentinel-1 scene records so the time-slider replay mode
has data to render.

Usage:
    python scripts/seed_elnino_2017.py

Requires: DB accessible at DATABASE_URL in .env
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://costa:costa@localhost:5432/costa_resiliente")

# 2017 El Niño peak flood events sourced from SINPAD historical data
# Approximate flood extents as GeoJSON Polygons per district
# Derived from SINPAD event density for Lima 2017 (Mar: Apr events)
# Coordinates are approximate bounding areas around high-impact zones
FLOOD_FIXTURES = [
    {
        "scene_id": "elnino2017-s1a-20170315-rimac",
        "acquired_at": "2017-03-15T06:00:00Z",
        "area_km2": 4.2,
        "confidence": 0.87,
        # Lurigancho-Chosica / Rímac valley flood zone
        "geom_wkt": "MULTIPOLYGON(((-76.85 -11.92, -76.83 -11.92, -76.83 -11.94, -76.85 -11.94, -76.85 -11.92)))",
    },
    {
        "scene_id": "elnino2017-s1a-20170318-chilln",
        "acquired_at": "2017-03-18T06:00:00Z",
        "area_km2": 2.8,
        "confidence": 0.83,
        # Carabayllo / Chillón lower basin
        "geom_wkt": "MULTIPOLYGON(((-77.02 -11.88, -77.00 -11.88, -77.00 -11.90, -77.02 -11.90, -77.02 -11.88)))",
    },
    {
        "scene_id": "elnino2017-s1a-20170322-ate",
        "acquired_at": "2017-03-22T06:00:00Z",
        "area_km2": 1.9,
        "confidence": 0.79,
        # Ate Vitarte / Rímac mid-valley
        "geom_wkt": "MULTIPOLYGON(((-76.92 -12.01, -76.90 -12.01, -76.90 -12.03, -76.92 -12.03, -76.92 -12.01)))",
    },
    {
        "scene_id": "elnino2017-s1a-20170327-vjm",
        "acquired_at": "2017-03-27T06:00:00Z",
        "area_km2": 3.1,
        "confidence": 0.81,
        # Villa María del Triunfo / Lurín basin
        "geom_wkt": "MULTIPOLYGON(((-76.94 -12.15, -76.92 -12.15, -76.92 -12.17, -76.94 -12.17, -76.94 -12.15)))",
    },
    {
        "scene_id": "elnino2017-s1a-20170402-chaclacayo",
        "acquired_at": "2017-04-02T06:00:00Z",
        "area_km2": 5.6,
        "confidence": 0.91,
        # Chaclacayo / Rímac upper Lima: peak event
        "geom_wkt": "MULTIPOLYGON(((-76.78 -11.98, -76.76 -11.98, -76.76 -12.00, -76.78 -12.00, -76.78 -11.98)))",
    },
]


# 2017 IMERG accumulations per watershed per day (ws 1=Rímac, 2=Chillón, 3=Lurín)
# Peak event: March 15-22, 2017
# Units: mm; acc72 computed as rolling 3-day sum estimate
IMERG_2017_ROWS = [
    # (date_str, ws_id, acc1, acc3, acc6, acc12, acc24, acc72)
    ("2017-03-13T12:00:00Z", 1, 0.2, 0.5, 1.1, 2.1, 4.2,  8.1),
    ("2017-03-13T12:00:00Z", 2, 0.1, 0.3, 0.5, 1.0, 2.1,  4.0),
    ("2017-03-13T12:00:00Z", 3, 0.0, 0.1, 0.2, 0.4, 0.8,  1.5),
    ("2017-03-14T12:00:00Z", 1, 0.8, 2.3, 4.6, 9.2, 18.5, 30.8),
    ("2017-03-14T12:00:00Z", 2, 0.3, 1.0, 2.1, 4.2, 8.3,  13.8),
    ("2017-03-14T12:00:00Z", 3, 0.1, 0.4, 0.8, 1.6, 3.1,  5.1),
    ("2017-03-15T12:00:00Z", 1, 1.2, 3.5, 7.0, 14.1, 28.1, 63.2),  # tutorial step 1
    ("2017-03-15T12:00:00Z", 2, 0.5, 1.6, 3.1, 6.2,  12.4, 28.4),
    ("2017-03-15T12:00:00Z", 3, 0.2, 0.6, 1.3, 2.6,  5.2,  11.0),
    ("2017-03-16T12:00:00Z", 1, 0.9, 2.8, 5.6, 11.2, 22.3, 58.4),
    ("2017-03-16T12:00:00Z", 2, 0.4, 1.2, 2.5, 5.0,  9.8,  24.6),
    ("2017-03-16T12:00:00Z", 3, 0.2, 0.5, 1.0, 2.0,  4.0,  9.4),
    ("2017-03-17T12:00:00Z", 1, 0.6, 1.8, 3.7, 7.3,  14.6, 42.1),
    ("2017-03-17T12:00:00Z", 2, 0.3, 0.8, 1.6, 3.1,  6.2,  17.2),
    ("2017-03-17T12:00:00Z", 3, 0.1, 0.4, 0.7, 1.4,  2.8,  6.5),
    ("2017-03-22T12:00:00Z", 1, 0.8, 2.4, 4.8, 9.7,  19.4, 42.8),  # SAR scene
    ("2017-03-22T12:00:00Z", 2, 0.4, 1.1, 2.2, 4.4,  8.7,  18.9),
    ("2017-03-22T12:00:00Z", 3, 0.1, 0.4, 0.9, 1.8,  3.5,  7.8),
    ("2017-04-02T12:00:00Z", 1, 0.1, 0.3, 0.5, 1.1,  2.1,  4.5),
    ("2017-04-02T12:00:00Z", 2, 0.0, 0.1, 0.2, 0.5,  0.9,  2.0),
    ("2017-04-02T12:00:00Z", 3, 0.0, 0.0, 0.1, 0.2,  0.4,  0.9),
]


async def seed_imerg_2017(conn: asyncpg.Connection) -> int:
    count = 0
    for row in IMERG_2017_ROWS:
        t = datetime.fromisoformat(row[0].replace("Z", "+00:00"))
        ws = row[1]
        a1, a3, a6, a12, a24, a72 = row[2], row[3], row[4], row[5], row[6], row[7]
        try:
            await conn.execute(
                """
                INSERT INTO hydro.imerg_accumulations
                  (time, watershed_id,
                   acc_1h_mm, acc_3h_mm, acc_6h_mm,
                   acc_12h_mm, acc_24h_mm, acc_72h_mm)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT DO NOTHING
                """,
                t, ws, a1, a3, a6, a12, a24, a72,
            )
            count += 1
        except Exception as exc:
            print(f"  skip IMERG 2017 {row[0]} ws={ws}: {exc}")
    return count


async def seed(db_url: str) -> None:
    conn = await asyncpg.connect(db_url)
    try:
        print("[1/2] Seeding El Niño 2017 flood polygons...")
        inserted = 0
        for f in FLOOD_FIXTURES:
            acquired = datetime.fromisoformat(f["acquired_at"].replace("Z", "+00:00"))
            existing = await conn.fetchval(
                "SELECT id FROM ml.flood_polygons WHERE scene_id = $1", f["scene_id"]
            )
            if existing:
                print(f"  skip {f['scene_id']} (already exists)")
                continue

            await conn.execute(
                """
                INSERT INTO ml.flood_polygons
                    (scene_id, acquired_at, model_version, confidence, area_km2, geom)
                VALUES ($1, $2, 'elnino2017-fixture-v1', $3, $4,
                        ST_SetSRID(ST_GeomFromText($5), 4326))
                """,
                f["scene_id"],
                acquired,
                f["confidence"],
                f["area_km2"],
                f["geom_wkt"],
            )
            inserted += 1
            print(f"  inserted {f['scene_id']} ({f['area_km2']} km²)")
        print(f"  ok {inserted} / {len(FLOOD_FIXTURES)} flood polygons")

        print("[2/2] Seeding El Niño 2017 IMERG accumulations...")
        n = await seed_imerg_2017(conn)
        print(f"  ok {n} IMERG rows")

        print(f"\nDone: El Niño 2017 data loaded. Use replay date 2017-03-15 or 2017-03-22.")
    finally:
        await conn.close()


if __name__ == "__main__":
    db_url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    asyncio.run(seed(db_url))
