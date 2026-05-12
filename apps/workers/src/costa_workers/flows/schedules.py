"""Prefect deployment schedules for all Costa Resiliente flows."""
from prefect import serve
from costa_workers.ingest.sentinel1 import ingest_sentinel1_flow
from costa_workers.ingest.imerg import ingest_imerg_flow
from costa_workers.ingest.social import ingest_social_flow


def deploy_all():
    """Register all flows with Prefect server and set schedules."""
    sentinel1_deployment = ingest_sentinel1_flow.to_deployment(
        name="sentinel1-daily",
        cron="0 6 * * *",  # 06:00 UTC daily (01:00 Lima time)
        parameters={"lookback_days": 3},
        tags=["ingest", "satellite"],
    )

    imerg_deployment = ingest_imerg_flow.to_deployment(
        name="imerg-hourly",
        interval=3600,  # every hour
        parameters={"lookback_hours": 25},
        tags=["ingest", "rainfall"],
    )

    social_deployment = ingest_social_flow.to_deployment(
        name="social-15min",
        interval=900,  # every 15 minutes
        tags=["ingest", "social"],
    )

    serve(sentinel1_deployment, imerg_deployment, social_deployment)


if __name__ == "__main__":
    deploy_all()
