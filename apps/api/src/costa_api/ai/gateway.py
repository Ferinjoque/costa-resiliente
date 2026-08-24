"""Unified LLM gateway: single interface over Ollama or OpenAI-compat providers.

Usage:
    from costa_api.ai.gateway import gateway

    response = await gateway.chat(messages, tools=my_tools)
    embedding = await gateway.embed("texto a embeder")
"""

from __future__ import annotations

import logging
from typing import Any

from costa_api.config import settings
from costa_api.ai.providers import ollama as _ollama

logger = logging.getLogger(__name__)


class LLMGateway:
    """Thin facade so the rest of the code never imports a provider directly."""

    async def chat(
        self,
        messages: list[dict],
        model: str | None = None,
        tools: list[dict] | None = None,
        response_format: str | None = None,
        temperature: float = 0.1,
        timeout: float | None = None,
    ) -> dict:
        return await _ollama.chat(
            messages=messages,
            model=model or settings.llm_primary_model,
            tools=tools,
            response_format=response_format,
            temperature=temperature,
            timeout=timeout,
        )

    async def chat_fast(
        self,
        messages: list[dict],
        response_format: str | None = None,
        temperature: float = 0.0,
    ) -> dict:
        """Use the fast/small model (guardrail classify, simple tasks)."""
        return await _ollama.chat(
            messages=messages,
            model=settings.llm_fast_model,
            response_format=response_format,
            temperature=temperature,
            timeout=15.0,
        )

    async def embed(self, text: str) -> list[float]:
        return await _ollama.embed(text, model=settings.llm_embed_model)

    def extract_text(self, response: dict) -> str:
        return _ollama.extract_text(response)

    def extract_tool_calls(self, response: dict) -> list[dict]:
        return _ollama.extract_tool_calls(response)

    def parse_json(self, response: dict) -> dict:
        return _ollama.parse_json_content(response)


gateway = LLMGateway()
