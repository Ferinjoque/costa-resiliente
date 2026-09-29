"""CENEPRED official El Niño risk scenario, per district.

Loaded by scripts/load_cenepred_districts.py into geo.cenepred_risk. This is the
one hazard input in the product that is neither derived by us nor a scenario
fixture: it is the government's own district classification.
"""
import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

SOURCE = "CENEPRED: Escenario de riesgo por lluvias intensas asociadas a El Niño"
SOURCE_URL = "https://sig.cenepred.gob.pe/arcgis_server/rest/services/FEN/ER_NINO2027_BD/MapServer"


async def official_risk(db: AsyncSession, ubigeo: str) -> dict[str, Any] | None:
    """{flood: {...}, mass_movement: {...}, source, source_url}, or None if not loaded.

    Call it last in a handler: if the table is missing, the failed statement
    aborts the session's transaction for any query that follows.
    """
    try:
        result = await db.execute(
            text("""
                SELECT hazard, risk_level, vulnerability, susceptibility,
                       exposed_homes, exposed_schools, exposed_health
                FROM geo.cenepred_risk WHERE ubigeo = :ubigeo
            """),
            {"ubigeo": ubigeo},
        )
        rows = result.mappings().all()
    except Exception as exc:  # table absent until the loader has run
        logger.debug("geo.cenepred_risk unavailable: %s", exc)
        return None
    if not rows:
        return None
    out: dict[str, Any] = {"source": SOURCE, "source_url": SOURCE_URL}
    for r in rows:
        out[r["hazard"]] = {
            "risk_level": r["risk_level"],
            "vulnerability": r["vulnerability"],
            "susceptibility": r["susceptibility"],
            "exposed_homes": r["exposed_homes"],
            "exposed_schools": r["exposed_schools"],
            "exposed_health": r["exposed_health"],
        }
    return out
