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
# Derived from SINPAD event density for Lima 2017 (Mar–Apr events)
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
        # Chaclacayo / Rímac upper Lima — peak event
        "geom_wkt": "MULTIPOLYGON(((-76.78 -11.98, -76.76 -11.98, -76.76 -12.00, -76.78 -12.00, -76.78 -11.98)))",
    },
]


async def seed(db_url: str) -> None:
    conn = await asyncpg.connect(db_url)
    try:
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

        print(f"\n✓ Seeded {inserted} / {len(FLOOD_FIXTURES)} El Niño 2017 flood fixtures")
    finally:
        await conn.close()


if __name__ == "__main__":
    db_url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    asyncio.run(seed(db_url))
