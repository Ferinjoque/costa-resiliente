"""Operator Copilot — Spanish NL query → structured PostGIS query → Spanish summary."""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/copilot", tags=["copilot"])


class CopilotQuery(BaseModel):
    query: str          # Spanish natural language question
    district_id: Optional[int] = None
    operator_id: str


class CopilotResponse(BaseModel):
    answer: str         # Spanish prose summary
    sources: list[dict] # Data rows backing the answer, with timestamps
    map_overlay: Optional[dict] = None  # GeoJSON to render on map
    confidence: float
    query_plan: Optional[str] = None  # SQL that was executed (for transparency)


@router.post("/ask", response_model=CopilotResponse)
async def ask(query: CopilotQuery) -> CopilotResponse:
    """
    Operator natural-language query pipeline:
    1. Intent classification via Gemma 3 12B-IT
    2. SQL/spatial query plan generation (whitelist-validated)
    3. Execute against PostGIS
    4. Summarize results in Spanish prose
    5. Log to ops.decision_log
    LLM never fabricates — all numerical claims trace to DB rows.
    """
    # TODO Sprint 5: implement full RAG pipeline
    return CopilotResponse(
        answer="El sistema de copiloto está en construcción. Disponible en Sprint 5.",
        sources=[],
        confidence=0.0,
    )
