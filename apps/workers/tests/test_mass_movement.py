"""Mass-movement model: feature construction, labels, leakage guards. No network, no DB."""
from datetime import date

import pytest

from costa_workers.ml import mass_movement as mm
from costa_workers.ml import mass_movement_data as data


class TestGrid:
    def test_cell_of_snaps_to_half_degree_centres(self):
        cid, lon, lat = data.cell_of(-76.69, -11.94)   # Chosica
        assert (lon, lat) == (-76.75, -11.75)
        assert cid == "-76.75_-11.75"

    def test_neighbouring_points_share_a_cell(self):
        assert data.cell_of(-76.70, -11.94)[0] == data.cell_of(-76.99, -11.51)[0]


class TestRainFeatures:
    def test_windows_look_backwards_from_the_day(self):
        cell, day = "c", date(2017, 3, 14)
        series = {(cell, date(2017, 3, 14 - k)): float(k + 1) for k in range(10)}
        f = mm.rain_features(series, cell, day)
        assert f["r1"] == 1.0
        assert f["r3"] == 1.0 + 2.0 + 3.0
        assert f["rmax3"] == 3.0
        assert f["r7"] == sum(range(1, 8))

    def test_missing_days_count_as_dry(self):
        assert mm.rain_features({}, "c", date(2017, 3, 14))["r30"] == 0.0

    def test_future_rain_is_never_a_feature(self):
        cell, day = "c", date(2017, 3, 14)
        series = {(cell, date(2017, 3, 15)): 100.0}
        assert mm.rain_features(series, cell, day)["r3"] == 0.0


class TestLabels:
    def test_72h_target_marks_the_two_days_before_an_event(self):
        ev = {("150118", date(2017, 3, 15))}
        lab = mm.within_window(ev)
        assert {("150118", date(2017, 3, d)) for d in (13, 14, 15)} == lab

    def test_december_belongs_to_the_next_season(self):
        assert mm._season_of(date(2016, 12, 20)) == 2017
        assert mm._season_of(date(2017, 3, 1)) == 2017


class TestHistoryRate:
    def test_leave_one_season_out_excludes_the_rows_own_season(self):
        ev = {("150118", date(2010, 2, 1)), ("150118", date(2011, 2, 1)), ("150118", date(2011, 3, 1))}
        rates = mm.history_rates(ev, [2010, 2011, 2012])
        # For a 2011 row only the 2010 event is visible: 1 event over the 2 other seasons.
        assert rates["150118"][2011] == pytest.approx(0.5)
        assert rates["150118"]["all"] == pytest.approx(1.0)

    def test_dry_season_events_are_not_counted(self):
        rates = mm.history_rates({("150118", date(2010, 7, 1))}, [2010, 2011])
        assert "150118" not in rates or rates["150118"]["all"] == 0


class TestSeason:
    def test_season_days_are_dec_to_apr_only(self):
        days = mm.season_days(2017, 2017)
        assert {d.month for d in days} == {1, 2, 3, 4}   # Dec 2017 is season 2018
        assert days[0] == date(2017, 1, 1) and days[-1] == date(2017, 4, 30)


class TestRiskLevel:
    @pytest.mark.parametrize("rel,level", [(0.5, "low"), (2.0, "medium"), (5.0, "high"), (12.0, "very_high")])
    def test_levels_are_multiples_of_the_base_rate(self, rel, level):
        thr = {"medium": 2.0, "high": 5.0, "very_high": 10.0, "base_rate": 0.001}
        assert mm.risk_level(rel, thr) == level

    def test_feature_list_matches_matrix_columns(self):
        district = {"ubigeo": "150118", "cell_id": "c", "susceptibility": "alto", "area_km2": 245.0}
        X, y, idx = mm.build_matrix([district], set(), {}, [date(2017, 3, 14)], {}, lambda s: "all")
        assert X.shape == (1, len(mm.FEATURES))
        assert y.tolist() == [0] and idx == [("150118", date(2017, 3, 14))]
