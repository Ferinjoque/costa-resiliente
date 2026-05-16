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


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Costa Resiliente API starting up")
    try:
        await maybe_seed(engine)
    except Exception as exc:
        logger.warning("auto_seed failed (DB may not be ready yet): %s", exc)
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
