"""Operator-sourced social signals.

POST /api/v1/social/field-report — duty officer in the field reports a hazard
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
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.db import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/social", tags=["social"])

_ALLOWED_LABELS = {
    "needs_help",
    "road_blocked",
    "infrastructure_damage",
    "huayco_observation",   # debris flow / quebrada surge sighting — primary Lima hazard type
    "flood_observation",    # standing water / inundation sighting
    "weather_observation",
    "false_alarm",
    "irrelevant",
}


class FieldReport(BaseModel):
    operator_id: str = Field(..., min_length=1, max_length=64)
    text: str = Field(..., min_length=1, max_length=2000)
    label: str
    district_ubigeo: Optional[str] = None
    session_id: Optional[str] = None


@router.post("/field-report", status_code=201)
async def submit_field_report(body: FieldReport, db: AsyncSession = Depends(get_db)) -> dict:
    if body.label not in _ALLOWED_LABELS:
        raise HTTPException(400, f"Invalid label. Must be one of: {sorted(_ALLOWED_LABELS)}")

    text_clean = body.text.strip()
    if not text_clean:
        raise HTTPException(400, "Empty report text")

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
        f"campo:{body.operator_id}:{text_clean}".encode()
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
            "operator_id": body.operator_id,
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
        raise HTTPException(409, "Duplicate report")

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
            "op": body.operator_id,
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
