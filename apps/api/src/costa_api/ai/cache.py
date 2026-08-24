"""Redis-backed result cache for AI tool dispatch.

Keyed by (tool_name, sorted_args_json).  TTLs are per-tool: static data
(infrastructure) stays cached longer; live data (alerts, river levels)
expires quickly.

Falls back silently: a Redis outage never breaks the copilot.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

import redis.asyncio as aioredis

from costa_api.config import settings

logger = logging.getLogger(__name__)

# Per-tool TTL in seconds. Zero = skip cache for that tool.
_TTL: dict[str, int] = {
    "get_flood_polygons": 300,        # 5 min. SAR acquired daily
    "get_huayco_risk": 600,           # 10 min. XGBoost runs hourly
    "get_river_levels": 60,           # 1 min, scraper runs every 15 min
    "get_social_clusters": 120,       # 2 min, social ingestion every 15 min
    "get_infrastructure_impact": 1800, # 30 min, spatial join, static infra
    "get_rainfall_accumulation": 300,  # 5 min. IMERG every 30 min
    "get_active_alerts": 30,           # 30 s, alerts change frequently
    "search_protocols": 3600,          # 1 hour, protocol docs are static
    "get_population_at_risk": 300,     # 5 min, depends on flood polygons
}

_PREFIX = "costa:ai:tool"

_client: aioredis.Redis | None = None


def _get_client() -> aioredis.Redis | None:
    global _client
    if _client is None:
        try:
            _client = aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=1,
            )
        except Exception as exc:
            logger.warning("Redis cache init failed: %s", exc)
    return _client


def _cache_key(tool_name: str, args: dict) -> str:
    canon = json.dumps(args, sort_keys=True, default=str)
    digest = hashlib.md5(canon.encode()).hexdigest()[:12]
    return f"{_PREFIX}:{tool_name}:{digest}"


async def get_cached(tool_name: str, args: dict) -> dict | None:
    ttl = _TTL.get(tool_name, 0)
    if ttl == 0:
        return None
    client = _get_client()
    if client is None:
        return None
    try:
        raw = await client.get(_cache_key(tool_name, args))
        if raw:
            return json.loads(raw)
    except Exception as exc:
        logger.debug("Cache GET miss/error for %s: %s", tool_name, exc)
    return None


async def set_cached(tool_name: str, args: dict, result: dict) -> None:
    ttl = _TTL.get(tool_name, 0)
    if ttl == 0:
        return
    client = _get_client()
    if client is None:
        return
    try:
        await client.setex(
            _cache_key(tool_name, args),
            ttl,
            json.dumps(result, default=str),
        )
    except Exception as exc:
        logger.debug("Cache SET error for %s: %s", tool_name, exc)


async def invalidate(tool_name: str) -> int:
    """Delete all cached entries for a given tool (e.g. after new alert inserted)."""
    client = _get_client()
    if client is None:
        return 0
    try:
        pattern = f"{_PREFIX}:{tool_name}:*"
        keys = await client.keys(pattern)
        if keys:
            return await client.delete(*keys)
    except Exception as exc:
        logger.debug("Cache invalidate error for %s: %s", tool_name, exc)
    return 0
