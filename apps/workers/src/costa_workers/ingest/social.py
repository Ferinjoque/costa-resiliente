"""Social signal ingestion — Bluesky, Reddit, RSS, Telegram.

Sprint 4 implementation target:
- Bluesky Jetstream firehose filtered for Lima/Peru disaster keywords
- Reddit r/Peru, r/Lima via praw
- RSS: RPP, Andina, El Comercio, Canal N
- PII redaction via presidio-analyzer before storage
- Triage classification via Gemma 3 12B-IT (Sprint 5)
"""
import hashlib
import logging
from datetime import datetime, timezone
from typing import NamedTuple

from prefect import flow, task

logger = logging.getLogger(__name__)

# Disaster vocabulary for Spanish keyword filtering
DISASTER_KEYWORDS = [
    "huayco", "huaycos", "deslizamiento", "desborde", "inundación", "inundacion",
    "aniego", "emergencia", "evacuación", "evacuacion", "alerta", "desastre",
    "Rímac", "Chillón", "Lurín", "INDECI", "CENEPRED", "COER", "COEN",
    "Pedregal", "Quirio", "Carossio", "Huaycoloro", "Chosica", "Chaclacayo",
]

LIMA_DISTRICTS = [
    "Lima", "Miraflores", "San Isidro", "Surco", "La Molina", "Ate", "San Juan",
    "Villa El Salvador", "Villa María", "Chorrillos", "Barranco", "Rímac",
    "Independencia", "Comas", "Los Olivos", "San Martín", "Carabayllo", "Puente Piedra",
    "Lurigancho", "Chosica", "Chaclacayo", "Cieneguilla", "Pachacamac",
]


class RawSignal(NamedTuple):
    source: str
    source_id: str
    content: str
    published_at: datetime
    location_hint: str | None = None


@task(retries=3, retry_delay_seconds=60)
def ingest_bluesky_firehose(limit: int = 100) -> list[RawSignal]:
    """Filter Bluesky Jetstream for Lima disaster keywords."""
    # TODO Sprint 4: connect to wss://jetstream2.us-east.bsky.network/subscribe
    logger.info("TODO: ingest Bluesky firehose")
    return []


@task(retries=2, retry_delay_seconds=30)
def ingest_reddit(subreddits: list[str] = ["Peru", "Lima"], limit: int = 50) -> list[RawSignal]:
    """Fetch recent posts from r/Peru and r/Lima via praw."""
    # TODO Sprint 4: PRAW client with env-configured credentials
    logger.info("TODO: ingest Reddit subreddits %s", subreddits)
    return []


@task(retries=3)
def ingest_rss_feeds(
    feeds: list[str] = [
        "https://rpp.pe/rss",
        "https://andina.pe/agencia/rss.aspx",
        "https://elcomercio.pe/rss/",
    ]
) -> list[RawSignal]:
    """Parse RSS feeds for disaster-related news."""
    # TODO Sprint 4: feedparser + keyword filter
    logger.info("TODO: ingest %d RSS feeds", len(feeds))
    return []


@task
def redact_pii(signals: list[RawSignal]) -> list[dict]:
    """
    Apply presidio-analyzer PII redaction to all signal content.
    Removes: names, phone numbers, email addresses, exact home addresses, license plates.
    MUST run before any signal is written to database.
    """
    # TODO Sprint 4: presidio analyzer + anonymizer
    redacted = []
    for sig in signals:
        content_hash = hashlib.sha256(sig.content.encode()).hexdigest()
        redacted.append({
            "source": sig.source,
            "source_id": sig.source_id,
            "content_redacted": sig.content,  # placeholder — real impl applies presidio
            "content_hash": content_hash,
            "published_at": sig.published_at,
            "location_raw": sig.location_hint,
        })
    return redacted


@task
def upsert_signals(records: list[dict]) -> int:
    """Insert redacted signals into social.signals, skip duplicates by content_hash."""
    # TODO Sprint 4: asyncpg upsert with ON CONFLICT DO NOTHING on content_hash
    logger.info("TODO: upsert %d signals", len(records))
    return len(records)


@flow(name="ingest-social", log_prints=True)
def ingest_social_flow():
    """Full social ingestion pipeline: fetch → redact PII → store."""
    bluesky = ingest_bluesky_firehose()
    reddit = ingest_reddit()
    rss = ingest_rss_feeds()

    all_signals = bluesky + reddit + rss
    redacted = redact_pii(all_signals)
    upserted = upsert_signals(redacted)

    logger.info("Social ingest complete: %d signals stored", upserted)
    return {"signals_stored": upserted}
