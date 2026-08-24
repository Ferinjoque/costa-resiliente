# Costa Resiliente

**Near-real-time operational awareness platform for El Niño-driven floods and huaycos in Lima Metropolitana, Peru.**

> IEEE Response Quest Challenge 2026 submission · Fernando Injoque · Apache 2.0

---

## What it is

A browser-accessible operational dashboard for Peru's SINAGERD emergency managers (COEN, COER Lima Metropolitana, distrital COELs) responding to El Niño Costero floods and huaycos. Fuses satellite radar, hydrometeorological data, infrastructure layers, and Spanish-language social signals through an agentic AI copilot. Everything runs on local hardware, with no cloud API dependency.

## Documentation map

| Doc | Purpose |
|-----|---------|
| **[`docs/STATUS.md`](docs/STATUS.md)** | Current build state, rubric score, what's pending |
| **[`docs/COMPETITION.md`](docs/COMPETITION.md)** | IEEE rubric, scope, locked decisions, Phase 2 submitted text |
| **[`apps/web/DESIGN.md`](apps/web/DESIGN.md)** | Frontend design system |
| [`docs/architecture.md`](docs/architecture.md) | System architecture + data flow |
| [`docs/data-sources.md`](docs/data-sources.md) | Per-source endpoints + status |
| [`docs/responsible-data-handling.md`](docs/responsible-data-handling.md) | Privacy + compliance (Ley 29733 + OCHA + IASC) |
| [`docs/operator-runbook.md`](docs/operator-runbook.md) | Operator manual |
| [`docs/decisions/`](docs/decisions/) | ADRs |
| [`CLAUDE.md`](CLAUDE.md) | Agent / contributor working instructions |

## Quick start

The whole platform is one `docker compose up`. **No cloud account, no API key and no hosted
deployment are required to run it.** Every model runs locally on Ollama; the demo scenario seeds
itself so the dashboard is populated on first boot.

**Requirements:** Docker Desktop or Docker Engine with Compose v2 · 8 GB RAM free (16 GB
comfortable) · ~25 GB disk · Linux, macOS, or Windows.

```bash
git clone https://github.com/Ferinjoque/costa-resiliente.git && cd costa-resiliente
cp .env.example .env             # works as-is; live-data credentials are optional (see below)
docker compose up -d             # 9 services
docker compose ps                # wait until all report healthy (first build: 5-10 min)
```

Pull the three local models once (~6.6 GB total, the copilot stays offline without them):

```bash
docker exec costa-ollama ollama pull qwen2.5:7b-instruct-q4_K_M   # copilot + Spanish triage
docker exec costa-ollama ollama pull gemma2:2b                     # guardrails
docker exec costa-ollama ollama pull nomic-embed-text              # pgvector RAG embeddings
docker exec costa-prefect-worker python -m costa_workers.rag.ingest  # index protocol corpus
```

### Tests

```bash
docker exec costa-api python -m pytest --asyncio-mode=auto -q   # 719 API tests
docker exec costa-prefect-worker python -m pytest -q            # 182 worker tests
cd apps/web && npm test && npx tsc --noEmit                     # 21 unit tests + types
cd apps/web && npx playwright test                              # 21 browser tests (desktop + mobile)
```

The browser suite drives the real stack (it does not start its own server), so bring the stack up
and seed the scenario first. Install the browser once with `npx playwright install chromium`.

Web at <http://localhost:3000> · API at <http://localhost:8000> · API docs at <http://localhost:8000/docs>.

Demo SINAGERD operator accounts (password `demo1234`):
- `coen_lima`. COEN, national
- `coer_lima`. COER, Lima region
- `coel_sjl`. COEL, San Juan de Lurigancho (150132)

### Live data (optional)

The 2017 El Niño Costero replay and the demo alert scenario run entirely from seeded fixtures.
To ingest live feeds instead, set `EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD` (free NASA
EarthData account, for IMERG rainfall) and optionally `PC_SDK_SUBSCRIPTION_KEY` (Sentinel-1 rate
limits) in `.env`. Bluesky, RSS, Reddit, ANA, and SENAMHI ingestion need no credentials.

