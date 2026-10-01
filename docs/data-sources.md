# Data Sources: Costa Resiliente

> Status column reflects actual implementation state as of 2026-06-01 (Session 23).

---

## Tier 1: Foundation

### Sentinel-1 GRD (Microsoft Planetary Computer)
- **Endpoint**: `https://planetarycomputer.microsoft.com/api/stac/v1`
- **Collection**: `sentinel-1-grd`
- **Access**: Public STAC; signed asset URLs via PC SDK
- **Resolution**: 10m (GRD IW mode)
- **Revisit**: ~6 days over Lima AOI (ascending + descending combined)
- **Latency**: ~3h after acquisition
- **Implementation**: `apps/workers/src/costa_workers/ingest/sentinel1.py`
- **Storage**: MinIO (raw GRD) + pgstac catalog + `ml.flood_polygons` (derived)
- **Status**: ✅ Implemented and running

### NASA IMERG Early Run V07B (GPM)
- **Endpoint**: NASA GES DISC archive, `https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3/GPM_3IMERGHHE.07/<YYYY>/<DOY>/`
- **Credentials**: `EARTHDATA_TOKEN` (Earthdata user token, sent as a bearer header; expires
  after 60 days) or `EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD`.
- **Resolution**: 0.1° (~11 km), half-hourly granules. **Latency**: ~4 h (Early Run).
- **Accumulations**: 1h to 168h, basin mean over the HydroBASINS Rímac, Chillón and Lurín basins.
- **Status**: ✅ **Live since 2026-09-28.** Hourly; only uncached granules are downloaded
  (8 MB each); per-granule basin means in `hydro.imerg_granule_means`, 1-72 h accumulations in
  `hydro.imerg_observed`, served at `/api/v1/layers/imerg/observed`, the freshness bar and the
  SITREP. Observations are kept apart from `hydro.imerg_accumulations`, which holds the demo
  scenario, so neither can overwrite or be mistaken for the other.
- **History**: until
  2026-09-28 the ingest pointed at `gpm.nasa.gov` (a web page) with a month/day path, read the
  pre-V07 variable name, summed pixels instead of averaging them, and on failure re-inserted the
  last scenario accumulation with a fresh timestamp, which kept the source "ok". All four are
  fixed; a run that reads no granule now writes nothing. The rainfall map layer still shows the
  scenario rows and labels them as such.
- **Implementation**: `apps/workers/src/costa_workers/ingest/imerg.py`
- **Storage**: `hydro.imerg_accumulations` (TimescaleDB hypertable)

### Open-Meteo: 72 h rainfall forecast per basin
- **Endpoint**: `https://api.open-meteo.com/v1/forecast` (`hourly=precipitation,precipitation_probability`)
- **Points**: 3 per basin along the middle and upper course (Rímac: Chosica, Matucana, San Mateo;
  Chillón: Santa Rosa de Quives, Canta; Lurín: Cieneguilla, Antioquía, Langa).
- **Output**: cumulative basin-mean rain at +6/12/24/48/72 h, ANA 72 h level, max precipitation
  probability. Cached 15 min in the API. `/api/v1/layers/rain-forecast`; district dashboard;
  SITREP line "Pronóstico 72h (Open-Meteo, real)".
- **Why**: the dashboard used to show a hard-coded table labelled "SENAMHI · WRF". It was
  invented data attributed to a real agency, and it is gone.
- **Status**: ✅ Live

### Open-Meteo: current weather conditions
- **Endpoint**: `https://api.open-meteo.com/v1/forecast` (`current=` block)
- **Credentials**: none. No API key, no account, no quota to manage; free at any volume this
  project reaches, which keeps the zero-paid-API guarantee intact.
- **Variables**: temperature, apparent temperature, relative humidity, precipitation, WMO
  present-weather code, wind speed, wind gusts, wind direction
