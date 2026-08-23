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
    assert "sinagerd_level" in data, "Health must include SINAGERD operational level"
    assert data["sinagerd_level"] in ("EMERGENCIA", "ALERTA", "AVISO", "NORMAL")
    assert "active_alerts" in data
    assert isinstance(data["active_alerts"], int)
    assert data["active_alerts"] >= 0
    # Verify SINAGERD level is consistent with active_alerts + rain_level
    # (rainfall can also elevate the level even with 0 alerts)
    if data["active_alerts"] == 0 and data["rain_level"] == "normal":
        # No active alerts AND no rainfall above threshold → NORMAL
        assert data["sinagerd_level"] == "NORMAL", f"0 alerts + normal rain should → NORMAL, got {data['sinagerd_level']!r}"

    # Verify rainfall-elevated SINAGERD levels
    if data["rain_level"] == "emergencia":
        assert data["sinagerd_level"] == "EMERGENCIA", (
            f"emergencia rain should → EMERGENCIA level, got {data['sinagerd_level']!r}"
        )
    assert "max_rain_72h_mm" in data
    assert data["max_rain_72h_mm"] is None or isinstance(data["max_rain_72h_mm"], (int, float))
    assert "rain_level" in data
    assert data["rain_level"] in ("emergencia", "alerta", "aviso", "normal")
    # Verify rain_level is at least as severe as 72h value implies
    mm = data["max_rain_72h_mm"]
    if mm is not None and mm >= 50:
        assert data["rain_level"] == "emergencia", f">=50mm should be emergencia, got {data['rain_level']!r}"
    if mm is not None and mm >= 25 and mm < 50:
        assert data["rain_level"] in ("alerta", "emergencia"), f">= 25mm should be alerta+, got {data['rain_level']!r}"
    # Session 23: verify new fields exist and are correct types
    assert "critical_alerts" in data, "Health must include critical_alerts count (Session 23)"
    assert "high_alerts" in data, "Health must include high_alerts count (Session 23)"
    assert "sinagerd_primary_trigger" in data, "Health must include sinagerd_primary_trigger (Session 23)"
    assert isinstance(data["critical_alerts"], int) and data["critical_alerts"] >= 0
    assert isinstance(data["high_alerts"], int) and data["high_alerts"] >= 0
    assert data["sinagerd_primary_trigger"] in ("alerts", "rainfall", "combined", "none"), (
        f"sinagerd_primary_trigger must be one of known values, got {data['sinagerd_primary_trigger']!r}"
    )
    # Verify combined logic consistency: combined = both alerts AND rainfall qualify independently
    # When we have critical alerts AND emergencia rainfall (as in demo), trigger must be "combined"
    if data["critical_alerts"] >= 1 and data["rain_level"] == "emergencia":
        assert data["sinagerd_primary_trigger"] == "combined", (
            "When critical_alerts >= 1 AND rain_level == emergencia, sinagerd_primary_trigger must be 'combined'"
        )


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


# ─── /health rainfall uses per-watershed query ────────────────────────────────

@pytest.mark.asyncio
async def test_health_rainfall_uses_per_watershed_query():
    """Regression: /health rainfall must use per-watershed DISTINCT ON, not global MAX(time).

    Prior bug: WHERE time = (SELECT MAX(time) FROM hydro.imerg_accumulations) retrieved
    only watersheds with the single latest timestamp — if one watershed ingested later
    than another, the others were excluded from the max_rain_72h_mm computation.
    Fix: per-watershed DISTINCT ON picks each watershed's own latest reading.
    """
    from inspect import getsource
    from costa_api.routers.health import health_check
    src = getsource(health_check)
    assert "DISTINCT ON" in src, (
        "health_check rainfall query must use DISTINCT ON (watershed_id) ORDER BY time DESC "
        "to pick each watershed's latest reading independently"
    )
    assert "SELECT MAX(time) FROM hydro.imerg_accumulations" not in src, (
        "health_check must not use global MAX(time) for rainfall — "
        "it excludes watersheds that ingested earlier than the most recent"
    )


@pytest.mark.asyncio
async def test_health_rain_level_consistent_with_max_rain():
    """rain_level classification must be consistent with max_rain_72h_mm value."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE) as c:
        resp = await c.get("/api/v1/health")
    data = resp.json()
    mm = data.get("max_rain_72h_mm")
    level = data.get("rain_level", "normal")
    if mm is not None:
        if mm >= 50:
            assert level == "emergencia", f"{mm}mm should be emergencia, got {level}"
        elif mm >= 25:
            assert level in ("alerta", "emergencia"), f"{mm}mm should be alerta+, got {level}"
        elif mm >= 15:
            assert level in ("aviso", "alerta", "emergencia"), f"{mm}mm should be aviso+, got {level}"
        else:
            # Below all thresholds — should be normal (unless something else elevated it)
            assert level in ("normal", "aviso", "alerta", "emergencia"), f"Invalid level: {level}"


# ─── Demo restore semantics ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_seed_gate_counts_only_active_demo_alerts():
    """The seed pass must key off ACTIVE demo alerts, not every alert row.

    Regression guard: the gate used to be `SELECT COUNT(*) FROM ops.alerts`, so
    once the demo alerts had been acknowledged or closed — by a demo run, by this
    test suite (which acts on real rows), or by auto-resolution — the table still
    looked populated and the seed returned early. POST /health/seed could then
    never restore the scenario, which is the only reason it exists.
    """
    import inspect
    from costa_api import auto_seed

    source = inspect.getsource(auto_seed.maybe_seed)
    assert "status = 'active' AND title = ANY(:titles)" in source


@pytest.mark.asyncio
async def test_demo_alerts_have_unique_titles():
    """Restore matches demo alerts by title, so titles must identify one alert."""
    from costa_api.auto_seed import _ALERTS_CURRENT

    titles = [a["title"] for a in _ALERTS_CURRENT]
    assert len(titles) == len(set(titles))
