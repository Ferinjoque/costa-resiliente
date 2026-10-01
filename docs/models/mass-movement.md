# Model card: mass-movement (huayco) probability

`xgb-fitted-sinpad-era5-v1`. Code: `apps/workers/src/costa_workers/ml/mass_movement.py`,
`mass_movement_data.py`. Registry: `ml.models`. Outputs: `ml.mass_movement_risk`.
Served at `/api/v1/layers/huayco/model` (layer "Huaycos: modelo entrenado") and
`/api/v1/layers/huayco/model/card`.

## What it predicts

The probability that the national emergency inventory (SINPAD, INDECI) records at least
one mass movement (huayco, deslizamiento, derrumbe de cerro, alud) in a district within
the next 72 hours, given the rain observed up to today. One prediction per district per
day, for the 178 districts of the Lima department and Callao, in the rainy season
(December to April, 92% of the dated Lima events).

It is a district-level early-warning signal. It does not locate a flow within a
district, and it does not predict magnitude.

## Data

| Input | Source | Notes |
|---|---|---|
| Labels | SINPAD emergency inventory 2003-2020 (`docs/BD-EMER-Y-DAÑOS-INTEGRADA-2003-2020-validada.xlsx`) | 1,062 dated mass-movement events in 145 districts. Dates are report dates. |
| Rain | ERA5 daily precipitation via the Open-Meteo archive API | 21 cells of 0.5 degrees. 0.25 degrees would need 54 cells and exceed the free quota. |
| Susceptibility | CENEPRED, escenario de riesgo El Niño, mass movements | Per district, ordinal 1-4. |
| Area | INEI district boundaries (same CENEPRED service) | log10 km2: large districts report more. |
| History | SINPAD, training seasons only | Leave-one-season-out inside training; test rows see training seasons only. |

Features: rain in the last 1, 3, 7, 14 and 30 days, the wettest day of the last 3,
susceptibility, log area, historical rate, and day-of-season (sine, cosine).

## Validation

Temporal split. Trained on the 2003-2016 seasons; tested on 2017-2020, which the model
never saw, including the 2017 coastal El Niño. Hyperparameters and the 72 h target were
chosen on a validation split inside the training seasons (train 2003-2012, validate
2013-2016) before the test seasons were scored.

The baseline is the same model without any rain feature, trained on the same split, so
the comparison isolates what the rainfall adds.

| Test 2017-2020 (107,690 district-days, 1,814 positive) | Model | No-rain baseline | Chance |
|---|---|---|---|
| ROC-AUC | **0.76** | 0.71 | 0.50 |
| PR-AUC | **0.060** (3.6x chance) | 0.034 (2.0x) | 0.017 |
| Share of events in the top 10% of district-days | **37%** | 19% | 10% |

2017 season alone: ROC-AUC 0.76, PR-AUC 0.116 against 0.042 by chance.

Replay check, 15 March 2017: Lurigancho and Chaclacayo are rated very high (31x and 17x
the base rate). SINPAD recorded seven mass movements in those two districts from 15 to
17 March (four in Chaclacayo, three in Lurigancho).

## How to read the output

Absolute probabilities are small, because a mass movement on a given district-day is
rare (base rate about 0.1% in training). Risk levels are therefore multiples of the
training base rate: medium at 2x, high at 5x, very high at 10x.

## Limitations

- Rain at 0.5 degrees is coarse: neighbouring districts in one cell share the same rain.
  Spatial contrast comes from susceptibility and history.
- SINPAD is a record of reported emergencies. Under-reporting in sparsely populated
  districts is learned as low risk.
- Report dates can lag the event by a day or two. The 72 h target absorbs some of that.
- Live inference uses Open-Meteo's forecast model for the last 30 days and tomorrow;
  training used ERA5. The two are close but not identical.
- Only 414 positive district-days in training. Skill is real but modest; this is a
  prioritisation aid for field verification, not a trigger for evacuation on its own.

## Reproduce

```bash
docker exec -i costa-postgres psql -U costa -d costa_resiliente < infra/postgres/migration_mass_movement.sql
docker exec costa-prefect-worker python -m costa_workers.ml.mass_movement fetch    # ERA5, ~2 min
docker exec costa-prefect-worker python -m costa_workers.ml.mass_movement train    # ~30 s
docker exec costa-prefect-worker python -m costa_workers.ml.mass_movement replay 2017-01-01 2017-04-30
docker exec costa-prefect-worker python -m costa_workers.ml.mass_movement live
```

SINPAD dates must be loaded first: `scripts/load_sinpad.py --replace` (steps in the README).
The loader needs both the header-parsing fix of 2026-09-28 (earlier loads left `event_date`
NULL) and the date fix of 2026-10-01 (earlier loads swapped day and month on a third of the
events). Reproduced from a clean install on 2026-10-01: ROC-AUC 0.762, rain-free baseline
0.708, PR-AUC 0.0605, 37.3% of events in the top decile. Live scoring runs every hour in the
`huayco-hourly` Prefect deployment.
