"""Notification subscribers — CRUD + async webhook + SMS fan-out.

Fan-out fires (background task) when:
  - A new alert is created with severity in (critical, high)
  - An alert is escalated via /alerts/{id}/action

Channels:
  webhook  — POST JSON payload to target URL (httpx, 5s timeout, 3 retries)
  sms      — Twilio SMS; active only when TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER set in .env
             Gracefully degrades to stub behavior when credentials absent ($0 until configured)
  sms_stub — legacy stub: logs intent, no provider call (kept for backwards compat)
  email    — stub: logs intent, no SMTP
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, HttpUrl, field_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.db import get_db, engine
from costa_api.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["notifications"])

SEVERITY_RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}


# ─── Schema ───────────────────────────────────────────────────────────────────

class SubscriberCreate(BaseModel):
    channel: str
    target: str
    label: str
    severity_min: str = "high"
    district_filter: Optional[str] = None
    created_by: str = "operator"

    @field_validator("channel")
    @classmethod
    def check_channel(cls, v: str) -> str:
        if v not in {"webhook", "email", "sms", "sms_stub"}:
            raise ValueError("channel must be webhook, email, sms, or sms_stub")
        return v

    @field_validator("severity_min")
    @classmethod
    def check_severity(cls, v: str) -> str:
        if v not in SEVERITY_RANK:
            raise ValueError("severity_min must be critical, high, medium, or low")
        return v

    @field_validator("target")
    @classmethod
    def check_target(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("target cannot be empty")
        return v


class SubscriberOut(BaseModel):
    id: int
    channel: str
    target: str
    label: str
    severity_min: str
    district_filter: Optional[str]
    active: bool
    created_by: str
    created_at: datetime


class DeliveryOut(BaseModel):
    id: int
    subscriber_id: int
    alert_id: Optional[int]
    trigger_event: str
    status: str
    attempts: int
    last_error: Optional[str]
    delivered_at: Optional[datetime]
    created_at: datetime


# ─── CRUD ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[SubscriberOut])
async def list_subscribers(
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
) -> list[SubscriberOut]:
    where = "WHERE active = TRUE" if active_only else ""
    result = await db.execute(text(f"SELECT * FROM ops.notification_subscribers {where} ORDER BY created_at DESC"))
    return [SubscriberOut(**dict(r)) for r in result.mappings().all()]


@router.post("", response_model=SubscriberOut, status_code=201)
async def create_subscriber(body: SubscriberCreate, db: AsyncSession = Depends(get_db)) -> SubscriberOut:
    row = await db.execute(
        text("""
            INSERT INTO ops.notification_subscribers
                (channel, target, label, severity_min, district_filter, created_by)
            VALUES (:channel, :target, :label, :sev, :dist, :by)
            RETURNING *
        """),
        {
            "channel": body.channel,
            "target": body.target,
            "label": body.label,
            "sev": body.severity_min,
            "dist": body.district_filter,
            "by": body.created_by,
        },
    )
    await db.commit()
    return SubscriberOut(**dict(row.mappings().one()))


@router.delete("/{sub_id}", status_code=204)
async def delete_subscriber(sub_id: int, db: AsyncSession = Depends(get_db)) -> None:
    result = await db.execute(
        text("UPDATE ops.notification_subscribers SET active = FALSE WHERE id = :id RETURNING id"),
        {"id": sub_id},
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail=f"Subscriber {sub_id} not found")
    await db.commit()


@router.get("/deliveries", response_model=list[DeliveryOut])
async def list_deliveries(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> list[DeliveryOut]:
    result = await db.execute(
        text("SELECT * FROM ops.notification_deliveries ORDER BY created_at DESC LIMIT :limit"),
        {"limit": limit},
    )
    return [DeliveryOut(**dict(r)) for r in result.mappings().all()]


# ─── Fan-out engine ───────────────────────────────────────────────────────────

async def _record_delivery(
    subscriber_id: int,
    alert_id: Optional[int],
    trigger_event: str,
    status: str,
    attempts: int,
    last_error: Optional[str] = None,
) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text("""
                INSERT INTO ops.notification_deliveries
                    (subscriber_id, alert_id, trigger_event, status, attempts, last_error, delivered_at)
                VALUES (:sid, :aid, :evt, :status, :attempts, :err,
                        CASE WHEN :status2 = 'delivered' THEN NOW() ELSE NULL END)
            """),
            {
                "sid": subscriber_id,
                "aid": alert_id,
                "evt": trigger_event,
                "status": status,
                "attempts": attempts,
                "err": last_error,
                "status2": status,
            },
        )


async def _send_webhook(target: str, payload: dict, timeout: float = 5.0, retries: int = 3) -> tuple[bool, str]:
    """POST payload to webhook URL. Returns (success, error_message)."""
    last_err = ""
    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(1, retries + 1):
            try:
                resp = await client.post(
                    target,
                    json=payload,
                    headers={"Content-Type": "application/json", "User-Agent": "CostaResilienteAlerts/1.0"},
                )
                if resp.status_code < 300:
                    return True, ""
                last_err = f"HTTP {resp.status_code}"
            except Exception as exc:
                last_err = str(exc)
            if attempt < retries:
                await asyncio.sleep(2 ** attempt)
    return False, last_err


async def _send_sms(to_number: str, body: str) -> tuple[bool, str]:
    """Send SMS via Twilio. Returns (success, error). No-ops if credentials absent."""
    if not settings.twilio_enabled:
        logger.info("[notifications] Twilio not configured — SMS stub for %s", to_number)
        return False, "twilio_not_configured"
    try:
        from twilio.rest import Client  # lazy import — optional dep
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        msg = client.messages.create(
            body=body,
            from_=settings.twilio_from_number,
            to=to_number,
        )
        logger.info("[notifications] SMS sent sid=%s to=%s", msg.sid, to_number)
        return True, ""
    except Exception as exc:
        logger.error("[notifications] Twilio error: %s", exc)
        return False, str(exc)


async def fan_out_notifications(
    alert_id: Optional[int],
    alert_severity: str,
    alert_title: str,
    alert_district_ubigeo: Optional[str],
    trigger_event: str,
) -> None:
    """Background task: query matching subscribers and dispatch notifications."""
    try:
        async with engine.connect() as conn:
            result = await conn.execute(
                text("""
                    SELECT id, channel, target, label, severity_min, district_filter
                    FROM ops.notification_subscribers
                    WHERE active = TRUE
                    ORDER BY id
                """)
            )
            subscribers = result.mappings().all()

        sev_rank = SEVERITY_RANK.get(alert_severity, 0)

        for sub in subscribers:
            sub_min_rank = SEVERITY_RANK.get(sub["severity_min"], 2)
            if sev_rank < sub_min_rank:
                continue
            if sub["district_filter"] and alert_district_ubigeo:
                if not alert_district_ubigeo.startswith(sub["district_filter"]):
                    continue

            payload = {
                "event": trigger_event,
                "alert_id": alert_id,
                "severity": alert_severity,
                "title": alert_title,
                "district_ubigeo": alert_district_ubigeo,
                "source": "costa-resiliente",
            }

            channel = sub["channel"]
            if channel == "webhook":
                success, err = await _send_webhook(sub["target"], payload)
                status = "delivered" if success else "failed"
                await _record_delivery(sub["id"], alert_id, trigger_event, status, 3 if not success else 1, err or None)
            elif channel == "sms":
                sms_body = (
                    f"[COSTA RESILIENTE] {payload['severity'].upper()}: {payload['title']}. "
                    f"Distrito: {payload.get('district_ubigeo', 'Lima')}. "
                    f"Evento: {trigger_event}."
                )
                success, err = await _send_sms(sub["target"], sms_body)
                if err == "twilio_not_configured":
                    status = "skipped"
                else:
                    status = "delivered" if success else "failed"
                await _record_delivery(sub["id"], alert_id, trigger_event, status, 1, err or None)
            else:
                # sms_stub / email — log intent, no provider call
                logger.info("[notifications] stub %s → %s: alert_id=%s event=%s", channel, sub["label"], alert_id, trigger_event)
                await _record_delivery(sub["id"], alert_id, trigger_event, "skipped", 0, f"{channel} stub — not wired")
    except Exception as exc:
        logger.exception("[notifications] fan_out error: %s", exc)
