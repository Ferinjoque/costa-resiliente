"""Alerts feed — read/write ops.alerts + operator actions → decision_log."""

from __future__ import annotations

import json
import io
import csv
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.db import get_db

router = APIRouter(prefix="/alerts", tags=["alerts"])


# ─── Schema ───────────────────────────────────────────────────────────────────

class AlertSummary(BaseModel):
    id: int
    type: str
    severity: str
    status: str
    title: str
    description: Optional[str] = None
    district_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class AlertAction(BaseModel):
    operator_id: str
    action: str          # acknowledge | escalate | false_positive | close
    note: Optional[str] = None
    session_id: Optional[str] = None


class DecisionLogEntry(BaseModel):
    id: int
    logged_at: datetime
    operator_id: str
    action_type: str
    alert_id: Optional[int] = None
    payload: dict
    session_id: Optional[str] = None


# ─── Alerts ───────────────────────────────────────────────────────────────────

@router.get("", response_model=list[AlertSummary])
async def list_alerts(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
) -> list[AlertSummary]:
    """Return alerts from ops.alerts, newest first."""
    conditions = ["1=1"]
    params: dict = {"limit": limit}

    if status:
        conditions.append("a.status = :status")
        params["status"] = status
    if severity:
        conditions.append("a.severity = :severity")
        params["severity"] = severity

    where = " AND ".join(conditions)
    rows = await db.execute(
        text(f"""
            SELECT a.id, a.type, a.severity, a.status, a.title, a.description,
                   a.district_id, a.created_at, a.updated_at
            FROM ops.alerts a
            WHERE {where}
            ORDER BY a.created_at DESC
            LIMIT :limit
        """),
        params,
    )
    return [AlertSummary(**dict(r._mapping)) for r in rows]


@router.post("/{alert_id}/action")
async def act_on_alert(
    alert_id: int,
    action: AlertAction,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Acknowledge, escalate, false_positive, or close an alert.
    Updates ops.alerts.status and appends to ops.decision_log (append-only).
    """
    valid_actions = {"acknowledge", "escalate", "false_positive", "close"}
    if action.action not in valid_actions:
        raise HTTPException(
            status_code=422,
            detail=f"action must be one of: {', '.join(sorted(valid_actions))}",
        )

    status_map = {
        "acknowledge": "acknowledged",
        "escalate": "escalated",
        "false_positive": "false_positive",
        "close": "closed",
    }
    new_status = status_map[action.action]

    result = await db.execute(
        text("""
            UPDATE ops.alerts
            SET status = :status, updated_at = NOW()
            WHERE id = :id
            RETURNING id
        """),
        {"status": new_status, "id": alert_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")

    payload = {
        "action": action.action,
        "new_status": new_status,
        "note": action.note,
    }
    await db.execute(
        text("""
            INSERT INTO ops.decision_log
                (operator_id, action_type, alert_id, payload, session_id)
            VALUES (:op, :atype, :aid, :payload::jsonb, :session)
        """),
        {
            "op": action.operator_id,
            "atype": f"alert_{action.action}",
            "aid": alert_id,
            "payload": json.dumps(payload, ensure_ascii=False),
            "session": action.session_id,
        },
    )
    await db.commit()

    return {"alert_id": alert_id, "new_status": new_status}


# ─── Decision log ─────────────────────────────────────────────────────────────

@router.get("/decision-log", response_model=list[DecisionLogEntry])
async def list_decision_log(
    operator_id: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
) -> list[DecisionLogEntry]:
    """Return recent decision log entries, newest first."""
    conditions = ["1=1"]
    params: dict = {"limit": limit}
    if operator_id:
        conditions.append("dl.operator_id = :op")
        params["op"] = operator_id

    where = " AND ".join(conditions)
    rows = await db.execute(
        text(f"""
            SELECT dl.id, dl.logged_at, dl.operator_id, dl.action_type,
                   dl.alert_id, dl.payload, dl.session_id
            FROM ops.decision_log dl
            WHERE {where}
            ORDER BY dl.logged_at DESC
            LIMIT :limit
        """),
        params,
    )
    return [
        DecisionLogEntry(
            **{**dict(r._mapping), "payload": dict(r._mapping["payload"])}
        )
        for r in rows
    ]


@router.get("/decision-log/export")
async def export_decision_log(
    operator_id: Optional[str] = Query(None),
    limit: int = Query(500, le=2000),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """
    Export decision log as CSV for EDAN-Perú reporting.
    Columns: id, logged_at, operator_id, action_type, alert_id, session_id, payload_json
    """
    conditions = ["1=1"]
    params: dict = {"limit": limit}
    if operator_id:
        conditions.append("dl.operator_id = :op")
        params["op"] = operator_id

    where = " AND ".join(conditions)
    rows = await db.execute(
        text(f"""
            SELECT dl.id, dl.logged_at, dl.operator_id, dl.action_type,
                   dl.alert_id, dl.session_id, dl.payload::text AS payload_json
            FROM ops.decision_log dl
            WHERE {where}
            ORDER BY dl.logged_at DESC
            LIMIT :limit
        """),
        params,
    )
    records = [dict(r._mapping) for r in rows]

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["id", "logged_at", "operator_id", "action_type",
                    "alert_id", "session_id", "payload_json"],
        extrasaction="ignore",
    )
    writer.writeheader()
    for rec in records:
        writer.writerow({k: str(v) if v is not None else "" for k, v in rec.items()})

    output.seek(0)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"decision_log_{ts}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
