"""
Districts endpoint contract tests: no real DB.
Validates GeoJSON shape, property schema, and error cases.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

# ─── Fixtures ─────────────────────────────────────────────────────────────────

MOCK_DISTRICT_ROW = {
    "ubigeo": "150101",
    "name": "Lima",
    "province": "Lima",
    "region": "Lima",
    "area_km2": 21.98,
    "population": 271814,
    "geometry": {"type": "MultiPolygon", "coordinates": [[[[0, 0], [1, 0], [1, 1], [0, 0]]]]},
}


def _mock_db_session(rows: list[dict]):
    """Create a mock AsyncSession that returns `rows` from .execute()."""
    mapping = MagicMock()
    mapping.all.return_value = [MagicMock(**{"__getitem__": lambda self, k: row[k]}) for row in rows]
    for row_mock, row in zip(mapping.all.return_value, rows):
        row_mock.__getitem__ = lambda self, k, _row=row: _row[k]

    result = MagicMock()
    result.mappings.return_value = mapping

    session = AsyncMock()
    session.execute = AsyncMock(return_value=result)
    return session


@pytest.fixture
def app():
    from costa_api.main import app as _app
    return _app


# ─── GeoJSON shape ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_districts_returns_feature_collection(app):
    """GET /api/v1/districts → FeatureCollection."""
    from costa_api.db import get_db
    mock_session = _mock_db_session([MOCK_DISTRICT_ROW])

    async def override():
        yield mock_session

    app.dependency_overrides[get_db] = override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/districts")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "FeatureCollection"
    assert isinstance(body["features"], list)


@pytest.mark.asyncio
async def test_districts_feature_has_required_properties(app):
    """Each feature must have ubigeo, name, province, region."""
    from costa_api.db import get_db
    mock_session = _mock_db_session([MOCK_DISTRICT_ROW])

    async def override():
        yield mock_session

    app.dependency_overrides[get_db] = override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/districts")
    finally:
        app.dependency_overrides.clear()

    feature = resp.json()["features"][0]
    assert feature["type"] == "Feature"
    props = feature["properties"]
    for key in ("ubigeo", "name", "province", "region"):
        assert key in props, f"Missing property: {key}"


@pytest.mark.asyncio
async def test_districts_ubigeo_format(app):
    """UBIGEO must be a 6-digit string matching Lima Province pattern."""
    from costa_api.db import get_db
    mock_session = _mock_db_session([MOCK_DISTRICT_ROW])

    async def override():
        yield mock_session

    app.dependency_overrides[get_db] = override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/districts")
    finally:
        app.dependency_overrides.clear()

    ubigeo = resp.json()["features"][0]["properties"]["ubigeo"]
    assert isinstance(ubigeo, str)
    assert len(ubigeo) == 6
    assert ubigeo.startswith("15"), f"Lima UBIGEO must start with '15', got {ubigeo}"


@pytest.mark.asyncio
async def test_districts_geometry_present(app):
    """Features must include a non-null geometry object."""
    from costa_api.db import get_db
    mock_session = _mock_db_session([MOCK_DISTRICT_ROW])

    async def override():
        yield mock_session

    app.dependency_overrides[get_db] = override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/districts")
    finally:
        app.dependency_overrides.clear()

    geometry = resp.json()["features"][0]["geometry"]
    assert geometry is not None
    assert "type" in geometry
    assert "coordinates" in geometry


@pytest.mark.asyncio
async def test_districts_empty_db_returns_empty_collection(app):
    """An empty DB should return an empty FeatureCollection, not an error."""
    from costa_api.db import get_db
    mock_session = _mock_db_session([])

    async def override():
        yield mock_session

    app.dependency_overrides[get_db] = override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/districts")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert resp.json()["features"] == []


# ─── Health endpoint sanity (already tested, re-assert here for clarity) ─────

@pytest.mark.asyncio
async def test_health_ok(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


# ─── Risk summary integration tests ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_risk_summary_returns_feature_collection(app):
    """GET /districts/risk-summary → FeatureCollection with risk_level properties."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/districts/risk-summary")
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "FeatureCollection"
    assert "features" in body
    assert "retrieved_at" in body
    if body["features"]:
        props = body["features"][0]["properties"]
        assert "risk_level" in props
        assert props["risk_level"] in ("alto", "moderado", "bajo")
        assert "active_alerts" in props
        assert "ubigeo" in props


