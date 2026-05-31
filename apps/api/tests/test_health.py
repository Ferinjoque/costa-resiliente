import pytest
from httpx import AsyncClient, ASGITransport

from costa_api.main import app

BASE = "http://test"
_COER = {"X-Testing-Operator": "1:test_op:coer"}
_COEN = {"X-Testing-Operator": "2:test_coen:coen"}
_COEL = {"X-Testing-Operator": "3:test_coel:coel:150101"}


@pytest.mark.asyncio
async def test_health_returns_ok():
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
        response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data


@pytest.mark.asyncio
async def test_health_seed_returns_all_keys():
    """All 8 table counts must be present and non-negative."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
        resp = await client.get("/api/v1/health/seed")
    assert resp.status_code == 200
    body = resp.json()
    for key in ("districts", "alerts", "flood_polygons", "social_signals",
                "infrastructure", "hazard_zones", "quebradas", "stations"):
        assert key in body, f"Missing key: {key}"
        assert isinstance(body[key], int)
        assert body[key] >= 0


@pytest.mark.asyncio
async def test_health_seed_districts_seeded():
    """At least 43 districts must be seeded (Lima Metropolitana)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
        resp = await client.get("/api/v1/health/seed")
    assert resp.json()["districts"] >= 43


@pytest.mark.asyncio
async def test_health_scraper_returns_shape():
    """Scraper health must return overall_status and sources dict."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
        resp = await client.get("/api/v1/health/scraper")
    assert resp.status_code == 200
    body = resp.json()
    assert "overall_status" in body
    assert "sources" in body
    assert body["overall_status"] in ("ok", "stale", "offline")


@pytest.mark.asyncio
async def test_health_scraper_sources_keys():
    """All 8 expected scraper sources must be present."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
        resp = await client.get("/api/v1/health/scraper")
    sources = resp.json()["sources"]
    for key in ("bluesky", "rss", "reddit", "telegram", "imerg", "stations", "flood", "alerts"):
        assert key in sources, f"Missing scraper source: {key}"


@pytest.mark.asyncio
async def test_health_scraper_each_source_has_status():
    """Every source dict must have a 'status' field with a valid value."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
        resp = await client.get("/api/v1/health/scraper")
    for name, src in resp.json()["sources"].items():
        assert "status" in src, f"Source {name!r} missing 'status'"
        assert src["status"] in ("ok", "stale", "offline", "error"), (
            f"Source {name!r} has unexpected status: {src['status']!r}"
        )


@pytest.mark.asyncio
async def test_health_scraper_has_retrieved_at():
    """Response must include retrieved_at ISO timestamp."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as client:
        resp = await client.get("/api/v1/health/scraper")
    assert "retrieved_at" in resp.json()


# ─── POST /health/seed auth guard ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_post_seed_unauthenticated_returns_401():
    """POST /health/seed without token → 401."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/health/seed")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_post_seed_coel_returns_403():
    """POST /health/seed with district-only COEL role → 403."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/health/seed", headers=_COEL)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_post_seed_coer_allowed():
    """POST /health/seed with COER role → 200 (idempotent)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/health/seed", headers=_COER)
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body.get("triggered_by") == "test_op"


@pytest.mark.asyncio
async def test_post_seed_coen_allowed():
    """POST /health/seed with COEN role → 200 (idempotent)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.post("/api/v1/health/seed", headers=_COEN)
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


# ─── Redis probe in /health/scraper ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_scraper_has_redis_key():
    """/health/scraper response must include a 'redis' key with status field."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/health/scraper")
    assert resp.status_code == 200
    body = resp.json()
    assert "redis" in body, "Missing 'redis' key in scraper health"
    assert "status" in body["redis"], "'redis' block must contain 'status'"
    assert body["redis"]["status"] in ("ok", "offline"), f"Unexpected redis status: {body['redis']['status']!r}"


@pytest.mark.asyncio
async def test_health_scraper_overall_status_valid():
    """overall_status in scraper response must be a valid SINAGERD-aligned value."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/health/scraper")
    body = resp.json()
    assert body["overall_status"] in ("ok", "stale", "offline"), (
        f"overall_status must be ok/stale/offline, got {body['overall_status']!r}"
    )