- **Points**: 5 (Lima Centro, Chosica/Rímac, Carabayllo/Chillón, Pachacámac/Lurín, Callao)
- **Latency**: ~15 min. This is the platform's genuinely near-real-time feed.
- **Derived warnings**: heat, cold, wind, fog, thunderstorm and heavy rain, thresholded for
  Lima's coastal desert climate rather than a temperate default. Logic and thresholds live in
  `apps/api/src/costa_api/weather.py` (single source of truth, covered by `tests/test_weather.py`).
- **Implementation**: `apps/workers/src/costa_workers/ingest/weather.py`, every 15 min
- **Storage**: `hydro.weather_observations` (TimescaleDB hypertable) + `hydro.weather_points`
- **Serving**: `/api/v1/layers/weather`; HUD temperature chip; `/health/scraper` source `weather`
- **Licence**: CC BY 4.0. Attribution is carried in the API payload and the Fuentes de datos panel.
- **Status**: ✅ Live

### Lima Geodata (INEI via CENEPRED, HydroBASINS, OSM)
- **Districts**: 178 districts of the Lima department and Callao, official INEI UBIGEO and
  boundaries, from the CENEPRED ArcGIS service (below). Loaded by
  `scripts/load_cenepred_districts.py`, which updates rows in place so every foreign key survives.
  Before 2026-09-28 the boundaries came from OSM with each boundary way closed as its own ring
  (Villa El Salvador 3.3 km² against a real 34), San Juan de Lurigancho and all of Callao were
  bounding boxes, and 118 Lima Región districts carried invented codes. Six rows with invented
  codes remain in the table and are filtered out of every endpoint by UBIGEO shape.
- **Watersheds**: Rímac (3,290 km²), Chillón (2,189) and Lurín (1,577), each the full upstream
  catchment derived from HydroBASINS level 10 (Lehner & Grill 2013) by following `NEXT_DOWN` to
  the sea outlet; within 10% of ANA's published areas. `scripts/load_watersheds_hydrobasins.py`.
  They replace six-vertex hexagons that put all of central Lima, Miraflores included, inside the
  Rímac basin.
- **Quebradas**: 10 priority quebradas. Pedregal and Huaycoloro follow the OSM waterway; the
  others are anchored on OSM place nodes (Quirio, Yanacoto, Carapongo, Ñaña) or documented
  Chosica locations (Corrales, Carossio). They used to sit within 5 km of each other in northern
  San Juan de Lurigancho.
- **Infrastructure**: hospitals, schools, fire stations, substations, bridges from Overpass API.
  **43,216 points loaded** (substation 24,368; school 16,044; hospital 1,668; bridge 768;
  fire_station 224; police_station 141; relief_warehouse 3). `/api/v1/layers/infrastructure`
  caps a response at 2,000 to keep the browser responsive and returns `total_available` plus
  `truncated` so the truncation is visible; rows are ordered by operational criticality
  (hospitals, INDECI warehouses, fire, police, bridges, schools, substations) so the points a
  duty officer needs first survive the cap. Use `?type=` to request a specific class.
- **Population**: INEI 2017 census at district level (`geo.districts.population`)
- **Load script**: `scripts/load_lima_geodata.py`
- **Status**: ✅ Loaded into PostGIS

### STAC Catalog (pgstac)
- **Backend**: pgstac schema inside the primary Postgres instance
- **Collections**: sentinel-1-grd, imerg-v07b, flood-polygons
- **Access**: `http://localhost:8082` (STAC API, pgstac-fastapi)
- **Status**: ⚠️ Schema bootstrapped and reachable, but **the catalogue is currently empty** (0 collections, 0 items). No Sentinel-1 scene has been registered since the ingest flow last ran (2026-05-18), so nothing downstream is reading from it today.

---

## Tier 2: Operational Layers

