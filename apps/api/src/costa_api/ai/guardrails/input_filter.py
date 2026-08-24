"""Input guardrail: screens operator queries before they reach the LLM.

Threat model:
  - Prompt injection: attacker embeds instructions in query to hijack the model
  - Role-pivot: "ignore previous instructions", "act as", DAN-style prompts
  - System-prompt leak: "repeat your system prompt"
  - Shell/SQL injection patterns sneaked through natural language
  - Off-topic requests unrelated to disaster management

Two-stage check:
  1. Fast regex blocklist  (<1ms, no LLM call)
  2. Optional LLM classify (<100ms, only if regex passes and LLM available)

Result: GuardResult with .ok bool + .reason str.
"""

from __future__ import annotations

import logging
import re
import unicodedata

logger = logging.getLogger(__name__)

# ─── Regex blocklist ──────────────────────────────────────────────────────────

_INJECTION_PATTERNS: list[tuple[str, str]] = [
    # Role pivot: English
    (r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions?", "role_pivot"),
    (r"\bact\s+as\b.{0,30}\b(admin|root|god|jailbreak|DAN)\b", "role_pivot"),
    (r"\bforget\s+(all\s+)?(your\s+)?(previous\s+)?instructions?\b", "role_pivot"),
    (r"\byou\s+are\s+now\b.{0,40}\b(free|unrestricted|liberated)\b", "role_pivot"),
    (r"\bpretend\s+(you\s+are|to\s+be)\b.{0,40}\b(admin|root|expert|unrestricted)\b", "role_pivot"),
    # Role pivot: Spanish (operators may attempt in Spanish inadvertently or deliberately)
    (r"ignora\s+(todas?\s+)?(las?\s+)?(instrucciones?|reglas?)\s+(anteriores?|previas?)", "role_pivot"),
    (r"olvida\s+(todas?\s+)?(tus\s+)?(instrucciones?|reglas?)", "role_pivot"),
    (r"act[úu]a\s+como\b.{0,40}\b(admin|root|libre|sin\s+restricci)", "role_pivot"),
    (r"ahora\s+eres\b.{0,40}\b(libre|sin\s+restricci|desbloquead)", "role_pivot"),
    # System-prompt leak: English
    (r"\brepeat\b.{0,30}\b(system\s+prompt|instructions?)\b", "prompt_leak"),
    (r"\bwhat\s+(are|were|is)\s+your\s+(instructions?|prompt|initial\s+instructions?)\b", "prompt_leak"),
    (r"\bwhat\s+(were|are)\s+your\s+initial\b", "prompt_leak"),
    (r"\bprint\s+(your|the|my)?\s*(system\s+prompt|initial\s+prompt|instructions?)\b", "prompt_leak"),
    (r"\bshow\s+(me\s+)?(your\s+)?(system|internal)\s+prompt\b", "prompt_leak"),
    (r"\bwhat\s+is\s+your\s+system\s+prompt\b", "prompt_leak"),
    # System-prompt leak: Spanish
    (r"(repite|muestra|dime|imprime)\s+(tu|el)\s+(prompt\s+del?\s+sistema|instrucciones?|prompt\s+inicial)", "prompt_leak"),
    (r"cu[áa]les?\s+son\s+tus\s+(instrucciones?|reglas?|restricciones?)\b", "prompt_leak"),
    # Shell / code injection
    (r";\s*(rm|drop|delete|truncate|shutdown|exec|eval|system)\s+", "code_injection"),
    (r"\b(exec|eval|__import__|subprocess|os\.system|subprocess\.call)\b", "code_injection"),
    (r"(--|#)\s*.*?(DROP|DELETE|TRUNCATE|INSERT|UPDATE)\s+", "sql_injection"),
    # Key / secret fishing
    (r"\b(api[_\s]key|secret[_\s]key|password|token|credential)\s*[:=]", "secret_fish"),
    (r"\b(contrase[ñn]a|clave\s+secreta|token\s+de\s+acceso)\s*[:=]", "secret_fish"),
    # Jailbreak idioms
    (r"\bDAN\b", "jailbreak"),
    (r"\bdo\s+anything\s+now\b", "jailbreak"),
    (r"\bjailbreak\b", "jailbreak"),
    (r"\bGPT[-\s]?(4|3|turbo|jailbreak)\b", "jailbreak"),
    (r"\bsin\s+(restricciones?|l[íi]mites?|filtros?)\b", "jailbreak"),
]

_COMPILED = [(re.compile(p, re.IGNORECASE | re.DOTALL), label) for p, label in _INJECTION_PATTERNS]

# Minimum query length: reject empty/trivial
_MIN_LEN = 3
_MAX_LEN = 2000


class GuardResult:
    __slots__ = ("ok", "reason", "label")

    def __init__(self, ok: bool, reason: str = "", label: str = "") -> None:
        self.ok = ok
        self.reason = reason
        self.label = label

    @classmethod
    def allow(cls) -> "GuardResult":
        return cls(True)

    @classmethod
    def block(cls, reason: str, label: str) -> "GuardResult":
        return cls(False, reason, label)


def check_input(query: str, operator_id: str = "unknown") -> GuardResult:
    """Synchronous regex guardrail. Call before any LLM call."""
    if len(query) < _MIN_LEN:
        return GuardResult.block("Consulta demasiado corta", "too_short")
    if len(query) > _MAX_LEN:
        return GuardResult.block("Consulta demasiado larga", "too_long")

    # NFKC normalise before pattern matching: decomposes compatibility characters
    # (ligatures, zero-width spaces, fullwidth letters) without splitting normal
    # accented chars like ú/á/ñ into base + combining mark, which would break
    # the Spanish injection patterns.
    normalised = unicodedata.normalize("NFKC", query)

    for pattern, label in _COMPILED:
        if pattern.search(normalised):
            logger.warning(
                "input_guardrail blocked | op=%s label=%s snippet=%.60r",
                operator_id, label, query,
            )
            return GuardResult.block(
                "Consulta contiene contenido no permitido en este sistema",
                label,
            )

    return GuardResult.allow()
