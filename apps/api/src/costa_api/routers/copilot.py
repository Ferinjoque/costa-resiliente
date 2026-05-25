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
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.db import get_db, get_ai_db
from costa_api.ai.agent import run as agent_run, AgentResult
from costa_api.ai.rag import search_protocols

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/copilot", tags=["copilot"])


# ─── Request / Response ───────────────────────────────────────────────────────

class CopilotQuery(BaseModel):
    query: str = Field(..., min_length=1, max_length=5000)
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
) -> None:
    payload = {
        "query": query,
        "tool_calls": result.tool_calls,
        "result_count": len(result.sources),
        "answer_preview": result.answer[:200],
        "blocked": result.blocked,
        "redacted": result.redacted,
    }
    try:
        await db.execute(
            text("""
                INSERT INTO ops.decision_log
                    (operator_id, action_type, payload, session_id)
                VALUES (:op, 'query', CAST(:payload AS jsonb), :session)
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
) -> CopilotResponse:
    """
    Operator NL query → agentic tool loop → Spanish answer.
    LLM never fabricates: all claims trace to DB rows in sources[].
    """
    result: AgentResult = await agent_run(
        query=query.query,
        operator_id=query.operator_id,
        db=ai_db,
        rag_fn=search_protocols,
    )

    # Log security event if blocked
    if result.blocked:
        await _log_security_event(db, query.operator_id, "input_blocked", result.block_reason)

    # Log decision (always, even for blocked queries so operators can review)
    await _log_decision(db, query.operator_id, query.query, result, query.session_id)

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
    )
