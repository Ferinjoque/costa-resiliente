"""Alerts feed — read/write ops.alerts + operator actions → decision_log."""

from __future__ import annotations

import asyncio
import json
import io
import csv
from datetime import datetime, timezone
from typing import Optional


def _parse_iso_dt(s: str | None) -> datetime | None:
    """Parse an ISO-8601 string (with optional Z suffix) to an aware datetime.

    asyncpg requires actual datetime objects, not raw strings, for timestamp
    query parameters. Both '2026-05-01T00:00:00Z' and '2026-05-01T00:00:00+00:00'
    are supported; returns None when s is None or empty.
    """
    if not s:
        return None
    s = s.strip().replace("Z", "+00:00")
    return datetime.fromisoformat(s)

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
import logging
from pydantic import BaseModel, Field

log = logging.getLogger(__name__)
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.db import get_db, engine
from costa_api.routers.notifications import fan_out_notifications
from costa_api.routers.auth import require_operator, CurrentOperator

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
    district_name: Optional[str] = None
    province: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    source_refs: Optional[list | dict] = None
    created_at: datetime
    updated_at: datetime


_VALID_ACTIONS = {"acknowledge", "escalate", "false_positive", "close"}


class LogEntry(BaseModel):
    # operator_id accepted for backwards-compatibility but IGNORED — the JWT
    # identity (op.username) is always used to prevent forgery.
    operator_id: Optional[str] = Field(None, max_length=100)
    action_type: str = Field(..., min_length=1, max_length=100)
    alert_id: Optional[int] = None
    payload: dict
    session_id: Optional[str] = Field(None, max_length=64)


class AlertAction(BaseModel):
    # operator_id accepted for backwards-compatibility but IGNORED — the JWT
    # identity (op.username) is always used to prevent forgery.
    operator_id: Optional[str] = Field(None, max_length=100)
    action: str = Field(..., min_length=1, max_length=32)
    note: Optional[str] = Field(None, max_length=2000)
    session_id: Optional[str] = Field(None, max_length=64)


class DecisionLogEntry(BaseModel):
    id: int
    logged_at: datetime
    operator_id: str
    action_type: str
    alert_id: Optional[int] = None
    payload: dict
    session_id: Optional[str] = None


# ─── Alerts ───────────────────────────────────────────────────────────────────

_VALID_ALERT_STATUSES = {"active", "acknowledged", "escalated", "closed", "false_positive"}
_VALID_SEVERITIES = {"critical", "high", "medium", "low"}