### ANA Observatorio Chirilu + SNIRH
- **URLs**: `observatoriochirilu.ana.gob.pe`, `snirh.ana.gob.pe`
- **Access**: HTML scraper (no public REST API confirmed)
- **Known fragility**: scraping is brittle; government sites go down during active flood events
- **Resilience**: every successful gauge reading cached to Redis (`costa:gauge:reading:{code}`, 24h TTL); scraper falls back to last known reading with `from_cache=True` on HTTP failure: station layer never goes blank during an outage
- **Storage**: `hydro.stations` + `hydro.station_observations`
- **Implementation**: `apps/workers/src/costa_workers/ingest/hydro.py` + `ana_scraper.py`
- **SENAMHI alert thresholds (meters):**

| Station | River | ALERTA | EMERGENCIA |
|---------|-------|--------|------------|
| ANA-Chosica | Rímac | 2.5 m | 3.2 m |
| ANA-Chaclacayo | Rímac | 1.5 m | 2.0 m |
| ANA-Carabayllo | Chillón | 2.5 m |, |
| ANA-Huachipa | Rímac | 1.8 m |, |
| ANA-Manchay | Lurín | 1.2 m |, |

- **Status**: ✅ Scraper implemented with Redis stale-reading cache; health published to `costa:scraper:status:{ana|senamhi}`

### SENAMHI
- **URL**: `senamhi.gob.pe`
- **Access**: Scraper (same caveats as ANA)
- **Layers**: Precipitation, temperature, wind, official advisories
- **Status**: ✅ Scraped alongside ANA in hydro.py

### INDECI SINPAD Historical
- **Source file**: `docs/BD-EMER-Y-DAÑOS-INTEGRADA-2003-2020-validada.xlsx` (gitignored, large binary)
- **Download URL**: `datosabiertos.gob.pe/dataset/emergencias-históricas-registradas-con-sinpad`
- **Coverage**: 96,531 national records (2003-2020); 2,063 Lima flood/huayco records loaded
- **Load script**: `scripts/load_sinpad.py`
- **Storage**: `historical.sinpad_events` (BIGSERIAL, indexed by ubigeo/year/event_type)
- **Use**: Hazard zone classification (SINPAD event density → flood/landslide levels per district)
- **Note**: SINPAD v2.0 live feed requires an authorized INDECI account; not used here
- **Status**: ✅ Historical data loaded (2,063 Lima records); hazard zones derived and in `geo.hazard_zones`

### CENEPRED: escenario de riesgo por lluvias intensas asociadas a El Niño
- **Endpoint**: `https://sig.cenepred.gob.pe/arcgis_server/rest/services/FEN/ER_NINO2027_BD/MapServer`,
  layers 4 (inundación) and 5 (movimientos en masa). Anonymous; no token.
- **Content**: one polygon per district with the official INEI UBIGEO, 2017 census population,
  and CENEPRED's susceptibility, vulnerability and risk levels, plus exposed homes, schools and
  health facilities. Scenario built on the rainfall of the 1983, 1998, 2017 and 2023 seasons.
- **Use**: authoritative district boundaries; layers "Riesgo oficial: huaycos / inundación";
  `official_risk` block in `/fusion` and the district dashboard; a feature of the trained model.
- **Storage**: `geo.cenepred_risk`, `geo.districts`. Loader: `scripts/load_cenepred_districts.py`.
- **Status**: ✅ Loaded (178 districts x 2 hazards)

