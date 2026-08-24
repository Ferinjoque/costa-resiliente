"""
load_sinpad.py: Load INDECI SINPAD historical emergency records into PostGIS.

Source: BD-EMER-Y-DAÑOS-INTEGRADA-2003-2020-validada.xlsx
        (docs/ directory: 96,531 records, 2003-2020)

Usage:
    # Load all Lima events (default):
    python scripts/load_sinpad.py

    # Load only 2017 El Niño events (for replay demo):
    python scripts/load_sinpad.py --year 2017

    # Load all departments:
    python scripts/load_sinpad.py --all-depts

    # Dry-run (parse + report, no DB writes):
    python scripts/load_sinpad.py --dry-run

    # Via Docker:
    docker cp scripts/load_sinpad.py costa-prefect-worker:/app/scripts/
    docker cp docs/BD-EMER-Y-DAÑOS-INTEGRADA-2003-2020-validada.xlsx costa-prefect-worker:/app/docs/
    docker exec -it costa-prefect-worker python /app/scripts/load_sinpad.py

Requirements:
    pip install openpyxl pandas psycopg2-binary
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import date

import pandas as pd
import psycopg2
import psycopg2.extras

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://costa:costa_dev_password@localhost:5432/costa_resiliente",
)

# Path relative to repo root: adjust if running from inside Docker
EXCEL_PATHS = [
    "docs/BD-EMER-Y-DAÑOS-INTEGRADA-2003-2020-validada.xlsx",
    "/app/docs/BD-EMER-Y-DAÑOS-INTEGRADA-2003-2020-validada.xlsx",
]

# Event types relevant for flood/huayco/landslide scenario
FLOOD_HUAYCO_TYPES = {
    "LLUVIA INTENSA",
    "INUNDACION",
    "INUNDACIÓN",
    "HUAYCO",
    "DESLIZAMIENTO",
    "DERRUMBE",
    "ALUVION",
    "ALUVIÓN",
    "EROSION DE RIBERA",
    "EROSIÓN DE RIBERA",
    "AVENIDA",
    "DESBORDE",
}

DDL = """
CREATE SCHEMA IF NOT EXISTS historical;

