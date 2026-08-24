import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from costa_api.auto_seed import maybe_seed
from costa_api.config import settings
from costa_api.db import engine
from costa_api.routers import districts, health, layers, alerts, copilot, share, fusion, proposals, notifications, auth, social

logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)


async def _seed_with_retry(max_attempts: int = 5, delay: float = 5.0) -> None:
    """Retry auto_seed up to max_attempts times: Postgres may need a moment after healthcheck passes."""
    for attempt in range(1, max_attempts + 1):
        try:
            await maybe_seed(engine)
            return
        except Exception as exc:
            if attempt < max_attempts:
                logger.warning(
                    "auto_seed attempt %d/%d failed (%s): retrying in %.0fs",
                    attempt, max_attempts, exc, delay,
                )
                await asyncio.sleep(delay)
            else:
                logger.error("auto_seed failed after %d attempts: %s", max_attempts, exc)


_DEFAULT_SECRETS = {
    "dev-secret-change-me",
    "dev-share-secret-change-me",
    "change_me_in_production",
    "costa-dev-secret-change-in-prod",
}


def _warn_default_secrets() -> None:
    """Log loud warnings if any secrets still use default placeholder values."""
    checks = {
        "APP_SECRET_KEY": settings.app_secret_key,
        "JWT_SECRET": settings.jwt_secret,
        "SHARE_TOKEN_SECRET": settings.share_token_secret,
        "POSTGRES_PASSWORD": settings.postgres_password,
        "POSTGRES_AI_PASSWORD": settings.postgres_ai_password,
    }
    for name, value in checks.items():
        if value in _DEFAULT_SECRETS:
            if settings.app_env == "production":
                raise RuntimeError(
                    f"{name} is still set to a default placeholder value, "
                    "refusing to start in production with insecure credentials."
                )
            logger.warning("SECURITY: %s uses a default placeholder value, change before production deploy", name)


async def _sync_ai_role_password() -> None:
    """Keep costa_ai_ro DB role password in sync with POSTGRES_AI_PASSWORD env var.

    ai_migration.sql creates the role with 'change_me_in_production' as a
    placeholder. Without this call the role password and the env var diverge in
    any non-default deployment, breaking the AI read-only DB connection.
    Skips silently in dev (default placeholder) so local dev boots without a DB.
    """
    pwd = settings.postgres_ai_password
    if pwd in _DEFAULT_SECRETS:
        logger.debug("_sync_ai_role_password: skipping (default placeholder, dev mode)")
        return

    try:
        async with engine.connect() as conn:
            # Use text() with a literal value: ALTER ROLE does not support
            # parameterized placeholders in PostgreSQL for the PASSWORD clause.
            safe_pwd = pwd.replace("'", "''")  # rudimentary escaping; pwd from env, not user input
            await conn.execute(text(f"ALTER ROLE costa_ai_ro PASSWORD '{safe_pwd}'"))
            await conn.commit()
            logger.info("_sync_ai_role_password: costa_ai_ro password synced")
    except Exception as exc:
        logger.warning("_sync_ai_role_password: failed to sync costa_ai_ro password: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Costa Resiliente API starting up")
    _warn_default_secrets()
    await _sync_ai_role_password()
    await _seed_with_retry()
    await auth.seed_demo_operators()
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
app.include_router(proposals.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(social.router, prefix="/api/v1")
