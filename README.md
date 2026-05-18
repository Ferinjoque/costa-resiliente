# Costa Resiliente

**Near-real-time operational awareness platform for El Niño-driven floods and huaycos in Lima Metropolitana, Peru.**

> IEEE Response Quest Challenge 2026 submission · Fernando Injoque · Apache 2.0

---

## What it is

A browser-accessible operational dashboard for Peru's SINAGERD emergency managers (COEN, COER Lima Metropolitana, distrital COELs) responding to El Niño Costero floods and huaycos. Fuses satellite radar, hydrometeorological data, infrastructure layers, and Spanish-language social signals through an agentic AI copilot — all running on local hardware, no cloud API dependency.

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

```bash
git clone <repo-url> && cd costa-resiliente
cp .env.example .env                          # fill in EarthData, Telegram, etc.
docker compose up -d                          # 9 services
docker compose ps                             # verify health
```

Web at <http://localhost:3000> · API at <http://localhost:8000> · API docs at <http://localhost:8000/docs>.

Demo SINAGERD operator accounts (password `demo1234`):
- `coen_lima` — COEN, national
- `coer_lima` — COER, Lima region
- `coel_sjl` — COEL, San Juan de Lurigancho (150132)

## Architecture at a glance

```
┌────────────────────────────────────────────────────────────┐
│                 Browser / PWA (Next.js 14)                 │
│  Scenario · Map · Alerts · Ask · Log · Social · Notifs    │
└─────────────────────┬──────────────────────────────────────┘
              HTTP REST · SSE · JWT auth
┌─────────────────────▼──────────────────────────────────────┐
│   FastAPI — ~32 endpoints + SSE alert stream               │
│   Agentic copilot · 8 DB tools · pgvector RAG · guardrails │
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
- **ML:** U-Net (Sen1Floods11 weights), XGBoost (Castro-Cabrera 2024), Spanish LLM triage

## Data sources

10 sources across satellite, hydromet, historical, social, and infrastructure tiers. Full list in [`docs/data-sources.md`](docs/data-sources.md). Notable: Sentinel-1 GRD via Microsoft Planetary Computer, NASA IMERG Early Run V07B, ANA + SENAMHI scrapers, INDECI SINPAD 2003–2020 (2,063 Lima events), Bluesky AT Protocol firehose, Telegram SENAMHI_Peru channel.

## Responsible data handling

Code-level, not aspirational:
- PII redaction via `presidio-analyzer` before any signal stored
- Location coarsened to manzana centroid (~100 m) for non-responder views
- 7-day pg_cron purge on raw social signals
- Append-only operator decision log enforced by DB trigger
- LLM anti-fabrication guarantee — all claims trace to DB rows
- Compliant with Peru Ley 29733 + DS 016-2024-JUS, OCHA, IASC

See [`docs/responsible-data-handling.md`](docs/responsible-data-handling.md).

## License

Apache 2.0 — see [`LICENSE`](LICENSE).
