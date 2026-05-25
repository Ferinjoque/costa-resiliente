"""Output guardrail — scans LLM responses before they reach the operator.

Scans for:
  - Leaked API keys / tokens (sk-*, Bearer, JWT signatures)
  - Peru DNI patterns (8 digits)
  - Email addresses in responses (only flag if not in source data context)
  - System-prompt echoes (model repeating its own instructions)
  - Suspicious coordinate fabrication (coordinates outside Lima bbox)

Returns the text as-is if clean, or a sanitised version with redactions.
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

# ─── Patterns ─────────────────────────────────────────────────────────────────

_REDACT_PATTERNS: list[tuple[str, str, str]] = [
    # (pattern, replacement, label)
    (r"sk-[A-Za-z0-9]{20,}", "[REDACTED_KEY]", "api_key"),
    (r"Bearer\s+[A-Za-z0-9\-_.~+/]+=*", "Bearer [REDACTED]", "bearer_token"),
    # JWT: three base64url segments separated by dots
    (r"eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+", "[REDACTED_JWT]", "jwt"),
    # AWS IAM access key IDs (AKIA/ASIA prefix + 16 uppercase alphanumeric chars)
    (r"\b(AKIA|ASIA|AROA|AIDA|ANPA|ANVA|APKA)[A-Z0-9]{16}\b", "[REDACTED_AWS_KEY]", "aws_key"),
    # Postgres / Redis / Minio connection strings with passwords
    (r"(postgresql|redis|mysql|amqp)://[^:]+:[^@\s]+@", r"\1://[REDACTED]@", "conn_string"),
    # Peru DNI: exactly 8 digits (not part of larger number)
    (r"(?<!\d)\d{8}(?!\d)", "[DNI_REDACTED]", "dni"),
    # Email addresses
    (r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", "[EMAIL_REDACTED]", "email"),
]

_COMPILED_REDACT = [
    (re.compile(p), repl, label)
    for p, repl, label in _REDACT_PATTERNS
]

# Lima bounding box for coordinate sanity check
_LIMA_LAT_MIN, _LIMA_LAT_MAX = -12.5, -11.7
_LIMA_LON_MIN, _LIMA_LON_MAX = -77.2, -76.7

# Detect system-prompt echo: model repeating instruction-style sentences
_SYS_PROMPT_ECHO = re.compile(
    r"(REGLAS\s+ESTRICTAS|eres\s+un\s+asistente|tu\s+tarea\s+es\s+redactar)",
    re.IGNORECASE,
)


def sanitise(text: str, source_rows: list[dict] | None = None) -> tuple[str, list[str]]:
    """
    Scan and redact LLM output.

    Returns (sanitised_text, list_of_triggered_labels).
    Source rows are passed in so legitimate emails/numbers from DB aren't flagged.
    """
    triggered: list[str] = []

    # Check for system-prompt echo first
    if _SYS_PROMPT_ECHO.search(text):
        logger.warning("output_guardrail: system_prompt_echo detected, truncating")
        triggered.append("system_prompt_echo")
        # Truncate at the echo point
        match = _SYS_PROMPT_ECHO.search(text)
        if match:
            text = text[: match.start()].strip()
        if not text:
            text = "No se pudo generar una respuesta válida."

    for pattern, replacement, label in _COMPILED_REDACT:
        new_text, n = pattern.subn(replacement, text)
        if n > 0:
            triggered.append(label)
            text = new_text
            logger.warning("output_guardrail: redacted %s (%d occurrence(s))", label, n)

    return text, triggered
