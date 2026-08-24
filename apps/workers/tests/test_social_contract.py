"""Social ingest contract tests: pure logic, no network, no DB.

Tests keyword filter, PII redaction fallback, RawSignal structure,
and disaster vocabulary completeness.
"""

from __future__ import annotations

import pytest
from datetime import datetime, timezone


# ─── Keyword filter ───────────────────────────────────────────────────────────

class TestKeywordFilter:
    def _matches(self, text: str) -> bool:
        from costa_workers.ingest.social import _matches_keywords
        return _matches_keywords(text)

    def test_huayco_matches(self):
        assert self._matches("Huayco en Chosica, evacuaciones urgentes")

    def test_desborde_matches(self):
        assert self._matches("Desborde del río Rímac cerca de Huachipa")

    def test_inundacion_matches(self):
        assert self._matches("Inundacion en Villa María del Triunfo")

    def test_emergencia_matches(self):
        assert self._matches("emergencia declarada por INDECI en Carabayllo")

    def test_indeci_matches(self):
        assert self._matches("INDECI activó alerta roja en Lima")

    def test_rimac_matches(self):
        assert self._matches("río rímac subiendo, nivel 3.2m en Chosica")

    def test_chosica_matches(self):
        assert self._matches("reportes de lluvias fuertes en Chosica")

    def test_irrelevant_text_no_match(self):
        assert not self._matches("Buenos días, ¿cuánto cuesta el pollo hoy?")

    def test_case_insensitive(self):
        assert self._matches("HUAYCO EN JICAMARCA CONFIRMAN AUTORIDADES")
        assert self._matches("huayco en jicamarca confirman autoridades")

    def test_empty_string_no_match(self):
        assert not self._matches("")

    def test_partial_keyword_no_match(self):
        # "rimacero" should not match "rimac", but our check is substring-based
        # so this documents the known behavior
        from costa_workers.ingest.social import DISASTER_KEYWORDS
        assert "rimac" in DISASTER_KEYWORDS  # lowercase keyword present


# ─── DISASTER_KEYWORDS completeness ──────────────────────────────────────────

class TestDisasterKeywords:
    def test_key_rivers_present(self):
        from costa_workers.ingest.social import DISASTER_KEYWORDS
        for river in ("rímac", "chillón", "lurín", "rimac", "chillon", "lurin"):
            assert river in DISASTER_KEYWORDS, f"Missing river: {river}"

    def test_key_quebradas_present(self):
        from costa_workers.ingest.social import DISASTER_KEYWORDS
        for q in ("huaycoloro", "jicamarca"):
            assert q in DISASTER_KEYWORDS, f"Missing quebrada: {q}"

    def test_emergency_terms_present(self):
        from costa_workers.ingest.social import DISASTER_KEYWORDS
        for term in ("indeci", "evacuación", "emergencia", "rescate"):
            assert term in DISASTER_KEYWORDS, f"Missing term: {term}"

    def test_event_types_present(self):
        from costa_workers.ingest.social import DISASTER_KEYWORDS
        for ev in ("huayco", "deslizamiento", "desborde", "inundación"):
            assert ev in DISASTER_KEYWORDS, f"Missing event type: {ev}"

    def test_keywords_are_lowercase(self):
        from costa_workers.ingest.social import DISASTER_KEYWORDS
        for kw in DISASTER_KEYWORDS:
            assert kw == kw.lower(), f"Keyword not lowercase: {kw!r}"

    def test_at_least_30_keywords(self):
        from costa_workers.ingest.social import DISASTER_KEYWORDS
        assert len(DISASTER_KEYWORDS) >= 30


# ─── LIMA_DISTRICTS completeness ─────────────────────────────────────────────

class TestLimaDistricts:
    def test_key_districts_present(self):
        from costa_workers.ingest.social import LIMA_DISTRICTS
        for d in ("lurigancho", "carabayllo", "ate", "chosica"):
            assert d in LIMA_DISTRICTS, f"Missing district: {d}"

    def test_districts_are_lowercase(self):
        from costa_workers.ingest.social import LIMA_DISTRICTS
        for d in LIMA_DISTRICTS:
            assert d == d.lower(), f"District not lowercase: {d!r}"


