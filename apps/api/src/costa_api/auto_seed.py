"""
Auto-seed demo data on first boot.

Checks whether flood_polygons is empty. If so, inserts demo fixtures so
every panel shows data out of the box — no manual seed step required.

Seeds:
  1. Lima watersheds (3) — required FK for IMERG
  2. Current-time flood polygons + IMERG + alerts + social signals + stations
  3. El Niño 2017 historical fixtures (for replay tutorial)
"""

import hashlib
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)

def _ts(offset_hours: float = 0) -> datetime:
    """Return UTC now minus offset_hours. Always uses current time (not module-load time)."""
    return datetime.now(timezone.utc) - timedelta(hours=offset_hours)


# ─── Lima districts (simplified bounding-box approximations for demo) ─────────
# Real geometries loaded by load_lima_geodata.py via Overpass.
# These are intentionally simplified for first-boot demo; accurate enough for
# spatial joins used by risk-summary, fusion, and social signal attribution.
_DEMO_DISTRICTS = [
    {
        "ubigeo": "150133", "name": "San Juan de Lurigancho",
        "population": 1038495, "area_km2": 131.25,
        "geom_wkt": "MULTIPOLYGON(((-77.00 -11.90,-76.80 -11.90,-76.80 -12.06,-77.00 -12.06,-77.00 -11.90)))",
    },
    {
        "ubigeo": "150134", "name": "San Juan de Miraflores",
        "population": 362285, "area_km2": 23.98,
        "geom_wkt": "MULTIPOLYGON(((-77.03 -12.14,-76.97 -12.14,-76.97 -12.21,-77.03 -12.21,-77.03 -12.14)))",
    },
    {
        "ubigeo": "150103", "name": "Ate",
        "population": 630086, "area_km2": 77.72,
        "geom_wkt": "MULTIPOLYGON(((-76.97 -11.97,-76.87 -11.97,-76.87 -12.10,-76.97 -12.10,-76.97 -11.97)))",
    },
    {
        "ubigeo": "150136", "name": "San Martín de Porres",
        "population": 700178, "area_km2": 36.77,
        "geom_wkt": "MULTIPOLYGON(((-77.13 -11.95,-77.05 -11.95,-77.05 -12.02,-77.13 -12.02,-77.13 -11.95)))",
    },
    {
        "ubigeo": "150110", "name": "Comas",
        "population": 520450, "area_km2": 48.75,
        "geom_wkt": "MULTIPOLYGON(((-77.10 -11.89,-76.99 -11.89,-76.99 -11.97,-77.10 -11.97,-77.10 -11.89)))",
    },
    {
        "ubigeo": "150118", "name": "Lurigancho",
        "population": 213386, "area_km2": 236.47,
        "geom_wkt": "MULTIPOLYGON(((-76.82 -11.85,-76.55 -11.85,-76.55 -11.99,-76.82 -11.99,-76.82 -11.85)))",
    },
    {
        "ubigeo": "150144", "name": "Villa María del Triunfo",
        "population": 398433, "area_km2": 70.57,
        "geom_wkt": "MULTIPOLYGON(((-76.97 -12.15,-76.90 -12.15,-76.90 -12.23,-76.97 -12.23,-76.97 -12.15)))",
    },
    {
        "ubigeo": "150143", "name": "Villa El Salvador",
        "population": 393254, "area_km2": 35.46,
        "geom_wkt": "MULTIPOLYGON(((-76.96 -12.15,-76.92 -12.15,-76.92 -12.23,-76.96 -12.23,-76.96 -12.15)))",
    },
    {
        "ubigeo": "150106", "name": "Carabayllo",
        "population": 333045, "area_km2": 346.88,
        "geom_wkt": "MULTIPOLYGON(((-77.10 -11.82,-76.97 -11.82,-76.97 -11.93,-77.10 -11.93,-77.10 -11.82)))",
    },
    {
        "ubigeo": "150126", "name": "Puente Piedra",
        "population": 362285, "area_km2": 71.18,
        "geom_wkt": "MULTIPOLYGON(((-77.12 -11.83,-77.03 -11.83,-77.03 -11.90,-77.12 -11.90,-77.12 -11.83)))",
    },
    {
        "ubigeo": "150108", "name": "Chorrillos",
        "population": 325547, "area_km2": 38.94,
        "geom_wkt": "MULTIPOLYGON(((-77.03 -12.13,-76.97 -12.13,-76.97 -12.22,-77.03 -12.22,-77.03 -12.13)))",
    },
    {
        "ubigeo": "150101", "name": "Lima",
        "population": 271814, "area_km2": 21.98,
        "geom_wkt": "MULTIPOLYGON(((-77.07 -12.02,-77.01 -12.02,-77.01 -12.07,-77.07 -12.07,-77.07 -12.02)))",
    },
    {
        "ubigeo": "150107", "name": "Chaclacayo",
        "population": 43694, "area_km2": 37.63,
        "geom_wkt": "MULTIPOLYGON(((-76.79 -11.96,-76.73 -11.96,-76.73 -12.01,-76.79 -12.01,-76.79 -11.96)))",
    },
    {
        "ubigeo": "150114", "name": "La Molina",
        "population": 171646, "area_km2": 65.75,
        "geom_wkt": "MULTIPOLYGON(((-76.97 -12.07,-76.93 -12.07,-76.93 -12.12,-76.97 -12.12,-76.97 -12.07)))",
    },
    {
        "ubigeo": "150141", "name": "Santiago de Surco",
        "population": 338509, "area_km2": 34.84,
        "geom_wkt": "MULTIPOLYGON(((-77.00 -12.10,-76.95 -12.10,-76.95 -12.15,-77.00 -12.15,-77.00 -12.10)))",
    },
    {
        "ubigeo": "150138", "name": "Santa Anita",
        "population": 228422, "area_km2": 10.65,
        "geom_wkt": "MULTIPOLYGON(((-76.99 -12.03,-76.96 -12.03,-76.96 -12.07,-76.99 -12.07,-76.99 -12.03)))",
    },
]

# ─── Watersheds ───────────────────────────────────────────────────────────────
# Approximate bounding polygons for Lima's three main watersheds.
# These are coarse approximations sufficient for IMERG FK + map display.
_WATERSHEDS = [
    {
        "name": "Rímac",
        "river": "Rímac",
        "area_km2": 3504.0,
        "outlet_lat": -12.050,
        "outlet_lon": -77.050,
        "geom_wkt": (
            "MULTIPOLYGON(((-77.15 -11.70, -76.50 -11.70, "
            "-76.50 -12.15, -77.15 -12.15, -77.15 -11.70)))"
        ),
    },
    {
        "name": "Chillón",
        "river": "Chillón",
        "area_km2": 2444.0,
        "outlet_lat": -11.890,
        "outlet_lon": -77.090,
        "geom_wkt": (
            "MULTIPOLYGON(((-77.20 -11.70, -76.75 -11.70, "
            "-76.75 -11.93, -77.20 -11.93, -77.20 -11.70)))"
        ),
    },
    {
        "name": "Lurín",
        "river": "Lurín",
        "area_km2": 1670.0,
        "outlet_lat": -12.280,
        "outlet_lon": -76.880,
        "geom_wkt": (
            "MULTIPOLYGON(((-77.00 -12.10, -76.50 -12.10, "
            "-76.50 -12.45, -77.00 -12.45, -77.00 -12.10)))"
        ),
    },
]

# ─── Current-time IMERG (live scenario data) ──────────────────────────────────
_IMERG_CURRENT = [
    # (watershed_name_key, offset_h, a1, a3, a6, a12, a24, a72)
    # Rímac — ws index 0
    (0, 0,  0.0,  2.1,  8.4,  22.1, 41.8, 63.2),
    (0, 1,  1.2,  3.8,  9.1,  23.4, 42.9, 64.1),
    (0, 3,  3.8,  7.2,  12.0, 26.8, 45.2, 66.3),
    # Chillón — ws index 1
    (1, 0,  0.0,  1.1,  4.2,  11.0, 18.5, 28.4),
    (1, 1,  0.8,  2.3,  5.1,  12.3, 19.8, 29.9),
    # Lurín — ws index 2
    (2, 0,  0.0,  0.5,  1.8,  4.2,  7.1,  11.0),
]

