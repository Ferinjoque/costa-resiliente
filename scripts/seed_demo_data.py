#!/usr/bin/env python3
"""
Seed demo data: sample alerts, flood polygons, huayco susceptibility records.
Safe to re-run (uses INSERT ... ON CONFLICT DO NOTHING or clears then reinserts).

Usage:
  python scripts/seed_demo_data.py
"""
import asyncio
import json
import os
from datetime import datetime, timedelta, timezone

import asyncpg

DSN = os.getenv(
    "DATABASE_URL",
    "postgresql://costa:change_me_in_production@localhost:5432/costa_resiliente",
)

NOW = datetime.now(timezone.utc)


def ts(offset_hours: float = 0) -> datetime:
    return NOW - timedelta(hours=offset_hours)


# ── Sample alerts ─────────────────────────────────────────────────────────────

ALERTS = [
    {
        "type": "flood",
        "severity": "high",
        "status": "active",
        "title": "Inundación activa: Sector Huachipa",
        "description": "Desborde del río Rímac detectado por Sentinel-1 (SAR). Área afectada: ~1.8 km². Afecta zonas agrícolas y residenciales.",
        "lon": -76.8800, "lat": -11.9500,
        "created_offset_h": 2.5,
    },
    {
        "type": "huayco",
        "severity": "critical",
        "status": "active",
        "title": "Riesgo crítico de huayco: Quebrada Jicamarca",
        "description": "Precipitación acumulada 24h supera umbral (42 mm). Modelo XGBoost: probabilidad 0.91. Evacuar zona baja.",
        "lon": -76.9200, "lat": -11.9100,
        "created_offset_h": 1.0,
    },
    {
        "type": "flood",
        "severity": "medium",
        "status": "active",
        "title": "Nivel del río Rímac elevado: Estación Chosica",
        "description": "Nivel actual: 2.4 m (umbral de alerta: 2.0 m). Tendencia ascendente.",
        "lon": -76.6950, "lat": -11.9380,
        "created_offset_h": 4.0,
    },
    {
        "type": "social_cluster",
        "severity": "medium",
        "status": "active",
        "title": "Cluster social: reportes de bloqueo vial en La Molina",
        "description": "8 publicaciones geolocalizadas en 15 min. Triage: 6 × 'road_blocked', 2 × 'infrastructure_damage'.",
        "lon": -76.9450, "lat": -12.0800,
        "created_offset_h": 0.5,
    },
    {
        "type": "flood",
        "severity": "high",
        "status": "acknowledged",
        "title": "Inundación contenida: Sector Ñaña",
        "description": "Desborde menor controlado por defensa ribereña. Monitoreo continuo activo.",
        "lon": -76.8200, "lat": -11.9800,
        "created_offset_h": 8.0,
    },
    {
        "type": "huayco",
        "severity": "low",
        "status": "active",
        "title": "Alerta temprana: Quebrada Canto Grande",
        "description": "Precipitación 24h: 18 mm (umbral: 35 mm). Susceptibilidad moderada. Vigilancia preventiva.",
        "lon": -76.9900, "lat": -11.9350,
        "created_offset_h": 3.0,
    },
]

# ── Sample flood polygons ─────────────────────────────────────────────────────

FLOOD_POLYGONS = [
    {
        "scene_id": "S1A_IW_SLC__1SDV_20250315T225800_DEMO",
        "acquired_at": ts(2.5),
        "model_version": "flood-seg-v0.1-demo",
        "confidence": 0.87,
        "area_km2": 1.83,
        "wkt": (
            "MULTIPOLYGON((("
            "-76.8850 -11.9480, -76.8750 -11.9480, "
            "-76.8750 -11.9540, -76.8850 -11.9540, "
            "-76.8850 -11.9480"
            ")))"
        ),
    },
    {
        "scene_id": "S1B_IW_SLC__1SDV_20250315T103400_DEMO",
        "acquired_at": ts(8.0),
        "model_version": "flood-seg-v0.1-demo",
        "confidence": 0.79,
        "area_km2": 0.64,
        "wkt": (
            "MULTIPOLYGON((("
            "-76.8220 -11.9780, -76.8150 -11.9780, "
            "-76.8150 -11.9840, -76.8220 -11.9840, "
            "-76.8220 -11.9780"
            ")))"
        ),
    },
]