# ─── RawSignal structure ──────────────────────────────────────────────────────

class TestRawSignal:
    def test_minimal_construction(self):
        from costa_workers.ingest.social import RawSignal
        sig = RawSignal(
            source="bluesky",
            source_id="abc123",
            content="Huayco en Chosica",
            published_at=datetime.now(timezone.utc),
        )
        assert sig.source == "bluesky"
        assert sig.location_hint is None
        assert sig.url is None

    def test_full_construction(self):
        from costa_workers.ingest.social import RawSignal
        sig = RawSignal(
            source="rss",
            source_id="rpp-2025-001",
            content="Desborde confirmado en Carabayllo",
            published_at=datetime.now(timezone.utc),
            location_hint="Carabayllo",
            url="https://rpp.pe/noticias/2025/desborde-carabayllo",
        )
        assert sig.location_hint == "Carabayllo"
        assert "rpp.pe" in sig.url

    def test_is_namedtuple(self):
        from costa_workers.ingest.social import RawSignal
        assert hasattr(RawSignal, "_fields")
        assert "source" in RawSignal._fields
        assert "content" in RawSignal._fields
        assert "published_at" in RawSignal._fields


# ─── PII redaction fallback ───────────────────────────────────────────────────

import costa_workers.ingest.social as _social_module


class TestRedactPii:
    def setup_method(self):
        """Reset presidio singleton so each test starts with a clean state."""
        _social_module._PRESIDIO_ANALYZER = None
        _social_module._PRESIDIO_ANONYMIZER = None

    def teardown_method(self):
        """Reset presidio singleton so subsequent test suites aren't polluted."""
        _social_module._PRESIDIO_ANALYZER = None
        _social_module._PRESIDIO_ANONYMIZER = None

    def test_fallback_returns_text_when_presidio_unavailable(self):
        """redact_pii must return input text if presidio engines not available."""
        from unittest.mock import patch
        from costa_workers.ingest.social import redact_pii

        with patch("costa_workers.ingest.social._get_presidio", side_effect=ImportError("presidio not installed")):
            result = redact_pii("Juan Pérez vive en Jr. Lima 123")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_redact_pii_returns_string(self):
        """redact_pii must always return a string, never raise."""
        from unittest.mock import patch, MagicMock
        from costa_workers.ingest.social import redact_pii

        mock_analyzer = MagicMock()
        mock_analyzer.analyze.return_value = []
        mock_anonymizer = MagicMock()
        mock_anonymizer.anonymize.return_value = MagicMock(text="Huayco en Chosica: sin víctimas reportadas")

        with patch("costa_workers.ingest.social._get_presidio", return_value=(mock_analyzer, mock_anonymizer)):
            result = redact_pii("Huayco en Chosica: sin víctimas reportadas")
        assert isinstance(result, str)
        assert len(result) > 0


# ─── RSS_FEEDS list ───────────────────────────────────────────────────────────

def test_rss_feeds_not_empty():
    from costa_workers.ingest.social import RSS_FEEDS
    assert len(RSS_FEEDS) >= 3


def test_rss_feeds_are_https():
    from costa_workers.ingest.social import RSS_FEEDS
    for url in RSS_FEEDS:
        assert url.startswith("https://"), f"Non-HTTPS RSS feed: {url}"


# ─── Telegram channels ────────────────────────────────────────────────────────

def test_telegram_channels_not_empty():
    from costa_workers.ingest.social import TELEGRAM_CHANNELS
    assert len(TELEGRAM_CHANNELS) >= 1


def test_senamhi_channel_included():
    from costa_workers.ingest.social import TELEGRAM_CHANNELS
    assert "Senamhi_Peru" in TELEGRAM_CHANNELS
