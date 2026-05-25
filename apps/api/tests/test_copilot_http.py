"""HTTP-level tests for POST /api/v1/copilot/ask.

These pin the Pydantic field constraints on CopilotQuery at the transport
layer — complementing the unit-level tests in test_ai_agent.py which mock
the LLM.  No Ollama is needed: requests that fail Pydantic validation are
rejected before the agent runs.

Session 16 adds auth guard to /copilot/ask; write tests include AUTH header,
and a 401 test verifies the guard fires for unauthenticated callers.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport

from costa_api.main import app

BASE = "http://test"
AUTH = {"X-Testing-Operator": "1:test-op:coer"}

# Minimal valid payload — small enough to pass guardrails without touching LLM
_VALID = {
    "query": "¿Cuántas alertas activas hay?",
    "operator_id": "coen_lima",
}


@pytest.mark.asyncio
async def test_copilot_unauthenticated_returns_401():
    """No auth header → 401 before agent runs."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/copilot/ask", json=_VALID)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_copilot_query_over_5000_chars_rejected():
    """CopilotQuery.query has max_length=5000; longer must return 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/copilot/ask",
            json={**_VALID, "query": "Q" * 5001},
            headers=AUTH,
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_copilot_operator_id_over_100_chars_rejected():
    """CopilotQuery.operator_id has max_length=100; longer must return 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/copilot/ask",
            json={**_VALID, "operator_id": "O" * 101},
            headers=AUTH,
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_copilot_empty_operator_id_rejected():
    """CopilotQuery.operator_id has min_length=1; empty string must return 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/copilot/ask",
            json={**_VALID, "operator_id": ""},
            headers=AUTH,
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_copilot_empty_query_rejected():
    """CopilotQuery.query has min_length=1; empty string must return 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/copilot/ask",
            json={**_VALID, "query": ""},
            headers=AUTH,
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_copilot_session_id_over_64_chars_rejected():
    """CopilotQuery.session_id has max_length=64; longer must return 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/copilot/ask",
            json={**_VALID, "session_id": "S" * 65},
            headers=AUTH,
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_copilot_district_ubigeo_over_12_chars_rejected():
    """CopilotQuery.district_ubigeo has max_length=12; longer must return 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post(
            "/api/v1/copilot/ask",
            json={**_VALID, "district_ubigeo": "1" * 13},
            headers=AUTH,
        )
    assert resp.status_code == 422
