"""Triage output schema validation tests: no LLM required."""
import pytest
from costa_workers.ml.triage import TriageResult, TriageLabel


def test_valid_triage_result():
    result = TriageResult(
        label=TriageLabel.NEEDS_HELP,
        confidence=0.92,
        location_entity="Chosica",
        district_name="Lurigancho",
        reasoning="El texto indica personas atrapadas por huayco en zona de Chosica.",
    )
    assert result.label == TriageLabel.NEEDS_HELP
    assert 0.0 <= result.confidence <= 1.0


def test_triage_result_from_json():
    raw = """
    {
      "label": "road_blocked",
      "confidence": 0.87,
      "location_entity": "Av. Ñaña",
      "district_name": "Lurigancho",
      "reasoning": "Reporte de vía bloqueada por deslizamiento en Ñaña."
    }
    """
    result = TriageResult.model_validate_json(raw)
    assert result.label == TriageLabel.ROAD_BLOCKED
    assert result.district_name == "Lurigancho"


def test_invalid_label_raises():
    with pytest.raises(Exception):
        TriageResult(
            label="unknown_label",
            confidence=0.5,
            reasoning="test",
        )


def test_confidence_must_be_float():
    result = TriageResult(
        label=TriageLabel.IRRELEVANT,
        confidence=0.1,
        reasoning="Contenido irrelevante.",
    )
    assert isinstance(result.confidence, float)


def test_huayco_observation_label():
    raw = """
    {
      "label": "huayco_observation",
      "confidence": 0.91,
      "location_entity": "Quebrada Jicamarca",
      "district_name": "San Juan de Lurigancho",
      "reasoning": "El usuario reporta flujo de lodo en quebrada Jicamarca."
    }
    """
    result = TriageResult.model_validate_json(raw)
    assert result.label == TriageLabel.HUAYCO_OBSERVATION


def test_flood_observation_label():
    raw = """
    {
      "label": "flood_observation",
      "confidence": 0.85,
      "location_entity": "Av. Universitaria",
      "district_name": "Comas",
      "reasoning": "Reporte de desborde de canal en Av. Universitaria."
    }
    """
    result = TriageResult.model_validate_json(raw)
    assert result.label == TriageLabel.FLOOD_OBSERVATION
