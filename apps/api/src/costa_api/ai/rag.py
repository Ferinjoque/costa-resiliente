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
        logger.warning("RAG embed failed: %s", exc)
        return []

    if not embedding:
        return []

    vec_str = "[" + ",".join(f"{v:.6f}" for v in embedding) + "]"

    # 2. Query pgvector
    sql = text("""
        SELECT source, title, chunk, meta,
               1 - (embedding <=> :vec::vector) AS similarity
        FROM rag.documents
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> :vec::vector
        LIMIT :k
    """)

    try:
        async with get_ai_db_session() as session:
            result = await session.execute(sql, {"vec": vec_str, "k": top_k})
            rows = [dict(r._mapping) for r in result]
            return rows
    except Exception as exc:
        logger.warning("RAG vector search failed: %s", exc)
        return []