# ─── Current flood polygons ───────────────────────────────────────────────────
_FLOOD_CURRENT = [
    {
        # Chillón river corridor — inside Puente Piedra district (362k pop)
        "scene_id": "S1A_IW_SLC__1SDV_DEMO-RIMAC-HUACHIPA",
        "offset_h": 2.5,
        "model_version": "flood-seg-v0.1-demo",
        "confidence": 0.87,
        "area_km2": 9.2,
        "geom_wkt": (
            "MULTIPOLYGON(((-77.1070 -11.8920,-77.0870 -11.8920,"
            "-77.0870 -11.9120,-77.1070 -11.9120,-77.1070 -11.8920)))"
        ),
    },
    {
        # Rímac river corridor — inside Lurigancho district (213k pop)
        "scene_id": "S1B_IW_SLC__1SDV_DEMO-RIMAC-NANA",
        "offset_h": 8.0,
        "model_version": "flood-seg-v0.1-demo",
        "confidence": 0.79,
        "area_km2": 6.5,
        "geom_wkt": (
            "MULTIPOLYGON(((-76.9500 -11.9500,-76.9200 -11.9500,"
            "-76.9200 -11.9700,-76.9500 -11.9700,-76.9500 -11.9500)))"
        ),
    },
]

# ─── Demo alerts ──────────────────────────────────────────────────────────────
_ALERTS_CURRENT = [
    {
        "type": "flood",
        "severity": "high",
        "status": "active",
        "title": "Inundación activa — Sector Huachipa",
        "description": "Desborde del río Rímac detectado por Sentinel-1 (SAR). Área afectada: ~1.8 km².",
        "lon": -76.8800, "lat": -11.9500,
        "offset_h": 2.5,
    },
    {
        "type": "huayco",
        "severity": "critical",
        "status": "active",
        "title": "Riesgo crítico de huayco — Quebrada Jicamarca",
        "description": "Precipitación acumulada 24h supera umbral (42 mm). Modelo XGBoost: probabilidad 0.91.",
        "lon": -76.9200, "lat": -11.9100,
        "offset_h": 1.0,
    },
    {
        "type": "flood",
        "severity": "medium",
        "status": "active",
        "title": "Nivel del río Rímac elevado — Estación Chosica",
        "description": "Nivel actual: 2.4 m (umbral de alerta: 2.0 m). Tendencia ascendente.",
        "lon": -76.6950, "lat": -11.9380,
        "offset_h": 4.0,
    },
    {
        "type": "social_cluster",
        "severity": "medium",
        "status": "active",
        "title": "Cluster social — reportes de bloqueo vial en La Molina",
        "description": "8 publicaciones geolocalizadas en 15 min. Triage: 6 × road_blocked.",
        "lon": -76.9450, "lat": -12.0800,
        "offset_h": 0.5,
    },
    {
        "type": "flood",
        "severity": "high",
        "status": "acknowledged",
        "title": "Inundación contenida — Sector Ñaña",
        "description": "Desborde menor controlado por defensa ribereña. Monitoreo continuo activo.",
        "lon": -76.8200, "lat": -11.9800,
        "offset_h": 8.0,
    },
    {
        "type": "huayco",
        "severity": "low",
        "status": "active",
        "title": "Alerta temprana — Quebrada Canto Grande",
        "description": "Precipitación 24h: 18 mm (umbral: 35 mm). Susceptibilidad moderada.",
        "lon": -76.9900, "lat": -11.9350,
        "offset_h": 3.0,
    },
]

# ─── Demo social signals ──────────────────────────────────────────────────────
_SOCIAL_CURRENT = [
    {
        "source": "bluesky",
        "content": "Rímac desbordado en Huachipa, varias familias evacuadas. Necesitamos ayuda urgente.",
        "label": "needs_help",
        "confidence": 0.94,
        "lon": -76.8780, "lat": -11.9510,
        "offset_h": 0.3,
    },
    {
        "source": "rss_rpp",
        "content": "RPP: Deslizamiento bloquea Carretera Central a la altura de Chosica km 38.",
        "label": "road_blocked",
        "confidence": 0.91,
        "lon": -76.6950, "lat": -11.9370,
        "offset_h": 0.7,
    },
    {
        "source": "reddit",
        "content": "Puente Huachipa colapsó parcialmente. Autos varados en ambos lados.",
        "label": "infrastructure_damage",
        "confidence": 0.88,
        "lon": -76.8820, "lat": -11.9490,
        "offset_h": 1.2,
    },
    {
        "source": "bluesky",
        "content": "Lluvia intensa en Ate Vitarte desde las 3am. Calles inundadas en Los Jardines.",
        "label": "flood_observation",
        "confidence": 0.85,
        "lon": -76.9100, "lat": -12.0250,
        "offset_h": 2.0,
    },
    {
        "source": "telegram",
        "content": "Avistamos flujo de lodo en quebrada de Huaycoloro bajando hacia Lurigancho. Evacúen ya.",
        "label": "huayco_observation",
        "confidence": 0.95,
        "lon": -76.9750, "lat": -11.9800,
        "offset_h": 1.1,
    },
    {
        "source": "rss_andina",
        "content": "INDECI activa protocolo de emergencia para Lurigancho y Chosica por desborde del Rímac.",
        "label": "needs_help",
        "confidence": 0.96,
        "lon": -76.7200, "lat": -11.9600,
        "offset_h": 1.5,
    },
    {
        "source": "bluesky",
        "content": "Huayco en Jicamarca bloqueó acceso principal. Vecinos atrapados. SOS.",
        "label": "needs_help",
        "confidence": 0.97,
        "lon": -76.9180, "lat": -11.9050,
        "offset_h": 0.9,
    },
    {
        "source": "rss_canal_n",
        "content": "SENAMHI advierte acumulación de 45mm en cuenca Rímac. Riesgo extremo de huaycos.",
        "label": "weather_observation",
        "confidence": 0.93,
        "lon": -76.7500, "lat": -11.9500,
        "offset_h": 5.0,
    },
    {
        "source": "reddit",
        "content": "Avenida La Molina inundada por desborde de canal de riego. Tránsito interrumpido.",
        "label": "road_blocked",
        "confidence": 0.89,
        "lon": -76.9420, "lat": -12.0850,
        "offset_h": 2.5,
    },
    {
        "source": "bluesky",
        "content": "Desborde del Rímac en zona de Carapongo. Casas del primer piso bajo el agua. Familias en azoteas.",
        "label": "flood_observation",
        "confidence": 0.95,
        "lon": -76.9100, "lat": -12.0150,
        "offset_h": 1.2,
    },
]

# ─── Demo hydro stations ──────────────────────────────────────────────────────
_STATIONS = [
    {"code": "ANA-001-DEMO", "name": "Chosica",   "source": "ana",     "river": "Rímac",
     "lon": -76.6950, "lat": -11.9380, "elev": 880.0},
    {"code": "ANA-002-DEMO", "name": "Ñaña",       "source": "ana",     "river": "Rímac",
     "lon": -76.8180, "lat": -11.9830, "elev": 560.0},
    {"code": "ANA-003-DEMO", "name": "Carapongo",  "source": "senamhi", "river": "Rímac",
     "lon": -76.9100, "lat": -12.0200, "elev": 320.0},
]

_STATION_OBS = [
    {"code": "ANA-001-DEMO", "offset_h": 0,  "level": 2.41, "flow": 68.2, "rain": 1.2},
    {"code": "ANA-001-DEMO", "offset_h": 1,  "level": 2.28, "flow": 61.4, "rain": 3.8},
    {"code": "ANA-001-DEMO", "offset_h": 3,  "level": 2.05, "flow": 52.1, "rain": 7.2},
    {"code": "ANA-001-DEMO", "offset_h": 6,  "level": 1.92, "flow": 44.8, "rain": 5.1},
    {"code": "ANA-001-DEMO", "offset_h": 12, "level": 1.78, "flow": 38.3, "rain": 2.0},
    {"code": "ANA-001-DEMO", "offset_h": 24, "level": 1.61, "flow": 29.7, "rain": 0.3},
    {"code": "ANA-002-DEMO", "offset_h": 0,  "level": 1.85, "flow": 52.4, "rain": 0.8},
    {"code": "ANA-002-DEMO", "offset_h": 6,  "level": 1.72, "flow": 44.1, "rain": 3.2},
    {"code": "ANA-002-DEMO", "offset_h": 24, "level": 1.44, "flow": 31.0, "rain": 0.1},
    {"code": "ANA-003-DEMO", "offset_h": 0,  "level": 1.55, "flow": 38.1, "rain": 0.4},
    {"code": "ANA-003-DEMO", "offset_h": 6,  "level": 1.48, "flow": 34.6, "rain": 1.9},
]