### CENEPRED SIGRID
- **URL**: `sigrid.cenepred.gob.pe` / `sig.cenepred.gob.pe/arcgis_server/`
- **Access**: ArcGIS REST, requires token. Portal uses SSO (browser OAuth); `generateToken` endpoint returns 401 for direct API auth. Tokens are IP-bound and short-lived (60 min).
- **Current approach**: `geo.hazard_zones` is populated from SINPAD historical event density (18-year record as proxy for hazard classification). See `scripts/load_sigrid.py` for future ArcGIS REST loader.
- **Re-verified 2026-08-23**: `sigrid.cenepred.gob.pe/geoserver/ows` GetCapabilities now returns **404** (WFS endpoint retired); `sigridv3/mapa` returns 302 to SSO. Hazard polygons remain unavailable.
- **Open sibling endpoint (new, 2026-08-23)**: `sig.cenepred.gob.pe/arcgis_server/rest/services` responds **anonymously, no token**. Folder `sectores/COEN_FEN_2023_10_5_1X/MapServer` publishes official COEN Fenómeno El Niño response layers, `AlmacenesNacionales` (INDECI relief warehouses, 21 national records with Lima/Callao entries), `Bomberos`, `ComisariasBasicas`, `ComisariasFamilia`, `ipress_afectadas_inoperativas` / `ipress_afectadas_operativas_COESALUD` (MINSA facilities affected during FEN), `maquinaria` (MIDAGRI), `INTERVENCIONES_PVN_FEN_*` (MTC road works). Queryable with `outSR=4326`, GeoJSON supported, `maxRecordCount=1000`. Folder `sigrid` itself only exposes `sigrid_collect` (workshop points: not hazard data).
- **Status**: ⚠️ SIGRID native hazard polygons blocked (SSO); SINPAD-derived fallback loaded and serving. COEN FEN responder-asset layers available as an optional additive source (not yet ingested).

### CENEPRED / COEN: Fenómeno El Niño 2023 responder assets
- **Endpoint**: `https://sig.cenepred.gob.pe/arcgis_server/rest/services/sectores/COEN_FEN_2023_10_5_1X/MapServer`
- **Access**: ArcGIS REST, **anonymous, no token, no SSO**. `outSR=4326`, JSON/GeoJSON, `maxRecordCount=1000`.
- **Loaded**: layer 1 `AlmacenesNacionales` → `relief_warehouse` (INDECI relief stock), layers 4 + 5 `ComisariasBasicas` / `ComisariasFamilia` → `police_station`. **144 points** inside Lima Metropolitana + Callao.
- **Deliberately skipped**: layer 3 `Bomberos`, `geo.infrastructure` already carries OSM `fire_station` points for Lima and merging would double-count. Layers `ipress_afectadas_*` are a 2023 event snapshot, not current state, so they are not shown to operators as live data.
- **Load script**: `scripts/load_coen_fen.py` (idempotent; keyed on `properties.source_id`)
- **District resolution**: UBIGEO (`id_dist`) → district name (unaccented, case-folded) → `ST_Contains`. The seeded district polygons are simplified, Santiago de Surco measures 12 km² against a real ~34 km², so point-in-polygon alone drops more than half the real assets. Points that resolve to no seeded district are outside the locked scope and are not loaded.
- **Per-feature provenance**: `properties.source = 'CENEPRED COEN FEN 2023'`, surfaced in the map popup.
- **Status**: ✅ Loaded and serving via `/api/v1/layers/infrastructure`

### IGP Seismic Feed
- **URL**: `ultimosismo.igp.gob.pe` (verified reachable, HTTP 200, 2026-08-23)
- **Use**: Multi-hazard context (secondary to flood/huayco scenario)
- **Status**: ❌ Dropped: seismic hazards are out of scope for a flood and huayco tool

---

## Tier 3: Social & Infrastructure Signals

### Bluesky Jetstream v2
- **Endpoint**: `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post`
- **Access**: Fully public WebSocket firehose, no credentials required
- **Filter**: Disaster keyword match (60+ terms) + Lima district vocabulary
- **Schedule**: Every 15 minutes (30-second window per run)
- **Privacy**: PII redaction via presidio-analyzer before storage; 7-day retention
- **Implementation**: `apps/workers/src/costa_workers/ingest/social.py::ingest_bluesky_firehose()`
- **Status**: ✅ Active

