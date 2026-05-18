"""Ollama provider — wraps /api/chat and /api/embeddings with retries."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from costa_api.config import settings

logger = logging.getLogger(__name__)

_RETRY_STATUSES = {429, 503, 502}


async def chat(
    messages: list[dict],
    model: str | None = None,
    tools: list[dict] | None = None,
    response_format: str | None = None,  # "json" to force JSON mode
    temperature: float = 0.1,
    timeout: float | None = None,
) -> dict:
    """POST /api/chat — returns full Ollama response dict."""
    model = model or settings.llm_primary_model
    timeout = timeout or settings.llm_timeout_chat

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": 256,   # tool calls are short JSON; cap keeps inference fast
            "num_ctx": 8192,      # default 32k → 8k; fits 4 tool iterations comfortably, 3x faster KV
        },
    }
    if tools:
        payload["tools"] = tools
    if response_format == "json":
        payload["format"] = "json"

    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(2):  # 1 retry max (not on timeout — callers use keyword fallback)
            try:
                resp = await client.post(
                    f"{settings.llm_base_url}/api/chat",
                    json=payload,
                )
                if resp.status_code in _RETRY_STATUSES and attempt < 1:
                    logger.warning("Ollama %s (attempt %d), retrying", resp.status_code, attempt + 1)
                    continue
                resp.raise_for_status()
                return resp.json()
            except httpx.TimeoutException:
                # Don't retry on timeout — let callers fall back to keyword dispatch
                logger.warning("Ollama timeout — not retrying")
                raise
    raise RuntimeError("Ollama: all retries exhausted")


async def embed(text: str, model: str | None = None) -> list[float]:
    """POST /api/embeddings — returns embedding vector."""
    model = model or settings.llm_embed_model
    async with httpx.AsyncClient(timeout=settings.llm_timeout_embed) as client:
        resp = await client.post(
            f"{settings.llm_base_url}/api/embeddings",
            json={"model": model, "prompt": text},
        )
        resp.raise_for_status()
        return resp.json()["embedding"]


def extract_text(response: dict) -> str:
    return response["message"]["content"].strip()


def extract_tool_calls(response: dict) -> list[dict]:
    """Return list of {name, arguments} dicts from tool_calls, or empty."""
    return response.get("message", {}).get("tool_calls", []) or []


def parse_json_content(response: dict) -> dict:
    """Parse JSON from message content; raises ValueError on bad JSON."""
    raw = extract_text(response)
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())