### Deployment

A single-VPS production path is included (`docker-compose.prod.yml`, Caddy auto-HTTPS,
`scripts/deploy.sh`) and targets ~€11-17/mo on a Hetzner CX32/CX42, the cost ceiling matters
because the intended operators are public emergency-management agencies. It is optional: the
platform is designed to run on an agency's own hardware, air-gapped from any cloud LLM API.

```bash
bash scripts/deploy.sh           # on a fresh Ubuntu 22/24 LTS VPS, with .env in place
```

## Architecture at a glance

```
┌────────────────────────────────────────────────────────────┐
│                 Browser / PWA (Next.js 14)                 │
│  Scenario · Map · Alerts · Ask · Log · Social · Notifs    │
└─────────────────────┬──────────────────────────────────────┘
              HTTP REST · SSE · JWT auth
┌─────────────────────▼──────────────────────────────────────┐
│   FastAPI: ~32 endpoints + SSE alert stream               │
│   Agentic copilot · 9 DB tools · pgvector RAG · guardrails │
└──────┬──────────────────────┬──────────────────────────────┘
       │                      │
┌──────▼──────┐    ┌──────────▼────────────────────────────┐
│ PostgreSQL  │    │   Prefect 3 workers                   │
│ + PostGIS   │    │   Sentinel-1 / IMERG / Hydro / Social │
│ + Timescale │    │   Flood U-Net · Huayco XGBoost · LLM  │
│ + pgstac    │    └───────────┬───────────────────────────┘
│ + pgvector  │                │
└──────┬──────┘                │
       │                       │
┌──────▼──────────┬────────────▼──────────────────────────┐
│ Redis pub/sub   │  MinIO rasters  │  Ollama (local-only) │
│                 │                 │  qwen2.5:7b copilot  │
│                 │                 │  gemma2:2b guardrails│
│                 │                 │  nomic-embed RAG     │
└─────────────────┴─────────────────┴──────────────────────┘
```

## Stack

- **Backend:** FastAPI · PostgreSQL 16 (PostGIS + TimescaleDB + pgstac + pgvector) · Redis · MinIO · Prefect 3 · Ollama (qwen2.5:7b + gemma2:2b + nomic-embed-text)
- **Frontend:** Next.js 14 App Router · TypeScript · Tailwind · MapLibre GL · Zustand · TanStack Query · PWA
- **ML:** U-Net over Sentinel-1 VV/VH (Sen1Floods11 architecture), XGBoost (Castro-Cabrera 2024), Spanish LLM triage on qwen2.5:7b. See [`docs/data-sources.md`](docs/data-sources.md#ml-derived-layers) for exactly which model outputs are live and which are labelled demonstration data.

## Data sources

10 sources across satellite, hydromet, historical, social, and infrastructure tiers. Full list in [`docs/data-sources.md`](docs/data-sources.md). Notable: Sentinel-1 GRD via Microsoft Planetary Computer, NASA IMERG Early Run V07B, ANA + SENAMHI scrapers, INDECI SINPAD 2003-2020 (2,063 Lima events), Bluesky AT Protocol firehose, Telegram SENAMHI_Peru channel.

## Responsible data handling

Code-level, not aspirational:
- PII redaction via `presidio-analyzer` before any signal stored
- Location coarsened to manzana centroid (~100 m) for non-responder views
- 7-day retention purge on raw social signals (Prefect `retention-daily` flow, 03:00 UTC)
- Append-only operator decision log enforced by DB trigger
- LLM anti-fabrication guarantee: all claims trace to DB rows
- Compliant with Peru Ley 29733 + DS 016-2024-JUS, OCHA, IASC

See [`docs/responsible-data-handling.md`](docs/responsible-data-handling.md).

## License

Apache 2.0: see [`LICENSE`](LICENSE).