# ── Sample IMERG accumulations ─────────────────────────────────────────────────

IMERG_ROWS = [
    # watershed_id 1 = Rímac
    {"ws": 1, "h": 0,  "acc1": 0.0,  "acc3": 2.1,  "acc6": 8.4,  "acc12": 22.1, "acc24": 41.8, "acc72": 63.2},
    {"ws": 1, "h": 1,  "acc1": 1.2,  "acc3": 3.8,  "acc6": 9.1,  "acc12": 23.4, "acc24": 42.9, "acc72": 64.1},
    {"ws": 1, "h": 3,  "acc1": 3.8,  "acc3": 7.2,  "acc6": 12.0, "acc12": 26.8, "acc24": 45.2, "acc72": 66.3},
    # watershed_id 2 = Chillón
    {"ws": 2, "h": 0,  "acc1": 0.0,  "acc3": 1.1,  "acc6": 4.2,  "acc12": 11.0, "acc24": 18.5, "acc72": 28.4},
    {"ws": 2, "h": 1,  "acc1": 0.8,  "acc3": 2.3,  "acc6": 5.1,  "acc12": 12.3, "acc24": 19.8, "acc72": 29.9},
    # watershed_id 3 = Lurín
    {"ws": 3, "h": 0,  "acc1": 0.0,  "acc3": 0.5,  "acc6": 1.8,  "acc12": 4.2,  "acc24": 7.1,  "acc72": 11.0},
]

# ── Sample huayco susceptibility ──────────────────────────────────────────────

HUAYCO_RECORDS = [
    {"qid": 1, "prob": 0.91, "risk": "very_high", "rain24": 41.8},
    {"qid": 2, "prob": 0.62, "risk": "high",      "rain24": 41.8},
    {"qid": 3, "prob": 0.74, "risk": "high",      "rain24": 41.8},
    {"qid": 4, "prob": 0.55, "risk": "medium",    "rain24": 41.8},
    {"qid": 5, "prob": 0.38, "risk": "medium",    "rain24": 7.1},
    {"qid": 6, "prob": 0.81, "risk": "very_high", "rain24": 41.8},
    {"qid": 7, "prob": 0.48, "risk": "medium",    "rain24": 41.8},
    {"qid": 8, "prob": 0.33, "risk": "low",       "rain24": 41.8},
    {"qid": 9, "prob": 0.28, "risk": "low",       "rain24": 41.8},
    {"qid": 10,"prob": 0.21, "risk": "low",       "rain24": 41.8},
]


async def seed_alerts(conn: asyncpg.Connection) -> int:
    count = 0
    for a in ALERTS:
        # Resolve district_id via point-in-polygon
        district_id = await conn.fetchval(
            """
            SELECT id FROM geo.districts
            WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
            LIMIT 1
            """,
            a["lon"], a["lat"],
        )
        existing = await conn.fetchval(
            "SELECT id FROM ops.alerts WHERE title = $1", a["title"]
        )
        if existing:
            continue
        await conn.execute(
            """
            INSERT INTO ops.alerts
              (type, severity, status, title, description, geom,
               district_id, created_at, updated_at)
            VALUES
              ($1, $2, $3, $4, $5,
               ST_SetSRID(ST_MakePoint($6, $7), 4326),
               $8, $9, $9)
            """,
            a["type"], a["severity"], a["status"], a["title"],
            a["description"], a["lon"], a["lat"],
            district_id, ts(a["created_offset_h"]),
        )
        count += 1
    return count


