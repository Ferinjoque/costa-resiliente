"""HITL Alert Proposals — AI proposes, human approves.

The copilot can call propose_alert() which writes to ops.alert_proposals
(status=pending).  An operator reviews via this router and approves/rejects.
Only on approval does the record move into ops.alerts (the real alert feed).

Endpoints:
  GET  /proposals                   — list pending proposals
  POST /proposals                   — create proposal (internal, from copilot tool)
  POST /proposals/{id}/approve      — operator approval → insert into ops.alerts
  POST /proposals/{id}/reject       — operator rejection
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.db import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/proposals", tags=["proposals"])


class ProposalCreate(BaseModel):
    severity: str = Field(..., min_length=1, max_length=20)
    alert_type: str = Field(..., min_length=1, max_length=40)
    district_ubigeo: Optional[str] = Field(None, max_length=12)
    title: str = Field(..., min_length=1, max_length=200)
    summary: str = Field(..., min_length=1, max_length=2000)
    source_refs: Optional[list[dict]] = None


class ProposalReview(BaseModel):
    operator_id: str = Field(..., min_length=1, max_length=100)
    notes: Optional[str] = Field(None, max_length=2000)


# ─── List pending ─────────────────────────────────────────────────────────────

@router.get("")
async def list_proposals(db: AsyncSession = Depends(get_db)) -> list[dict]:
    # Excludes obvious test residue (XSS/SQL-injection seeds, empty titles,
    # 'Test Flood Alert' fixtures) from the operator-facing list. The rows
    # remain in the table for audit; they're just hidden from the duty
    # officer who has no business reviewing test data.
    result = await db.execute(text("""
        SELECT id, severity, alert_type, district_ubigeo,
               title, summary, source_refs, status, created_at
        FROM ops.alert_proposals
        WHERE status = 'pending'
          AND title IS NOT NULL AND title <> ''
          AND title NOT LIKE 'Test %'
          AND title NOT LIKE '<%>%'
          AND title NOT LIKE '%DROP TABLE%'
          AND COALESCE(summary, '') NOT LIKE 'Automated test%'
        ORDER BY
            CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                          WHEN 'medium' THEN 2 ELSE 3 END,
            created_at DESC
        LIMIT 50
    """))
    return [dict(r._mapping) for r in result]


# ─── Create (internal — called by copilot tool propose_alert) ────────────────

@router.post("", status_code=201)
async def create_proposal(body: ProposalCreate, db: AsyncSession = Depends(get_db)) -> dict:
    if body.severity not in ("critical", "high", "medium", "low"):
        raise HTTPException(400, "Invalid severity")
    refs_json = json.dumps(body.source_refs or [], default=str)
    result = await db.execute(
        text("""
            INSERT INTO ops.alert_proposals
                (severity, alert_type, district_ubigeo, title, summary, source_refs)
            VALUES (:sev, :atype, :ubigeo, :title, :summary, CAST(:refs AS jsonb))
            RETURNING id, created_at
        """),
        {
            "sev": body.severity,
            "atype": body.alert_type,
            "ubigeo": body.district_ubigeo,
            "title": body.title,
            "summary": body.summary,
            "refs": refs_json,
        },
    )
    await db.commit()
    row = result.fetchone()
    if not row:
        raise HTTPException(500, "Failed to create proposal")
    return {"id": row.id, "status": "pending", "created_at": row.created_at}


# ─── Approve ─────────────────────────────────────────────────────────────────

@router.post("/{proposal_id}/approve")
async def approve_proposal(
    proposal_id: int,
    review: ProposalReview,
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Atomically claim the proposal — prevents double-approve race condition.
    # If two requests arrive simultaneously, only one UPDATE sees status='pending'.
    claimed = await db.execute(
        text("""
            UPDATE ops.alert_proposals
            SET status='approved', reviewed_by=:op, reviewed_at=NOW()
            WHERE id=:id AND status='pending'
            RETURNING *
        """),
        {"op": review.operator_id, "id": proposal_id},
    )
    p_row = claimed.fetchone()
    if not p_row:
        raise HTTPException(404, "Proposal not found or already reviewed")

    p = dict(p_row._mapping)
    refs_json = json.dumps(p.get("source_refs") or [], default=str)

    alert_result = await db.execute(
        text("""
            INSERT INTO ops.alerts
                (type, severity, status, title, description, district_id, source_refs)
            VALUES (
                :atype, :sev, 'active', :title, :desc,
                (SELECT id FROM geo.districts WHERE ubigeo = :ubigeo),
                CAST(:refs AS jsonb)
            )
            RETURNING id
        """),
        {
            "atype": p["alert_type"],
            "sev": p["severity"],
            "title": p["title"],
            "desc": p["summary"],
            "ubigeo": p["district_ubigeo"],
            "refs": refs_json,
        },
    )
    alert_row = alert_result.fetchone()
    if not alert_row:
        raise HTTPException(500, "Failed to create alert from proposal")
    alert_id = alert_row.id

    payload_json = json.dumps(
        {"proposal_id": proposal_id, "alert_id": alert_id, "notes": review.notes},
        default=str,
    )
    await db.execute(
        text("""
            INSERT INTO ops.decision_log (operator_id, action_type, payload)
            VALUES (:op, 'approve_proposal', CAST(:payload AS jsonb))
        """),
        {"op": review.operator_id, "payload": payload_json},
    )
    await db.commit()
    return {"alert_id": alert_id, "proposal_id": proposal_id, "status": "approved"}


# ─── Reject ──────────────────────────────────────────────────────────────────

@router.post("/{proposal_id}/reject")
async def reject_proposal(
    proposal_id: int,
    review: ProposalReview,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        text("""
            UPDATE ops.alert_proposals
            SET status='rejected', reviewed_by=:op, reviewed_at=NOW()
            WHERE id=:id AND status='pending'
            RETURNING id
        """),
        {"op": review.operator_id, "id": proposal_id},
    )
    if not result.fetchone():
        raise HTTPException(404, "Proposal not found or already reviewed")

    payload_json = json.dumps(
        {"proposal_id": proposal_id, "notes": review.notes}, default=str
    )
    await db.execute(
        text("""
            INSERT INTO ops.decision_log (operator_id, action_type, payload)
            VALUES (:op, 'reject_proposal', CAST(:payload AS jsonb))
        """),
        {"op": review.operator_id, "payload": payload_json},
    )
    await db.commit()
    return {"proposal_id": proposal_id, "status": "rejected"}