@pytest.mark.asyncio
async def test_risk_summary_includes_rainfall_risk(app):
    """Risk summary code must query rainfall alerts via watershed intersection.

    Regression guard: prior bug only counted district-specific alerts (district_id FK),
    so rainfall alerts (district_id NULL, watershed-level) never elevated any district.
    Fix: pre-compute rainfall severity per watershed, then spatial-join to districts.

    This test verifies the code structure (not live DB state, which varies across
    test suite runs as other tests modify alert statuses).
    """
    from inspect import getsource
    from costa_api.routers.districts import district_risk_summary
    src = getsource(district_risk_summary)

    # Verify the new rainfall-aware logic is present
    assert "rainfall_district_sev" in src, (
        "district_risk_summary must include rainfall_district_sev dict "
        "to propagate watershed rainfall alerts to intersecting districts"
    )
    assert "watershed_id" in src, (
        "district_risk_summary must join to geo.watersheds to resolve "
        "rainfall alert watershed coverage"
    )
    assert "rain_sev" in src, (
        "district_risk_summary must compute rain_sev and pass it to risk_level()"
    )


@pytest.mark.asyncio
async def test_district_dashboard_returns_active_alerts(app):
    """GET /districts/{ubigeo}/dashboard must return active alerts list.

    Regression guard: district dashboard now includes rainfall alerts
    (district_id = NULL, watershed-level) in addition to district-specific alerts.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/districts/150118/dashboard")
    assert resp.status_code == 200
    body = resp.json()
    assert "active_alerts" in body
    assert isinstance(body["active_alerts"], list)
    assert "district" in body
    assert body["district"]["ubigeo"] == "150118"


@pytest.mark.asyncio
async def test_district_dashboard_rainfall_alerts_included(app):
    """District dashboard active_alerts now includes watershed rainfall alerts.

    Regression: prior query only filtered by district_id = :did, so rainfall
    alerts (district_id = NULL) never appeared in district dashboards even
    during EMERGENCIA events.
    """
    from inspect import getsource
    from costa_api.routers.districts import district_dashboard
    src = getsource(district_dashboard)
    assert "type = 'rainfall'" in src, (
        "district_dashboard must include a UNION for rainfall alerts "
        "since they have district_id = NULL but affect watershed-intersecting districts"
    )
    assert "UNION" in src or "union" in src.lower(), (
        "district_dashboard must UNION district-specific and rainfall alerts"
    )


@pytest.mark.asyncio
async def test_sinpad_uses_exact_match_not_substring(app):
    """SINPAD historical event count uses exact ubigeo or exact name match.

    Regression guard: prior ILIKE '%name%' substring match overcounted events: 
    e.g. 'Lurigancho' returned 50 events (includes 'Lurigancho-Chosica' and others).
    Fix: exact ubigeo match + exact case-insensitive name fallback = 27 events.
    """
    from inspect import getsource
    from costa_api.routers.districts import district_dashboard
    src = getsource(district_dashboard)

    # Exact match patterns must be present
    assert "ubigeo = :ubigeo" in src, (
        "SINPAD query must use exact ubigeo match to avoid substring overcounting"
    )
    assert "LOWER(TRIM(distrito))" in src, (
        "SINPAD query must use exact normalized name match as fallback"
    )
    # Substring match must NOT be present
    assert "ILIKE '%' || :name || '%'" not in src, (
        "SINPAD query must not use substring ILIKE match, it overcounts events "
        "from adjacent/similarly-named districts"
    )


# ─── INEI UBIGEO integrity ────────────────────────────────────────────────────

def test_seed_districts_use_official_inei_ubigeos():
    """Guard against the 2026-08 off-by-one in the Lima UBIGEO map.

    'Pueblo Libre' and 'Magdalena Vieja' are the same district (INEI 150121).
    Listing both shifted every code from 150125 onward by +1 and put San Juan de
    Lurigancho, the demo COEL district, on 150133, which is San Juan de
    Miraflores. Codes are surfaced to operators and written into EDAN-Perú
    exports, so they have to match INEI exactly.

    Reference: CENEPRED COEN FEN 2023 service, field id_dist.
    """
    from costa_api.auto_seed import _DEMO_DISTRICTS

    official = {
        "Lima": "150101", "Ate": "150103", "Carabayllo": "150106",
        "Chaclacayo": "150107", "Chorrillos": "150108", "Comas": "150110",
        "La Molina": "150114", "Lurigancho": "150118", "Puente Piedra": "150125",
        "San Juan de Lurigancho": "150132", "San Juan de Miraflores": "150133",
        "San Martín de Porres": "150135", "Santa Anita": "150137",
        "Santiago de Surco": "150140", "Villa El Salvador": "150142",
        "Villa María del Triunfo": "150143",
    }
    seeded = {d["name"]: d["ubigeo"] for d in _DEMO_DISTRICTS}
    for name, ubigeo in official.items():
        assert seeded.get(name) == ubigeo, f"{name}: expected {ubigeo}, seeded {seeded.get(name)}"


def test_no_seed_district_shares_a_population_with_another():
    """A duplicated population figure means one of them was copied, not sourced."""
    from costa_api.auto_seed import _DEMO_DISTRICTS

    populations = [d["population"] for d in _DEMO_DISTRICTS if d.get("population")]
    assert len(populations) == len(set(populations))