async def seed_flood_polygons(conn: asyncpg.Connection) -> int:
    count = 0
    for fp in FLOOD_POLYGONS:
        await conn.execute(
            """
            INSERT INTO ml.flood_polygons
              (scene_id, acquired_at, model_version, confidence, area_km2, geom)
            VALUES ($1, $2, $3, $4, $5, ST_GeomFromText($6, 4326))
            ON CONFLICT DO NOTHING
            """,
            fp["scene_id"], fp["acquired_at"], fp["model_version"],
            fp["confidence"], fp["area_km2"], fp["wkt"],
        )
        count += 1
    return count


async def seed_imerg(conn: asyncpg.Connection) -> int:
    count = 0
    for row in IMERG_ROWS:
        t = ts(row["h"])
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
                t, row["ws"],
                row["acc1"], row["acc3"], row["acc6"],
                row["acc12"], row["acc24"], row["acc72"],
            )
            count += 1
        except Exception as exc:
            print(f"  skip IMERG row: {exc}")
    return count


async def seed_huayco(conn: asyncpg.Connection) -> int:
    # Check we have quebradas
    n = await conn.fetchval("SELECT COUNT(*) FROM geo.quebradas")
    if n == 0:
        print("  WARN: No quebradas found, run load_lima_geodata.py first")
        return 0

    count = 0
    for h in HUAYCO_RECORDS:
        try:
            await conn.execute(
                """
                INSERT INTO ml.huayco_susceptibility
                  (quebrada_id, probability, risk_level,
                   trigger_rain_24h_mm, model_version, computed_at)
                VALUES ($1, $2, $3, $4, 'xgb-v0.1-demo', $5)
                ON CONFLICT DO NOTHING
                """,
                h["qid"], h["prob"], h["risk"], h["rain24"], ts(0.25),
            )
            count += 1
        except Exception as exc:
            print(f"  skip huayco {h['qid']}: {exc}")
    return count


import hashlib

# ── Sample social signals ─────────────────────────────────────────────────────

SOCIAL_SIGNALS = [
    {
        "source": "bluesky",
        "content": "Rímac desbordado en Huachipa, varias familias evacuadas. Necesitamos ayuda urgente.",
        "triage_label": "needs_help",
        "triage_confidence": 0.94,
        "lon": -76.8780, "lat": -11.9510,
        "offset_h": 0.3,
    },
    {
        "source": "rss_rpp",
        "content": "RPP Noticias: Deslizamiento de lodo bloquea Carretera Central a la altura de Chosica km 38.",
        "triage_label": "road_blocked",
        "triage_confidence": 0.91,
        "lon": -76.6950, "lat": -11.9370,
        "offset_h": 0.7,
    },
    {
        "source": "reddit",
        "content": "Puente Huachipa colapsó parcialmente. Autos varados en ambos lados. Eviten la zona.",
        "triage_label": "infrastructure_damage",
        "triage_confidence": 0.88,
        "lon": -76.8820, "lat": -11.9490,
        "offset_h": 1.2,
    },
    {
        "source": "bluesky",
        "content": "Lluvia intensa en Ate Vitarte desde las 3am. Calles inundadas en sector Los Jardines.",
        "triage_label": "weather_observation",
        "triage_confidence": 0.85,
        "lon": -76.9100, "lat": -12.0250,
        "offset_h": 2.0,
    },
    {
        "source": "rss_andina",
        "content": "INDECI activa protocolo de emergencia para distritos de Lurigancho y Chosica por desborde del río Rímac.",
        "triage_label": "needs_help",
        "triage_confidence": 0.96,
        "lon": -76.7200, "lat": -11.9600,
        "offset_h": 1.5,
    },
    {
        "source": "bluesky",
        "content": "Huayco en Jicamarca bloqueó acceso principal. Vecinos atrapados. SOS.",
        "triage_label": "needs_help",
        "triage_confidence": 0.97,
        "lon": -76.9180, "lat": -11.9050,
        "offset_h": 0.9,
    },
    {
        "source": "reddit",
        "content": "Rímac sigue creciendo. Medí 2.3m en estación Chosica. Umbral de alerta es 2.0m.",
        "triage_label": "weather_observation",
        "triage_confidence": 0.82,
        "lon": -76.6980, "lat": -11.9390,
        "offset_h": 3.1,
    },
    {
        "source": "rss_rpp",
        "content": "Avenida La Molina inundada por desborde de canal de riego. Tránsito interrumpido.",
        "triage_label": "road_blocked",
        "triage_confidence": 0.89,
        "lon": -76.9420, "lat": -12.0850,
        "offset_h": 2.5,
    },
    {
        "source": "bluesky",
        "content": "Colegio Nro 1225 en Ate reporta inundación de primer piso. Clases suspendidas.",
        "triage_label": "infrastructure_damage",
        "triage_confidence": 0.86,
        "lon": -76.9050, "lat": -12.0150,
        "offset_h": 4.0,
    },
    {
        "source": "rss_canal_n",
        "content": "SENAMHI advierte acumulación de 45mm en cuenca del Rímac. Riesgo extremo de huaycos en próximas horas.",
        "triage_label": "weather_observation",
        "triage_confidence": 0.93,
        "lon": -76.7500, "lat": -11.9500,
        "offset_h": 5.0,
    },
]

