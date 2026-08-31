"""Interpretation of stored weather observations for emergency responders.

The ingest worker stores raw numbers; this module is the single place that turns
them into labels and warnings. Keeping the thresholds here rather than split
across the API and the worker package means the map chip, the copilot and the
sitrep cannot disagree about whether it is currently too windy to fly a drone.

Thresholds are tuned for Lima's coastal desert climate, not a temperate default:
Lima runs roughly 14-30 °C with very little rain and near-permanent winter cloud
and garua fog, so a 35 °C heat warning would never fire and a freezing warning
would be meaningless.
"""
from typing import Any

HEAT_WARNING_C = 30.0
COLD_WARNING_C = 12.0
WIND_WARNING_KMH = 38.0        # sustained: hampers rescue and shelter setup
GUST_WARNING_KMH = 55.0        # gusts: structures, drones, work at height

# WMO 4677 present-weather codes, as returned by Open-Meteo.
WMO_FOG = {45, 48}
WMO_THUNDERSTORM = {95, 96, 99}
WMO_HEAVY_RAIN = {65, 67, 82}

WMO_LABELS: dict[int, dict[str, str]] = {
    0:  {"es": "Despejado",              "en": "Clear"},
    1:  {"es": "Mayormente despejado",   "en": "Mainly clear"},
    2:  {"es": "Parcialmente nublado",   "en": "Partly cloudy"},
    3:  {"es": "Nublado",                "en": "Overcast"},
    45: {"es": "Niebla",                 "en": "Fog"},
    48: {"es": "Niebla con escarcha",    "en": "Depositing rime fog"},
    51: {"es": "Llovizna ligera",        "en": "Light drizzle"},
    53: {"es": "Llovizna moderada",      "en": "Moderate drizzle"},
    55: {"es": "Llovizna densa",         "en": "Dense drizzle"},
    56: {"es": "Llovizna helada ligera", "en": "Light freezing drizzle"},
    57: {"es": "Llovizna helada densa",  "en": "Dense freezing drizzle"},
    61: {"es": "Lluvia ligera",          "en": "Slight rain"},
    63: {"es": "Lluvia moderada",        "en": "Moderate rain"},
    65: {"es": "Lluvia fuerte",          "en": "Heavy rain"},
    66: {"es": "Lluvia helada ligera",   "en": "Light freezing rain"},
    67: {"es": "Lluvia helada fuerte",   "en": "Heavy freezing rain"},
    71: {"es": "Nevada ligera",          "en": "Slight snowfall"},
    73: {"es": "Nevada moderada",        "en": "Moderate snowfall"},
    75: {"es": "Nevada fuerte",          "en": "Heavy snowfall"},
    77: {"es": "Granos de nieve",        "en": "Snow grains"},
    80: {"es": "Chubascos ligeros",      "en": "Slight rain showers"},
    81: {"es": "Chubascos moderados",    "en": "Moderate rain showers"},
    82: {"es": "Chubascos violentos",    "en": "Violent rain showers"},
    85: {"es": "Chubascos de nieve ligeros", "en": "Slight snow showers"},
    86: {"es": "Chubascos de nieve fuertes", "en": "Heavy snow showers"},
    95: {"es": "Tormenta eléctrica",     "en": "Thunderstorm"},
    96: {"es": "Tormenta con granizo ligero", "en": "Thunderstorm, slight hail"},
    99: {"es": "Tormenta con granizo fuerte", "en": "Thunderstorm, heavy hail"},
}


def describe_weather_code(code: Any) -> dict[str, str]:
    """Bilingual label for a WMO present-weather code."""
    if code is None:
        return {"es": "Sin dato", "en": "No data"}
    try:
        key = int(code)
    except (TypeError, ValueError):
        return {"es": "Sin dato", "en": "No data"}
    return WMO_LABELS.get(key, {"es": f"Código WMO {key}", "en": f"WMO code {key}"})


def derive_warnings(obs: dict) -> list[dict]:
    """Responder-relevant warnings implied by one observation.

    Returns structured dicts rather than prose so the UI can colour them by
    severity and the copilot can reason over them without re-parsing text.
    """
    warnings: list[dict] = []

    temp = obs.get("temperature_c")
    if temp is not None:
        if temp >= HEAT_WARNING_C:
            warnings.append({
                "kind": "heat", "severity": "warn",
                "label_es": f"Calor: {temp:.0f} °C",
                "label_en": f"Heat: {temp:.0f} °C",
                "detail_es": "Riesgo de golpe de calor en brigadas con EPP. Rotar personal e hidratar.",
                "detail_en": "Heat-stress risk for brigades in PPE. Rotate crews and hydrate.",
            })
        elif temp <= COLD_WARNING_C:
            warnings.append({
                "kind": "cold", "severity": "warn",
                "label_es": f"Frío: {temp:.0f} °C",
                "label_en": f"Cold: {temp:.0f} °C",
                "detail_es": "Exposición prolongada en albergues y trabajo nocturno en quebradas.",
                "detail_en": "Prolonged exposure in shelters and night work in the quebradas.",
            })

    gusts = obs.get("wind_gusts_kmh")
    speed = obs.get("wind_speed_kmh")
    if gusts is not None and gusts >= GUST_WARNING_KMH:
        warnings.append({
            "kind": "wind", "severity": "danger",
            "label_es": f"Ráfagas: {gusts:.0f} km/h",
            "label_en": f"Gusts: {gusts:.0f} km/h",
            "detail_es": "Riesgo de caída de estructuras ligeras. Suspender vuelos de dron y trabajo en altura.",
            "detail_en": "Light structures at risk. Suspend drone flights and work at height.",
        })
    elif speed is not None and speed >= WIND_WARNING_KMH:
        warnings.append({
            "kind": "wind", "severity": "warn",
            "label_es": f"Viento: {speed:.0f} km/h",
            "label_en": f"Wind: {speed:.0f} km/h",
            "detail_es": "Dificulta maniobras de rescate y montaje de carpas.",
            "detail_en": "Hampers rescue manoeuvres and tent setup.",
        })

    code = obs.get("weather_code")
    if code is not None:
        try:
            code_int = int(code)
        except (TypeError, ValueError):
            code_int = None
        if code_int in WMO_THUNDERSTORM:
            warnings.append({
                "kind": "thunderstorm", "severity": "danger",
                "label_es": "Tormenta eléctrica", "label_en": "Thunderstorm",
                "detail_es": "Suspender operaciones en terreno abierto y en cauces.",
                "detail_en": "Suspend operations in open ground and river channels.",
            })
        elif code_int in WMO_FOG:
            warnings.append({
                "kind": "fog", "severity": "warn",
                "label_es": "Niebla", "label_en": "Fog",
                "detail_es": "Visibilidad reducida en Carretera Central y vías a quebradas.",
                "detail_en": "Reduced visibility on the Carretera Central and quebrada access roads.",
            })
        elif code_int in WMO_HEAVY_RAIN:
            warnings.append({
                "kind": "heavy_rain", "severity": "danger",
                "label_es": "Lluvia fuerte", "label_en": "Heavy rain",
                "detail_es": "Detonante directo de huaycos. Verificar umbrales por quebrada.",
                "detail_en": "Direct huayco trigger. Check per-quebrada thresholds.",
            })

    return warnings


def worst_severity(warnings: list[dict]) -> str | None:
    """Highest severity present, for a single at-a-glance chip colour."""
    if any(w["severity"] == "danger" for w in warnings):
        return "danger"
    if any(w["severity"] == "warn" for w in warnings):
        return "warn"
    return None
