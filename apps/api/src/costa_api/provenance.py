"""Provenance: does a model_version stamp denote real model output?

Shared by the map layers, fusion and the copilot, so every surface applies the
same rule to the same row.
"""
from typing import Any

# Version strings that denote scenario data rather than genuine model output.
DEMO_VERSION_MARKERS = ("demo", "fixture", "scenario", "synthetic")


def is_demo_version(version: Any) -> bool:
    """True when a model_version does not denote real model output.

    An unstamped row (NULL) counts as demonstration data on purpose: a row that
    cannot prove where it came from must never be presented to an operator as a
    real detection. Failing closed here is what keeps the map honest when a
    refresh job dies halfway.
    """
    if not version:
        return True
    lowered = str(version).lower()
    return any(marker in lowered for marker in DEMO_VERSION_MARKERS)
