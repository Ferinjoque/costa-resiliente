"""Ollama provider — wraps /api/chat and /api/embeddings with retries."""

from __future__ import annotations

import asyncio
import re
import json
import logging
from typing import Any

import httpx

from costa_api.config import settings

logger = logging.getLogger(__name__)

_RETRY_STATUSES = {429, 503, 502}
_RETRY_DELAY_S = 0.5  # brief pause before retry so Ollama can shed load


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
                    logger.warning("Ollama %s (attempt %d), retrying in %.1fs", resp.status_code, attempt + 1, _RETRY_DELAY_S)
                    await asyncio.sleep(_RETRY_DELAY_S)
                    continue
                resp.raise_for_status()
                return resp.json()
            except httpx.TimeoutException:
                # Don't retry on timeout — let callers fall back to keyword dispatch
                logger.warning("Ollama chat timeout (attempt %d) — not retrying", attempt + 1)
                raise
    raise RuntimeError("Ollama: all retries exhausted")


async def embed(text: str, model: str | None = None) -> list[float]:
    """POST /api/embeddings — returns embedding vector (1 retry on 429/503/502)."""
    model = model or settings.llm_embed_model
    async with httpx.AsyncClient(timeout=settings.llm_timeout_embed) as client:
        for attempt in range(2):
            try:
                resp = await client.post(
                    f"{settings.llm_base_url}/api/embeddings",
                    json={"model": model, "prompt": text},
                )
                if resp.status_code in _RETRY_STATUSES and attempt < 1:
                    logger.warning("Ollama embed %s (attempt %d), retrying in %.1fs", resp.status_code, attempt + 1, _RETRY_DELAY_S)
                    await asyncio.sleep(_RETRY_DELAY_S)
                    continue
                resp.raise_for_status()
                return resp.json()["embedding"]
            except httpx.TimeoutException:
                logger.warning("Ollama embed timeout (attempt %d) — not retrying", attempt + 1)
                raise
    raise RuntimeError("Ollama embed: all retries exhausted")


def extract_text(response: dict) -> str:
    return response["message"]["content"].strip()


_TEXT_TOOL_CALL_RE = re.compile(
    r'\{\s*"(?:name|tool)"\s*:\s*"(?P<name>[a-z_]+)"'
    r'(?:\s*,\s*"(?:arguments|args|parameters)"\s*:\s*(?P<args>\{.*?\}))?\s*\}',
    re.DOTALL,
)


def extract_tool_calls(response: dict) -> list[dict]:
    """Return list of {"function": {"name", "arguments"}} dicts, or empty.

    Ollama normally returns tool calls in the structured `tool_calls` field, but
    qwen2.5 intermittently emits them as JSON *inside* the message content
    instead. When that happened the agent loop saw "no tool calls", stopped, and
    handed the raw content to the operator — producing answers like
    `Ronaldo\\n{"name": "get_active_alerts", ...}`. So fall back to scraping
    tool-call JSON out of the content.
    """
    structured = response.get("message", {}).get("tool_calls", []) or []
    if structured:
        return structured

    content = (response.get("message", {}) or {}).get("content") or ""
    if "{" not in content:
        return []

    recovered: list[dict] = []
    for match in _TEXT_TOOL_CALL_RE.finditer(content):
        args: dict = {}
        raw_args = match.group("args")
        if raw_args:
            try:
                args = json.loads(raw_args)
            except json.JSONDecodeError:
                args = {}
        recovered.append({"function": {"name": match.group("name"), "arguments": args}})
    if recovered:
        logger.info("Recovered %d tool call(s) from message content", len(recovered))
    return recovered


def parse_json_content(response: dict) -> dict:
    """Parse JSON from message content; raises ValueError on bad JSON."""
    raw = extract_text(response)
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())