@router.get("", response_model=list[AlertSummary])
async def list_alerts(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    province: Optional[str] = Query(None, description="Filter by province. 'Lima' = Lima Metropolitana (43 districts). Omit for all."),
    district: Optional[str] = Query(None, description="Filter by district name (case-insensitive)."),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> list[AlertSummary]:
    """Return alerts from ops.alerts with district info, newest first."""
    if status and status not in _VALID_ALERT_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {sorted(_VALID_ALERT_STATUSES)}")
    if severity and severity not in _VALID_SEVERITIES:
        raise HTTPException(status_code=400, detail=f"Invalid severity. Allowed: {sorted(_VALID_SEVERITIES)}")

    # Exclude obvious test residue (XSS/SQL seeds, 'Test ' prefix fixtures)
    # from the operator-facing list. Rows remain in the table; just hidden.
    conditions = [
        "1=1",
        "a.title NOT LIKE 'Test %'",
        "a.title NOT LIKE '<%>%'",
        "a.title NOT LIKE '%DROP TABLE%'",
    ]
    params: dict = {"limit": limit}

    if status:
        conditions.append("a.status = :status")
        params["status"] = status
    if severity:
        conditions.append("a.severity = :severity")
        params["severity"] = severity
    if province:
        # Include alerts with no district (e.g. rainfall alerts) when province filter active
        conditions.append("(d.province = :province OR a.district_id IS NULL)")
        params["province"] = province
    if district:
        conditions.append("d.name ILIKE :district")
        params["district"] = district

    where = " AND ".join(conditions)
    await db.execute(text("SET LOCAL statement_timeout = '10000'"))
    rows = await db.execute(
        text(f"""
            SELECT a.id, a.type, a.severity, a.status, a.title, a.description,
                   a.district_id, d.name AS district_name, d.province,
                   a.created_at, a.updated_at,
                   ST_Y(a.geom) AS lat, ST_X(a.geom) AS lng,
                   a.source_refs
            FROM ops.alerts a
            LEFT JOIN geo.districts d ON d.id = a.district_id
            WHERE {where}
            ORDER BY
                CASE a.status WHEN 'active' THEN 0 WHEN 'escalated' THEN 1 ELSE 2 END,
                CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                a.created_at DESC
            LIMIT :limit
        """),
        params,
    )
    def _coerce_refs(raw):
        # source_refs is JSONB — may be a dict OR a list of dicts depending on
        # who inserted the alert (alert_generator vs proposal-approval). Pass
        # through unchanged; the Pydantic model accepts either shape.
        if raw is None:
            return None
        if isinstance(raw, (dict, list)):
            return raw
        return None

    return [
        AlertSummary(**{
            **dict(r._mapping),
            "source_refs": _coerce_refs(r._mapping.get("source_refs")),
        })
        for r in rows
    ]


@router.post("/{alert_id}/action")
async def act_on_alert(
    alert_id: int,
    action: AlertAction,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    op: CurrentOperator = Depends(require_operator),
) -> dict:
    """
    Acknowledge, escalate, false_positive, or close an alert.
    Updates ops.alerts.status and appends to ops.decision_log (append-only).
    """
    if action.action not in _VALID_ACTIONS:
        raise HTTPException(
            status_code=422,
            detail=f"action must be one of: {', '.join(sorted(_VALID_ACTIONS))}",
        )

    status_map = {
        "acknowledge": "acknowledged",
        "escalate": "escalated",
        "false_positive": "false_positive",
        "close": "closed",
    }
    new_status = status_map[action.action]

    await db.execute(text("SET LOCAL statement_timeout = '5000'"))
    # Fetch alert metadata needed for notification fan-out before updating.
    # Join districts to get ubigeo for subscriber district_filter matching.
    meta_row = await db.execute(
        text("""
            SELECT a.severity, a.title, d.ubigeo AS district_ubigeo
            FROM ops.alerts a
            LEFT JOIN geo.districts d ON d.id = a.district_id
            WHERE a.id = :id
        """),
        {"id": alert_id},
    )
    meta = meta_row.mappings().first()
    if not meta:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")

    result = await db.execute(
        text("""
            UPDATE ops.alerts
            SET status = :status, updated_at = NOW()
            WHERE id = :id
            RETURNING id
        """),
        {"status": new_status, "id": alert_id},
    )
    if not result.fetchone():
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
            "op": op.username,
            "atype": f"alert_{action.action}",
            "aid": alert_id,
            "payload": json.dumps(payload, ensure_ascii=False),
            "session": action.session_id,
        },
    )
    await db.commit()

    # Fan-out notification on escalation
    if action.action == "escalate":
        background_tasks.add_task(
            fan_out_notifications,
            alert_id=alert_id,
            alert_severity=meta["severity"],
            alert_title=meta["title"],
            alert_district_ubigeo=meta["district_ubigeo"],
            trigger_event="alert_escalated",
        )

    return {"alert_id": alert_id, "new_status": new_status}


# ─── Free-form decision log entry ────────────────────────────────────────────

@router.post("/log")
async def log_decision(
    entry: LogEntry,
    db: AsyncSession = Depends(get_db),
    op: CurrentOperator = Depends(require_operator),
) -> dict:
    """Append a free-form entry to the decision log (dispatch, protocol step, note)."""
    await db.execute(text("SET LOCAL statement_timeout = '5000'"))
    await db.execute(
        text("""
            INSERT INTO ops.decision_log
                (operator_id, action_type, alert_id, payload, session_id)
            VALUES (:op, :atype, :aid, CAST(:payload AS jsonb), :session)
        """),
        {
            "op": op.username,
            "atype": entry.action_type,
            "aid": entry.alert_id,
            "payload": json.dumps(entry.payload, ensure_ascii=False),
            "session": entry.session_id,
        },
    )
    await db.commit()
    return {"ok": True}


