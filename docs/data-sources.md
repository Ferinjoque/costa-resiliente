# Data Sources — Costa Resiliente

## Tier 1 — Foundation

### Sentinel-1 GRD (Microsoft Planetary Computer)
- **Endpoint**: `https://planetarycomputer.microsoft.com/api/stac/v1`
- **Collection**: `sentinel-1-grd`
- **Access**: Public STAC, signed asset URLs via PC SDK
- **Resolution**: 10m (GRD), 5×20m (SLC)
- **Revisit**: ~6 days (Lima AOI, combined A/B)
- **Latency**: ~3h after acquisition
- **Implementation**: `apps/workers/src/costa_workers/ingest/sentinel1.py`

### NASA IMERG Early Run (V07B)
- **Endpoint**: NASA GES DISC OPeNDAP
- **Resolution**: 0.1° (~11km), half-hourly
- **Latency**: ~4h
- **Accumulations**: 1h, 3h, 6h, 12h, 24h, 72h per watershed
- **Implementation**: `apps/workers/src/costa_workers/ingest/imerg.py`

### OpenStreetMap — Critical Infrastructure
- **Access**: Overpass API (`https://overpass-api.de/api/interpreter`)
- **Layers**: hospitals, schools, fire stations, power substations, bridges
- **Update cadence**: Weekly refresh
- **Storage**: `geo.infrastructure` table (PostGIS)

### INEI 2017 Census
- **Access**: Open data portal `datosabiertos.gob.pe`
- **Resolution**: Manzana (block), fallback to district
- **Use**: Population exposure estimates for affected districts

## Tier 2 — Operational Layers

### ANA Observatorio Chirilu + SNIRH
- **URLs**: `observatoriochirilu.ana.gob.pe`, `snirh.ana.gob.pe`
- **Access**: Polite scraper (no public REST API confirmed)
- **Caveat**: Scraping is fragile — documented gap, fallback to manual nightly CSV
- **Storage**: `hydro.stations` + `hydro.station_observations`

### SENAMHI
- **URL**: `senamhi.gob.pe`
- **Access**: Scraper — same caveats as ANA
- **Layers**: Precipitation, temperature, wind, official advisories

### INDECI SINPAD Historical
- **URL**: `datosabiertos.gob.pe/dataset/emergencias-históricas-registradas-con-sinpad`
- **Access**: Public CSV/API (read-only)
- **Note**: SINPAD v2.0 live feed requires authorized account — Phase 3 partnership ask

### CENEPRED SIGRID
- **URL**: `sigrid.cenepred.gob.pe`
- **Access**: Shapefile downloads (manual refresh)
- **Layers**: Peligro polygons, EVAR Chosica zones

### IGP Seismic Feed
- **URL**: `ultimosismo.igp.gob.pe`
- **Use**: Multi-hazard context (secondary to flood/huayco scenario)

## Tier 3 — Social & Infrastructure Signals

### Bluesky Jetstream Firehose
- **Endpoint**: `wss://jetstream2.us-east.bsky.network/subscribe`
- **Access**: Public WebSocket, no API key required
- **Filter**: Spanish keyword match + Lima district name match
- **Privacy**: PII redaction via presidio-analyzer before storage

### Reddit
- **Subreddits**: `r/Peru`, `r/Lima`
- **Access**: PRAW with registered app credentials
- **Rate limit**: 60 requests/minute on free tier

### News RSS
- RPP: `rpp.pe/rss`
- Andina: `andina.pe/agencia/rss.aspx`
- El Comercio: `elcomercio.pe/rss/`
- Canal N: TBD
- La República: TBD

### Telegram Public Channels
- COER Lima, distrital civil defense channels
- **Access**: Telethon client (opt-in per channel)
- **Privacy**: Only public channels; no private group monitoring

## Novelty Justification (IEEE Rubric)

The combination of:
1. **Bluesky AT Protocol firehose** — underutilized in disaster platforms (most use Twitter/X)
2. **Spanish-language LLM triage** with Pydantic-validated structured output and injection hardening
3. **r.avaflow simulation triggered by real-time IMERG thresholds** — on-demand debris flow physics
4. **pgstac + PostGIS + TimescaleDB** unified in one Postgres instance for spatial-temporal queries

...provides novel data discovery and integration that goes beyond simple layer aggregation.
