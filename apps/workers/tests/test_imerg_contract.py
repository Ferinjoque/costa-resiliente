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
    """The AOI must cover the full Rímac, Chillón and Lurín basins.

    The old 0.5° x 0.8° box stopped at -76.7, so the upper Rímac, where the
    rain that drives huaycos in Chosica falls, was never sampled.
    """
    from costa_workers.ingest.imerg import LIMA_BBOX, IMERG_RES

    w, s, e, n = LIMA_BBOX
    assert (e - w) / IMERG_RES == pytest.approx(16.0, abs=0.1)
    assert (n - s) / IMERG_RES == pytest.approx(17.0, abs=0.1)
    # HydroBASINS extents of the three basins (see load_watersheds_hydrobasins.py)
    assert w <= -77.2 and e >= -76.0 and s <= -12.5 and n >= -11.2


def test_granule_url_uses_gesdisc_day_of_year_path():
    from costa_workers.ingest.imerg import granule_url

    url, name = granule_url(datetime(2026, 9, 28, 16, 7, tzinfo=timezone.utc))
    assert url.startswith("https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3/GPM_3IMERGHHE.07/2026/271/")
    assert name == "3B-HHR-E.MS.MRG.3IMERG.20260928-S160000-E162959.0960.V07C.HDF5"


def test_granule_url_second_half_hour():
    from costa_workers.ingest.imerg import granule_url

    _, name = granule_url(datetime(2026, 1, 1, 0, 45, tzinfo=timezone.utc))
    assert name == "3B-HHR-E.MS.MRG.3IMERG.20260101-S003000-E005959.0030.V07C.HDF5"


def test_watershed_accumulation_is_a_basin_mean_not_a_pixel_sum():
    """Two pixels each receiving 1 mm per granule for 2 granules -> 2 mm, not 4."""
    stack = np.ones((2, 1, 2))            # granules x rows x cols, mm per granule
    mask = np.array([[True, True]])
    depth = float(np.nanmean(np.nansum(stack[:, mask], axis=0)))
    assert depth == pytest.approx(2.0)


def test_listing_parser_takes_names_from_the_directory_not_a_template():
    from costa_workers.ingest.imerg import parse_listing

    html = (
        '<a href="3B-HHR-E.MS.MRG.3IMERG.20260928-S203000-E205959.1230.V07C.HDF5">x</a>'
        '<a href="3B-HHR-E.MS.MRG.3IMERG.20260928-S203000-E205959.1230.V07C.HDF5.xml">x</a>'
        '<a href="3B-HHR-E.MS.MRG.3IMERG.20260928-S210000-E212959.1260.V07D.HDF5">x</a>'
    )
    out = parse_listing(html)
    assert len(out) == 2   # the .xml sidecar is not a granule
    t = datetime(2026, 9, 28, 21, 0, tzinfo=timezone.utc)
    assert out[t].endswith("V07D.HDF5")   # a new processing version still parses


def test_basin_depth_is_half_the_hourly_rate_averaged_over_the_basin():
    from costa_workers.ingest.imerg import basin_depths

    rate = np.array([[2.0, 4.0], [-9999.0, 0.0]])   # mm/h, fill value included
    masks = {1: np.array([[True, True], [False, False]]), 2: np.array([[False, False], [True, True]]),
             3: np.zeros((2, 2), dtype=bool)}
    d = basin_depths(rate, masks)
    assert d[1] == pytest.approx(1.5)      # mean(2, 4) x 0.5
    assert d[2] == pytest.approx(0.0)      # fill value treated as dry
    assert 3 not in d                      # empty mask skipped


def test_basin_mask_rows_run_south_to_north_like_the_clipped_grid():
    from costa_workers.ingest.imerg import basin_masks, _LAT, _LAT_MASK

    # A thin box in the southern part of the AOI must land in the low rows.
    south = "POLYGON((-77.3 -12.65,-75.9 -12.65,-75.9 -12.45,-77.3 -12.45,-77.3 -12.65))"
    m = basin_masks([{"id": 1, "geom_wkt": south}])[1]
    lats = _LAT[_LAT_MASK]
    rows = np.where(m.any(axis=1))[0]
    assert lats[rows].max() < -12.3
