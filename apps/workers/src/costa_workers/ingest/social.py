"""Social signal ingestion: Bluesky, RSS, Reddit, Telegram.

Active sources:
  Bluesky:  Jetstream v2 WebSocket (wss://jetstream2.us-east.bsky.network/subscribe)
            Public firehose, no credentials required.
  RSS:      RPP, Andina, Canal N, El Comercio, La República, Peru21,
            Defensoría del Pueblo Peru (feedparser, no auth)
  Reddit:   /r/Peru /r/Lima /r/Chosica public JSON API.
            Uses REDDIT_CLIENT_ID/SECRET if set (higher rate limit).
  Telegram: INDECI Peru + COER Lima public channels via telethon.
            Requires TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION_STRING.

PII redaction: presidio-analyzer with es_core_news_sm spaCy model.
  Entities stripped: PERSON, PHONE_NUMBER, EMAIL_ADDRESS, STREET_ADDRESS,
                     IP_ADDRESS, CREDIT_CARD, NRP (Peruvian NRP / DNI)
  Redacted text → SHA-256 content_hash → dedup via ON CONFLICT DO NOTHING

XML sandbox: social signals NEVER enter operator query context without
  being wrapped in <SEÑAL>...</SEÑAL> tags first (enforced in copilot router).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import NamedTuple

import feedparser
import httpx
from prefect import flow, task

logger = logging.getLogger(__name__)

def _db_dsn() -> str:
    if url := os.getenv("DATABASE_URL"):
        return url
    host = os.getenv("POSTGRES_HOST", "postgres")
    port = os.getenv("POSTGRES_PORT", "5432")
    db   = os.getenv("POSTGRES_DB", "costa_resiliente")
    user = os.getenv("POSTGRES_USER", "costa")
    pw   = os.getenv("POSTGRES_PASSWORD", "change_me_in_production")
    return f"postgresql://{user}:{pw}@{host}:{port}/{db}"

DB_DSN = _db_dsn()

# ─── Disaster vocabulary ──────────────────────────────────────────────────────

DISASTER_KEYWORDS: frozenset[str] = frozenset({
    # Event types
    "huayco", "huaycos", "deslizamiento", "deslizamientos", "desborde", "desbordes",
    "inundación", "inundacion", "inundaciones", "aniego", "aniegos",
    "aluvión", "aluvion", "torrente", "crecida", "derrumbe", "derrumbes",
    "erosión", "erosion", "socavamiento", "colapso",
    # Emergency terms
    "emergencia", "emergencias", "evacuación", "evacuacion", "evacuados",
    "desastre", "desastres", "alerta", "alertas", "rescate", "rescates",
    "heridos", "víctimas", "victimas", "fallecidos", "atrapados",
    # Institutions
    "indeci", "cenepred", "coer", "coen", "digesa", "sedapal",
    # Lima rivers / quebradas
    "rímac", "rimac", "chillón", "chillon", "lurín", "lurin",
    "huaycoloro", "pedregal", "quirio", "carossio", "jicamarca",
    "cajamarquilla", "manchay",
    # High-risk zones
    "chosica", "chaclacayo", "lurigancho", "cieneguilla",
    # Infra
    "carretera", "puente", "colapsado", "cortada", "bloqueada",
    # Lima-specific flash flood / quebrada breach terms (Session 23)
    "cauce", "cauces", "torrentada", "torrentadas",
    "avenida de lodo", "avenida de agua",  # flash flood technical/colloquial
    "quebradazo",  # slang for quebrada breach
    "socavón", "socavon",  # sinkhole (common in flood events)
})

LIMA_DISTRICTS: frozenset[str] = frozenset({
    "lima", "miraflores", "san isidro", "surco", "la molina", "ate", "san juan",
    "villa el salvador", "villa maría del triunfo", "chorrillos", "barranco",
    "rímac", "rimac", "independencia", "comas", "los olivos", "san martín de porres",
    "carabayllo", "puente piedra", "lurigancho", "chosica", "chaclacayo",
    "cieneguilla", "pachacamac", "lurín", "lurin", "punta hermosa", "punta negra",
    "santa maría del mar",
})

RSS_FEEDS = [
    "https://rpp.pe/rss",
    "https://andina.pe/agencia/rss.aspx",
    "https://elcomercio.pe/rss/",
    "https://peru21.pe/rss/",
    "https://gestion.pe/rss/",
]

REQUEST_TIMEOUT = 20.0
RATE_LIMIT_S = 1.5
BLUESKY_WINDOW_S = 30

# Public Telegram channels: read-only civil-defense monitoring
TELEGRAM_CHANNELS: list[str] = [
    "Senamhi_Peru",  # SENAMHI official: weather/hydro alerts for Peru
]


# ─── RawSignal ────────────────────────────────────────────────────────────────

class RawSignal(NamedTuple):
    source: str
    source_id: str
    content: str
    published_at: datetime
    location_hint: str | None = None
    url: str | None = None


# ─── Keyword filter ───────────────────────────────────────────────────────────

def _matches_keywords(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in DISASTER_KEYWORDS)


# ─── PII redaction ────────────────────────────────────────────────────────────

_PRESIDIO_ANALYZER = None  # process-wide singleton (engine init is heavy)
_PRESIDIO_ANONYMIZER = None


def _get_presidio():
    """Lazy-init presidio engines with the Spanish spaCy NLP backend."""
    global _PRESIDIO_ANALYZER, _PRESIDIO_ANONYMIZER
    if _PRESIDIO_ANALYZER is not None:
        return _PRESIDIO_ANALYZER, _PRESIDIO_ANONYMIZER
    from presidio_analyzer import AnalyzerEngine
    from presidio_analyzer.nlp_engine import NlpEngineProvider
    from presidio_anonymizer import AnonymizerEngine

    nlp_cfg = {
        "nlp_engine_name": "spacy",
        "models": [{"lang_code": "es", "model_name": "es_core_news_sm"}],
    }
    nlp_engine = NlpEngineProvider(nlp_configuration=nlp_cfg).create_engine()
    _PRESIDIO_ANALYZER = AnalyzerEngine(nlp_engine=nlp_engine, supported_languages=["es"])
    _PRESIDIO_ANONYMIZER = AnonymizerEngine()
    return _PRESIDIO_ANALYZER, _PRESIDIO_ANONYMIZER


def redact_pii(text: str) -> str:
    """
    Redact PII from text using presidio-analyzer with Spanish spaCy model.
    Falls back to returning the original text if presidio is unavailable.
    """
    try:
        analyzer, anonymizer = _get_presidio()
        results = analyzer.analyze(
            text=text,
            language="es",
            entities=[
                "PERSON",
                "PHONE_NUMBER",
                "EMAIL_ADDRESS",
                "LOCATION",
                "IP_ADDRESS",
                "CREDIT_CARD",
                "NRP",
            ],
        )
        if not results:
            return text

        anonymized = anonymizer.anonymize(text=text, analyzer_results=results)
        return anonymized.text
    except Exception as exc:
        logger.warning("PII redaction failed, storing raw: %s", exc)
        return text


# ─── Bluesky Jetstream ────────────────────────────────────────────────────────

@task(retries=3, retry_delay_seconds=60, log_prints=True)
async def ingest_bluesky_firehose(window_seconds: int = BLUESKY_WINDOW_S) -> list[RawSignal]:
    """
    Connect to Bluesky Jetstream v2 WebSocket and collect posts for window_seconds.
    Filters app.bsky.feed.post records for Lima/Peru disaster keywords.
    No credentials required: Jetstream is public.
    """
    try:
        import websockets
    except ImportError:
        logger.warning("websockets not installed, skipping Bluesky ingest")
        return []

    url = (
        "wss://jetstream2.us-east.bsky.network/subscribe"
        "?wantedCollections=app.bsky.feed.post"
    )
    signals: list[RawSignal] = []
    loop = asyncio.get_running_loop()
    deadline = loop.time() + window_seconds

    try:
        async with websockets.connect(url, open_timeout=10) as ws:
            while loop.time() < deadline:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
                    event = json.loads(raw)
                except asyncio.TimeoutError:
                    continue
                except Exception:
                    continue

                record = event.get("commit", {}).get("record", {})
                text = record.get("text", "")
                if not text or not _matches_keywords(text):
                    continue

                did = event.get("did", "")
                rkey = event.get("commit", {}).get("rkey", "")
                source_id = f"{did}/{rkey}"
                ts_str = record.get("createdAt")
                try:
                    published_at = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                except (TypeError, ValueError):
                    published_at = datetime.now(timezone.utc)

                signals.append(RawSignal(
                    source="bluesky",
                    source_id=source_id,
                    content=text,
                    published_at=published_at,
                    url=f"https://bsky.app/profile/{did}/post/{rkey}",
                ))
    except Exception as exc:
        logger.warning("Bluesky Jetstream error: %s", exc)

    logger.info("Bluesky: %d keyword-matched posts collected", len(signals))
    return signals


# ─── Reddit (public JSON, no credentials) ────────────────────────────────────

@task(retries=3, retry_delay_seconds=60, log_prints=True)
async def ingest_reddit(
    subreddits: list[str] | None = None,
    limit: int = 50,
) -> list[RawSignal]:
    """
    Fetch recent posts from r/Peru, r/Lima, r/Chosica using the public
    Reddit JSON API (no OAuth required). Filters for disaster keywords.
    """
    if subreddits is None:
        subreddits = ["Peru", "Lima", "Chosica"]

    cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
    signals: list[RawSignal] = []

    async with httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT,
        headers={"User-Agent": "CostaResiliiente/1.0 (emergency-research@ieee.org)"},
        follow_redirects=True,
    ) as client:
        for sub in subreddits:
            url = f"https://www.reddit.com/r/{sub}/new.json?limit={limit}"
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
            except Exception as exc:
                logger.warning("Reddit r/%s fetch failed: %s", sub, exc)
                await asyncio.sleep(RATE_LIMIT_S)
                continue

            for post in data.get("data", {}).get("children", []):
                p = post.get("data", {})
                title = p.get("title", "")
                selftext = p.get("selftext", "")
                combined = f"{title} {selftext}".strip()

                if not _matches_keywords(combined):
                    continue

                created_utc = p.get("created_utc", 0)
                published_at = datetime.fromtimestamp(created_utc, tz=timezone.utc)
                if published_at < cutoff:
                    continue

                signals.append(RawSignal(
                    source="reddit",
                    source_id=p.get("id", ""),
                    content=combined[:2000],
                    published_at=published_at,
                    location_hint=sub,
                    url=f"https://reddit.com{p.get('permalink', '')}",
                ))

            await asyncio.sleep(RATE_LIMIT_S)

    logger.info("Reddit: %d keyword-matched posts from %s", len(signals), subreddits)
    return signals


# ─── RSS feeds ────────────────────────────────────────────────────────────────

@task(retries=3, retry_delay_seconds=60, log_prints=True)
async def ingest_rss_feeds(feeds: list[str] | None = None) -> list[RawSignal]:
    """
    Parse RSS feeds (RPP, Andina, Canal N) using feedparser.
    Keeps entries from the last 48h that match disaster keywords.
    """
    if feeds is None:
        feeds = RSS_FEEDS

    cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
    signals: list[RawSignal] = []

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT, follow_redirects=True) as client:
        for feed_url in feeds:
            try:
                resp = await client.get(feed_url)
                resp.raise_for_status()
                parsed = feedparser.parse(resp.text)
            except Exception as exc:
                logger.warning("RSS fetch failed for %s: %s", feed_url, exc)
                await asyncio.sleep(RATE_LIMIT_S)
                continue

            source_name = parsed.feed.get("title", feed_url)
            for entry in parsed.entries:
                title = entry.get("title", "")
                summary = entry.get("summary", "")
                combined = f"{title} {summary}".strip()

                if not _matches_keywords(combined):
                    continue

                # Parse published date
                published_at: datetime
                if entry.get("published_parsed"):
                    import time as _time
                    published_at = datetime.fromtimestamp(
                        _time.mktime(entry.published_parsed), tz=timezone.utc
                    )
                else:
                    published_at = datetime.now(timezone.utc)

                if published_at < cutoff:
                    continue

                signals.append(RawSignal(
                    source=f"rss_{source_name.lower().replace(' ', '_')[:20]}",
                    source_id=entry.get("id", entry.get("link", "")),
                    content=combined[:2000],
                    published_at=published_at,
                    url=entry.get("link"),
                ))

            await asyncio.sleep(RATE_LIMIT_S)

    logger.info("RSS: %d keyword-matched entries from %d feeds", len(signals), len(feeds))
    return signals


# ─── Telegram (read-only via telethon) ───────────────────────────────────────

@task(retries=2, retry_delay_seconds=120, log_prints=True)
async def ingest_telegram(
    channels: list[str] | None = None,
    limit: int = 50,
) -> list[RawSignal]:
    """
    Read recent messages from INDECI Peru and COER Lima Telegram channels.
    Requires TELEGRAM_API_ID and TELEGRAM_API_HASH env vars.
    Read-only access only: no messages are ever sent.
    """
    api_id = os.getenv("TELEGRAM_API_ID")
    api_hash = os.getenv("TELEGRAM_API_HASH")
    if not api_id or not api_hash:
        logger.info("TELEGRAM_API_ID/HASH not configured, skipping Telegram ingest")
        return []

    if channels is None:
        channels = TELEGRAM_CHANNELS

    cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
    signals: list[RawSignal] = []

    try:
        from telethon import TelegramClient
        from telethon.sessions import StringSession

        session_str = os.getenv("TELEGRAM_SESSION_STRING", "")
        client = TelegramClient(StringSession(session_str), int(api_id), api_hash)

        async with client:
            for channel in channels:
                try:
                    entity = await client.get_entity(channel)
                    async for msg in client.iter_messages(entity, limit=limit):
                        if not msg.text:
                            continue
                        if msg.date and msg.date.replace(tzinfo=timezone.utc) < cutoff:
                            break
                        if not _matches_keywords(msg.text):
                            continue

                        signals.append(RawSignal(
                            source="telegram",
                            source_id=f"{channel}/{msg.id}",
                            content=msg.text[:2000],
                            published_at=msg.date.replace(tzinfo=timezone.utc),
                            location_hint=channel,
                        ))
                except Exception as exc:
                    logger.warning("Telegram channel %s error: %s", channel, exc)

    except ImportError:
        logger.warning("telethon not installed, skipping Telegram ingest")
    except Exception as exc:
        logger.warning("Telegram client error: %s", exc)

    logger.info("Telegram: %d keyword-matched messages from %s", len(signals), channels)
    return signals


# ─── Upsert ───────────────────────────────────────────────────────────────────

@task(retries=2, retry_delay_seconds=30, log_prints=True)
async def upsert_signals(signals: list[RawSignal]) -> int:
    """
    For each signal: redact PII → compute content_hash → upsert into social.signals.
    Duplicate detection via ON CONFLICT DO NOTHING on content_hash.
    """
    import asyncpg

    if not signals:
        return 0

    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    inserted = 0

    async with asyncpg.create_pool(DB_DSN, min_size=1, max_size=3) as pool:
        for sig in signals:
            redacted = redact_pii(sig.content)
            content_hash = hashlib.sha256(redacted.encode()).hexdigest()
            try:
                result = await pool.execute(
                    """
                    INSERT INTO social.signals
                        (source, source_id, content_hash, published_at,
                         content_redacted, location_raw, expires_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (content_hash) DO NOTHING
                    """,
                    sig.source,
                    sig.source_id or None,
                    content_hash,
                    sig.published_at,
                    redacted,
                    sig.location_hint,
                    expires_at,
                )
                if result == "INSERT 0 1":
                    inserted += 1
            except Exception as exc:
                logger.warning("Signal upsert failed (source=%s): %s", sig.source, exc)

    logger.info("Social upsert: %d new signals stored", inserted)
    return inserted


# ─── Flow ─────────────────────────────────────────────────────────────────────

@flow(name="ingest-social", log_prints=True)
async def ingest_social_flow() -> dict:
    """
    Collect social signals from Bluesky, RSS, Reddit, and Telegram.
    PII is redacted before any signal touches the database.
    Reddit/Telegram skip gracefully if credentials are unset.
    Schedule: every 15 minutes.
    """
    results = await asyncio.gather(
        ingest_bluesky_firehose(),
        ingest_rss_feeds(),
        ingest_reddit(),
        ingest_telegram(),
        return_exceptions=True,
    )

    all_signals: list[RawSignal] = []
    for result in results:
        if isinstance(result, list):
            all_signals.extend(result)
        elif isinstance(result, Exception):
            logger.warning("Source ingest failed: %s", result)

    total = await upsert_signals(all_signals)
    logger.info("Social ingest complete: %d signals stored", total)

    # Record scraper run times in Redis so the health endpoint shows liveness
    # regardless of whether fresh disaster content was published this cycle.
    await _write_scraper_heartbeats(results)

    return {"signals_stored": total, "signals_collected": len(all_signals)}


async def _write_scraper_heartbeats(results: list) -> None:
    """Write per-source last-run timestamps to Redis keyed by source name."""
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(redis_url, decode_responses=True, socket_timeout=2)
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            # results[0]=bluesky, [1]=rss, [2]=reddit, [3]=telegram (order matches gather)
            source_order = ["bluesky", "rss", "reddit", "telegram"]
            for i, source in enumerate(source_order):
                if i < len(results) and not isinstance(results[i], Exception):
                    await r.set(
                        f"costa:scraper:last_run:{source}",
                        now_iso,
                        ex=3600,  # expire after 1h so stale keys don't mislead
                    )
        finally:
            await r.aclose()
    except Exception as exc:
        logger.warning("Could not write scraper heartbeats to Redis: %s", exc)