### RSS News Feeds
- RPP: `https://rpp.pe/rss`
- Andina (official Peru news agency): `https://andina.pe/agencia/rss.aspx`
- El Comercio: `https://elcomercio.pe/rss/`
- Gestión: `https://gestion.pe/rss/` *(replaced Canal N and La República: both returned 404 consistently as of 2026-05)*
- Peru21: `https://peru21.pe/rss/`
- **Filter**: Disaster keyword match; last 48h only
- **Implementation**: `apps/workers/src/costa_workers/ingest/social.py::ingest_rss_feeds()`
- **Status**: ✅ Active (5 feeds; 2 dead feeds removed)

### Reddit
- **Subreddits**: r/Peru, r/Lima, r/Chosica
- **Access**: Public JSON API (`/r/{sub}/new.json`): no OAuth required. `REDDIT_CLIENT_ID/SECRET` optional (higher rate limit if set)
- **Filter**: Disaster keywords; last 48h
- **Implementation**: `apps/workers/src/costa_workers/ingest/social.py::ingest_reddit()`
- **Status**: ⚠️ Best-effort. Implemented and credential-free, but not currently producing a steady feed; `/health/scraper` reports the live state and the console shows it as stale rather than pretending otherwise.

### Telegram
- **Channel**: `Senamhi_Peru`. SENAMHI official weather and hydro alerts
- **Access**: Telethon library, read-only. Credentials: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION_STRING` (all set in `.env`)
- **Filter**: Disaster keywords; last 48h
- **Implementation**: `apps/workers/src/costa_workers/ingest/social.py::ingest_telegram()`
- **Status**: ⚠️ Best-effort. Session configured, but delivery is intermittent; `/health/scraper` reports the live state.

---

## ML-Derived Layers

### SAR Flood Segmentation
- **Model**: U-Net over Sentinel-1 GRD IW VV/VH, architecture and preprocessing following
  Sen1Floods11 (Bonafilia et al. 2020)
- **Input**: Sentinel-1 GRD IW VV/VH dual-polarization
- **Output**: `ml.flood_polygons` (MultiPolygon, confidence, area_km2)
- **Inference time**: <5 min CPU per scene
- **Weights, honest status (verified 2026-08-23)**: the pipeline expects a pretrained
  checkpoint at `weights/sen1floods11_unet.pt`, falling back to a HuggingFace download from
  `isp-uv-es/SEN1Floods11_Unet_Flood_Detection`. **That repo returns HTTP 401 and no public
  Sen1Floods11 *U-Net* checkpoint is currently published.** The Sen1Floods11 checkpoints that
  are reachable on HuggingFace are Prithvi-EO variants, which take optical HLS bands rather
  than SAR VV/VH, so they are not drop-in substitutes for this architecture. Inference
  therefore refuses to run on random weights unless `FLOOD_ALLOW_RANDOM_WEIGHTS=1` is set
  explicitly (dev only).
- **What is on the map today**: labelled synthetic polygons, `flood-seg-v0.1-demo` for the
  current scenario and `elnino2017-fixture-v1` for the 2017 replay. Every polygon carries its
  `model_version`, and the map popup states *"Datos de demostración: no es una detección
  real"* for both. No synthetic polygon is ever presented as a live detection.
- **Status**: ⚠️ Inference path implemented and unit-tested; awaiting publishable weights or a
  locally trained checkpoint before it can produce real detections

### Huayco: trained district model
- **Model**: XGBoost, P(mass movement in the next 72 h) per district. **Trained on SINPAD
  2003-2016, tested on 2017-2020 (never seen, includes El Niño 2017): ROC-AUC 0.76 vs 0.71 for a
  rain-free baseline; PR-AUC 3.6x chance.** Full card: [`docs/models/mass-movement.md`](models/mass-movement.md).
- **Output**: `ml.mass_movement_risk`, live (hourly) and replay (any past date from ERA5).
  Layer "Huaycos: modelo entrenado"; SITREP line; model card in Fuentes de datos.
- **Status**: ✅ Trained, validated, live.

### Huayco points per quebrada (scenario)
- **Output**: `ml.huayco_susceptibility`, model_version `scenario-fixture-v1`.
- **These are hand-authored scenario values**, kept because the El Niño demo needs quebrada-level
  points. The quebrada-level XGBoost (Castro-Cabrera et al. 2024 features) has no training data
  and used to write a constant 0.5344 for every quebrada each hour; that flow now runs the
  trained district model instead. Disclosure: `is_demo_data` per feature, popup, alert text
  ("Valor de escenario, no es salida de un modelo entrenado"), SITREP ("Huayco (escenario)").

### Hazard Zone Classification (SINPAD-derived)
- **Method**: District-level event frequency + severity score from SINPAD 2003-2020; quartile classification → muy_alto / alto / medio / bajo per hazard type (flood, landslide)
- **Output**: `geo.hazard_zones` (50 district polygons; source_layer='sinpad_historical')
- **Status**: ✅ Loaded; layer live on map as "Peligro Histórico"

### Spanish Signal Triage (LLM)
- **Model**: qwen2.5:7b-instruct-q4_K_M via Ollama
- **Labels**: needs_help, infrastructure_damage, road_blocked, huayco_observation, flood_observation, weather_observation, false_alarm, irrelevant
- **Output**: `social.signals.triage_label` + `triage_confidence`
- **Status**: ✅ Implemented; all ingested signals are triaged

---

## Agentic Copilot Tools (DB query layer)

Nine whitelisted parameterised tools available to the copilot. The LLM never executes raw SQL.

| Tool | Data source | Notes |
|------|-------------|-------|
| `get_flood_polygons` | `ml.flood_polygons` | SAR U-Net extents + confidence |
| `get_huayco_risk` | `ml.huayco_susceptibility` | XGBoost risk per quebrada |
| `get_river_levels` | `hydro.station_observations` | Latest reading + 1h trend (rising/stable/falling) |
| `get_social_clusters` | `social.signals` | Triage-labelled signal counts |
| `get_infrastructure_impact` | `geo.infrastructure` | Hospitals, bridges, substations in flood zones |
| `get_rainfall_accumulation` | `hydro.imerg_accumulations` | 1h: 72h per watershed; ANA-aligned thresholds |
| `get_active_alerts` | `ops.alerts` | Full count + severity breakdown; uncapped total |
| `search_protocols` | pgvector RAG | INDECI / MINSA / CENEPRED / ANA / MML / SINAGERD protocol embeddings (7 docs, 51 chunks) |
| `get_population_at_risk` | `geo.districts` × `ml.flood_polygons` | INEI 2017 census × SAR spatial join; estimates affected persons per district |

**RAG Protocol Corpus (7 documents, 51 chunks):**
- `INDECI Plan Familiar de Emergencia 2024`, family emergency plan
- `CENEPRED Susceptibilidad por Movimientos en Masa`, debris flow susceptibility
- `MINSA Protocolo de Emergencias y Desastres`, health emergency protocol
- `SENAMHI Guía Hidrometeorológica`. ANA station thresholds + IMERG interpretation
- `MML Plan Lima ante Huaycos`. Lima municipal huayco response plan
- `ANA Umbrales de Lluvia para Alertas Lima`. ANA/INDECI rainfall thresholds (15/25/50 mm at 24/72h windows)
- `SINAGERD Guía de Acciones Rápidas COER Lima`, quick-action guide per SINAGERD level (AVISO/ALERTA/EMERGENCIA/huayco/desborde)

---

## What is new here

1. **Bluesky AT Protocol firehose**, underutilized in disaster platforms (most use Twitter/X or WhatsApp groups); provides real-time Spanish citizen reports
2. **Spanish-language LLM triage** with Pydantic-validated structured output and prompt-injection hardening (Aegis-style cognitive firewall)
3. **pgstac + PostGIS + TimescaleDB** unified in one Postgres instance, single engine for spatial vector, raster catalog, and time-series; enables complex spatial-temporal joins without cross-service latency
4. **SINPAD 18-year event density** as a data-driven hazard proxy, honest, reproducible, and more operationally grounded than GIS polygon approximations
