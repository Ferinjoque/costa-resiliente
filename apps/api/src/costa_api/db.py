"""Async SQLAlchemy engines + session factories for costa_api.

Two engines:
  engine          — full read/write, POSTGRES_USER (costa)
  ai_engine       — SELECT-only, POSTGRES_AI_USER (costa_ai_ro)
                    Used exclusively by the AI tool layer. No writes possible.
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from costa_api.config import settings

# ── Main R/W engine ───────────────────────────────────────────────────────────
engine = create_async_engine(
    settings.database_url,
    echo=settings.app_env == "development",
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
)
AsyncSessionFactory = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a full R/W async DB session."""
    async with AsyncSessionFactory() as session:
        yield session


# ── Read-only AI engine ───────────────────────────────────────────────────────
ai_engine = create_async_engine(
    settings.database_ai_url,
    echo=False,
    pool_size=3,
    max_overflow=5,
)
AiSessionFactory = async_sessionmaker(ai_engine, expire_on_commit=False)


async def get_ai_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a READ-ONLY session for AI tools."""
    async with AiSessionFactory() as session:
        yield session


@asynccontextmanager
async def get_ai_db_session():
    """Context-manager version for non-FastAPI callers (e.g. rag.py)."""
    async with AiSessionFactory() as session:
        yield session
