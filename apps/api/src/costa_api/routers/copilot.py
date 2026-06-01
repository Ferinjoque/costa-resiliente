"""Operator Copilot — agentic NL query → multi-tool → Spanish answer.

Pipeline (see ai/agent.py for details):
  1. Input guardrail: regex prompt-injection filter
  2. LLM + tool schemas: model selects tools (DB, RAG, alerts)
  3. Tool execution: whitelisted parameterised queries only (no LLM SQL)
  4. Answer generation: Spanish prose citing real DB rows
  5. Output guardrail: redact leaked keys / PII
  6. Decision log: append-only trace to ops.decision_log

Security invariants:
  - Operator input NEVER reaches raw SQL or DB directly
  - Social signal text NEVER enters LLM context unredacted
  - All numerical claims trace to source_refs rows
  - LLM uses read-only AI DB user (see db.py / ai/tools/db_tools.py)
  - Proposed alerts require human approval (ops.alert_proposals, separate endpoint)
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, status
import asyncio

from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.config import settings
from costa_api.db import get_db, get_ai_db
from costa_api.ai.agent import run as agent_run, AgentResult
from costa_api.ai.rag import search_protocols
from costa_api.routers.auth import require_operator, CurrentOperator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/copilot", tags=["copilot"])

# ─── Per-operator rate limit ──────────────────────────────────────────────────
# 6 copilot queries per operator per 60-second window.
# Fails open: Redis unavailability never blocks legitimate operators.

_COPILOT_RATE_LIMIT = 6
_COPILOT_RATE_WINDOW = 60
_copilot_rl_client: aioredis.Redis | None = None
TESTING = os.environ.get("TESTING", "0") == "1"


def _get_copilot_rl_client() -> aioredis.Redis | None:
    global _copilot_rl_client
    if _copilot_rl_client is None:
        try:
            _copilot_rl_client = aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=1,
            )
        except Exception as exc:
            logger.warning("[copilot] Redis rate-limiter init failed: %s", exc)
    return _copilot_rl_client


async def _check_copilot_rate(operator_id: str) -> None:
    """Raise 429 if operator has exceeded query limit. Fails open on Redis outage."""
    if TESTING or os.environ.get("TESTING", "0") == "1":
        return
    client = _get_copilot_rl_client()
    if client is None:
        return
    key = f"costa:copilot:rate:{operator_id}"
    try:
        count = await client.incr(key)
        if count == 1:
            await client.expire(key, _COPILOT_RATE_WINDOW)
        if count > _COPILOT_RATE_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiadas consultas. Espere 60 segundos.",
                headers={"Retry-After": str(_COPILOT_RATE_WINDOW)},
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("[copilot] Rate-limit check failed (fail-open): %s", exc)


# ─── Request / Response ───────────────────────────────────────────────────────

class CopilotQuery(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    district_ubigeo: Optional[str] = Field(None, max_length=12)
    operator_id: str = Field(..., min_length=1, max_length=100)
    session_id: Optional[str] = Field(None, max_length=64)


class CopilotResponse(BaseModel):
    answer: str
    sources: list[dict]
    confidence: float
    tool_calls: list[dict] = []  # agentic trace: [{tool, args, count}]
    blocked: bool = False
    redacted: bool = False
    quick_mode: bool = False  # True when LLM was bypassed (keyword → template, ~2s)
    mode: str = "full"  # "sitrep" | "quick" | "full" — differentiates query paths


# ─── Backward-compat exports (referenced by sprint5 contract tests) ───────────
# These are preserved so existing tests don't break after the copilot rewrite.

INTENT_TYPES = [
    "flood_status", "huayco_risk", "river_level", "social_cluster",
    "infrastructure_impact", "rainfall_accumulation", "unknown",
]

SUMMARY_SYSTEM_PROMPT = (
    "Eres un asistente de gestión de emergencias para Lima Metropolitana, Perú. "
    "Solo menciona números y lugares que aparezcan explícitamente en los datos. "
    "No especules ni inventes información. Máximo 3 oraciones."
)


# ─── Decision log ─────────────────────────────────────────────────────────────

async def _log_decision(
    db: AsyncSession,
    operator_id: str,
    query: str,
    result: AgentResult,
    session_id: Optional[str],
    duration_ms: int = 0,
) -> None:
    payload = {
        "query": query,
        "tool_calls": result.tool_calls,
        "result_count": len(result.sources),
        "answer_preview": result.answer[:200],
        "blocked": result.blocked,
        "redacted": result.redacted,
        "duration_ms": duration_ms,
        "mode": result.mode,
    }
    try:
        await db.execute(text("SET LOCAL statement_timeout = '5000'"))
        await db.execute(
            text("""
                INSERT INTO ops.decision_log
                    (operator_id, action_type, payload, session_id)
                VALUES (:op, 'copilot', CAST(:payload AS jsonb), :session)
            """),
            {
                "op": operator_id,
                "payload": json.dumps(payload, default=str, ensure_ascii=False),
                "session": session_id,
            },
        )
        await db.commit()
    except Exception as exc:
        logger.warning("decision_log insert failed: %s", exc)


# ─── Security event log ───────────────────────────────────────────────────────

async def _log_security_event(
    db: AsyncSession,
    operator_id: str,
    event_type: str,
    detail: str,
) -> None:
    try:
        await db.execute(text("SET LOCAL statement_timeout = '5000'"))
        await db.execute(
            text("""
                INSERT INTO ops.security_events
                    (operator_id, event_type, detail, created_at)
                VALUES (:op, :et, :detail, NOW())
            """),
            {"op": operator_id, "et": event_type, "detail": detail[:500]},
        )
        await db.commit()
    except Exception as exc:
        logger.warning("security_event insert failed (non-blocking): %s", exc)


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/ask", response_model=CopilotResponse)
async def ask(
    query: CopilotQuery,
    db: AsyncSession = Depends(get_db),
    ai_db: AsyncSession = Depends(get_ai_db),
    op: CurrentOperator = Depends(require_operator),
) -> CopilotResponse:
    """
    Operator NL query → agentic tool loop → Spanish answer.
    LLM never fabricates: all claims trace to DB rows in sources[].
    """
    # Use JWT identity for decision log (prevents operator_id spoofing)
    operator_id = op.username

    await _check_copilot_rate(operator_id)

    _start = datetime.now(timezone.utc)
    try:
        result: AgentResult = await asyncio.wait_for(
            agent_run(
                query=query.query,
                operator_id=operator_id,
                db=ai_db,
                rag_fn=search_protocols,
            ),
            timeout=90.0,
        )
    except asyncio.TimeoutError:
        logger.error("copilot/ask: agent_run timed out (>90s) for operator=%s", operator_id)
        # Decrement rate-limit counter on timeout so retry doesn't double-count.
        # Without this, a timed-out SITREP (rare but possible under load) would consume
        # 2 of 6 quota slots — making the rate limiter more punishing than intended.
        try:
            rl_client = _get_copilot_rl_client()
            if rl_client:
                await rl_client.decr(f"costa:copilot:rate:{operator_id}")
        except Exception:
            pass
        raise HTTPException(
            status_code=503,
            detail="El asistente no respondió a tiempo. Reintenta en unos segundos.",
        )
    except Exception as exc:
        logger.error("copilot/ask: unexpected error for operator=%s: %s", operator_id, exc)
        raise HTTPException(
            status_code=503,
            detail="Error interno del asistente. Reintenta o usa una consulta diferente.",
        )

    # Log security event if blocked
    if result.blocked:
        await _log_security_event(db, operator_id, "input_blocked", result.block_reason)

    # Log decision (always, even for blocked queries so operators can review)
    _duration_ms = int((datetime.now(timezone.utc) - _start).total_seconds() * 1000)
    await _log_decision(db, operator_id, query.query, result, query.session_id, duration_ms=_duration_ms)

    if result.blocked:
        raise HTTPException(
            status_code=400,
            detail=result.block_reason or "Consulta no permitida",
        )

    return CopilotResponse(
        answer=result.answer,
        sources=result.sources,
        confidence=result.confidence,
        tool_calls=result.tool_calls,
        blocked=result.blocked,
        redacted=result.redacted,
        quick_mode=result.quick_mode,
        mode=result.mode,
    )
