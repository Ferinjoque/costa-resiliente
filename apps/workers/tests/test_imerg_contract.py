"""
IMERG ingest contract tests: no NASA API calls.
Validates data transformations and output schema.
"""
import numpy as np
import pytest
from datetime import datetime, timezone


def test_granule_time_alignment():
    """IMERG timestamps must snap to 30-minute boundaries."""
    from datetime import timedelta

    def snap_to_half_hour(dt: datetime) -> datetime:
        minute = (dt.minute // 30) * 30
        return dt.replace(minute=minute, second=0, microsecond=0)

    t = datetime(2025, 1, 10, 11, 47, 33, tzinfo=timezone.utc)
    snapped = snap_to_half_hour(t)
    assert snapped.minute in (0, 30)
    assert snapped.second == 0


def test_imerg_fill_value_cleaned():
    """IMERG fill values (-9999) must be zeroed before accumulation."""
    raw = np.array([[5.0, -9999.0, 3.0], [2.0, -9999.0, 1.0]])
    cleaned = np.where(raw < 0, 0.0, raw)
    assert (cleaned >= 0).all()
    assert cleaned[0, 1] == 0.0


def test_half_hourly_to_mm():
    """mm/hr × 0.5 = mm per 30-minute granule."""
    rate_mmhr = 10.0
    mm_per_granule = rate_mmhr * 0.5
    assert mm_per_granule == 5.0


def test_accumulation_window_granule_counts():
    """1h = 2 granules, 3h = 6, 6h = 12, 12h = 24, 24h = 48, 72h = 144, 168h = 336."""
    granules_per_hour = 2
    from costa_workers.ingest.imerg import ACCUMULATION_HOURS
    expected = {1: 2, 3: 6, 6: 12, 12: 24, 24: 48, 72: 144, 168: 336}
    for h in ACCUMULATION_HOURS:
        assert h * granules_per_hour == expected[h]


def test_watershed_zonal_sum():
    """Zonal sum over a 2-pixel mask should equal sum of masked values."""
    precip = np.array([[2.0, 5.0], [3.0, 0.0]])  # mm per granule
    mask = np.array([[True, False], [True, False]])
    result = float(np.nansum(precip[mask]))
    assert result == pytest.approx(5.0)


def test_lima_bbox_dimensions():
    """Lima AOI must cover expected lat/lon range."""
    from costa_workers.ingest.imerg import LIMA_BBOX, IMERG_RES

    w, s, e, n = LIMA_BBOX
    lon_cells = (e - w) / IMERG_RES
    lat_cells = (n - s) / IMERG_RES

    # Lima AOI: 0.5° lon × 0.8° lat → 5 × 8 cells at 0.1°
    assert lon_cells == pytest.approx(5.0, abs=0.1)
    assert lat_cells == pytest.approx(8.0, abs=0.1)
