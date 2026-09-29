"""Prefect deployment schedules for all Costa Resiliente flows.

Run this script to register all deployments and start the inline runner:
  python -m costa_workers.flows.schedules

The runner polls the Prefect server and executes flows in-process.
No separate work pool is required: serve() handles both registration + execution.
"""
import os

from prefect import flow, serve

logger_name = "costa_workers.flows.schedules"

# ─── Thin wrappers for plain-async pipelines ─────────────────────────────────

@flow(name="run-triage", log_prints=True)
async def triage_flow() -> dict:
    """Run LLM triage on untriaged social signals."""
    from costa_workers.ml.triage import run_triage_pipeline

    return await run_triage_pipeline(
        db_dsn=os.getenv("DATABASE_URL", f"postgresql://{os.getenv('POSTGRES_USER','costa')}:{os.getenv('POSTGRES_PASSWORD','change_me_in_production')}@{os.getenv('POSTGRES_HOST','postgres')}:{os.getenv('POSTGRES_PORT','5432')}/{os.getenv('POSTGRES_DB','costa_resiliente')}"),
        ollama_host=os.getenv("LLM_BASE_URL", "http://ollama:11434"),
        # Use TRIAGE_MODEL if set, fall back to LLM_PRIMARY_MODEL then gemma2:2b
        model=os.getenv("TRIAGE_MODEL", os.getenv("LLM_PRIMARY_MODEL", "gemma2:2b")),
    )


@flow(name="run-huayco-susceptibility", log_prints=True)
async def huayco_flow() -> dict:
    """Score today and tomorrow with the trained mass-movement model.

    This used to run the quebrada-level XGBoost, which has no training data and
    wrote the same 0.5344 for every quebrada each hour, overwriting the demo
    scenario until the seeder put it back. The district model below is trained
    on the SINPAD inventory and validated on 2017-2020; it writes to
    ml.mass_movement_risk and leaves the labelled scenario layer alone.
    """
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    from costa_workers.ml.mass_movement import score

    today = datetime.now(ZoneInfo("America/Lima")).date()
    rows = await score([today, today + timedelta(days=1)], "live", "open-meteo")
    return {"district_days_scored": rows}


@flow(name="index-protocols-rag", log_prints=True)
async def rag_index_flow() -> dict:
    """Index protocol documents into pgvector for RAG search (idempotent)."""
    from costa_workers.rag.ingest import index_protocols
    return await index_protocols()


@flow(name="run-retention", log_prints=True)
async def retention_flow() -> dict:
    """Prune expired rows from social.signals, alerts, share_tokens, security_events."""
    from costa_workers.flows.retention import run_retention
    return await run_retention()


# ─── Main entry point ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    from costa_workers.ingest.sentinel1 import ingest_sentinel1_flow
    from costa_workers.ingest.imerg import ingest_imerg_flow
    from costa_workers.ingest.social import ingest_social_flow
    from costa_workers.ingest.ana_scraper import ingest_hydro_stations_flow
    from costa_workers.ingest.weather import ingest_weather_flow
    from costa_workers.ingest.flood_pipeline import flood_segmentation_flow
    from costa_workers.ml.alert_generator import generate_alerts_flow

    serve(
        # Satellite ingest, daily at 06:00 UTC (01:00 Lima)
        ingest_sentinel1_flow.to_deployment(
            name="sentinel1-daily",
            cron="0 6 * * *",
            parameters={"lookback_days": 3},
            tags=["ingest", "satellite"],
        ),
        # Real IMERG Early Run: every hour. Only granules not yet cached are
        # downloaded (~8 MB each); the first run backfills 72 h, ~1.2 GB.
        ingest_imerg_flow.to_deployment(
            name="imerg-hourly",
            interval=3600,
            parameters={"lookback_hours": 72},
            tags=["ingest", "rainfall"],
        ),
        # Hydro stations (ANA + SENAMHI): every 30 minutes
        ingest_hydro_stations_flow.to_deployment(
            name="hydro-stations-30min",
            interval=1800,
            tags=["ingest", "hydro"],
        ),
        # Current weather (Open-Meteo): every 15 minutes, matching the upstream
        # refresh interval. Keyless and free, so this cadence costs nothing.
        ingest_weather_flow.to_deployment(
            name="weather-15min",
            interval=900,
            tags=["ingest", "weather"],
        ),
        # Social signals (Bluesky + RSS + Reddit + Telegram): every 15 minutes
        ingest_social_flow.to_deployment(
            name="social-15min",
            interval=900,
            tags=["ingest", "social"],
        ),
        # Flood segmentation: every hour (processes new pgstac scenes)
        flood_segmentation_flow.to_deployment(
            name="flood-seg-hourly",
            interval=3600,
            tags=["ml", "flood"],
        ),
        # Trained mass-movement model, live scoring: every hour (one Open-Meteo
        # call for 21 grid cells; the forecast itself refreshes hourly at best)
        huayco_flow.to_deployment(
            name="huayco-hourly",
            interval=3600,
            tags=["ml", "huayco"],
        ),
        # LLM triage: every 15 minutes (matches social ingest cadence)
        triage_flow.to_deployment(
            name="triage-15min",
            interval=900,
            tags=["ml", "triage"],
        ),
        # Alert generation: every 5 minutes
        generate_alerts_flow.to_deployment(
            name="alerts-5min",
            interval=300,
            tags=["ml", "alerts"],
        ),
        # RAG protocol index, daily at 02:00 UTC (idempotent)
        rag_index_flow.to_deployment(
            name="rag-index-daily",
            cron="0 2 * * *",
            tags=["rag", "ai"],
        ),
        # Data retention, daily at 03:00 UTC (prune expired signals, alerts, tokens)
        retention_flow.to_deployment(
            name="retention-daily",
            cron="0 3 * * *",
            tags=["ops", "retention"],
        ),
    )