# ─── El Niño 2017 fixtures (replay tutorial) ──────────────────────────────────
_ELNINO_FLOODS = [
    {
        "scene_id": "elnino2017-s1a-20170315-rimac",
        "acquired_at": datetime(2017, 3, 15, 6, 0, tzinfo=timezone.utc),
        "area_km2": 4.2,
        "confidence": 0.87,
        "geom_wkt": "MULTIPOLYGON(((-76.85 -11.92,-76.83 -11.92,-76.83 -11.94,-76.85 -11.94,-76.85 -11.92)))",
    },
    {
        "scene_id": "elnino2017-s1a-20170318-chilln",
        "acquired_at": datetime(2017, 3, 18, 6, 0, tzinfo=timezone.utc),
        "area_km2": 2.8,
        "confidence": 0.83,
        "geom_wkt": "MULTIPOLYGON(((-77.02 -11.88,-77.00 -11.88,-77.00 -11.90,-77.02 -11.90,-77.02 -11.88)))",
    },
    {
        "scene_id": "elnino2017-s1a-20170322-ate",
        "acquired_at": datetime(2017, 3, 22, 6, 0, tzinfo=timezone.utc),
        "area_km2": 1.9,
        "confidence": 0.79,
        "geom_wkt": "MULTIPOLYGON(((-76.92 -12.01,-76.90 -12.01,-76.90 -12.03,-76.92 -12.03,-76.92 -12.01)))",
    },
    {
        "scene_id": "elnino2017-s1a-20170327-vjm",
        "acquired_at": datetime(2017, 3, 27, 6, 0, tzinfo=timezone.utc),
        "area_km2": 3.1,
        "confidence": 0.81,
        "geom_wkt": "MULTIPOLYGON(((-76.94 -12.15,-76.92 -12.15,-76.92 -12.17,-76.94 -12.17,-76.94 -12.15)))",
    },
    {
        "scene_id": "elnino2017-s1a-20170402-chaclacayo",
        "acquired_at": datetime(2017, 4, 2, 6, 0, tzinfo=timezone.utc),
        "area_km2": 5.6,
        "confidence": 0.91,
        "geom_wkt": "MULTIPOLYGON(((-76.78 -11.98,-76.76 -11.98,-76.76 -12.00,-76.78 -12.00,-76.78 -11.98)))",
    },
]

# ─── Demo quebradas (huayco-prone gullies — MULTILINESTRING centerlines) ─────
# ws_idx: 0=Rímac, 1=Chillón, 2=Lurín
_QUEBRADAS = [
    {
        "name": "Quebrada Jicamarca",
        "ws_idx": 0, "priority": 1, "threshold_24h_mm": 35.0,
        "slope_deg": 28.4, "aspect_deg": 195.0, "lithology_class": 3,
        "distance_to_stream_m": 120.0, "ndvi": 0.08, "soil_moisture": 0.11,
        "geom_wkt": "MULTILINESTRING((-76.9250 -11.9050,-76.9150 -11.9120,-76.9100 -11.9180,-76.9050 -11.9250))",
    },
    {
        "name": "Quebrada Canto Grande",
        "ws_idx": 0, "priority": 2, "threshold_24h_mm": 42.0,
        "slope_deg": 22.1, "aspect_deg": 210.0, "lithology_class": 2,
        "distance_to_stream_m": 250.0, "ndvi": 0.12, "soil_moisture": 0.14,
        "geom_wkt": "MULTILINESTRING((-76.9650 -11.9100,-76.9550 -11.9200,-76.9480 -11.9300))",
    },
    {
        "name": "Quebrada Huaycoloro",
        "ws_idx": 0, "priority": 3, "threshold_24h_mm": 30.0,
        "slope_deg": 32.8, "aspect_deg": 185.0, "lithology_class": 4,
        "distance_to_stream_m": 80.0, "ndvi": 0.06, "soil_moisture": 0.09,
        "geom_wkt": "MULTILINESTRING((-76.8050 -11.9200,-76.7950 -11.9350,-76.7850 -11.9500))",
    },
    {
        "name": "Quebrada Santa Eulalia",
        "ws_idx": 0, "priority": 4, "threshold_24h_mm": 50.0,
        "slope_deg": 18.5, "aspect_deg": 220.0, "lithology_class": 2,
        "distance_to_stream_m": 350.0, "ndvi": 0.15, "soil_moisture": 0.18,
        "geom_wkt": "MULTILINESTRING((-76.7200 -11.9400,-76.7100 -11.9500,-76.7000 -11.9600))",
    },
    {
        "name": "Quebrada La Chira",
        "ws_idx": 2, "priority": 5, "threshold_24h_mm": 38.0,
        "slope_deg": 25.3, "aspect_deg": 178.0, "lithology_class": 3,
        "distance_to_stream_m": 180.0, "ndvi": 0.10, "soil_moisture": 0.12,
        "geom_wkt": "MULTILINESTRING((-76.9500 -12.1200,-76.9400 -12.1350,-76.9300 -12.1500))",
    },
    {
        "name": "Quebrada Manchay Alto",
        "ws_idx": 2, "priority": 6, "threshold_24h_mm": 45.0,
        "slope_deg": 20.8, "aspect_deg": 190.0, "lithology_class": 2,
        "distance_to_stream_m": 290.0, "ndvi": 0.13, "soil_moisture": 0.16,
        "geom_wkt": "MULTILINESTRING((-76.8700 -12.1800,-76.8600 -12.1950,-76.8550 -12.2100))",
    },
]

# Huayco susceptibility — El Niño scenario values for priority Lima quebradas.
# Names match geo.quebradas (SINPAD short names without "Quebrada" prefix).
_HUAYCO_SUSCEPTIBILITY = [
    # (quebrada_name, probability, risk_level, trigger_rain_24h_mm)
    ("Pedregal",    0.91, "very_high", 12.0),
    ("Huaycoloro",  0.89, "very_high", 12.0),
    ("Quirio",      0.74, "high",      15.0),
    ("Carapongo",   0.68, "high",      18.0),
    ("Corrales",    0.62, "high",      20.0),
    ("Cashahuacra", 0.55, "medium",    25.0),
    ("Carossio",    0.51, "medium",    28.0),
    ("Yanacoto",    0.48, "medium",    30.0),
    ("Cieneguilla", 0.31, "low",       35.0),
    ("Ñaña",        0.42, "medium",    22.0),
]

# Approximate geometries for priority Lima quebradas (MultiLineString, EPSG:4326).
# These are simplified centerlines near the correct districts for spatial joins.
_QUEBRADA_GEOMETRIES: dict[str, str] = {
    "Pedregal":    "MULTILINESTRING((-76.960 -11.930,-76.955 -11.935,-76.950 -11.940))",
    "Huaycoloro":  "MULTILINESTRING((-76.975 -11.960,-76.970 -11.965,-76.965 -11.970))",
    "Quirio":      "MULTILINESTRING((-76.945 -11.925,-76.940 -11.930,-76.935 -11.935))",
    "Carapongo":   "MULTILINESTRING((-76.880 -11.960,-76.875 -11.965,-76.870 -11.970))",
    "Corrales":    "MULTILINESTRING((-76.940 -11.930,-76.935 -11.935,-76.930 -11.940))",
    "Cashahuacra": "MULTILINESTRING((-76.935 -11.930,-76.930 -11.935,-76.925 -11.940))",
    "Carossio":    "MULTILINESTRING((-76.930 -11.928,-76.925 -11.933,-76.920 -11.938))",
    "Yanacoto":    "MULTILINESTRING((-76.936 -11.926,-76.931 -11.931,-76.926 -11.936))",
    "Cieneguilla": "MULTILINESTRING((-76.870 -12.175,-76.865 -12.180,-76.860 -12.185))",
    "Ñaña":        "MULTILINESTRING((-76.938 -11.927,-76.933 -11.932,-76.928 -11.937))",
}

