"""Operator-sourced social signals.

POST /api/v1/social/field-report: duty officer in the field reports a hazard
sighting that doesn't yet exist in any RSS / Bluesky / Reddit feed. We treat
it as a first-class `social.signals` row with source='campo' so it shows up
in the live signal layer and counts toward dashboards / fusion, AND we
append-only-log the act to ops.decision_log so the audit trail names the
operator who reported it.

This closes the gap that existed before Session 6: the FieldReport UI was
performing an optimistic update with no persistence, so any refresh dropped
the report.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.config import settings
from costa_api.db import get_db
from costa_api.routers.auth import require_operator, CurrentOperator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/social", tags=["social"])

_FIELD_REPORT_RATE_LIMIT = 30
_FIELD_REPORT_RATE_WINDOW = 3600
_social_rl_client: aioredis.Redis | None = None


def _get_social_rl_client() -> aioredis.Redis | None:
    global _social_rl_client
    if _social_rl_client is None:
        try:
            _social_rl_client = aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=1,
            )
        except Exception as exc:
            logger.warning("[social] Redis rate-limiter init failed: %s", exc)
    return _social_rl_client


async def _check_field_report_rate(operator_id: str) -> None:
    """Raise 429 if operator exceeds field-report limit. Fails open on Redis outage."""
    if os.environ.get("TESTING", "0") == "1":
        return
    client = _get_social_rl_client()
    if client is None:
        return
    key = f"costa:social:fieldreport:{operator_id}"
    try:
        count = await client.incr(key)
        if count == 1:
            await client.expire(key, _FIELD_REPORT_RATE_WINDOW)
        if count > _FIELD_REPORT_RATE_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiados reportes de campo. Espere antes de enviar más.",
                headers={"Retry-After": str(_FIELD_REPORT_RATE_WINDOW)},
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("[social] Rate-limit check failed (fail-open): %s", exc)

_ALLOWED_LABELS = {
    "needs_help",
    "road_blocked",
    "infrastructure_damage",
    "huayco_observation",   # debris flow / quebrada surge sighting, primary Lima hazard type
    "flood_observation",    # standing water / inundation sighting
    "weather_observation",
    "false_alarm",
    "irrelevant",
}


class FieldReport(BaseModel):
    # operator_id accepted for backwards-compatibility but IGNORED. JWT identity
    # (op.username) is always used so reports cannot be forged under another name.
    operator_id: Optional[str] = Field(None, max_length=64)
    text: str = Field(..., min_length=1, max_length=2000)
    label: str = Field(..., min_length=1, max_length=40)
    district_ubigeo: Optional[str] = Field(None, max_length=12)
    session_id: Optional[str] = Field(None, max_length=64)


@router.post("/field-report", status_code=201)
async def submit_field_report(
    body: FieldReport,
    db: AsyncSession = Depends(get_db),
    op: CurrentOperator = Depends(require_operator),
) -> dict:
    await _check_field_report_rate(op.username)
    await db.execute(text("SET LOCAL statement_timeout = '5000'"))

    if body.label not in _ALLOWED_LABELS:
        raise HTTPException(400, f"Invalid label. Must be one of: {sorted(_ALLOWED_LABELS)}")

    text_clean = body.text.strip()
    if not text_clean:
        raise HTTPException(400, "Empty report text")

    # Use JWT identity so reports cannot be forged under another operator's name
    operator_id = op.username

    # Lookup district by ubigeo
    district_id: Optional[int] = None
    if body.district_ubigeo:
        row = (
            await db.execute(
                text("SELECT id FROM geo.districts WHERE ubigeo = :u"),
                {"u": body.district_ubigeo},
            )
        ).first()
        if row:
            district_id = row.id

    # Hash excludes timestamp so identical text from same operator deduplicates
    # even if submitted multiple times (e.g., double-click or network retry).
    content_hash = hashlib.sha256(
        f"campo:{operator_id}:{text_clean}".encode()
    ).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(days=30)

    insert_result = await db.execute(
        text(
            """
            INSERT INTO social.signals
                (source, source_id, content_hash, published_at, content_redacted,
                 location_raw, district_id, triage_label, triage_confidence,
                 triage_model, triage_at, expires_at)
            VALUES
                ('campo', :operator_id, :hash, NOW(), :body, :loc, :did,
                 :label, 1.0, 'operator_assertion', NOW(), :expires)
            ON CONFLICT (content_hash) DO NOTHING
            RETURNING id, ingested_at
            """
        ),
        {
            "operator_id": operator_id,
            "hash": content_hash,
            "body": text_clean,
            "loc": body.district_ubigeo,
            "did": district_id,
            "label": body.label,
            "expires": expires_at,
        },
    )
    inserted = insert_result.first()
    if not inserted:
        # Duplicate submission (same operator + same text already stored).
        # Return the existing record so the caller is idempotent, operator
        # retrying after a transient error doesn't see a confusing 409.
        existing = (
            await db.execute(
                text("SELECT id, ingested_at FROM social.signals WHERE content_hash = :h"),
                {"h": content_hash},
            )
        ).first()
        if existing:
            return {"signal_id": existing.id, "ingested_at": existing.ingested_at.isoformat() if existing.ingested_at else None, "status": "duplicate"}
        raise HTTPException(500, "Duplicate signal but existing record not found")

    # Audit log
    payload = {
        "signal_id": inserted.id,
        "label": body.label,
        "district_ubigeo": body.district_ubigeo,
        "text_preview": text_clean[:200],
        "source": "campo",
    }
    await db.execute(
        text(
            """
            INSERT INTO ops.decision_log
                (operator_id, action_type, payload, session_id)
            VALUES (:op, 'field_report', CAST(:payload AS jsonb), :session)
            """
        ),
        {
            "op": operator_id,
            "payload": json.dumps(payload, default=str, ensure_ascii=False),
            "session": body.session_id,
        },
    )
    await db.commit()
    return {
        "signal_id": inserted.id,
        "ingested_at": inserted.ingested_at.isoformat() if inserted.ingested_at else None,
        "status": "stored",
    }
