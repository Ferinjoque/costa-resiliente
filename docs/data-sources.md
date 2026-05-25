# Data Sources — Costa Resiliente

> Status column reflects actual implementation state as of 2026-05-18.

---

## Tier 1 — Foundation

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

### NASA IMERG Early Run (V07B)
- **Endpoint**: NASA GES DISC OPeNDAP
- **Credentials**: `EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD` (set in `.env`)
- **Resolution**: 0.1° (~11km), half-hourly granules
- **Latency**: ~4h after observation
- **Accumulations stored**: 1h, 3h, 6h, 12h, 24h, 72h per Lima watershed
- **Implementation**: `apps/workers/src/costa_workers/ingest/imerg.py`
- **Storage**: `hydro.imerg_accumulations` (TimescaleDB hypertable)
- **Status**: ✅ Implemented and running

### Lima Geodata (OSM + INEI)
- **Districts**: 43 Lima province distritos as MultiPolygon, WGS84
- **Watersheds**: Rímac, Chillón, Lurín (3 watersheds)
- **Quebradas**: 10 priority quebradas with IMERG rainfall thresholds
- **Infrastructure**: hospitals, schools, fire stations, substations, bridges from Overpass API
- **Population**: INEI 2017 census at district level (`geo.districts.population`)
- **Load script**: `scripts/load_lima_geodata.py`
- **Status**: ✅ Loaded into PostGIS

### STAC Catalog (pgstac)
- **Backend**: pgstac schema inside the primary Postgres instance
- **Collections**: sentinel-1-grd, imerg-v07b, flood-polygons
- **Access**: `http://localhost:8082` (STAC API, pgstac-fastapi)
- **Status**: ✅ Running; scenes registered on ingest

---

## Tier 2 — Operational Layers

### ANA Observatorio Chirilu + SNIRH
- **URLs**: `observatoriochirilu.ana.gob.pe`, `snirh.ana.gob.pe`
- **Access**: HTML scraper (no public REST API confirmed)
- **Known fragility**: scraping is brittle; government sites go down during active flood events
- **Resilience**: every successful gauge reading cached to Redis (`costa:gauge:reading:{code}`, 24h TTL); scraper falls back to last known reading with `from_cache=True` on HTTP failure — station layer never goes blank during an outage
- **Storage**: `hydro.stations` + `hydro.station_observations`
- **Implementation**: `apps/workers/src/costa_workers/ingest/hydro.py` + `ana_scraper.py`
- **Status**: ✅ Scraper implemented with Redis stale-reading cache; health published to `costa:scraper:status:{ana|senamhi}`

### SENAMHI
- **URL**: `senamhi.gob.pe`
- **Access**: Scraper (same caveats as ANA)
- **Layers**: Precipitation, temperature, wind, official advisories
- **Status**: ✅ Scraped alongside ANA in hydro.py

### INDECI SINPAD Historical
- **Source file**: `docs/BD-EMER-Y-DAÑOS-INTEGRADA-2003-2020-validada.xlsx` (gitignored, large binary)
- **Download URL**: `datosabiertos.gob.pe/dataset/emergencias-históricas-registradas-con-sinpad`
- **Coverage**: 96,531 national records (2003–2020); 2,063 Lima flood/huayco records loaded
- **Load script**: `scripts/load_sinpad.py`
- **Storage**: `historical.sinpad_events` (BIGSERIAL, indexed by ubigeo/year/event_type)
- **Use**: Hazard zone classification (SINPAD event density → flood/landslide levels per district)
- **Note**: SINPAD v2.0 live feed requires authorized INDECI account — documented as Phase 3 partnership ask; not used here
- **Status**: ✅ Historical data loaded (2,063 Lima records); hazard zones derived and in `geo.hazard_zones`

### CENEPRED SIGRID
- **URL**: `sigrid.cenepred.gob.pe` / `sig.cenepred.gob.pe/arcgis_server/`
- **Access**: ArcGIS REST — requires token. Portal uses SSO (browser OAuth); `generateToken` endpoint returns 401 for direct API auth. Tokens are IP-bound and short-lived (60 min).
- **Current approach**: `geo.hazard_zones` is populated from SINPAD historical event density (18-year record as proxy for hazard classification). See `scripts/load_sigrid.py` for future ArcGIS REST loader.
- **Status**: ⚠️ SIGRID native polygons blocked (SSO auth); SINPAD-derived fallback loaded and serving