# ── Sample hydro stations + observations ──────────────────────────────────────

STATIONS = [
    {"code": "ANA-001-DEMO", "name": "Chosica", "source": "ana", "river": "Rímac",
     "lon": -76.6950, "lat": -11.9380, "elev": 880.0},
    {"code": "ANA-002-DEMO", "name": "Ñaña",    "source": "ana", "river": "Rímac",
     "lon": -76.8180, "lat": -11.9830, "elev": 560.0},
    {"code": "ANA-003-DEMO", "name": "Carapongo", "source": "senamhi", "river": "Rímac",
     "lon": -76.9100, "lat": -12.0200, "elev": 320.0},
]

STATION_OBS = [
    # Chosica (code ANA-001): elevated, trending up
    {"code": "ANA-001-DEMO", "h": 0,   "level": 2.41, "flow": 68.2, "rain": 1.2},
    {"code": "ANA-001-DEMO", "h": 1,   "level": 2.28, "flow": 61.4, "rain": 3.8},
    {"code": "ANA-001-DEMO", "h": 3,   "level": 2.05, "flow": 52.1, "rain": 7.2},
    {"code": "ANA-001-DEMO", "h": 6,   "level": 1.92, "flow": 44.8, "rain": 5.1},
    {"code": "ANA-001-DEMO", "h": 12,  "level": 1.78, "flow": 38.3, "rain": 2.0},
    {"code": "ANA-001-DEMO", "h": 24,  "level": 1.61, "flow": 29.7, "rain": 0.3},
    # Ñaña (code ANA-002)
    {"code": "ANA-002-DEMO", "h": 0,   "level": 1.85, "flow": 52.4, "rain": 0.8},
    {"code": "ANA-002-DEMO", "h": 6,   "level": 1.72, "flow": 44.1, "rain": 3.2},
    {"code": "ANA-002-DEMO", "h": 24,  "level": 1.44, "flow": 31.0, "rain": 0.1},
    # Carapongo (senamhi)
    {"code": "ANA-003-DEMO", "h": 0,   "level": 1.55, "flow": 38.1, "rain": 0.4},
    {"code": "ANA-003-DEMO", "h": 6,   "level": 1.48, "flow": 34.6, "rain": 1.9},
]