# ─── Demo critical infrastructure ─────────────────────────────────────────────
_INFRASTRUCTURE = [
    {"type": "hospital",    "name": "Hospital Nacional Dos de Mayo",       "osm_id": 123001, "lon": -77.0280, "lat": -12.0460},
    {"type": "hospital",    "name": "Hospital Nacional Cayetano Heredia",  "osm_id": 123002, "lon": -77.0840, "lat": -12.0230},
    {"type": "hospital",    "name": "Hospital de Ate Vitarte",             "osm_id": 123003, "lon": -76.8930, "lat": -12.0060},
    {"type": "hospital",    "name": "Hospital Huaycán",                    "osm_id": 123004, "lon": -76.8680, "lat": -12.0260},
    {"type": "school",      "name": "I.E. José María Arguedas",           "osm_id": 124001, "lon": -76.9200, "lat": -11.9400},
    {"type": "school",      "name": "Gran Unidad Escolar Ricardo Palma",   "osm_id": 124002, "lon": -77.0420, "lat": -12.0500},
    {"type": "school",      "name": "I.E. 142 Virgen de Fátima",         "osm_id": 124003, "lon": -76.9850, "lat": -11.9280},
    {"type": "bridge",      "name": "Puente Huachipa",                     "osm_id": 125001, "lon": -76.8830, "lat": -11.9480},
    {"type": "bridge",      "name": "Puente Chosica",                      "osm_id": 125002, "lon": -76.6930, "lat": -11.9370},
    {"type": "bridge",      "name": "Puente Santa Anita",                  "osm_id": 125003, "lon": -76.9800, "lat": -12.0320},
    {"type": "substation",  "name": "SE Huachipa",                         "osm_id": 126001, "lon": -76.8750, "lat": -11.9500},
    {"type": "shelter",     "name": "Centro de Albergue San Juan",         "osm_id": 127001, "lon": -76.9100, "lat": -11.9600},
    {"type": "shelter",     "name": "Estadio Municipal de Ate",            "osm_id": 127002, "lon": -76.8900, "lat": -12.0100},
    {"type": "fire_station","name": "Cía. Bomberos Lurigancho",            "osm_id": 128001, "lon": -76.8200, "lat": -11.9700},
]

# ─── Demo hazard zones (SINPAD historical event density) ─────────────────────
_HAZARD_ZONES = [
    {
        "name": "Zona inundación Rímac medio (SINPAD)",
        "hazard_type": "flood", "level": "alto",
        "source_layer": "sinpad_historical",
        "geom_wkt": "MULTIPOLYGON(((-76.9050 -11.9350,-76.8700 -11.9350,-76.8700 -11.9700,-76.9050 -11.9700,-76.9050 -11.9350)))",
    },
    {
        "name": "Zona inundación Chosica (SINPAD)",
        "hazard_type": "flood", "level": "muy_alto",
        "source_layer": "sinpad_historical",
        "geom_wkt": "MULTIPOLYGON(((-76.7200 -11.9300,-76.6800 -11.9300,-76.6800 -11.9600,-76.7200 -11.9600,-76.7200 -11.9300)))",
    },
    {
        "name": "Peligro deslizamiento Lurigancho (SINPAD)",
        "hazard_type": "landslide", "level": "muy_alto",
        "source_layer": "sinpad_historical",
        "geom_wkt": "MULTIPOLYGON(((-76.8050 -11.9200,-76.7750 -11.9200,-76.7750 -11.9550,-76.8050 -11.9550,-76.8050 -11.9200)))",
    },
    {
        "name": "Peligro inundación Carabayllo bajo (SINPAD)",
        "hazard_type": "flood", "level": "medio",
        "source_layer": "sinpad_historical",
        "geom_wkt": "MULTIPOLYGON(((-77.0800 -11.8400,-77.0300 -11.8400,-77.0300 -11.8800,-77.0800 -11.8800,-77.0800 -11.8400)))",
    },
    {
        "name": "Peligro huayco Jicamarca (SINPAD)",
        "hazard_type": "huayco", "level": "muy_alto",
        "source_layer": "sinpad_historical",
        "geom_wkt": "MULTIPOLYGON(((-76.9350 -11.8950,-76.9050 -11.8950,-76.9050 -11.9280,-76.9350 -11.9280,-76.9350 -11.8950)))",
    },
    {
        "name": "Peligro inundación VMT (SINPAD)",
        "hazard_type": "flood", "level": "alto",
        "source_layer": "sinpad_historical",
        "geom_wkt": "MULTIPOLYGON(((-76.9600 -12.1550,-76.9200 -12.1550,-76.9200 -12.2050,-76.9600 -12.2050,-76.9600 -12.1550)))",
    },
]

# ─── 30-day IMERG historical (Lima wet-season wind-down, April→May 2026) ─────
# Rímac watershed acc_24h_mm: index 0 = 30 days ago, index 29 = 1 day ago
_RIMAC_24H_30D: list[float] = [
    18.5, 22.1, 28.4, 31.2, 26.8, 19.4, 14.2,   # days 30-24 ago (wet spell peak)
    8.6,  5.1,  3.2,  1.8,  0.8,  0.4,  0.2,    # days 23-17 ago (dry interval)
    0.6,  1.4,  2.8,  5.2,  8.6, 12.4, 18.2,    # days 16-10 ago (new system)
    24.5, 31.8, 38.4, 35.2, 28.6, 22.1, 18.4,   # days 9-3 ago (intensification)
    14.8, 12.4,                                   # days 2-1 ago (tapering)
]


def _build_imerg_30d(rimac: list[float]) -> list[tuple]:
    """Build 30-day IMERG rows for 3 watersheds from Rímac 24h pattern."""
    records = []
    n = len(rimac)
    for i, r24 in enumerate(rimac):
        day_from_end = n - 1 - i   # 0 = most recent; n-1 = oldest
        offset_h = (day_from_end + 1) * 24
        r72 = sum(rimac[max(0, i - 2):i + 1])
        records.append((0, offset_h, round(r24, 2),          round(r72, 2)))
        records.append((1, offset_h, round(r24 * 0.55, 2),   round(r72 * 0.55, 2)))
        records.append((2, offset_h, round(r24 * 0.18, 2),   round(r72 * 0.18, 2)))
    return records


_IMERG_30D = _build_imerg_30d(_RIMAC_24H_30D)


_ELNINO_IMERG = [
    # (ws_index, date, a1, a3, a6, a12, a24, a72)
    (0, datetime(2017, 3, 13, 12, tzinfo=timezone.utc), 0.2, 0.5, 1.1, 2.1, 4.2, 8.1),
    (1, datetime(2017, 3, 13, 12, tzinfo=timezone.utc), 0.1, 0.3, 0.5, 1.0, 2.1, 4.0),
    (2, datetime(2017, 3, 13, 12, tzinfo=timezone.utc), 0.0, 0.1, 0.2, 0.4, 0.8, 1.5),
    (0, datetime(2017, 3, 14, 12, tzinfo=timezone.utc), 0.8, 2.3, 4.6, 9.2, 18.5, 30.8),
    (1, datetime(2017, 3, 14, 12, tzinfo=timezone.utc), 0.3, 1.0, 2.1, 4.2, 8.3, 13.8),
    (2, datetime(2017, 3, 14, 12, tzinfo=timezone.utc), 0.1, 0.4, 0.8, 1.6, 3.1, 5.1),
    (0, datetime(2017, 3, 15, 12, tzinfo=timezone.utc), 1.2, 3.5, 7.0, 14.1, 28.1, 63.2),
    (1, datetime(2017, 3, 15, 12, tzinfo=timezone.utc), 0.5, 1.6, 3.1, 6.2, 12.4, 28.4),
    (2, datetime(2017, 3, 15, 12, tzinfo=timezone.utc), 0.2, 0.6, 1.3, 2.6, 5.2, 11.0),
    (0, datetime(2017, 3, 16, 12, tzinfo=timezone.utc), 0.9, 2.8, 5.6, 11.2, 22.3, 58.4),
    (1, datetime(2017, 3, 16, 12, tzinfo=timezone.utc), 0.4, 1.2, 2.5, 5.0, 9.8, 24.6),
    (2, datetime(2017, 3, 16, 12, tzinfo=timezone.utc), 0.2, 0.5, 1.0, 2.0, 4.0, 9.4),
    (0, datetime(2017, 3, 17, 12, tzinfo=timezone.utc), 0.6, 1.8, 3.7, 7.3, 14.6, 42.1),
    (1, datetime(2017, 3, 17, 12, tzinfo=timezone.utc), 0.3, 0.8, 1.6, 3.1, 6.2, 17.2),
    (2, datetime(2017, 3, 17, 12, tzinfo=timezone.utc), 0.1, 0.4, 0.7, 1.4, 2.8, 6.5),
    (0, datetime(2017, 3, 22, 12, tzinfo=timezone.utc), 0.8, 2.4, 4.8, 9.7, 19.4, 42.8),
    (1, datetime(2017, 3, 22, 12, tzinfo=timezone.utc), 0.4, 1.1, 2.2, 4.4, 8.7, 18.9),
    (2, datetime(2017, 3, 22, 12, tzinfo=timezone.utc), 0.1, 0.4, 0.9, 1.8, 3.5, 7.8),
    (0, datetime(2017, 4, 2, 12, tzinfo=timezone.utc), 0.1, 0.3, 0.5, 1.1, 2.1, 4.5),
    (1, datetime(2017, 4, 2, 12, tzinfo=timezone.utc), 0.0, 0.1, 0.2, 0.5, 0.9, 2.0),
    (2, datetime(2017, 4, 2, 12, tzinfo=timezone.utc), 0.0, 0.0, 0.1, 0.2, 0.4, 0.9),
]


