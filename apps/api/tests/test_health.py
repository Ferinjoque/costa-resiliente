import pytest
from httpx import AsyncClient, ASGITransport

from costa_api.main import app

BASE = "http://test"


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
