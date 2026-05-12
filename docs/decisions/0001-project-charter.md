# ADR-0001: Project Charter — Costa Resiliente

**Date:** 2026-05-11  
**Status:** Accepted  
**Author:** Fernando Injoque

---

## Context

Costa Resiliente is a near-real-time operational awareness platform for emergency
managers responding to El Niño-driven floods and huaycos (debris flows) in
Lima Metropolitana, Peru. It is submitted to the IEEE Response Quest Challenge 2026
(judged November–December 2026, product due 9 October 2026).

The platform fuses satellite radar (Sentinel-1), hydrometeorological feeds (IMERG,
ANA, SENAMHI), infrastructure layers (OSM, CENEPRED SIGRID), and Spanish-language
social signals (Bluesky, Reddit, RSS, Telegram) into a single browser-accessible
operational dashboard for SINAGERD emergency managers at COEN, COER Lima
Metropolitana, and distrital COELs.

---

## Mission Statement

Deliver decision-support tooling — not autonomous decision-making — to Peruvian
emergency managers during El Niño Costero 2026–2027. The system surfaces timely,
fused situational awareness; the humans act. Every data claim shown to operators
must trace to a timestamped, sourced database row. The LLM routes and summarizes;
it never fabricates.

---

## Scope

**In scope:**
- Lima Metropolitana: 43 districts of Lima Province (Callao optional in Phase 3)
- Disaster types: El Niño-driven floods and huaycos (debris flows) only
- Languages: Spanish UI + NLP (primary); English toggle on UI
- Actor: SINAGERD system — COEN, COER Lima, distrital COELs

**Out of scope (locked, no silent expansion):**
- Geographic regions outside Lima Metropolitana
- Disaster types: hurricanes, wildfires, tornadoes, tsunamis, seismic (only context)
- Languages beyond Spanish/English: no Quechua, Aymara, or other indigenous NLP
- Mobile-native apps (PWA only)
- Real-time COEN/COER integration requiring authorized accounts (Phase 3 stretch)
- Mobile carrier signaling (Movistar/Claro/Entel) — Phase 3 stretch

---

## Locked Stack Decisions

### Why single-VM single-Postgres design

A single PostgreSQL instance with PostGIS and TimescaleDB extensions is chosen
over a microservice database-per-service architecture because:

1. **Solo developer capacity**: A distributed data layer multiplies operational
   burden (backups, replication, schema coordination) with no throughput benefit
   at MVP scale.
2. **PostGIS + TimescaleDB co-location**: Spatial vector queries and time-series
   hypertables in the same engine eliminates cross-service joins and keeps latency
   predictable.
3. **Judge evaluation context**: The submission is demonstrated via video call, not
   load-tested under production traffic. Over-engineering the data layer adds risk
   without observable benefit to judges.
4. **STAC via pgstac**: pgstac requires PostgreSQL anyway; running a second Postgres
   instance for STAC would be pure overhead.
5. **Escape hatch**: If partitioning or replication becomes necessary post-MVP, the
   TimescaleDB multi-node or Citus extension can be layered on without changing
   application code.

### Why Prefect 2 for orchestration

Prefect 2 provides retries, caching, observability, and configurable schedules with
minimal boilerplate. Its local agent mode runs inside a Docker container without
external dependencies. Airflow's DAG overhead is disproportionate for a solo project;
Celery lacks first-class geospatial aware scheduling.

### Why ollama for LLM serving

Ollama containerizes model serving with zero custom inference code. Gemma 3 12B-IT
(Q4_K_M GGUF) is verified released (March 2025) and Apache 2.0 licensed for the
weights we need. The fallback Qwen3-30B-A3B-Instruct-2507 is also Apache 2.0.
Neither OpenAI nor Anthropic APIs are used — zero external API cost, no data
egress for citizen PII signals.

### Why MapLibre + PMTiles (not Mapbox/Google Maps)

Zero vendor tile API dependency. PMTiles are a single file served over HTTP Range
headers. Self-hosted via FastAPI. OSM-derived basemap generated via Planetiler.
No API key required, no per-tile billing, no outage dependency on external tile CDN.

### Why Next.js 14 App Router

Fernando's daily stack. App Router enables server components for initial data
rendering, reducing client bundle. Tailwind + shadcn/ui provides accessible
components without custom CSS overhead at MVP scale.

---

## Responsible Data Handling Commitments

These are **code-level** commitments, not documentation aspirations:

1. PII redaction on all ingested social signals (`presidio-analyzer`, CV for images)
2. Location coarsening to manzana centroid (~100m) for non-responder views
3. Retention limits enforced via pg_cron or Prefect flows:
   - Raw social firehose: 7 days
   - Derived non-PII features: 12 months
   - Aggregates: indefinite
4. Immutable append-only operator decision log
5. Spanish-only consent strings on citizen reporting features
6. Legal basis: Peru Ley 29733 + DS 016-2024-JUS, OCHA Data Responsibility
   Guidelines (2025), IASC Operational Guidance on Data Responsibility (April 2023)

---

## Build Sequence Summary

| Sprint | Days   | Deliverable                                      |
|--------|--------|--------------------------------------------------|
| 0      | 1–3    | Scaffolding, docker-compose, services green      |
| 1      | 4–10   | Sentinel-1 + IMERG ingest, PostGIS schema        |
| 2      | 11–18  | Dashboard skeleton, MapLibre, first data layer   |
| 3      | 19–30  | SAR flood segmentation, polygons on map          |
| 4      | 31–45  | Huayco XGBoost, ANA scraper, social ingest       |
| 5      | 46–60  | Ollama LLM triage, operator copilot RAG          |
| 6      | 61–75  | UI polish, alerts, decision log, PWA, tutorial   |
| 7      | 76–95  | Docs, video, hardening, submission               |

---

## Consequences

This ADR locks the technology choices and scope boundaries for the duration of
the IEEE Response Quest 2026 submission. Changes to locked items require a new
ADR documenting the concrete reason for deviation (e.g., a confirmed API shutdown,
licensing conflict, or performance blocker).
