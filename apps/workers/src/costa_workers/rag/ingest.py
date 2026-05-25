"""RAG document ingest pipeline.

Reads source documents from data/protocols/, chunks them, embeds each chunk
via Ollama nomic-embed-text, and upserts into rag.documents (idempotent on
content_hash).

Sources bundled:
  - INDECI Plan Familiar de Emergencia 2024 (public, peru.gob.pe)
  - CENEPRED Susceptibilidad por movimientos en masa (public)
  - MINSA Protocolo de emergencias y desastres (public)
  - SENAMHI Guía hidrometeorológica (public)
  - Plan Lima ante huaycos — Municipalidad Metropolitana de Lima (public)

Documents are plain-text .txt files in data/protocols/{source_key}.txt.
To add a new source: add the .txt file and re-run index_protocols_flow().
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import textwrap
from pathlib import Path

import asyncpg
import httpx

logger = logging.getLogger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────

_protocols_env = os.getenv("PROTOCOLS_DIR")
if _protocols_env:
    PROTOCOLS_DIR = Path(_protocols_env)
else:
    try:
        # Dev layout: <repo>/apps/workers/src/costa_workers/rag/ingest.py
        # parents[5] → <repo root> → <repo root>/data/protocols
        PROTOCOLS_DIR = Path(__file__).parents[5] / "data" / "protocols"
    except IndexError:
        # Container layout: /app/src/costa_workers/rag/ingest.py (only 5 parents)
        PROTOCOLS_DIR = Path("/data/protocols")
OLLAMA_HOST = os.getenv("LLM_BASE_URL", "http://localhost:11434")
EMBED_MODEL = os.getenv("LLM_EMBED_MODEL", "nomic-embed-text")
CHUNK_SIZE = 800       # characters per chunk (≈ 200 tokens for nomic)
CHUNK_OVERLAP = 100    # overlap between consecutive chunks

_DB_DSN = (
    f"postgresql://{os.getenv('POSTGRES_USER','costa')}:"
    f"{os.getenv('POSTGRES_PASSWORD','change_me_in_production')}@"
    f"{os.getenv('POSTGRES_HOST','localhost')}:5432/"
    f"{os.getenv('POSTGRES_DB','costa_resiliente')}"
)

# Protocol metadata: {filename_stem: (source_key, title, lang)}
PROTOCOL_REGISTRY: dict[str, tuple[str, str, str]] = {
    "indeci_plan_familiar_2024":
        ("INDECI_Plan_Familiar_2024", "Plan Familiar de Emergencia 2024 — INDECI", "es"),
    "cenepred_movimientos_masa":
        ("CENEPRED_Movimientos_Masa", "Susceptibilidad por Movimientos en Masa — CENEPRED", "es"),
    "minsa_protocolo_emergencias":
        ("MINSA_Protocolo_Emergencias", "Protocolo de Emergencias y Desastres — MINSA", "es"),
    "senamhi_guia_hidrometeorologica":
        ("SENAMHI_Guia_Hidro", "Guía Hidrometeorológica — SENAMHI", "es"),
    "mml_plan_huaycos_lima":
        ("MML_Plan_Huaycos", "Plan Lima ante Huaycos — Municipalidad Metropolitana", "es"),
}


# ─── Chunking ─────────────────────────────────────────────────────────────────

def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + size
        # Try to break at sentence boundary
        window = text[start:end]
        last_period = max(window.rfind(". "), window.rfind(".\n"))
        if last_period > size // 2:
            end = start + last_period + 1
        chunks.append(text[start:end].strip())
        start = end - overlap
    return [c for c in chunks if len(c) > 50]


# ─── Embedding ────────────────────────────────────────────────────────────────

async def embed_text(text: str) -> list[float] | None:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{OLLAMA_HOST}/api/embeddings",
                json={"model": EMBED_MODEL, "prompt": text},
            )
            resp.raise_for_status()
            return resp.json()["embedding"]
    except Exception as exc:
        logger.warning("embed failed: %s", exc)
        return None


# ─── DB upsert ────────────────────────────────────────────────────────────────

async def upsert_chunk(
    conn,
    source: str,
    title: str,
    lang: str,
    chunk_index: int,
    chunk: str,
    embedding: list[float],
    meta: dict,
) -> bool:
    content_hash = hashlib.sha256(chunk.encode()).hexdigest()

    # Check if already indexed (idempotent)
    existing = await conn.fetchval(
        "SELECT id FROM rag.documents WHERE content_hash=$1", content_hash
    )
    if existing:
        return False  # already up to date

    vec_str = "[" + ",".join(f"{v:.6f}" for v in embedding) + "]"
    await conn.execute(
        """
        INSERT INTO rag.documents
            (source, title, lang, chunk_index, chunk, embedding, content_hash, meta)
        VALUES ($1,$2,$3,$4,$5,$6::vector,$7,$8::jsonb)
        ON CONFLICT (content_hash) DO NOTHING
        """,
        source, title, lang, chunk_index, chunk, vec_str, content_hash,
        str(meta).replace("'", '"'),  # rough jsonb encoding; replace with json.dumps in prod
    )
    return True


# ─── Main flow ────────────────────────────────────────────────────────────────

async def index_protocols(dry_run: bool = False) -> dict:
    """
    Read all .txt files in data/protocols/, chunk + embed, upsert to DB.
    Returns stats dict.
    """
    import json

    conn = await asyncpg.connect(_DB_DSN)
    try:
        stats = {"total_files": 0, "total_chunks": 0, "new_chunks": 0, "skipped": 0}

        for path in sorted(PROTOCOLS_DIR.glob("*.txt")):
            stem = path.stem
            if stem not in PROTOCOL_REGISTRY:
                logger.info("Skipping unregistered file: %s", path.name)
                continue

            source, title, lang = PROTOCOL_REGISTRY[stem]
            text = path.read_text(encoding="utf-8")
            chunks = chunk_text(text)
            stats["total_files"] += 1
            stats["total_chunks"] += len(chunks)
            logger.info("Indexing %s — %d chunks", source, len(chunks))

            for i, chunk in enumerate(chunks):
                if dry_run:
                    stats["new_chunks"] += 1
                    continue
                embedding = await embed_text(chunk)
                if embedding is None:
                    stats["skipped"] += 1
                    continue
                meta = json.dumps({"chunk_index": i, "total_chunks": len(chunks)})
                inserted = await upsert_chunk(
                    conn, source, title, lang, i, chunk, embedding,
                    {"chunk_index": i, "total_chunks": len(chunks)},
                )
                if inserted:
                    stats["new_chunks"] += 1
                else:
                    stats["skipped"] += 1

                # Small delay to not slam Ollama
                await asyncio.sleep(0.05)

        # Build HNSW index after initial load (idempotent)
        if not dry_run and stats["new_chunks"] > 0:
            try:
                await conn.execute("""
                    CREATE INDEX IF NOT EXISTS rag_documents_embedding_hnsw
                    ON rag.documents
                    USING hnsw (embedding vector_cosine_ops)
                    WITH (m=16, ef_construction=64)
                """)
                logger.info("HNSW index created/verified")
            except Exception as exc:
                logger.warning("HNSW index creation failed (non-fatal): %s", exc)

        return stats
    finally:
        await conn.close()


# Allow direct execution for manual seeding
if __name__ == "__main__":
    import asyncio
    result = asyncio.run(index_protocols())
    print(result)