# ─── Decision log ─────────────────────────────────────────────────────────────

_STREAM_MAX_LIFETIME_S = 3600  # force reconnect after 1 h — prevents zombie connections

@router.get("/stream")
async def alerts_stream(request: Request) -> StreamingResponse:
    """Server-Sent Events — pushes active alerts every 10 s.

    Connection is capped at _STREAM_MAX_LIFETIME_S (1 h) to prevent indefinite
    resource holding. Clients receive a 'retry' event and should reconnect.
    Alert data is public (matches GET /alerts) — no auth required for read.
    """
    async def _fetch_alerts() -> str:
        async with engine.connect() as conn:
            async with conn.begin():
                # SET LOCAL requires an explicit transaction to take effect
                await conn.execute(text("SET LOCAL statement_timeout = '7000'"))
                result = await conn.execute(
                    text("""
                        SELECT id, type, severity, title, status, created_at, district_id,
                               source_refs
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
        return json.dumps(alerts, default=str)

    async def generate():
        deadline = asyncio.get_running_loop().time() + _STREAM_MAX_LIFETIME_S
        while True:
            if await request.is_disconnected():
                break
            if asyncio.get_running_loop().time() >= deadline:
                # Tell client to reconnect in 10 s then close this generator.
                yield "retry: 10000\ndata: {\"reconnect\":true}\n\n"
                break
            try:
                payload = await asyncio.wait_for(_fetch_alerts(), timeout=8.0)
                yield f"data: {payload}\n\n"
            except asyncio.TimeoutError:
                log.warning("alerts_stream: DB fetch timed out (>8s)")
                yield 'data: {"error":"db_timeout"}\n\n'
            except Exception as exc:
                log.warning("alerts_stream: fetch error: %s", exc)
                yield 'data: {"error":"db_error"}\n\n'
            for _ in range(10):
                if await request.is_disconnected():
                    return
                await asyncio.sleep(1)

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
    since: Optional[str] = Query(None, description="ISO-8601 start datetime (inclusive)"),
    until: Optional[str] = Query(None, description="ISO-8601 end datetime (inclusive)"),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    op: CurrentOperator = Depends(require_operator),
) -> list[DecisionLogEntry]:
    """Return recent decision log entries, newest first."""
    conditions = ["1=1"]
    params: dict = {"limit": limit}
    if operator_id:
        conditions.append("dl.operator_id = :op")
        params["op"] = operator_id
    since_dt = _parse_iso_dt(since)
    until_dt = _parse_iso_dt(until)
    if since_dt:
        conditions.append("dl.logged_at >= :since")
        params["since"] = since_dt
    if until_dt:
        conditions.append("dl.logged_at <= :until")
        params["until"] = until_dt

    where = " AND ".join(conditions)
    await db.execute(text("SET LOCAL statement_timeout = '10000'"))
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
            **{**dict(r._mapping), "payload": dict(r._mapping["payload"]) if r._mapping["payload"] else {}}
        )
        for r in rows
    ]


@router.get("/decision-log/export")
async def export_decision_log(
    operator_id: Optional[str] = Query(None),
    since: Optional[str] = Query(None, description="ISO-8601 start datetime (inclusive)"),
    until: Optional[str] = Query(None, description="ISO-8601 end datetime (inclusive)"),
    limit: int = Query(500, ge=1, le=2000),
    db: AsyncSession = Depends(get_db),
    op: CurrentOperator = Depends(require_operator),
) -> StreamingResponse:
    """
    Export decision log as CSV for EDAN-Perú reporting.
    Columns: id, logged_at, operator_id, action_type, alert_id, session_id, payload_json
    Supports ?since=2026-05-01T00:00:00Z&until=2026-05-31T23:59:59Z for shift/audit reports.
    """
    conditions = ["1=1"]
    params: dict = {"limit": limit}
    if operator_id:
        conditions.append("dl.operator_id = :op")
        params["op"] = operator_id
    since_dt = _parse_iso_dt(since)
    until_dt = _parse_iso_dt(until)
    if since_dt:
        conditions.append("dl.logged_at >= :since")
        params["since"] = since_dt
    if until_dt:
        conditions.append("dl.logged_at <= :until")
        params["until"] = until_dt

    where = " AND ".join(conditions)
    await db.execute(text("SET LOCAL statement_timeout = '15000'"))
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
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    range_suffix = ""
    if since or until:
        s = (since or "")[:10].replace("-", "")
        u = (until or "")[:10].replace("-", "")
        range_suffix = f"_{s}-{u}" if s or u else ""
    filename = f"decision_log{range_suffix}_{ts}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/decision-log/report")
async def export_pdf_report(
    operator_id: Optional[str] = Query(None),
    since: Optional[str] = Query(None, description="ISO-8601 start datetime (inclusive)"),
    until: Optional[str] = Query(None, description="ISO-8601 end datetime (inclusive)"),
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    op: CurrentOperator = Depends(require_operator),
) -> StreamingResponse:
    """
    Export decision log as an EDAN-Perú style PDF situational report.
    Sections: cover, active alerts summary, operator action log.
    Supports ?since=ISO&until=ISO date-range filtering (same as CSV export).
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer, HRFlowable,
        )
    except ImportError:
        raise HTTPException(status_code=503, detail="PDF export no disponible — dependencia reportlab no instalada")

    await db.execute(text("SET LOCAL statement_timeout = '15000'"))
    # ── Fetch active alerts ───────────────────────────────────────────────────
    alert_rows = (await db.execute(
        text("""
            SELECT a.id, a.type, a.severity, a.status, a.title, a.created_at,
                   d.name AS district_name
            FROM ops.alerts a
            LEFT JOIN geo.districts d ON a.district_id = d.id
            WHERE a.status = 'active'
            ORDER BY
                CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                                WHEN 'medium' THEN 2 ELSE 3 END,
                a.created_at DESC
            LIMIT 50
        """)
    )).mappings().all()

    # ── Fetch decision log ────────────────────────────────────────────────────
    conditions = ["1=1"]
    params: dict = {"limit": limit}
    if operator_id:
        conditions.append("dl.operator_id = :op")
        params["op"] = operator_id
    since_dt = _parse_iso_dt(since)
    until_dt = _parse_iso_dt(until)
    if since_dt:
        conditions.append("dl.logged_at >= :since")
        params["since"] = since_dt
    if until_dt:
        conditions.append("dl.logged_at <= :until")
        params["until"] = until_dt

    log_rows = (await db.execute(
        text(f"""
            SELECT dl.id, dl.logged_at, dl.operator_id, dl.action_type,
                   dl.alert_id, dl.payload::text AS payload_json
            FROM ops.decision_log dl
            WHERE {' AND '.join(conditions)}
            ORDER BY dl.logged_at DESC
            LIMIT :limit
        """),
        params,
    )).mappings().all()

    # ── Build PDF ─────────────────────────────────────────────────────────────
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=2.5 * cm, rightMargin=2.5 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title="Costa Resiliente — Informe Situacional",
    )

    styles = getSampleStyleSheet()
    RED = colors.HexColor("#C0392B")
    DARK = colors.HexColor("#1A1A1A")
    SUBTLE = colors.HexColor("#666666")
    YELLOW = colors.HexColor("#F39C12")
    BLUE = colors.HexColor("#2980B9")

    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=16,
                         textColor=DARK, spaceAfter=4, spaceBefore=0)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=11,
                         textColor=DARK, spaceAfter=3, spaceBefore=8)
    body = ParagraphStyle("Body", parent=styles["Normal"], fontSize=9,
                           textColor=DARK, spaceAfter=2)
    small = ParagraphStyle("Small", parent=styles["Normal"], fontSize=8,
                            textColor=SUBTLE)

    SEV_COLOR = {"critical": RED, "high": YELLOW, "medium": BLUE,
                 "low": colors.HexColor("#27AE60")}

    story = []

    # ── Cover section ──────────────────────────────────────────────────────
    story.append(Paragraph("INFORME SITUACIONAL", h1))
    story.append(Paragraph("Sistema Costa Resiliente — Lima Metropolitana", body))
    now = datetime.now(timezone.utc)
    story.append(Paragraph(
        f"Generado: {now.strftime('%d/%m/%Y %H:%M')} UTC  ·  "
        f"Operador: {operator_id or 'todos'}",
        small,
    ))
    story.append(HRFlowable(width="100%", thickness=1, color=RED, spaceAfter=8))

    # ── Active alerts summary ─────────────────────────────────────────────
    story.append(Paragraph("ALERTAS ACTIVAS", h2))
    if not alert_rows:
        story.append(Paragraph("No hay alertas activas en este momento.", body))
    else:
        alert_data = [["ID", "Tipo", "Severidad", "Título", "Distrito", "Creado"]]
        for r in alert_rows:
            created = r["created_at"]
            if hasattr(created, "strftime"):
                created_s = created.strftime("%d/%m %H:%M")
            else:
                created_s = str(created)[:16]
            alert_data.append([
                str(r["id"]),
                (r["type"] or "")[:20],
                (r["severity"] or "").upper(),
                (r["title"] or "")[:50],
                (r["district_name"] or "—")[:25],
                created_s,
            ])

        at = Table(alert_data, colWidths=[1*cm, 2.5*cm, 2*cm, 6*cm, 3.5*cm, 2*cm])
        ts_alert = TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), DARK),
            ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
            ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",   (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F5F5")]),
            ("GRID",       (0, 0), (-1, -1), 0.25, colors.HexColor("#DDDDDD")),
            ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ])
        # Colour severity cells
        for row_idx, r in enumerate(alert_rows, start=1):
            sev = (r["severity"] or "low").lower()
            at.setStyle(TableStyle([
                ("TEXTCOLOR", (2, row_idx), (2, row_idx), SEV_COLOR.get(sev, DARK)),
                ("FONTNAME",  (2, row_idx), (2, row_idx), "Helvetica-Bold"),
            ]))

        at.setStyle(ts_alert)
        story.append(at)

    story.append(Spacer(1, 0.4 * cm))

    # ── Decision log ──────────────────────────────────────────────────────
    story.append(Paragraph("REGISTRO DE ACCIONES OPERACIONALES", h2))
    if not log_rows:
        story.append(Paragraph("No hay entradas en el registro.", body))
    else:
        log_data = [["#", "Fecha/Hora", "Operador", "Acción", "Alerta", "Detalle"]]
        for r in log_rows:
            logged = r["logged_at"]
            if hasattr(logged, "strftime"):
                logged_s = logged.strftime("%d/%m %H:%M")
            else:
                logged_s = str(logged)[:16]
            try:
                payload = json.loads(r["payload_json"] or "{}")
                detail = payload.get("note") or payload.get("action") or ""
                detail = str(detail)[:60]
            except Exception as _json_exc:
                log.debug("PDF report: failed to parse payload_json for log row %s: %s", r.get("id"), _json_exc)
                detail = ""
            log_data.append([
                str(r["id"]),
                logged_s,
                (r["operator_id"] or "")[:20],
                (r["action_type"] or "")[:20],
                str(r["alert_id"]) if r["alert_id"] else "—",
                detail,
            ])

        lt = Table(log_data, colWidths=[0.7*cm, 2*cm, 2.5*cm, 2.5*cm, 1.5*cm, 5.8*cm])
        lt.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), DARK),
            ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
            ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1, -1), 7.5),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F5F5")]),
            ("GRID",          (0, 0), (-1, -1), 0.25, colors.HexColor("#DDDDDD")),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",    (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("WORDWRAP",      (5, 1), (5, -1), True),
        ]))
        story.append(lt)

    story.append(Spacer(1, 0.6 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=SUBTLE))
    story.append(Paragraph(
        "Documento generado automáticamente por Costa Resiliente · SINAGERD Lima Metropolitana",
        small,
    ))

    doc.build(story)
    buf.seek(0)
    ts = now.strftime("%Y%m%d_%H%M%S")
    filename = f"informe_situacional_{ts}.pdf"

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
