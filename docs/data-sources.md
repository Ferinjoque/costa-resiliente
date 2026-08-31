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

### NASA IMERG Late Run V07B (GPM)
- **Endpoint**: NASA GES DISC OPeNDAP
- **Credentials**: `EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD` (set in `.env`)
- **Resolution**: 0.1° (~11km), half-hourly granules
- **Latency**: ~12h after observation (higher accuracy than Early Run)
- **Timeliness caveat, stated plainly**: the half-hourly figure is the product's *temporal
  resolution*, not its availability. IMERG Late is **not** a near-real-time feed, and nothing in
  this project should describe it as one. Open-Meteo (below) is the near-real-time source;
  Early Run would cut IMERG latency to ~4h and is the obvious upgrade if rainfall needs to be
  operationally live.
- **Accumulations stored**: 1h, 3h, 6h, 12h, 24h, 72h, 168h per Lima watershed
- **Implementation**: `apps/workers/src/costa_workers/ingest/imerg.py`
- **Storage**: `hydro.imerg_accumulations` (TimescaleDB hypertable)
- **Status**: ✅ Implemented and running

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

### Lima Geodata (OSM + INEI)
- **Districts**: 43 Lima province distritos as MultiPolygon, WGS84
- **Watersheds**: Rímac, Chillón, Lurín (3 watersheds)
- **Quebradas**: 10 priority quebradas with IMERG rainfall thresholds
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
- **Note**: SINPAD v2.0 live feed requires authorized INDECI account, documented as Phase 3 partnership ask; not used here
- **Status**: ✅ Historical data loaded (2,063 Lima records); hazard zones derived and in `geo.hazard_zones`

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
- **Status**: ❌ Dropped, seismic is explicitly out of scope per [`COMPETITION.md`](COMPETITION.md); revisit only post-competition

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

### Huayco Susceptibility
- **Model**: XGBoost, methodology from Castro-Cabrera et al. (Geosciences 14(6):168, 2024)
- **Features**: slope, aspect, lithology, distance-to-stream, NDVI, soil_moisture, IMERG 24h/72h
- **Output**: `ml.huayco_susceptibility` (probability + risk_level per quebrada)
- **Current model_version**: `scenario-fixture-v1`. **The probabilities currently on the map are
  hand-authored scenario values, not model output.** The feature pipeline and the scoring code
  are implemented and run against live IMERG accumulations, but the tree ensemble is not fitted
  on a labelled Lima landslide inventory, so it emits a near-constant ~0.53 for every quebrada.
  The El Niño demo scenario therefore ships fixed values with a realistic spread, and the seeder
  restores them when the pipeline flattens the scenario.
- **Where this is disclosed**: the layer payload carries `is_demo_data` per feature and for the
  collection; the collection `source` string refuses to name XGBoost while fixtures are served;
  the map popup prints *"Valor de demostración, no es salida del modelo"*; the copilot appends
  the same qualifier to every huayco answer; and the "Limitaciones conocidas" block in the
  Fuentes de datos panel states it in the product. An unstamped row is treated as demonstration
  data, so the labelling fails closed.
- **Status**: ⚠️ Pipeline implemented and unit-tested; **served values are scenario fixtures**.
  Fitting on SINPAD-derived labels is the remaining step before any figure here can be
  attributed to the model.

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

## Novelty Justification (IEEE Rubric)

1. **Bluesky AT Protocol firehose**, underutilized in disaster platforms (most use Twitter/X or WhatsApp groups); provides real-time Spanish citizen reports
2. **Spanish-language LLM triage** with Pydantic-validated structured output and prompt-injection hardening (Aegis-style cognitive firewall)
3. **pgstac + PostGIS + TimescaleDB** unified in one Postgres instance, single engine for spatial vector, raster catalog, and time-series; enables complex spatial-temporal joins without cross-service latency
4. **SINPAD 18-year event density** as a data-driven hazard proxy, honest, reproducible, and more operationally grounded than GIS polygon approximations
