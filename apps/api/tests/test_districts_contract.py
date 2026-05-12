"""
Districts endpoint contract tests — no real DB.
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
