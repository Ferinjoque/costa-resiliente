# Costa Resiliente

**Near-real-time operational awareness platform for El Niño-driven floods and
huaycos in Lima Metropolitana, Peru.**

> IEEE Response Quest Challenge 2026 submission · Fernando Injoque

---

## What It Does

Costa Resiliente fuses satellite radar (Sentinel-1), hydrometeorological data
(NASA IMERG, ANA, SENAMHI), infrastructure layers (CENEPRED SIGRID, OSM), and
Spanish-language social signals (Bluesky, Reddit, RSS, Telegram) into a single
browser-accessible dashboard for SINAGERD emergency managers at COEN, COER Lima
Metropolitana, and distrital COELs.

It addresses all six IEEE Response Quest sub-problems:

| Sub-problem | How |
|-------------|-----|
| **Access** | Prefect flows per data source with retries, STAC catalog |
| **Storage** | PostGIS + TimescaleDB for vector + time-series; MinIO for rasters |
| **Integration** | Unified spatial schema + Redis pub/sub live updates |
| **UI** | Next.js dashboard — Scenario Panel, Map, Alerts, Ask, Decision Log |
| **Decision-making** | Operator Copilot (RAG over structured data, Spanish NL) |
| **Modeling** | SAR flood segmentation, XGBoost huayco susceptibility, r.avaflow |

---

## Quick Start (Local Dev)

```bash
# 1. Clone and copy environment template
git clone <repo-url> && cd costa-resiliente
cp .env.example .env  # fill in required values

# 2. Start all services
docker compose up -d

# 3. Wait for healthchecks (~30s), then verify
docker compose ps
curl http://localhost:8000/api/v1/health
curl http://localhost:3000
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Browser (Next.js)                      │
│  Scenario Panel │ Map View │ Alerts Feed │ Ask │ Log     │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTP / WebSocket / SSE
┌────────────────────────▼─────────────────────────────────┐
│                FastAPI (apps/api)                         │
│  /districts  /layers  /alerts  /copilot  /ws/live        │
└───────┬──────────────────────┬───────────────────────────┘
        │                      │
┌───────▼──────┐    ┌──────────▼──────────────────────────┐
│   PostGIS +  │    │        Prefect Workers               │
│ TimescaleDB  │    │  Sentinel-1 │ IMERG │ ANA │ Social   │
│   (pgstac)   │    │  Flood Seg  │ Huayco Model │ Triage  │
└───────┬──────┘    └──────────┬──────────────────────────┘
        │                      │
┌───────▼──────────────────────▼──────────────────────────┐
│           MinIO (rasters)  │  Redis (cache / pub-sub)    │
│           Ollama (LLM serving — Gemma 3 12B-IT)          │
└─────────────────────────────────────────────────────────┘
```

### Key design choices → [docs/decisions/](docs/decisions/)

---

## Repository Layout

```
costa-resiliente/
├── apps/
│   ├── api/          # FastAPI — REST + WebSocket backend
│   ├── workers/      # Prefect flows + ML inference
│   └── web/          # Next.js 14 dashboard
├── docs/
│   ├── decisions/    # Architecture Decision Records (ADRs)
│   ├── architecture.md
│   ├── data-sources.md
│   └── responsible-data-handling.md
├── infra/
│   ├── postgres/     # PostGIS + TimescaleDB init SQL
│   ├── stac/         # pgstac configuration
│   └── minio/        # bucket bootstrap
├── data/
│   ├── fixtures/     # committed test datasets
│   ├── raw/          # gitignored local raster cache
│   └── processed/    # gitignored derived outputs
├── scripts/          # one-shot utilities
└── notebooks/        # exploratory only
```

---

## Data Sources

Full description in [docs/data-sources.md](docs/data-sources.md).

| Tier | Source | Layer |
|------|--------|-------|
| 1 | Sentinel-1 GRD (MS Planetary Computer) | SAR flood |
| 1 | NASA IMERG Early Run | Rainfall accumulations |
| 1 | OSM via Overpass API | Infrastructure |
| 1 | INEI 2017 census | Population |
| 2 | ANA Rímac/Chillón/Lurín stations | River levels |
| 2 | SENAMHI station network | Hydromet |
| 2 | CENEPRED SIGRID | Hazard polygons |
| 2 | INDECI SINPAD historical | Emergency records |
| 3 | Bluesky Jetstream firehose | Social signals |
| 3 | Reddit r/Peru, r/Lima | Social signals |
| 3 | RPP / Andina / El Comercio RSS | News signals |
| 3 | Telegram public channels | Official COER feeds |

---

## ML Components

- **SAR Flood Segmentation**: Sen1Floods11 / UrbanSARFloods weights, inference
  <5 min on CPU / <60s on GPU
- **Huayco Susceptibility**: XGBoost (slope, aspect, rainfall, NDVI, soil
  moisture) following Castro-Cabrera et al. (2024)
- **r.avaflow**: on-demand debris flow simulation for top-10 Lima quebradas
- **Spanish Signal Triage**: Gemma 3 12B-IT via Ollama, structured JSON output
- **Operator Copilot**: RAG over PostGIS — Spanish NL → SQL → Spanish summary

---

## Responsible Data Handling

Implemented as code, not documentation. See
[docs/responsible-data-handling.md](docs/responsible-data-handling.md).

- PII redaction via `presidio-analyzer` before any storage
- Location coarsened to manzana centroid (~100m) for non-responder views
- Raw social data purged after 7 days (pg_cron)
- Immutable operator decision log
- Compliant with Peru Ley 29733 + DS 016-2024-JUS

---

## Development

```bash
# Python linting + formatting
cd apps/api && ruff check . && black .

# Frontend
cd apps/web && npm run dev

# Run all Prefect flows locally
cd apps/workers && prefect server start &
prefect deploy --all

# Tests
pytest apps/api/tests apps/workers/tests -v
```

### Pre-commit hooks

```bash
pip install pre-commit
pre-commit install
```

---

## Branch Strategy

- **`develop`** — all active development, always deployable
- **`main`** — tagged submission releases only
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`)

---

## IEEE Response Quest Challenge

Submission deadline: **9 October 2026**  
Concept form: June 5, 2026  
Phase 3 judging: November–December 2026

Five rubric criteria (equal weight):
1. Timeliness & Real-Time Responsiveness
2. Comprehensiveness & Novel Data Discovery
3. Integration & Responsible Data Handling
4. Usability & Operational Readiness
5. Scenario Fit & Innovation

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
