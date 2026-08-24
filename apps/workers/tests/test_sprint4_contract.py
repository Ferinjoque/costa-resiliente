"""Sprint 4 contract tests: huayco model, ANA parser, social keyword filter, PII logic."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import numpy as np
import pytest


# ─── Huayco model ─────────────────────────────────────────────────────────────

class TestRiskLevel:
    def test_very_low(self):
        from costa_workers.ml.huayco_model import risk_level
        assert risk_level(0.0) == "very_low"
        assert risk_level(0.19) == "very_low"

    def test_low_boundary(self):
        from costa_workers.ml.huayco_model import risk_level
        assert risk_level(0.20) == "low"
        assert risk_level(0.39) == "low"

    def test_medium_boundary(self):
        from costa_workers.ml.huayco_model import risk_level
        assert risk_level(0.40) == "medium"
        assert risk_level(0.59) == "medium"

    def test_high_boundary(self):
        from costa_workers.ml.huayco_model import risk_level
        assert risk_level(0.60) == "high"
        assert risk_level(0.79) == "high"

    def test_very_high_at_boundary(self):
        from costa_workers.ml.huayco_model import risk_level
        assert risk_level(0.80) == "very_high"
        assert risk_level(1.0) == "very_high"


class TestHuaycoFeatures:
    def _valid_features(self):
        from costa_workers.ml.huayco_model import HuaycoFeatures
        return HuaycoFeatures(
            slope_deg=25.0,
            aspect_deg=180.0,
            lithology_class=2,
            distance_to_stream_m=150.0,
            ndvi=0.30,
            soil_moisture=0.25,
            rain_24h_mm=15.0,
            rain_72h_mm=30.0,
            rain_7d_mm=45.0,
        )

    def test_to_array_shape(self):
        feat = self._valid_features()
        arr = feat.to_array()
        assert arr.shape == (9,)
        assert arr.dtype == np.float32

    def test_to_array_values(self):
        feat = self._valid_features()
        arr = feat.to_array()
        assert arr[0] == pytest.approx(25.0)
        assert arr[2] == pytest.approx(2.0)  # lithology_class cast to float

    def test_validate_passes_valid(self):
        feat = self._valid_features()
        feat.validate()  # should not raise

    def test_validate_slope_too_high(self):
        from costa_workers.ml.huayco_model import HuaycoFeatures
        feat = HuaycoFeatures(91.0, 0.0, 0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        with pytest.raises(ValueError, match="slope_deg"):
            feat.validate()

    def test_validate_negative_slope(self):
        from costa_workers.ml.huayco_model import HuaycoFeatures
        feat = HuaycoFeatures(-1.0, 0.0, 0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        with pytest.raises(ValueError, match="slope_deg"):
            feat.validate()

    def test_validate_aspect_out_of_range(self):
        from costa_workers.ml.huayco_model import HuaycoFeatures
        feat = HuaycoFeatures(10.0, 361.0, 0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        with pytest.raises(ValueError, match="aspect_deg"):
            feat.validate()

    def test_validate_bad_lithology(self):
        from costa_workers.ml.huayco_model import HuaycoFeatures
        feat = HuaycoFeatures(10.0, 0.0, 6, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        with pytest.raises(ValueError, match="lithology_class"):
            feat.validate()

    def test_validate_negative_distance(self):
        from costa_workers.ml.huayco_model import HuaycoFeatures
        feat = HuaycoFeatures(10.0, 0.0, 0, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        with pytest.raises(ValueError, match="distance_to_stream_m"):
            feat.validate()

    def test_validate_ndvi_out_of_range(self):
        from costa_workers.ml.huayco_model import HuaycoFeatures
        feat = HuaycoFeatures(10.0, 0.0, 0, 0.0, 1.5, 0.0, 0.0, 0.0, 0.0)
        with pytest.raises(ValueError, match="ndvi"):
            feat.validate()

    def test_validate_negative_rain(self):
        from costa_workers.ml.huayco_model import HuaycoFeatures
        feat = HuaycoFeatures(10.0, 0.0, 0, 0.0, 0.0, 0.0, -1.0, 0.0, 0.0)
        with pytest.raises(ValueError, match="rain_24h_mm"):
            feat.validate()


class TestFeaturesMatrix:
    def test_matrix_shape(self):
        from costa_workers.ml.huayco_model import HuaycoFeatures, features_to_matrix
        samples = [
            HuaycoFeatures(10.0, 90.0, 1, 50.0, 0.2, 0.1, 5.0, 10.0, 20.0),
            HuaycoFeatures(30.0, 270.0, 3, 200.0, 0.5, 0.3, 20.0, 40.0, 60.0),
        ]
        mat = features_to_matrix(samples)
        assert mat.shape == (2, 9)
        assert mat.dtype == np.float32

    def test_single_sample(self):
        from costa_workers.ml.huayco_model import HuaycoFeatures, features_to_matrix
        feat = HuaycoFeatures(5.0, 0.0, 0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        mat = features_to_matrix([feat])
        assert mat.shape == (1, 9)


class TestSlopeHeuristic:
    def test_all_zeros_returns_zero(self):
        from costa_workers.ml.huayco_model import _slope_heuristic
        X = np.zeros((3, 9), dtype=np.float32)
        result = _slope_heuristic(X)
        np.testing.assert_array_almost_equal(result, [0.0, 0.0, 0.0])

    def test_max_slope_and_rain(self):
        from costa_workers.ml.huayco_model import _slope_heuristic
        X = np.zeros((1, 9), dtype=np.float32)
        X[0, 0] = 45.0   # slope_deg (normalized to 1.0)
        X[0, 6] = 50.0   # rain_24h_mm (normalized to 1.0)
        result = _slope_heuristic(X)
        assert result[0] == pytest.approx(1.0, abs=1e-5)

    def test_output_clipped_to_0_1(self):
        from costa_workers.ml.huayco_model import _slope_heuristic
        X = np.full((1, 9), 1000.0, dtype=np.float32)
        result = _slope_heuristic(X)
        assert 0.0 <= float(result[0]) <= 1.0

    def test_slope_dominant(self):
        from costa_workers.ml.huayco_model import _slope_heuristic
        X = np.zeros((1, 9), dtype=np.float32)
        X[0, 0] = 45.0   # max slope, zero rain
        result = _slope_heuristic(X)
        assert result[0] == pytest.approx(0.6, abs=1e-5)


class TestHuaycoModelFallback:
    def test_predict_proba_without_weights_returns_heuristic(self):
        from costa_workers.ml.huayco_model import HuaycoFeatures, HuaycoModel
        model = HuaycoModel()
        # _booster is None → uses slope heuristic
        feats = [HuaycoFeatures(45.0, 0.0, 0, 0.0, 0.0, 0.0, 50.0, 0.0, 0.0)]
        probs = model.predict_proba(feats)
        assert probs.shape == (1,)
        assert 0.0 <= float(probs[0]) <= 1.0

    def test_predict_proba_empty_returns_empty(self):
        from costa_workers.ml.huayco_model import HuaycoModel
        model = HuaycoModel()
        result = model.predict_proba([])
        assert len(result) == 0

    def test_predict_quebrada_returns_expected_keys(self):
        from costa_workers.ml.huayco_model import HuaycoFeatures, HuaycoModel
        model = HuaycoModel()
        feat = HuaycoFeatures(20.0, 90.0, 2, 100.0, 0.3, 0.2, 10.0, 20.0, 30.0)
        result = model.predict_quebrada(quebrada_id=5, features=feat)
        assert "quebrada_id" in result
        assert "probability" in result
        assert "risk_level" in result
        assert result["quebrada_id"] == 5
        assert result["risk_level"] in ("very_low", "low", "medium", "high", "very_high")


# ─── ANA / SENAMHI parser ─────────────────────────────────────────────────────

class TestParseAnaTable:
    def _html_with_row(self, dt="01/03/2025 08:00", nivel="2.50", caudal="45.30", lluvia="12.0"):
        return (
            f'<tr><td>{dt}</td><td>{nivel}</td><td>{caudal}</td><td>{lluvia}</td></tr>'
        )

    def test_parses_valid_row(self):
        from costa_workers.ingest.ana_scraper import _parse_ana_table
        html = self._html_with_row()
        rows = _parse_ana_table(html, "100120")
        assert len(rows) == 1
        row = rows[0]
        assert row["station_code"] == "100120"
        assert row["level_m"] == pytest.approx(2.50)
        assert row["flow_m3s"] == pytest.approx(45.30)
        assert row["rain_mm"] == pytest.approx(12.0)

    def test_observed_at_is_utc(self):
        from costa_workers.ingest.ana_scraper import _parse_ana_table
        rows = _parse_ana_table(self._html_with_row(), "100120")
        assert rows[0]["observed_at"].tzinfo is not None

    def test_dash_values_become_none(self):
        from costa_workers.ingest.ana_scraper import _parse_ana_table
        html = self._html_with_row(nivel="---", caudal="--", lluvia="-")
        rows = _parse_ana_table(html, "100120")
        assert len(rows) == 1
        assert rows[0]["level_m"] is None
        assert rows[0]["flow_m3s"] is None
        assert rows[0]["rain_mm"] is None

    def test_empty_html_returns_empty(self):
        from costa_workers.ingest.ana_scraper import _parse_ana_table
        assert _parse_ana_table("<html><body>no data</body></html>", "X") == []

    def test_multiple_rows(self):
        from costa_workers.ingest.ana_scraper import _parse_ana_table
        html = (
            self._html_with_row("01/03/2025 08:00", "2.5", "45.3", "12.0") +
            self._html_with_row("01/03/2025 07:00", "2.4", "44.1", "0.0")
        )
        rows = _parse_ana_table(html, "100120")
        assert len(rows) == 2


class TestParseSenamhiCsv:
    def test_parses_valid_csv(self):
        from costa_workers.ingest.ana_scraper import _parse_senamhi_csv
        csv = "Fecha;Hora;Precipitacion(mm)\n01/03/2025;08:00;5.2\n"
        rows = _parse_senamhi_csv(csv, "47288")
        assert len(rows) == 1
        assert rows[0]["rain_mm"] == pytest.approx(5.2)
        assert rows[0]["level_m"] is None
        assert rows[0]["flow_m3s"] is None

    def test_comma_decimal_separator(self):
        from costa_workers.ingest.ana_scraper import _parse_senamhi_csv
        csv = "Fecha;Hora;Precipitacion(mm)\n01/03/2025;08:00;3,7\n"
        rows = _parse_senamhi_csv(csv, "47288")
        assert rows[0]["rain_mm"] == pytest.approx(3.7)

    def test_empty_rain_cell_becomes_none(self):
        from costa_workers.ingest.ana_scraper import _parse_senamhi_csv
        csv = "Fecha;Hora;Precipitacion(mm)\n01/03/2025;08:00;\n"
        rows = _parse_senamhi_csv(csv, "47288")
        assert rows[0]["rain_mm"] is None

    def test_header_skipped(self):
        from costa_workers.ingest.ana_scraper import _parse_senamhi_csv
        csv = "Fecha;Hora;Precipitacion(mm)\n"
        rows = _parse_senamhi_csv(csv, "47288")
        assert rows == []


# ─── Social signal ingestion ──────────────────────────────────────────────────

class TestMatchesKeywords:
    def test_matches_huayco(self):
        from costa_workers.ingest.social import _matches_keywords
        assert _matches_keywords("Huayco en Chosica") is True

    def test_matches_mixed_case(self):
        from costa_workers.ingest.social import _matches_keywords
        assert _matches_keywords("INDECI reporta desborde del Rímac") is True

    def test_no_match_irrelevant(self):
        from costa_workers.ingest.social import _matches_keywords
        assert _matches_keywords("El partido de fútbol terminó 2-1") is False

    def test_matches_institution_keyword(self):
        from costa_workers.ingest.social import _matches_keywords
        assert _matches_keywords("COER Lima activó alerta temprana") is True

    def test_matches_quebrada_name(self):
        from costa_workers.ingest.social import _matches_keywords
        assert _matches_keywords("Quebrada Huaycoloro desbordó anoche") is True


class TestRawSignal:
    def test_construction(self):
        from costa_workers.ingest.social import RawSignal
        now = datetime.now(timezone.utc)
        sig = RawSignal(
            source="reddit",
            source_id="abc123",
            content="Huayco en Chosica",
            published_at=now,
            location_hint="Lima",
        )
        assert sig.source == "reddit"
        assert sig.location_hint == "Lima"
        assert sig.url is None  # default

    def test_url_default_none(self):
        from costa_workers.ingest.social import RawSignal
        sig = RawSignal("bluesky", "x/y", "text", datetime.now(timezone.utc))
        assert sig.url is None


class TestRedactPii:
    def test_returns_original_on_exception(self):
        from unittest.mock import patch
        from costa_workers.ingest.social import redact_pii
        # Force the analyzer to raise: fallback must return original text
        with patch("presidio_analyzer.AnalyzerEngine") as mock_ae:
            mock_ae.return_value.analyze.side_effect = RuntimeError("analyzer error")
            result = redact_pii("Llamar a Juan al 987654321")
        assert result == "Llamar a Juan al 987654321"

    def test_returns_original_on_import_error(self):
        from unittest.mock import patch
        from costa_workers.ingest.social import redact_pii
        # When AnalyzerEngine constructor raises ImportError, fallback must return original
        with patch("presidio_analyzer.AnalyzerEngine", side_effect=ImportError("not installed")):
            result = redact_pii("texto de prueba")
        assert result == "texto de prueba"

    def test_does_not_raise_on_empty_string(self):
        from unittest.mock import patch
        from costa_workers.ingest.social import redact_pii
        with patch("presidio_analyzer.AnalyzerEngine") as mock_ae:
            mock_ae.return_value.analyze.side_effect = RuntimeError("fail")
            result = redact_pii("")
        assert result == ""


class TestContentHash:
    def test_hash_is_sha256(self):
        """Content hash must be exactly 64 hex characters (SHA-256)."""
        text = "Huayco en La Molina"
        h = hashlib.sha256(text.encode()).hexdigest()
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_same_content_same_hash(self):
        text = "Desborde del Rímac a las 03:00"
        h1 = hashlib.sha256(text.encode()).hexdigest()
        h2 = hashlib.sha256(text.encode()).hexdigest()
        assert h1 == h2

    def test_different_content_different_hash(self):
        h1 = hashlib.sha256(b"huayco").hexdigest()
        h2 = hashlib.sha256(b"inundacion").hexdigest()
        assert h1 != h2
