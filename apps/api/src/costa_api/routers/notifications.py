"""Notification subscribers: CRUD + async webhook + SMS fan-out.

Fan-out fires (background task) when:
  - A new alert is created with severity in (critical, high)
  - An alert is escalated via /alerts/{id}/action

Channels:
  webhook: POST JSON payload to target URL (httpx, 5s timeout, 3 retries)
  sms: Twilio SMS; active only when TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER set in .env
             Gracefully degrades to stub behavior when credentials absent ($0 until configured)
  sms_stub, legacy stub: logs intent, no provider call (kept for backwards compat)
  email, stub: logs intent, no SMTP
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import os
import re
import socket
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

import httpx
import redis.asyncio as aioredis
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.db import get_db, engine
from costa_api.config import settings
from costa_api.routers.auth import require_operator, CurrentOperator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["notifications"])

# ─── Subscriber creation rate limit (10 per operator per hour) ───────────────
_NOTIF_RATE_LIMIT = 10
_NOTIF_RATE_WINDOW = 3600
_notif_rl_client: aioredis.Redis | None = None


def _get_notif_rl_client() -> aioredis.Redis | None:
    global _notif_rl_client
    if _notif_rl_client is None:
        try:
            _notif_rl_client = aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=1,
            )
        except Exception as exc:
            logger.warning("[notifications] Redis rate-limiter init failed: %s", exc)
    return _notif_rl_client


async def _check_notif_create_rate(operator_id: str) -> None:
    """Raise 429 if operator has exceeded subscriber creation limit. Fails open on Redis outage."""
    if os.environ.get("TESTING", "0") == "1":
        return
    client = _get_notif_rl_client()
    if client is None:
        return
    key = f"costa:notif:create:{operator_id}"
    try:
        count = await client.incr(key)
        if count == 1:
            await client.expire(key, _NOTIF_RATE_WINDOW)
        if count > _NOTIF_RATE_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiadas suscripciones creadas. Espere antes de agregar más.",
                headers={"Retry-After": str(_NOTIF_RATE_WINDOW)},
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("[notifications] Rate-limit check failed (fail-open): %s", exc)

SEVERITY_RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}

_PRIVATE_NETS = [
    ipaddress.ip_network(cidr) for cidr in (
        "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
        "127.0.0.0/8", "169.254.0.0/16", "::1/128", "fc00::/7",
        "fe80::/10",  # IPv6 link-local, prevents SSRF via link-local targeting
    )
]


def _is_private_addr(addr_str: str) -> bool:
    try:
        addr = ipaddress.ip_address(addr_str)
        return any(addr in net for net in _PRIVATE_NETS)
    except ValueError:
        return False


def _reject_private_host(host: str) -> None:
    """Raise ValueError if host is or resolves to a private/internal IP (SSRF guard).

    Resolves DNS hostnames so that names like internal.corp.local or
    169.254.169.254.nip.io are blocked even if the literal value is not an IP.
    """
    # Fast path: literal IP address
    try:
        ipaddress.ip_address(host)
        if _is_private_addr(host):
            raise ValueError(f"webhook target must be a public URL (private IP blocked: {host})")
        return
    except ValueError as exc:
        if "webhook target" in str(exc):
            raise
        # Not a literal IP: fall through to DNS resolution

    # DNS resolution path: resolve and check each returned address
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        # DNS failure: conservatively block rather than allow unknown targets
        raise ValueError(f"webhook hostname could not be resolved: {host}")
    for info in infos:
        addr_str = info[4][0]
        if _is_private_addr(addr_str):
            raise ValueError(
                f"webhook target resolves to a private IP ({addr_str}): blocked to prevent SSRF"
            )


# ─── Schema ───────────────────────────────────────────────────────────────────

class SubscriberCreate(BaseModel):
    channel: str = Field(..., min_length=1, max_length=20)
    target: str = Field(..., min_length=1, max_length=500)
    label: str = Field(..., min_length=1, max_length=100)
    severity_min: str = Field("high", min_length=1, max_length=20)
    district_filter: Optional[str] = Field(None, max_length=12)
    created_by: str = Field("operator", min_length=1, max_length=100)

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

    @model_validator(mode="after")
    def check_email_format(self) -> "SubscriberCreate":
        """Validate email format when channel is 'email'."""
        if self.channel == "email":
            pattern = r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$"
            if not re.match(pattern, self.target):
                raise ValueError("target must be a valid email address for email channel (e.g. ops@indeci.gob.pe)")
        return self

    @model_validator(mode="after")
    def check_webhook_url_safe(self) -> "SubscriberCreate":
        if self.channel != "webhook":
            return self
        parsed = urlparse(self.target)
        if parsed.scheme not in ("http", "https"):
            raise ValueError("webhook target must use http or https")
        host = parsed.hostname or ""
        _reject_private_host(host)
        return self


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
    op: CurrentOperator = Depends(require_operator),
) -> list[SubscriberOut]:
    await db.execute(text("SET LOCAL statement_timeout = '5000'"))
    result = await db.execute(
        text(
            "SELECT * FROM ops.notification_subscribers"
            " WHERE (:active_only = FALSE OR active = TRUE)"
            " ORDER BY created_at DESC"
        ),
        {"active_only": active_only},
    )
    return [SubscriberOut(**dict(r)) for r in result.mappings().all()]


@router.post("", response_model=SubscriberOut, status_code=201)
async def create_subscriber(
    body: SubscriberCreate,
    db: AsyncSession = Depends(get_db),
    op: CurrentOperator = Depends(require_operator),
) -> SubscriberOut:
    await _check_notif_create_rate(op.username)
    await db.execute(text("SET LOCAL statement_timeout = '5000'"))
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
            "by": op.username,
        },
    )
    await db.commit()
    return SubscriberOut(**dict(row.mappings().one()))


@router.delete("/{sub_id}", status_code=204)
async def delete_subscriber(
    sub_id: int,
    db: AsyncSession = Depends(get_db),
    op: CurrentOperator = Depends(require_operator),
) -> None:
    await db.execute(text("SET LOCAL statement_timeout = '5000'"))
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
    op: CurrentOperator = Depends(require_operator),
) -> list[DeliveryOut]:
    await db.execute(text("SET LOCAL statement_timeout = '5000'"))
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


async def _send_webhook(target: str, payload: dict, timeout: float = 5.0, retries: int = 3) -> tuple[bool, str, int]:
    """POST payload to webhook URL. Returns (success, error_message, attempt_count)."""
    parsed = urlparse(target)
    host = parsed.hostname or ""
    try:
        _reject_private_host(host)
    except ValueError as exc:
        return False, str(exc), 0

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
                    return True, "", attempt
                last_err = f"HTTP {resp.status_code}"
            except Exception as exc:
                last_err = str(exc)
            if attempt < retries:
                # Short fixed delays: this is emergency alert fan-out, not a background job.
                await asyncio.sleep(0.5 * attempt)
    return False, last_err, retries


async def _send_sms(to_number: str, body: str) -> tuple[bool, str]:
    """Send SMS via Twilio. Returns (success, error). No-ops if credentials absent."""
    if not settings.twilio_enabled:
        logger.info("[notifications] Twilio not configured: SMS stub for %s", to_number)
        return False, "twilio_not_configured"
    try:
        from twilio.rest import Client  # lazy import: optional dep
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


_FAN_OUT_CONCURRENCY = 10  # max parallel webhook/SMS dispatches
_FAN_OUT_SUBSCRIBER_CAP = 500  # safety cap on subscribers loaded per fan-out


async def _dispatch_to_subscriber(
    sub: dict,
    payload: dict,
    alert_id: Optional[int],
    trigger_event: str,
    semaphore: asyncio.Semaphore,
) -> None:
    """Dispatch a single notification; record delivery result. Bounded by semaphore."""
    async with semaphore:
        channel = sub["channel"]
        if channel == "webhook":
            success, err, attempts = await _send_webhook(sub["target"], payload)
            status = "delivered" if success else "failed"
            await _record_delivery(sub["id"], alert_id, trigger_event, status, attempts, err or None)
        elif channel == "sms":
            sms_body = (
                f"[COSTA RESILIENTE] {(payload.get('severity') or 'ALERTA').upper()}: "
                f"{payload.get('title') or trigger_event}. "
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
            # sms_stub / email: log intent, no provider call
            logger.info("[notifications] stub %s → %s: alert_id=%s event=%s", channel, sub["label"], alert_id, trigger_event)
            await _record_delivery(sub["id"], alert_id, trigger_event, "skipped", 0, f"{channel} stub: not wired")


async def fan_out_notifications(
    alert_id: Optional[int],
    alert_severity: str,
    alert_title: str,
    alert_district_ubigeo: Optional[str],
    trigger_event: str,
) -> None:
    """Background task: query matching subscribers and dispatch notifications in parallel."""
    try:
        sev_rank = SEVERITY_RANK.get(alert_severity, 0)

        async with engine.begin() as conn:
            # engine.begin() opens an explicit transaction so SET LOCAL takes effect
            await conn.execute(text("SET LOCAL statement_timeout = '5000'"))
            # Apply severity and district filters in SQL so LIMIT is on matched rows,
            # not on the full subscriber table. Without this, high-ID subscribers (added
            # later) are silently skipped when total active > _FAN_OUT_SUBSCRIBER_CAP.
            result = await conn.execute(
                text("""
                    SELECT id, channel, target, label, severity_min, district_filter
                    FROM ops.notification_subscribers
                    WHERE active = TRUE
                      AND CASE severity_min
                            WHEN 'low'      THEN 0
                            WHEN 'medium'   THEN 1
                            WHEN 'high'     THEN 2
                            WHEN 'critical' THEN 3
                            ELSE 2
                          END <= :sev_rank
                      AND (
                            district_filter IS NULL
                            OR :alert_ubigeo IS NULL
                            OR :alert_ubigeo LIKE district_filter || '%'
                          )
                    ORDER BY id
                    LIMIT :cap
                """),
                {
                    "sev_rank": sev_rank,
                    "alert_ubigeo": alert_district_ubigeo,
                    "cap": _FAN_OUT_SUBSCRIBER_CAP,
                },
            )
            subscribers = result.mappings().all()

        payload = {
            "event": trigger_event,
            "alert_id": alert_id,
            "severity": alert_severity,
            "title": alert_title,
            "district_ubigeo": alert_district_ubigeo,
            "source": "costa-resiliente",
        }

        semaphore = asyncio.Semaphore(_FAN_OUT_CONCURRENCY)
        tasks = [
            _dispatch_to_subscriber(dict(sub), payload, alert_id, trigger_event, semaphore)
            for sub in subscribers
        ]

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            failed = sum(1 for r in results if isinstance(r, Exception))
            if failed:
                logger.warning("[notifications] fan_out: %d/%d dispatches raised exceptions", failed, len(results))
    except Exception as exc:
        logger.exception("[notifications] fan_out error: %s", exc)
