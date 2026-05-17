"""Prefect deployment schedules for all Costa Resiliente flows."""
import os

from prefect import flow, serve

from costa_workers.ingest.sentinel1 import ingest_sentinel1_flow
from costa_workers.ingest.imerg import ingest_imerg_flow
from costa_workers.ingest.social import ingest_social_flow
from costa_workers.ingest.ana_scraper import ingest_hydro_stations_flow
from costa_workers.ingest.flood_pipeline import flood_segmentation_flow
from costa_workers.ml.alert_generator import generate_alerts_flow


# ─── Thin wrappers for plain-async pipelines ─────────────────────────────────

@flow(name="run-triage", log_prints=True)
async def triage_flow() -> dict:
    """Schedule wrapper: run LLM triage on untriaged social signals."""
    from costa_workers.ml.triage import run_triage_pipeline

    return await run_triage_pipeline(
        db_dsn=os.getenv("DATABASE_URL", "postgresql://costa:costa@postgres:5432/costa_resiliente"),
        ollama_host=os.getenv("LLM_BASE_URL", "http://ollama:11434"),
        model=os.getenv("LLM_FAST_MODEL", "gemma2:2b"),
    )


@flow(name="run-huayco-susceptibility", log_prints=True)
async def huayco_flow() -> dict:
    """Schedule wrapper: run XGBoost susceptibility for all quebradas."""
    from costa_workers.ml.huayco_model import HuaycoModel, run_huayco_susceptibility

    db_dsn = os.getenv("DATABASE_URL", "postgresql://costa:costa@postgres:5432/costa_resiliente")
    model = HuaycoModel.load()
    results = await run_huayco_susceptibility(db_dsn=db_dsn, model=model)
    return {"quebradas_updated": len(results)}


# ─── Deployment registry ──────────────────────────────────────────────────────

@flow(name="index-protocols-rag", log_prints=True)
async def rag_index_flow() -> dict:
    """Index protocol documents into pgvector for RAG search (idempotent)."""
    from costa_workers.rag.ingest import index_protocols
    return await index_protocols()


def deploy_all() -> None:
    """Register all flows with Prefect server and start serving."""

    serve(
        # Satellite ingest — daily at 06:00 UTC (01:00 Lima)
        ingest_sentinel1_flow.to_deployment(
            name="sentinel1-daily",
            cron="0 6 * * *",
            parameters={"lookback_days": 3},
            tags=["ingest", "satellite"],
        ),
        # Rainfall — every hour, 25h lookback covers IMERG lag
        ingest_imerg_flow.to_deployment(
            name="imerg-hourly",
            interval=3600,
            parameters={"lookback_hours": 25},
            tags=["ingest", "rainfall"],
        ),
        # Hydro stations (ANA + SENAMHI) — every hour
        ingest_hydro_stations_flow.to_deployment(
            name="hydro-stations-hourly",
            interval=3600,
            tags=["ingest", "hydro"],
        ),
        # Social signals (Bluesky + RSS) — every 15 minutes
        ingest_social_flow.to_deployment(
            name="social-15min",
            interval=900,
            tags=["ingest", "social"],
        ),
        # Flood segmentation — every hour (processes new pgstac scenes)
        flood_segmentation_flow.to_deployment(
            name="flood-seg-hourly",
            interval=3600,
            tags=["ml", "flood"],
        ),
        # Huayco susceptibility — every hour
        huayco_flow.to_deployment(
            name="huayco-hourly",
            interval=3600,
            tags=["ml", "huayco"],
        ),
        # LLM triage — every 15 minutes (matches social ingest cadence)
        triage_flow.to_deployment(
            name="triage-15min",
            interval=900,
            tags=["ml", "triage"],
        ),
        # Alert generation — every 5 minutes
        generate_alerts_flow.to_deployment(
            name="alerts-5min",
            interval=300,
            tags=["ml", "alerts"],
        ),
        # RAG protocol index — daily at 02:00 UTC (idempotent, skips unchanged chunks)
        rag_index_flow.to_deployment(
            name="rag-index-daily",
            cron="0 2 * * *",
            tags=["rag", "ai"],
        ),
    )


if __name__ == "__main__":
    deploy_all()
