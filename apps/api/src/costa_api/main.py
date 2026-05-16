import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from costa_api.auto_seed import maybe_seed
from costa_api.config import settings
from costa_api.db import engine
from costa_api.routers import districts, health, layers, alerts, copilot, share, fusion

logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)


async def _seed_with_retry(max_attempts: int = 5, delay: float = 5.0) -> None:
    """Retry auto_seed up to max_attempts times — Postgres may need a moment after healthcheck passes."""
    for attempt in range(1, max_attempts + 1):
        try:
            await maybe_seed(engine)
            return
        except Exception as exc:
            if attempt < max_attempts:
                logger.warning(
                    "auto_seed attempt %d/%d failed (%s) — retrying in %.0fs",
                    attempt, max_attempts, exc, delay,
                )
                await asyncio.sleep(delay)
            else:
                logger.error("auto_seed failed after %d attempts: %s", max_attempts, exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Costa Resiliente API starting up")
    await _seed_with_retry()
    yield
    logger.info("Costa Resiliente API shutting down")


app = FastAPI(
    title="Costa Resiliente API",
    description="Near-real-time flood and huayco awareness for Lima Metropolitana",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(districts.router, prefix="/api/v1")
app.include_router(layers.router, prefix="/api/v1")
app.include_router(alerts.router, prefix="/api/v1")
app.include_router(copilot.router, prefix="/api/v1")
app.include_router(share.router, prefix="/api/v1")
app.include_router(fusion.router, prefix="/api/v1")