async def seed_social_signals(conn: asyncpg.Connection) -> int:
    count = 0
    for s in SOCIAL_SIGNALS:
        h = hashlib.sha256(s["content"].encode()).hexdigest()
        t = ts(s["offset_h"])
        existing = await conn.fetchval(
            "SELECT id FROM social.signals WHERE content_hash = $1", h
        )
        if existing:
            continue
        # Resolve district_id via spatial lookup
        district_id = await conn.fetchval(
            """
            SELECT id FROM geo.districts
            WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
            LIMIT 1
            """,
            s["lon"], s["lat"],
        )
        try:
            await conn.execute(
                """
                INSERT INTO social.signals
                  (source, content_hash, content_redacted, published_at, ingested_at,
                   triage_label, triage_confidence, triage_model, triage_at,
                   geom, district_id, expires_at)
                VALUES ($1, $2, $3, $4, $4, $5, $6, 'qwen2.5:7b-instruct-q4_K_M (demo seed)', $4,
                        ST_SetSRID(ST_MakePoint($7, $8), 4326),
                        $9, $4 + INTERVAL '7 days')
                """,
                s["source"], h, s["content"], t,
                s["triage_label"], s["triage_confidence"],
                s["lon"], s["lat"], district_id,
            )
            count += 1
        except Exception as exc:
            print(f"  skip signal: {exc}")
    return count


async def seed_stations(conn: asyncpg.Connection) -> int:
    count = 0
    for st in STATIONS:
        sid = await conn.fetchval(
            """
            INSERT INTO hydro.stations (code, name, source, river, geom, elevation_m)
            VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326), $7)
            ON CONFLICT (code) DO NOTHING
            RETURNING id
            """,
            st["code"], st["name"], st["source"], st["river"],
            st["lon"], st["lat"], st["elev"],
        )
        if sid:
            count += 1

    for obs in STATION_OBS:
        sid = await conn.fetchval(
            "SELECT id FROM hydro.stations WHERE code = $1", obs["code"]
        )
        if not sid:
            continue
        t = ts(obs["h"])
        try:
            await conn.execute(
                """
                INSERT INTO hydro.station_observations
                  (time, station_id, level_m, flow_m3s, rain_mm)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT DO NOTHING
                """,
                t, sid, obs["level"], obs["flow"], obs["rain"],
            )
        except Exception:
            pass
    return count


async def main() -> None:
    print("Costa Resiliente: demo data seeder")
    print(f"Connecting to {DSN.split('@')[-1]}...\n")

    conn = await asyncpg.connect(DSN)
    try:
        print("[1/6] Seeding alerts...")
        n = await seed_alerts(conn)
        print(f"  ok {n} alerts")

        print("[2/6] Seeding flood polygons...")
        n = await seed_flood_polygons(conn)
        print(f"  ok {n} flood polygons")

        print("[3/6] Seeding IMERG accumulations...")
        n = await seed_imerg(conn)
        print(f"  ok {n} IMERG rows")

        print("[4/6] Seeding huayco susceptibility...")
        n = await seed_huayco(conn)
        print(f"  ok {n} susceptibility records")

        print("[5/6] Seeding social signals...")
        n = await seed_social_signals(conn)
        print(f"  ok {n} social signals")

        print("[6/6] Seeding hydro stations + observations...")
        n = await seed_stations(conn)
        print(f"  ok {n} stations")

        rows = await conn.fetchrow("""
            SELECT
              (SELECT COUNT(*) FROM ops.alerts)                AS alerts,
              (SELECT COUNT(*) FROM ml.flood_polygons)         AS flood_polygons,
              (SELECT COUNT(*) FROM hydro.imerg_accumulations) AS imerg_rows,
              (SELECT COUNT(*) FROM ml.huayco_susceptibility)  AS huayco_records,
              (SELECT COUNT(*) FROM social.signals)            AS social_signals,
              (SELECT COUNT(*) FROM hydro.stations)            AS hydro_stations
        """)
        print(f"\nDatabase totals: {dict(rows)}")
        print("\nDone. Refresh http://localhost:3000 to see data on the map.")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