CREATE TABLE IF NOT EXISTS historical.sinpad_events (
    id               BIGSERIAL PRIMARY KEY,
    sinpad_code      TEXT,
    event_date       DATE,
    year             SMALLINT,
    month            SMALLINT,
    dpto             TEXT,
    provincia        TEXT,
    distrito         TEXT,
    ubigeo           CHAR(6),
    region_natural   TEXT,
    event_type       TEXT NOT NULL,
    -- human impact
    fallecidos       INTEGER DEFAULT 0,
    desaparecidos    INTEGER DEFAULT 0,
    heridos          INTEGER DEFAULT 0,
    damnificados     INTEGER DEFAULT 0,
    afectados        INTEGER DEFAULT 0,
    -- infrastructure (counts)
    viviendas_dest   INTEGER DEFAULT 0,
    viviendas_afect  INTEGER DEFAULT 0,
    -- economic
    costo_ayuda      DOUBLE PRECISION,
    -- metadata
    loaded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sinpad_events_ubigeo_idx   ON historical.sinpad_events (ubigeo);
CREATE INDEX IF NOT EXISTS sinpad_events_year_idx     ON historical.sinpad_events (year);
CREATE INDEX IF NOT EXISTS sinpad_events_type_idx     ON historical.sinpad_events (event_type);
CREATE INDEX IF NOT EXISTS sinpad_events_dpto_idx     ON historical.sinpad_events (dpto);
"""


def find_excel() -> str:
    for path in EXCEL_PATHS:
        if os.path.exists(path):
            return path
    raise FileNotFoundError(
        "SINPAD Excel not found. Expected at:\n"
        + "\n".join(f"  {p}" for p in EXCEL_PATHS)
    )


def _safe_int(val) -> int:
    try:
        v = int(val)
        return max(0, v)
    except (TypeError, ValueError):
        return 0


def _safe_float(val) -> float | None:
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _safe_date(val) -> date | None:
    if pd.isna(val):
        return None
    if isinstance(val, (date,)):
        return val
    try:
        return pd.to_datetime(val, dayfirst=True).date()
    except Exception:
        return None


def load_excel(path: str, lima_only: bool, year_filter: int | None) -> pd.DataFrame:
    log.info("Reading %s …", path)
    # Header is on row 3 (0-indexed: row 2), data starts row 4
    df = pd.read_excel(path, sheet_name=0, header=2, dtype=str, engine="openpyxl")
    log.info("Raw rows: %d, columns: %d", len(df), len(df.columns))

    # Normalise column names: strip whitespace, upper
    df.columns = [str(c).strip().upper() for c in df.columns]

    # Map expected columns (handles minor name variations)
    col_map = {
        "FECHA DE LA EMER": "event_date",
        "AÑO": "year",
        "MES": "month_name",
        "DPTO.": "dpto",
        "PROV.": "provincia",
        "DIST.": "distrito",
        "COD. DISTRITO": "ubigeo",
        "REGIÓN NATURAL": "region_natural",
        "EMERGENCIA": "event_type",
        "CÓDIGO DE EMERGENCIA-SINPAD": "sinpad_code",
        "FALLECIDOS": "fallecidos",
        "DESAPARECIDOS": "desaparecidos",
        "HERIDOS": "heridos",
        "DAMNIFICADOS": "damnificados",
        "AFECTADOS": "afectados",
        "COSTO DE LA AYUDA": "costo_ayuda",
    }
    # Viviendas destroyed / affected: column names vary in SINPAD versions
    for col in df.columns:
        if "VIVIENDA" in col and "DESTRUI" in col:
            col_map[col] = "viviendas_dest"
        elif "VIVIENDA" in col and "AFECT" in col:
            col_map[col] = "viviendas_afect"

    df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})

    # Drop rows with no event type
    df = df.dropna(subset=["event_type"])
    df["event_type"] = df["event_type"].str.strip().str.upper()

    # Department filter
    if lima_only and "dpto" in df.columns:
        df = df[df["dpto"].str.strip().str.upper() == "LIMA"]
        log.info("After Lima filter: %d rows", len(df))

    # Year filter
    if year_filter and "year" in df.columns:
        df["year_int"] = pd.to_numeric(df["year"], errors="coerce")
        df = df[df["year_int"] == year_filter]
        log.info("After year=%d filter: %d rows", year_filter, len(df))

    # Event type filter: flood/huayco types only for disaster scenario
    df = df[df["event_type"].apply(
        lambda t: any(ft in t for ft in FLOOD_HUAYCO_TYPES)
    )]
    log.info("After disaster-type filter: %d rows", len(df))

    return df


def df_to_rows(df: pd.DataFrame) -> list[dict]:
    rows = []
    month_map = {
        "ENERO": 1, "FEBRERO": 2, "MARZO": 3, "ABRIL": 4,
        "MAYO": 5, "JUNIO": 6, "JULIO": 7, "AGOSTO": 8,
        "SETIEMBRE": 9, "SEPTIEMBRE": 9, "OCTUBRE": 10,
        "NOVIEMBRE": 11, "DICIEMBRE": 12,
    }

    for _, r in df.iterrows():
        ubigeo = str(r.get("ubigeo", "") or "").strip().zfill(6)
        if len(ubigeo) != 6:
            ubigeo = None

        month_name = str(r.get("month_name", "") or "").strip().upper()
        month_num = month_map.get(month_name)

        rows.append({
            "sinpad_code":    str(r.get("sinpad_code", "") or "").strip() or None,
            "event_date":     _safe_date(r.get("event_date")),
            "year":           _safe_int(r.get("year")),
            "month":          month_num,
            "dpto":           str(r.get("dpto", "") or "").strip() or None,
            "provincia":      str(r.get("provincia", "") or "").strip() or None,
            "distrito":       str(r.get("distrito", "") or "").strip() or None,
            "ubigeo":         ubigeo,
            "region_natural": str(r.get("region_natural", "") or "").strip() or None,
            "event_type":     str(r.get("event_type", "") or "").strip(),
            "fallecidos":     _safe_int(r.get("fallecidos")),
            "desaparecidos":  _safe_int(r.get("desaparecidos")),
            "heridos":        _safe_int(r.get("heridos")),
            "damnificados":   _safe_int(r.get("damnificados")),
            "afectados":      _safe_int(r.get("afectados")),
            "viviendas_dest":  _safe_int(r.get("viviendas_dest")),
            "viviendas_afect": _safe_int(r.get("viviendas_afect")),
            "costo_ayuda":    _safe_float(r.get("costo_ayuda")),
        })
    return rows


def upsert_rows(rows: list[dict], replace: bool) -> int:
    conn = psycopg2.connect(DB_URL)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(DDL)
                if replace:
                    cur.execute("TRUNCATE historical.sinpad_events RESTART IDENTITY")
                    log.info("Existing records cleared (--replace)")

                psycopg2.extras.execute_batch(
                    cur,
                    """
                    INSERT INTO historical.sinpad_events
                        (sinpad_code, event_date, year, month, dpto, provincia,
                         distrito, ubigeo, region_natural, event_type,
                         fallecidos, desaparecidos, heridos, damnificados, afectados,
                         viviendas_dest, viviendas_afect, costo_ayuda)
                    VALUES
                        (%(sinpad_code)s, %(event_date)s, %(year)s, %(month)s,
                         %(dpto)s, %(provincia)s, %(distrito)s, %(ubigeo)s,
                         %(region_natural)s, %(event_type)s,
                         %(fallecidos)s, %(desaparecidos)s, %(heridos)s,
                         %(damnificados)s, %(afectados)s,
                         %(viviendas_dest)s, %(viviendas_afect)s, %(costo_ayuda)s)
                    ON CONFLICT DO NOTHING
                    """,
                    rows,
                    page_size=500,
                )
        log.info("Committed %d rows", len(rows))
        return len(rows)
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Load SINPAD historical records into PostGIS")
    parser.add_argument("--excel", help="Path to SINPAD Excel file (auto-detected if omitted)")
    parser.add_argument("--year", type=int, help="Filter to a single year (e.g. 2017)")
    parser.add_argument("--all-depts", action="store_true", help="Include all departments (default: Lima only)")
    parser.add_argument("--replace", action="store_true", help="Truncate table before loading")
    parser.add_argument("--dry-run", action="store_true", help="Parse only, no DB writes")
    args = parser.parse_args()

    excel_path = args.excel or find_excel()
    df = load_excel(excel_path, lima_only=not args.all_depts, year_filter=args.year)

    if df.empty:
        log.warning("No rows matched filters: nothing to load")
        sys.exit(0)

    rows = df_to_rows(df)
    log.info("Prepared %d rows for insert", len(rows))

    # Summary
    if "event_type" in df.columns:
        top = df["event_type"].value_counts().head(8)
        log.info("Top event types:\n%s", top.to_string())
    if "year" in df.columns:
        years = sorted(df["year"].dropna().unique())
        log.info("Years covered: %s … %s", years[0] if years else "?", years[-1] if years else "?")

    total_afectados = sum(r["afectados"] for r in rows)
    total_fallecidos = sum(r["fallecidos"] for r in rows)
    log.info("Total afectados: %d | Fallecidos: %d", total_afectados, total_fallecidos)

    if args.dry_run:
        log.info("Dry-run: no DB writes")
        return

    inserted = upsert_rows(rows, replace=args.replace)
    log.info("Done. %d records loaded into historical.sinpad_events", inserted)


if __name__ == "__main__":
    main()
