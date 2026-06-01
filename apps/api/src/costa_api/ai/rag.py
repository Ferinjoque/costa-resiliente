"""RAG search over rag.documents using pgvector cosine similarity.

Used by agent.py as the `search_protocols` tool.
Falls back gracefully (empty list) when pgvector or embedder is unavailable.
"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from costa_api.ai.gateway import gateway
from costa_api.db import get_ai_db_session

logger = logging.getLogger(__name__)


async def search_protocols(query: str, top_k: int = 3) -> list[dict]:
    """
    Embed `query` then find top-k protocol chunks by cosine similarity.
    Returns list of {source, title, chunk, meta, similarity}.
    """
    if not query or not query.strip():
        return []

    # 1. Embed query
    try:
        embedding = await gateway.embed(query)
    except Exception as exc:
        logger.error("RAG embed failed — search_protocols will return empty (Ollama unavailable?): %s", exc)
        return []

    if not embedding:
        return []

    vec_str = "[" + ",".join(f"{v:.6f}" for v in embedding) + "]"

    # 2. Query pgvector — use CAST(:vec AS vector) so vec_str is a bound
    # parameter rather than interpolated SQL. The :: shorthand triggers an
    # SQLAlchemy false-parse of the colon; CAST() is the standard workaround.
    sql = text("""
        SELECT source, title, chunk, meta,
               1 - (embedding <=> CAST(:vec AS vector)) AS similarity
        FROM rag.documents
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> CAST(:vec AS vector)
        LIMIT :k
    """)

    _MIN_SIMILARITY = 0.50  # filter chunks below 50% cosine similarity to avoid misleading citations

    try:
        async with get_ai_db_session() as session:
            await session.execute(text("SET LOCAL statement_timeout = '10000'"))
            result = await session.execute(sql, {"vec": vec_str, "k": top_k})
            rows = [dict(r._mapping) for r in result]
            # Filter below minimum similarity — prevents low-relevance protocol citations
            filtered = [r for r in rows if (r.get("similarity") or 0) >= _MIN_SIMILARITY]
            if len(filtered) < len(rows):
                logger.debug(
                    "RAG: filtered %d low-similarity results (threshold=%.2f, kept=%d/%d)",
                    len(rows) - len(filtered), _MIN_SIMILARITY, len(filtered), len(rows)
                )
            return filtered
    except Exception as exc:
        logger.warning("RAG vector search failed: %s", exc)
        return []