### IGP Seismic Feed
- **URL**: `ultimosismo.igp.gob.pe`
- **Use**: Multi-hazard context (secondary to flood/huayco scenario)
- **Status**: ❌ Not implemented (low priority for current scenario focus)

---

## Tier 3 — Social & Infrastructure Signals

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
- Gestión: `https://gestion.pe/rss/` *(replaced Canal N and La República — both returned 404 consistently as of 2026-05)*
- Peru21: `https://peru21.pe/rss/`
- **Filter**: Disaster keyword match; last 48h only
- **Implementation**: `apps/workers/src/costa_workers/ingest/social.py::ingest_rss_feeds()`
- **Status**: ✅ Active (5 feeds; 2 dead feeds removed)

### Reddit
- **Subreddits**: r/Peru, r/Lima, r/Chosica
- **Access**: Public JSON API (`/r/{sub}/new.json`) — no OAuth required. `REDDIT_CLIENT_ID/SECRET` optional (higher rate limit if set)
- **Filter**: Disaster keywords; last 48h
- **Implementation**: `apps/workers/src/costa_workers/ingest/social.py::ingest_reddit()`
- **Status**: ✅ Active (public API, no credentials needed)

### Telegram
- **Channel**: `Senamhi_Peru` — SENAMHI official weather and hydro alerts
- **Access**: Telethon library, read-only. Credentials: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION_STRING` (all set in `.env`)
- **Filter**: Disaster keywords; last 48h
- **Implementation**: `apps/workers/src/costa_workers/ingest/social.py::ingest_telegram()`
- **Status**: ✅ Session configured and active (Senamhi_Peru channel)

---

## ML-Derived Layers

### SAR Flood Segmentation
- **Model**: U-Net initialized from Sen1Floods11 weights (Bonafilia et al. 2020)
- **Input**: Sentinel-1 GRD IW VV/VH dual-polarization
- **Output**: `ml.flood_polygons` (MultiPolygon, confidence, area_km2)
- **Inference time**: <5 min CPU per scene
- **Status**: ✅ Implemented; polygon layer live on map

### Huayco Susceptibility
- **Model**: XGBoost, methodology from Castro-Cabrera et al. (Geosciences 14(6):168, 2024)
- **Features**: slope, aspect, lithology, distance-to-stream, NDVI, soil_moisture, IMERG 24h/72h
- **Output**: `ml.huayco_susceptibility` (probability + risk_level per quebrada)
- **Status**: ✅ Implemented; susceptibility circles live on map

### Hazard Zone Classification (SINPAD-derived)
- **Method**: District-level event frequency + severity score from SINPAD 2003–2020; quartile classification → muy_alto / alto / medio / bajo per hazard type (flood, landslide)
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
| `get_rainfall_accumulation` | `hydro.imerg_accumulations` | 1h–72h per watershed; ANA-aligned thresholds |
| `get_active_alerts` | `ops.alerts` | Full count + severity breakdown; uncapped total |
| `search_protocols` | pgvector RAG | INDECI / MINSA / CENEPRED protocol embeddings |
| `get_population_at_risk` | `geo.districts` × `ml.flood_polygons` | INEI 2017 census × SAR spatial join; estimates affected persons per district |

---

## Novelty Justification (IEEE Rubric)

1. **Bluesky AT Protocol firehose** — underutilized in disaster platforms (most use Twitter/X or WhatsApp groups); provides real-time Spanish citizen reports
2. **Spanish-language LLM triage** with Pydantic-validated structured output and prompt-injection hardening (Aegis-style cognitive firewall)
3. **pgstac + PostGIS + TimescaleDB** unified in one Postgres instance — single engine for spatial vector, raster catalog, and time-series; enables complex spatial-temporal joins without cross-service latency
4. **SINPAD 18-year event density** as a data-driven hazard proxy — honest, reproducible, and more operationally grounded than GIS polygon approximations