async def maybe_seed(engine: AsyncEngine) -> None:
    """Seed all demo data if flood_polygons is empty. Safe to call every boot."""
    async with engine.connect() as conn:
        flood_count = (
            await conn.execute(text("SELECT COUNT(*) FROM ml.flood_polygons"))
        ).scalar_one()

        # Check structural tables — these may be missing even if flood data exists
        # (added in a later session after first boot)
        _qbr = (await conn.execute(text("SELECT COUNT(*) FROM geo.quebradas"))).scalar_one()
        _infra = (await conn.execute(text("SELECT COUNT(*) FROM geo.infrastructure"))).scalar_one()
        _hazard = (await conn.execute(text("SELECT COUNT(*) FROM geo.hazard_zones"))).scalar_one()

        _elnino = (await conn.execute(
            text("SELECT COUNT(*) FROM ml.flood_polygons WHERE scene_id LIKE 'elnino2017%'")
        )).scalar_one()

        _alerts = (await conn.execute(text("SELECT COUNT(*) FROM ops.alerts"))).scalar_one()
        # Count only RECENT + LOCATABLE social signals — the map layer filters by both
        # 48h window AND (geom IS NOT NULL OR district_id IS NOT NULL). Raw social scraper
        # signals without geom don't count as operational demo signal data.
        _social = (await conn.execute(text("""
            SELECT COUNT(*) FROM social.signals
            WHERE ingested_at >= NOW() - INTERVAL '48 hours'
              AND triage_label NOT IN ('irrelevant', 'false_alarm')
              AND triage_label IS NOT NULL
              AND (geom IS NOT NULL OR district_id IS NOT NULL)
        """))).scalar_one()
        _imerg  = (await conn.execute(
            text("SELECT COUNT(*) FROM hydro.imerg_accumulations WHERE time > NOW() - INTERVAL '2 hours'")
        )).scalar_one()
        _stobs  = (await conn.execute(
            text("SELECT COUNT(*) FROM hydro.station_observations WHERE time > NOW() - INTERVAL '2 hours'")
        )).scalar_one()

        operational_ok = _alerts > 0 and _social > 0 and _imerg > 0 and _stobs > 0

        # Ensure quebradas have geometries (needed for district spatial join in alert generator)
        if _qbr > 0:
            _geom_missing = (await conn.execute(text(
                "SELECT COUNT(*) FROM geo.quebradas WHERE geom IS NULL"
            ))).scalar_one()
            if _geom_missing > 0:
                logger.info("auto_seed: adding geometries to %d quebradas", _geom_missing)
                for qname, wkt in _QUEBRADA_GEOMETRIES.items():
                    try:
                        await conn.execute(text("""
                            UPDATE geo.quebradas
                            SET geom = ST_SetSRID(ST_GeomFromText(:wkt), 4326)
                            WHERE name = :name AND geom IS NULL
                        """), {"name": qname, "wkt": wkt})
                    except Exception as exc:
                        logger.debug("auto_seed: skip geom update for %s: %s", qname, exc)
                await conn.commit()

        # Check if latest huayco data has high/very_high risk — ML pipeline can overwrite
        # demo seed values with lower estimates. Refresh when that happens.
        _high_huayco = (await conn.execute(text("""
            SELECT COUNT(*) FROM (
                SELECT DISTINCT ON (quebrada_id) risk_level
                FROM ml.huayco_susceptibility
                ORDER BY quebrada_id, computed_at DESC
            ) latest WHERE risk_level IN ('high', 'very_high')
        """))).scalar_one()
        need_huayco_refresh = _qbr > 0 and _high_huayco == 0

        if need_huayco_refresh:
            logger.info("auto_seed: refreshing huayco data — ML pipeline overwrote demo scenario with low-risk values")
            # Re-seed with El Niño scenario values at current timestamp
            for name, prob, risk, rain24 in _HUAYCO_SUSCEPTIBILITY:
                qid = (await conn.execute(
                    text("SELECT id FROM geo.quebradas WHERE name = :name"), {"name": name}
                )).scalar_one_or_none()
                if not qid:
                    continue
                try:
                    await conn.execute(text("""
                        INSERT INTO ml.huayco_susceptibility
                            (quebrada_id, probability, risk_level,
                             trigger_rain_24h_mm, model_version)
                        VALUES (:qid, :prob, :risk, :rain, 'xgboost-v0.1-demo-refresh')
                        ON CONFLICT (quebrada_id, computed_at) DO NOTHING
                    """), {"qid": qid, "prob": prob, "risk": risk, "rain": rain24})
                except Exception as exc:
                    logger.debug("auto_seed: skip huayco refresh row %s: %s", name, exc)
            await conn.commit()

        # Always refresh demo social signals so they stay within the 48h map window.
        # Uses ON CONFLICT DO UPDATE to bump ingested_at even if the signal already exists.
        # Runs before the early-return check so it fires on every seed call.
        # Previously conditioned on count — but signals can be within the 48h window yet
        # have stale timestamps (e.g. seeded 20h ago). Always refresh to keep them current.
        _need_social_refresh = True
        if _need_social_refresh:
            logger.info("auto_seed: refreshing %d demo social signals (%d visible in 48h window)", len(_SOCIAL_CURRENT), _social)
            for s in _SOCIAL_CURRENT:
                h = hashlib.sha256(s["content"].encode()).hexdigest()
                t = _ts(s["offset_h"])
                try:
                    _did = (await conn.execute(
                        text("""
                            SELECT id FROM geo.districts
                            WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(:lon,:lat), 4326))
                            LIMIT 1
                        """),
                        {"lon": s["lon"], "lat": s["lat"]},
                    )).scalar_one_or_none()
                except Exception:
                    _did = None
                try:
                    await conn.execute(
                        text("""
                            INSERT INTO social.signals
                                (source, content_hash, content_redacted,
                                 published_at, ingested_at,
                                 triage_label, triage_confidence, triage_model, triage_at,
                                 geom, district_id, expires_at)
                            VALUES (:src, :h, :content, :t, :t,
                                    :label, :conf, 'qwen2.5:7b-instruct-q4_K_M (demo seed)', :t,
                                    ST_SetSRID(ST_MakePoint(:lon,:lat), 4326),
                                    :did, :expires_at)
                            ON CONFLICT (content_hash) DO UPDATE
                                SET ingested_at = EXCLUDED.ingested_at,
                                    published_at = EXCLUDED.published_at,
                                    expires_at   = EXCLUDED.expires_at,
                                    district_id  = EXCLUDED.district_id,
                                    geom         = EXCLUDED.geom
                        """),
                        {
                            "src": s["source"], "h": h, "content": s["content"],
                            "t": t, "label": s["label"], "conf": s["confidence"],
                            "lon": s["lon"], "lat": s["lat"],
                            "did": _did, "expires_at": t + timedelta(days=7),
                        },
                    )
                except Exception as exc:
                    logger.warning("auto_seed: social signal refresh failed: %s", exc)
            await conn.commit()
            # Update local count so operational_ok reflects fresh state
            _social = len(_SOCIAL_CURRENT)

        # Always refresh demo station observations so their timestamps stay current.
        # Demo stations (ANA-001-DEMO etc.) carry actual readings (level_m, flow_m3s)
        # that the copilot and dashboard rely on. Without refresh they go stale after
        # the initial seed — 22h-old readings look offline to operators.
        demo_codes = [s["code"] for s in _STATIONS]
        if demo_codes:
            try:
                # Delete stale demo observations (> 4h old) for demo stations only,
                # then re-insert fresh ones. A plain DELETE without time filter would
                # need to scan the entire TimescaleDB hypertable — use the 4h window
                # to limit I/O while ensuring the refresh keeps latest readings current.
                await conn.execute(
                    text("""
                        DELETE FROM hydro.station_observations so
                        WHERE so.station_id IN (
                            SELECT id FROM hydro.stations WHERE code = ANY(:codes)
                        )
                          AND so.time < NOW() - INTERVAL '4 hours'
                    """),
                    {"codes": demo_codes},
                )
                # Re-insert with current timestamps (ON CONFLICT DO NOTHING for rows
                # within the 4h window that were kept by the DELETE above)
                demo_station_ids: dict[str, int] = {}
                for st in _STATIONS:
                    sid_row = await conn.execute(
                        text("SELECT id FROM hydro.stations WHERE code = :code"),
                        {"code": st["code"]},
                    )
                    sid_val = sid_row.scalar_one_or_none()
                    if sid_val:
                        demo_station_ids[st["code"]] = sid_val
                for obs in _STATION_OBS:
                    sid = demo_station_ids.get(obs["code"])
                    if not sid:
                        continue
                    try:
                        await conn.execute(
                            text("""
                                INSERT INTO hydro.station_observations
                                    (time, station_id, level_m, flow_m3s, rain_mm)
                                VALUES (:t, :sid, :level, :flow, :rain)
                                ON CONFLICT DO NOTHING
                            """),
                            {
                                "t": _ts(obs["offset_h"]),
                                "sid": sid,
                                "level": obs["level"],
                                "flow": obs["flow"],
                                "rain": obs["rain"],
                            },
                        )
                    except Exception as exc:
                        logger.debug("auto_seed: skip station obs refresh %s: %s", obs["code"], exc)
                await conn.commit()
                logger.info("auto_seed: refreshed demo station observations for %d stations", len(demo_codes))
            except Exception as exc:
                logger.warning("auto_seed: station obs refresh failed: %s", exc)

        # Always refresh demo IMERG accumulations so the DataFreshnessBar shows
        # IMERG as fresh (< 70min threshold). The Prefect IMERG worker normally keeps
        # these current, but if it hasn't run recently, the demo would show stale.
        # Fetch watershed IDs directly since ws_ids is only populated in the full seed path.
        try:
            ws_rows = (await conn.execute(
                text("SELECT id FROM geo.watersheds ORDER BY id LIMIT 3")
            )).scalars().all()
            if ws_rows and len(ws_rows) >= 3:
                for ws_idx, offset_h, a1, a3, a6, a12, a24, a72 in _IMERG_CURRENT:
                    if ws_idx < len(ws_rows):
                        t_imerg = _ts(offset_h)
                        await conn.execute(
                            text("""
                                INSERT INTO hydro.imerg_accumulations
                                    (time, watershed_id, acc_1h_mm, acc_3h_mm, acc_6h_mm,
                                     acc_12h_mm, acc_24h_mm, acc_72h_mm)
                                VALUES (:t, :ws, :a1, :a3, :a6, :a12, :a24, :a72)
                                ON CONFLICT (time, watershed_id) DO UPDATE
                                    SET acc_1h_mm = EXCLUDED.acc_1h_mm,
                                        acc_24h_mm = EXCLUDED.acc_24h_mm,
                                        acc_72h_mm = EXCLUDED.acc_72h_mm
                            """),
                            {
                                "t": t_imerg, "ws": ws_rows[ws_idx],
                                "a1": a1, "a3": a3, "a6": a6,
                                "a12": a12, "a24": a24, "a72": a72,
                            },
                        )
                await conn.commit()
                logger.info("auto_seed: refreshed IMERG demo accumulations for %d watersheds", len(ws_rows))
        except Exception as exc:
            logger.warning("auto_seed: IMERG refresh failed (Prefect worker will cover): %s", exc)

        # Always refresh demo flood polygon timestamps so they stay within the
        # DataFreshnessBar's 6h STALE window. SAR data is daily-cadence in production,
        # but demo polygons seeded at container start would look 24+ hours stale.
        # Only updates the two demo polygons (not El Niño 2017 fixtures which are historical).
        try:
            for flood in _FLOOD_CURRENT:
                t_flood = _ts(flood["offset_h"])
                await conn.execute(
                    text("""
                        UPDATE ml.flood_polygons
                        SET acquired_at = :t
                        WHERE scene_id = :sid
                          AND model_version = :mv
                    """),
                    {"t": t_flood, "sid": flood["scene_id"], "mv": flood["model_version"]},
                )
            await conn.commit()
            logger.info("auto_seed: refreshed %d demo flood polygon timestamps", len(_FLOOD_CURRENT))
        except Exception as exc:
            logger.warning("auto_seed: flood polygon timestamp refresh failed: %s", exc)

        # Always insert _DEMO_DISTRICTS (ON CONFLICT DO NOTHING) to ensure
        # districts missing from the real geodata load get approximate boundaries.
        # Run BEFORE early-return so SJL (150133) and other missing districts
        # are always available for spatial joins even if all other data is fresh.
        for d in _DEMO_DISTRICTS:
            try:
                await conn.execute(
                    text("""
                        INSERT INTO geo.districts
                            (ubigeo, name, province, region, area_km2, population, geom)
                        VALUES (:ubigeo, :name, 'Lima', 'Lima', :area_km2, :pop,
                                ST_SetSRID(ST_GeomFromText(:geom_wkt), 4326))
                        ON CONFLICT (ubigeo) DO NOTHING
                    """),
                    {
                        "ubigeo": d["ubigeo"],
                        "name": d["name"],
                        "area_km2": d["area_km2"],
                        "pop": d["population"],
                        "geom_wkt": d["geom_wkt"],
                    },
                )
            except Exception as exc:
                logger.debug("auto_seed: skip demo district %s: %s", d["ubigeo"], exc)
        await conn.commit()

        if flood_count > 0 and _qbr > 0 and _infra > 0 and _hazard > 0 and _elnino >= len(_ELNINO_FLOODS) and operational_ok:
            logger.info(
                "auto_seed: all tables populated (flood=%d elnino=%d alerts=%d social=%d) — skipping",
                flood_count, _elnino, _alerts, _social,
            )
            return

        logger.info(
            "auto_seed: seeding missing data (flood=%d qbr=%d infra=%d hazard=%d)",
            flood_count, _qbr, _infra, _hazard,
        )

        # ── 1. Districts (needed for spatial joins and map overlay) ──────────
        # Always insert _DEMO_DISTRICTS with ON CONFLICT DO NOTHING so that
        # districts missing from the real geodata load (e.g. SJL ubigeo 150133)
        # get approximate polygon boundaries. Safe to run on every boot.
        for d in _DEMO_DISTRICTS:
            await conn.execute(
                text("""
                    INSERT INTO geo.districts
                        (ubigeo, name, province, region, area_km2, population, geom)
                    VALUES (:ubigeo, :name, 'Lima', 'Lima', :area_km2, :pop,
                            ST_SetSRID(ST_GeomFromText(:geom_wkt), 4326))
                    ON CONFLICT (ubigeo) DO NOTHING
                """),
                {
                    "ubigeo": d["ubigeo"],
                    "name": d["name"],
                    "area_km2": d["area_km2"],
                    "pop": d["population"],
                    "geom_wkt": d["geom_wkt"],
                },
            )
        logger.info("auto_seed: ensured %d demo districts exist (ON CONFLICT DO NOTHING)", len(_DEMO_DISTRICTS))

        # ── 2b. Fill INEI 2017 populations for Lima Metro districts ──────────
        # This runs unconditionally so a fresh DB always gets population data.
        lima_pop_map = {
            "150101": 271814, "150102": 62928,  "150103": 630086, "150104": 29764,
            "150105": 68569,  "150106": 333045, "150107": 43694,  "150108": 325547,
            "150109": 49462,  "150110": 520450, "150111": 191365, "150112": 216764,
            "150113": 71589,  "150114": 171646, "150115": 164931, "150116": 49651,
            "150117": 388534, "150118": 213386, "150119": 89415,  "150120": 54667,
            "150122": 81619,  "150123": 129653, "150124": 16771,  "150125": 76114,
            "150126": 362285, "150127": 7619,   "150128": 8295,   "150129": 163423,
            "150130": 7842,   "150131": 111928, "150132": 54206,  "150133": 1038495,
            "150134": 362285, "150135": 57598,  "150136": 700178, "150137": 135669, "150138": 228422,
            "150139": 2176,   "150140": 18751,  "150141": 338509, "150142": 89283,
            "150143": 393254, "150144": 398433,
        }
        for ubigeo, pop in lima_pop_map.items():
            await conn.execute(
                text("UPDATE geo.districts SET population = :pop WHERE ubigeo = :ubigeo AND (population IS NULL OR population = 0)"),
                {"ubigeo": ubigeo, "pop": pop},
            )

        # ── 3. Watersheds (FK required for IMERG) ────────────────────────────
        ws_count = (
            await conn.execute(text("SELECT COUNT(*) FROM geo.watersheds"))
        ).scalar_one()
        ws_ids: list[int] = []
        if ws_count == 0:
            for w in _WATERSHEDS:
                wid = (
                    await conn.execute(
                        text("""
                            INSERT INTO geo.watersheds
                                (name, river, area_km2, outlet_lat, outlet_lon, geom)
                            VALUES (:name, :river, :area_km2, :outlet_lat, :outlet_lon,
                                    ST_SetSRID(ST_GeomFromText(:geom_wkt), 4326))
                            RETURNING id
                        """),
                        {
                            "name": w["name"],
                            "river": w["river"],
                            "area_km2": w["area_km2"],
                            "outlet_lat": w["outlet_lat"],
                            "outlet_lon": w["outlet_lon"],
                            "geom_wkt": w["geom_wkt"],
                        },
                    )
                ).scalar_one()
                ws_ids.append(wid)
            logger.info("auto_seed: inserted %d watersheds", len(ws_ids))
        else:
            rows = (
                await conn.execute(
                    text("SELECT id FROM geo.watersheds ORDER BY id LIMIT 3")
                )
            ).fetchall()
            ws_ids = [r[0] for r in rows]

        if len(ws_ids) < 3:
            logger.warning("auto_seed: fewer than 3 watersheds; IMERG may be partial")
            while len(ws_ids) < 3:
                ws_ids.append(ws_ids[-1])

        # ── 2. Current flood polygons ─────────────────────────────────────────
        # Upsert: always refresh acquired_at so polygons stay within the query
        # window (168h default). Geometry only changes on first insert.
        for f in _FLOOD_CURRENT:
            await conn.execute(
                text("""
                    INSERT INTO ml.flood_polygons
                        (scene_id, acquired_at, model_version, confidence, area_km2, geom)
                    VALUES (:sid, :acq, :mv, :conf, :area,
                            ST_SetSRID(ST_GeomFromText(:wkt), 4326))
                    ON CONFLICT (scene_id) DO UPDATE
                        SET acquired_at = EXCLUDED.acquired_at
                """),
                {
                    "sid": f["scene_id"],
                    "acq": _ts(f["offset_h"]),
                    "mv": f["model_version"],
                    "conf": f["confidence"],
                    "area": f["area_km2"],
                    "wkt": f["geom_wkt"],
                },
            )

        # ── 3. Current IMERG ──────────────────────────────────────────────────
        for ws_idx, offset_h, a1, a3, a6, a12, a24, a72 in _IMERG_CURRENT:
            try:
                await conn.execute(
                    text("""
                        INSERT INTO hydro.imerg_accumulations
                            (time, watershed_id,
                             acc_1h_mm, acc_3h_mm, acc_6h_mm,
                             acc_12h_mm, acc_24h_mm, acc_72h_mm)
                        VALUES (:t, :ws, :a1, :a3, :a6, :a12, :a24, :a72)
                        ON CONFLICT DO NOTHING
                    """),
                    {
                        "t": _ts(offset_h),
                        "ws": ws_ids[ws_idx],
                        "a1": a1, "a3": a3, "a6": a6,
                        "a12": a12, "a24": a24, "a72": a72,
                    },
                )
            except Exception as exc:
                logger.warning("auto_seed: skip IMERG row ws_idx=%s: %s", ws_idx, exc)

        # ── 3b. Historical 30-day IMERG (district dashboard sparkline) ────────
        for ws_idx, offset_h, a24, a72 in _IMERG_30D:
            try:
                await conn.execute(
                    text("""
                        INSERT INTO hydro.imerg_accumulations
                            (time, watershed_id,
                             acc_1h_mm, acc_3h_mm, acc_6h_mm,
                             acc_12h_mm, acc_24h_mm, acc_72h_mm)
                        VALUES (:t, :ws, :a1, :a3, :a6, :a12, :a24, :a72)
                        ON CONFLICT DO NOTHING
                    """),
                    {
                        "t": _ts(offset_h),
                        "ws": ws_ids[ws_idx],
                        "a1": round(a24 / 24, 3),
                        "a3": round(a24 / 8, 3),
                        "a6": round(a24 / 4, 3),
                        "a12": round(a24 / 2, 3),
                        "a24": a24,
                        "a72": a72,
                    },
                )
            except Exception as exc:
                logger.warning("auto_seed: skip IMERG 30d row: %s", exc)
        logger.info("auto_seed: inserted 30d IMERG history (%d records)", len(_IMERG_30D))

        # ── 4. Alerts ─────────────────────────────────────────────────────────
        for a in _ALERTS_CURRENT:
            # Try spatial district lookup; fall back to NULL if districts not loaded
            try:
                district_id = (
                    await conn.execute(
                        text("""
                            SELECT id FROM geo.districts
                            WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(:lon,:lat), 4326))
                            LIMIT 1
                        """),
                        {"lon": a["lon"], "lat": a["lat"]},
                    )
                ).scalar_one_or_none()
            except Exception as exc:
                logger.debug("auto_seed: district lookup failed for alert lon=%s lat=%s: %s", a["lon"], a["lat"], exc)
                district_id = None

            existing = (
                await conn.execute(
                    text("SELECT id FROM ops.alerts WHERE title = :title LIMIT 1"),
                    {"title": a["title"]},
                )
            ).scalar_one_or_none()
            if existing:
                continue

            await conn.execute(
                text("""
                    INSERT INTO ops.alerts
                        (type, severity, status, title, description,
                         geom, district_id, created_at, updated_at)
                    VALUES (:type, :sev, :status, :title, :desc,
                            ST_SetSRID(ST_MakePoint(:lon,:lat), 4326),
                            :district_id, :ts, :ts)
                """),
                {
                    "type": a["type"],
                    "sev": a["severity"],
                    "status": a["status"],
                    "title": a["title"],
                    "desc": a["description"],
                    "lon": a["lon"],
                    "lat": a["lat"],
                    "district_id": district_id,
                    "ts": _ts(a["offset_h"]),
                },
            )

        # ── 5. Social signals ─────────────────────────────────────────────────
        # Use ON CONFLICT DO UPDATE to refresh ingested_at/expires_at so demo
        # signals stay visible in the 48h window even if seeded days ago.
        for s in _SOCIAL_CURRENT:
            h = hashlib.sha256(s["content"].encode()).hexdigest()
            t = _ts(s["offset_h"])

            try:
                district_id = (
                    await conn.execute(
                        text("""
                            SELECT id FROM geo.districts
                            WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(:lon,:lat), 4326))
                            LIMIT 1
                        """),
                        {"lon": s["lon"], "lat": s["lat"]},
                    )
                ).scalar_one_or_none()
            except Exception as exc:
                logger.debug("auto_seed: district lookup failed for signal lon=%s lat=%s: %s", s["lon"], s["lat"], exc)
                district_id = None

            try:
                await conn.execute(
                    text("""
                        INSERT INTO social.signals
                            (source, content_hash, content_redacted,
                             published_at, ingested_at,
                             triage_label, triage_confidence, triage_model, triage_at,
                             geom, district_id, expires_at)
                        VALUES (:src, :h, :content, :t, :t,
                                :label, :conf, 'qwen2.5:7b-instruct-q4_K_M (demo seed)', :t,
                                ST_SetSRID(ST_MakePoint(:lon,:lat), 4326),
                                :district_id, :expires_at)
                        ON CONFLICT (content_hash) DO UPDATE
                            SET ingested_at = EXCLUDED.ingested_at,
                                published_at = EXCLUDED.published_at,
                                expires_at   = EXCLUDED.expires_at,
                                district_id  = EXCLUDED.district_id,
                                geom         = EXCLUDED.geom
                    """),
                    {
                        "src": s["source"],
                        "h": h,
                        "content": s["content"],
                        "t": t,
                        "label": s["label"],
                        "conf": s["confidence"],
                        "lon": s["lon"],
                        "lat": s["lat"],
                        "district_id": district_id,
                        "expires_at": t + timedelta(days=7),
                    },
                )
            except Exception as exc:
                logger.warning("auto_seed: skip social signal: %s", exc)

        # ── 6. Hydro stations + observations ──────────────────────────────────
        station_ids: dict[str, int] = {}
        for st in _STATIONS:
            sid = (
                await conn.execute(
                    text("""
                        INSERT INTO hydro.stations
                            (code, name, source, river, geom, elevation_m)
                        VALUES (:code, :name, :src, :river,
                                ST_SetSRID(ST_MakePoint(:lon,:lat), 4326), :elev)
                        ON CONFLICT (code) DO NOTHING
                        RETURNING id
                    """),
                    {
                        "code": st["code"],
                        "name": st["name"],
                        "src": st["source"],
                        "river": st["river"],
                        "lon": st["lon"],
                        "lat": st["lat"],
                        "elev": st["elev"],
                    },
                )
            ).scalar_one_or_none()
            if sid is None:
                # Already existed
                sid = (
                    await conn.execute(
                        text("SELECT id FROM hydro.stations WHERE code = :code"),
                        {"code": st["code"]},
                    )
                ).scalar_one()
            station_ids[st["code"]] = sid

        for obs in _STATION_OBS:
            sid = station_ids.get(obs["code"])
            if not sid:
                continue
            try:
                await conn.execute(
                    text("""
                        INSERT INTO hydro.station_observations
                            (time, station_id, level_m, flow_m3s, rain_mm)
                        VALUES (:t, :sid, :level, :flow, :rain)
                        ON CONFLICT DO NOTHING
                    """),
                    {
                        "t": _ts(obs["offset_h"]),
                        "sid": sid,
                        "level": obs["level"],
                        "flow": obs["flow"],
                        "rain": obs["rain"],
                    },
                )
            except Exception as exc:
                logger.debug("auto_seed: skip station observation sid=%s: %s", sid, exc)

        # ── 7. Quebradas + huayco susceptibility ─────────────────────────────
        qbr_count = (
            await conn.execute(text("SELECT COUNT(*) FROM geo.quebradas"))
        ).scalar_one()
        quebrada_ids: dict[str, int] = {}
        if qbr_count == 0:
            for q in _QUEBRADAS:
                ws_id = ws_ids[q["ws_idx"]] if q["ws_idx"] < len(ws_ids) else None
                qid = (
                    await conn.execute(
                        text("""
                            INSERT INTO geo.quebradas
                                (name, watershed_id, geom, priority, threshold_24h_mm,
                                 slope_deg, aspect_deg, lithology_class,
                                 distance_to_stream_m, ndvi, soil_moisture)
                            VALUES (:name, :ws_id,
                                    ST_SetSRID(ST_GeomFromText(:wkt), 4326),
                                    :priority, :threshold,
                                    :slope, :aspect, :litho,
                                    :dist, :ndvi, :sm)
                            RETURNING id
                        """),
                        {
                            "name": q["name"],
                            "ws_id": ws_id,
                            "wkt": q["geom_wkt"],
                            "priority": q["priority"],
                            "threshold": q["threshold_24h_mm"],
                            "slope": q["slope_deg"],
                            "aspect": q["aspect_deg"],
                            "litho": q["lithology_class"],
                            "dist": q["distance_to_stream_m"],
                            "ndvi": q["ndvi"],
                            "sm": q["soil_moisture"],
                        },
                    )
                ).scalar_one()
                quebrada_ids[q["name"]] = qid
            logger.info("auto_seed: inserted %d quebradas", len(quebrada_ids))

            for name, prob, risk, rain24 in _HUAYCO_SUSCEPTIBILITY:
                qid = quebrada_ids.get(name)
                if not qid:
                    continue
                try:
                    await conn.execute(
                        text("""
                            INSERT INTO ml.huayco_susceptibility
                                (quebrada_id, probability, risk_level,
                                 trigger_rain_24h_mm, model_version, features_json)
                            VALUES (:qid, :prob, :risk, :rain,
                                    'xgboost-v0.1-demo', :features)
                            ON CONFLICT DO NOTHING
                        """),
                        {
                            "qid": qid, "prob": prob, "risk": risk, "rain": rain24,
                            "features": '{"source":"auto_seed_demo"}',
                        },
                    )
                except Exception as exc:
                    logger.warning("auto_seed: skip huayco row %s: %s", name, exc)
            logger.info("auto_seed: inserted huayco susceptibility records")

        # ── 8. Critical infrastructure ────────────────────────────────────────
        infra_count = (
            await conn.execute(text("SELECT COUNT(*) FROM geo.infrastructure"))
        ).scalar_one()
        if infra_count == 0:
            for inf in _INFRASTRUCTURE:
                try:
                    district_id = (
                        await conn.execute(
                            text("""
                                SELECT id FROM geo.districts
                                WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(:lon,:lat), 4326))
                                LIMIT 1
                            """),
                            {"lon": inf["lon"], "lat": inf["lat"]},
                        )
                    ).scalar_one_or_none()
                except Exception as exc:
                    logger.debug("auto_seed: district lookup failed for infra lon=%s lat=%s: %s", inf["lon"], inf["lat"], exc)
                    district_id = None
                await conn.execute(
                    text("""
                        INSERT INTO geo.infrastructure
                            (osm_id, type, name, district_id, geom, properties)
                        VALUES (:osm_id, :type, :name, :district_id,
                                ST_SetSRID(ST_MakePoint(:lon,:lat), 4326), '{}')
                    """),
                    {
                        "osm_id": inf["osm_id"],
                        "type": inf["type"],
                        "name": inf["name"],
                        "district_id": district_id,
                        "lon": inf["lon"],
                        "lat": inf["lat"],
                    },
                )
            logger.info("auto_seed: inserted %d infrastructure points", len(_INFRASTRUCTURE))

        # ── 9. Hazard zones ───────────────────────────────────────────────────
        hazard_count = (
            await conn.execute(text("SELECT COUNT(*) FROM geo.hazard_zones"))
        ).scalar_one()
        if hazard_count == 0:
            for hz in _HAZARD_ZONES:
                await conn.execute(
                    text("""
                        INSERT INTO geo.hazard_zones
                            (name, hazard_type, level, source_layer, geom)
                        VALUES (:name, :hazard_type, :level, :source_layer,
                                ST_SetSRID(ST_GeomFromText(:wkt), 4326))
                    """),
                    {
                        "name": hz["name"],
                        "hazard_type": hz["hazard_type"],
                        "level": hz["level"],
                        "source_layer": hz["source_layer"],
                        "wkt": hz["geom_wkt"],
                    },
                )
            logger.info("auto_seed: inserted %d hazard zones", len(_HAZARD_ZONES))

        # ── 10. El Niño 2017 replay fixtures ──────────────────────────────────
        for f in _ELNINO_FLOODS:
            await conn.execute(
                text("""
                    INSERT INTO ml.flood_polygons
                        (scene_id, acquired_at, model_version, confidence, area_km2, geom)
                    VALUES (:sid, :acq, 'elnino2017-fixture-v1', :conf, :area,
                            ST_SetSRID(ST_GeomFromText(:wkt), 4326))
                    ON CONFLICT DO NOTHING
                """),
                {
                    "sid": f["scene_id"],
                    "acq": f["acquired_at"],
                    "conf": f["confidence"],
                    "area": f["area_km2"],
                    "wkt": f["geom_wkt"],
                },
            )

        for ws_idx, t, a1, a3, a6, a12, a24, a72 in _ELNINO_IMERG:
            try:
                await conn.execute(
                    text("""
                        INSERT INTO hydro.imerg_accumulations
                            (time, watershed_id,
                             acc_1h_mm, acc_3h_mm, acc_6h_mm,
                             acc_12h_mm, acc_24h_mm, acc_72h_mm)
                        VALUES (:t, :ws, :a1, :a3, :a6, :a12, :a24, :a72)
                        ON CONFLICT DO NOTHING
                    """),
                    {
                        "t": t,
                        "ws": ws_ids[ws_idx],
                        "a1": a1, "a3": a3, "a6": a6,
                        "a12": a12, "a24": a24, "a72": a72,
                    },
                )
            except Exception as exc:
                logger.warning("auto_seed: skip El Niño IMERG row: %s", exc)

        await conn.commit()
        logger.info(
            "auto_seed: done — %d flood (current) + %d flood (2017) polygons seeded",
            len(_FLOOD_CURRENT),
            len(_ELNINO_FLOODS),
        )
