"""Share tokens — mint + resolve read-only scenario snapshots for judges/public."""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.config import settings
from costa_api.db import get_db

router = APIRouter(prefix="/share", tags=["share"])


# ─── Schema ───────────────────────────────────────────────────────────────────

class ScenarioSnapshot(BaseModel):
    districtUbigeo: str | None = None
    districtName: str | None = None
    timeWindowHours: int = 24
    isReplayMode: bool = False
    replayDate: str | None = None
    activeLayers: list[str] = ["districts", "imerg", "infrastructure"]


class MintRequest(BaseModel):
    scenario: ScenarioSnapshot


class MintResponse(BaseModel):
    token: str
    url: str
    expires_at: datetime


class ResolveResponse(BaseModel):
    scenario: ScenarioSnapshot
    created_at: datetime
    expires_at: datetime


# ─── Helpers ──────────────────────────────────────────────────────────────────

_ALLOWED_LAYERS = {
    "districts", "imerg", "flood", "huayco",
    "hazard", "infrastructure", "social",
}

def _validate_scenario(s: ScenarioSnapshot) -> None:
    bad = set(s.activeLayers) - _ALLOWED_LAYERS
    if bad:
        raise HTTPException(400, f"Unknown layer keys: {sorted(bad)}")
    if s.timeWindowHours not in (1, 3, 6, 12, 24, 72):
        raise HTTPException(400, "timeWindowHours must be one of 1,3,6,12,24,72")


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("", response_model=MintResponse, status_code=201)
async def mint_share_token(
    body: MintRequest,
    db: AsyncSession = Depends(get_db),
) -> MintResponse:
    """Mint a share token capturing a scenario snapshot.

    No authentication required — any client can create a read-only link.
    Rate-limiting should be added at the reverse-proxy layer (Caddy/nginx).
    """
    _validate_scenario(body.scenario)

    token = secrets.token_urlsafe(24)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.share_token_ttl_days)
    scenario_dict: dict[str, Any] = body.scenario.model_dump()

    await db.execute(
        text(
            "INSERT INTO ops.share_tokens (token, scenario, expires_at) "
            "VALUES (:token, CAST(:scenario AS JSONB), :expires_at)"
        ),
        {"token": token, "scenario": json.dumps(scenario_dict), "expires_at": expires_at},
    )
    await db.commit()

    base_url = settings.app_cors_origins.split(",")[0].strip().rstrip("/")
    return MintResponse(
        token=token,
        url=f"{base_url}/?share={token}",
        expires_at=expires_at,
    )


@router.get("/{token}", response_model=ResolveResponse)
async def resolve_share_token(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> ResolveResponse:
    """Resolve a share token → scenario state.

    Returns 404 for unknown tokens and 410 for expired tokens.
    Records `accessed_at` timestamp for audit.
    """
    if len(token) > 64 or not token.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(404, "Invalid token format")

    row = await db.execute(
        text(
            "UPDATE ops.share_tokens SET accessed_at = NOW() "
            "WHERE token = :token "
            "RETURNING scenario, created_at, expires_at"
        ),
        {"token": token},
    )
    record = row.mappings().first()

    if not record:
        raise HTTPException(404, "Share token not found")

    if record["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(410, "Share token has expired")

    await db.commit()

    return ResolveResponse(
        scenario=ScenarioSnapshot(**record["scenario"]),
        created_at=record["created_at"],
        expires_at=record["expires_at"],
    )
