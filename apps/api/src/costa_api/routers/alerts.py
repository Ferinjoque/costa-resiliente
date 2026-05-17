"""Alerts feed — read/write ops.alerts + operator actions → decision_log."""

from __future__ import annotations

import asyncio
import json
import io
import csv
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.db import get_db, engine

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
    lat: Optional[float] = None
    lng: Optional[float] = None
    source_refs: Optional[dict] = None
    created_at: datetime
    updated_at: datetime


class LogEntry(BaseModel):
    operator_id: str
    action_type: str   # resource_dispatch | protocol_step | note
    alert_id: Optional[int] = None
    payload: dict
    session_id: Optional[str] = None


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
    limit: int = Query(50, ge=0, le=200),
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
                   a.district_id, a.created_at, a.updated_at,
                   ST_Y(a.geom) AS lat, ST_X(a.geom) AS lng,
                   a.source_refs
            FROM ops.alerts a
            WHERE {where}
            ORDER BY a.created_at DESC
            LIMIT :limit
        """),
        params,
    )
    return [
        AlertSummary(**{
            **dict(r._mapping),
            "source_refs": dict(r._mapping["source_refs"]) if r._mapping.get("source_refs") else None,
        })
        for r in rows
    ]


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
            VALUES (:op, :atype, :aid, CAST(:payload AS jsonb), :session)
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


# ─── Free-form decision log entry ────────────────────────────────────────────

@router.post("/log")
async def log_decision(entry: LogEntry, db: AsyncSession = Depends(get_db)) -> dict:
    """Append a free-form entry to the decision log (dispatch, protocol step, note)."""
    await db.execute(
        text("""
            INSERT INTO ops.decision_log
                (operator_id, action_type, alert_id, payload, session_id)
            VALUES (:op, :atype, :aid, CAST(:payload AS jsonb), :session)
        """),
        {
            "op": entry.operator_id,
            "atype": entry.action_type,
            "aid": entry.alert_id,
            "payload": json.dumps(entry.payload, ensure_ascii=False),
            "session": entry.session_id,
        },
    )
    await db.commit()
    return {"ok": True}


# ─── Decision log ─────────────────────────────────────────────────────────────

@router.get("/stream")
async def alerts_stream(request: Request) -> StreamingResponse:
    """Server-Sent Events — pushes active alerts every 10 s.
    DB operations run in a shielded task so that client disconnects cannot
    cancel mid-flight asyncpg operations and corrupt the connection pool.
    """
    async def _fetch_alerts() -> str:
        async with engine.connect() as conn:
            result = await conn.execute(
                text("""
                    SELECT id, type, severity, title, status, created_at, district_id
                    FROM ops.alerts
                    WHERE status = 'active'
                    ORDER BY created_at DESC
                    LIMIT 20
                """)
            )
            rows = result.mappings().all()
        alerts = []
        for r in rows:
            d = dict(r)
            if isinstance(d.get("created_at"), datetime):
                d["created_at"] = d["created_at"].isoformat()
            alerts.append(d)
        return json.dumps(alerts)

    async def generate():
        fetch_task: asyncio.Task | None = None
        try:
            while True:
                if await request.is_disconnected():
                    break
                fetch_task = asyncio.create_task(_fetch_alerts())
                try:
                    payload = await asyncio.shield(fetch_task)
                    yield f"data: {payload}\n\n"
                except asyncio.CancelledError:
                    break
                finally:
                    fetch_task = None
                for _ in range(10):
                    if await request.is_disconnected():
                        return
                    await asyncio.sleep(1)
        except (GeneratorExit, Exception):
            pass
        finally:
            if fetch_task and not fetch_task.done():
                fetch_task.cancel()
                try:
                    await fetch_task
                except (asyncio.CancelledError, Exception):
                    pass

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/decision-log", response_model=list[DecisionLogEntry])
async def list_decision_log(
    operator_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=0, le=500),
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
    limit: int = Query(500, ge=0, le=2000),
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
