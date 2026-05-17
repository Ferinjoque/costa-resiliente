# Costa Resiliente — Next Development Session Prompt

> **Project:** IEEE Response Quest 2026 — `costa-resiliente`
> **Branch:** `develop` — ALL commits go here. Never touch `main`.
> **Current score:** ~24.7 / 25 (C1=4.7, C2=5.0, C3=5.0, C4=5.0, C5=5.0)
> **Goal this session:** VPS deployment (unblocks final judging) or remaining polish items.

---

## Orientation (mandatory before touching any code)

1. Read `CLAUDE.md` at the repo root — frontend conventions, design system rules, branch rules.
2. Read `apps/web/DESIGN_SYSTEM.md` — canonical visual spec.
3. Read `docs/SUBMISSION_GAPS.md` — rubric-mapped gap analysis, current score per criterion.
4. Run `docker compose ps` — confirm API (port 8000) and web (port 3000) are up.
5. Run `git log --oneline -10` on branch `develop`.

---

## Session Constraints

- **Never commit to `main`** — develop branch only.
- **Docker ollama service has 5GB+ of models** — do not pull new models unless necessary.

---

## Session 3 Summary (2026-05-17)

### What was done
- **SSE task leak fixed** — `generate()` now tracks `fetch_task` via `asyncio.create_task` and
  cancels it in a `finally` block. Previously, `asyncio.ensure_future` orphaned tasks accumulated
  on client disconnect, starving uvicorn and causing healthcheck timeouts.
- **El Niño 2017 replay** — ScenarioPanel `ReplayDateScrubber` with 5 date steps (Mar 15–Apr 2 2017).
  `_parse_replay_time` treats bare dates as 23:59:59 UTC so full-day SAR coverage is included.
  MapView passes `replayDate` → `useFlood`/`useImerg` → API.
- **Population exposure** — INEI 2017 census seeded for 41 Lima Metro districts. Fusion API
  returns `population_at_risk` and `affected_districts`.
- **ANA scraper fragility** — stale-station check in `ingest_hydro_stations_flow` logs WARNING
  for any active station with no data in >2h.
- **Verified done earlier:** social signal map layer, DataSourcesPanel, locale toggle, SSE,
  Lighthouse 100/100, all C3/C4/C5 features.

### Test results
- 175/175 API tests pass (`not Copilot and not TestShare`)
- TypeScript: 0 errors
- API container: healthy

---

## Work Order

### Priority 1 — VPS deployment (unblocks all judging)

The only remaining blocker for full score is a public URL for judges.

```
VPS: Hetzner CX32 €11/mo or DigitalOcean $20/mo
TLS: Caddy auto-HTTPS — Caddyfile is ready at repo root
Deploy script: scripts/deploy.sh
Compose: docker-compose.prod.yml
```

Steps:
1. Provision a VPS with 4 vCPU / 8GB RAM, Ubuntu 22.04
2. `scp -r .env.prod docker-compose.prod.yml Caddyfile user@vps:/app/`
3. `ssh user@vps && cd /app && docker compose -f docker-compose.prod.yml up -d`
4. Verify: `curl https://your-domain.com/api/v1/health`
5. Seed data: `docker exec costa-api python -c "import asyncio; from costa_api.auto_seed import maybe_seed; from costa_api.db import engine; asyncio.run(maybe_seed(engine))"`

---

### Priority 2 — C1 score improvement (if VPS not available)

Current C1 = 4.7. The remaining gap is ANA scraper fragility visibility in the UI.

The `/api/v1/health/scraper` endpoint already returns `status: offline` for sources
with no data >2h. The Prefect flow now logs stale-station warnings. To improve C1 to 5.0:
- Add a red indicator to `DataFreshnessBar` when any source is `status: offline`
- Current `DataFreshnessBar` checks each source — verify it shows the offline indicator

---

### Priority 3 — Confirm i18n toggle visible (C4 cosmetic)

LeftRail already has a Globe icon button that toggles ES/EN. All major panels respect `locale`.
Verify the button is visible in the demo flow and the ScenarioPanel labels switch correctly.

---

## Testing Requirements

- **After backend changes:** `docker exec costa-api python -m pytest tests/test_session_audit.py -q -k "not Copilot and not TestShare" --tb=short` — must stay at 175/175
- **After frontend changes:** `cd apps/web && npx tsc --noEmit` then `npm run build`
- Document test results in `SESSION_LOG.md` if one exists, or this file.

---

## End-of-Session Checklist

- [ ] 175/175 API tests still pass
- [ ] Frontend builds clean (`npm run build` — 0 errors)
- [ ] TS has no errors (`npx tsc --noEmit`)
- [ ] All changes committed to `develop` with conventional commit messages
- [ ] `docs/SUBMISSION_GAPS.md` updated if any criterion improved
