# Costa Resiliente — Agent Instructions

> **IEEE Response Quest 2026 submission.** Lima Metropolitana emergency-operations platform.

## The 3 sources of truth

Read these first. They cover everything an agent needs to know.

| Doc | Purpose |
|-----|---------|
| **[`docs/STATUS.md`](docs/STATUS.md)** | Current build state, score, what's pending, recent sessions |
| **[`docs/COMPETITION.md`](docs/COMPETITION.md)** | IEEE rubric, scope, locked stack decisions, Phase 2 submission |
| **[`apps/web/DESIGN.md`](apps/web/DESIGN.md)** | Frontend design system — read before any UI work |

## Operational rules

- **Branch:** `develop` only. Never commit to `main` unless explicitly tagging a submission release.
- **Secrets:** `.env` only (gitignored). `.env.example` is the committed template.
- **Conventional Commits:** `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`. Scope tags encouraged (`feat(auth): ...`).
- **Every push to `develop`** keeps the project working — `docker compose up` succeeds, primary services reachable.
- **No paid API calls** — local Ollama only. Never reach for OpenAI / Anthropic / etc.
- **LLM never fabricates** — all operator-facing numerical claims trace to a DB row. The LLM never executes raw SQL.

## Frontend hard rules (excerpt — full spec in DESIGN.md)

- Panels use `bg-surface` (cream). **No glass, no `backdrop-blur-*`, no dark panel bg.**
- All interactive elements use primitives from `src/components/ui/primitives.tsx`.
- No inline hex — use token classes or CSS variables.
- `lucide-react` icons only — no emoji in UI chrome.
- MapLibre navigation at `bottom-right`, attribution at `bottom-left`.

## Reference docs (complementary, not redundant)

| Doc | When to read |
|-----|--------------|
| [`docs/architecture.md`](docs/architecture.md) | System architecture, data flow, schema |
| [`docs/data-sources.md`](docs/data-sources.md) | Per-source endpoints, credentials, scraper notes |
| [`docs/responsible-data-handling.md`](docs/responsible-data-handling.md) | Privacy, retention, compliance (Ley 29733 + OCHA + IASC) |
| [`docs/operator-runbook.md`](docs/operator-runbook.md) | Operator user manual |
| [`docs/decisions/`](docs/decisions/) | ADRs (project charter, ML architecture) |

## Running locally

```bash
docker compose up -d                          # starts all services
# Web at http://localhost:3000
# API at http://localhost:8000
# API docs at http://localhost:8000/docs
```

## Dev commands

```bash
# Frontend
cd apps/web && npm run dev                    # hot reload
cd apps/web && npx tsc --noEmit               # type check
cd apps/web && npm run build                  # production build

# API tests (in container)
docker exec costa-api python -m pytest --asyncio-mode=auto -q

# Rebuild API after backend changes
docker compose build api && docker compose up -d api
```

## Container code note

API and worker Python packages are installed into site-packages at build time. `apps/api/src/` and `apps/api/tests/` are read-only volume-mounted in dev. **`pyproject.toml` is NOT mounted** — settings there won't take effect at runtime without rebuilding.

When fixing API code that needs immediate effect without a full rebuild:
```bash
docker cp <host_file> costa-api:/usr/local/lib/python3.12/site-packages/<package_path>
docker exec costa-api sh -c "find /usr/local/lib/python3.12/site-packages/<pkg>/__pycache__ -name '<module>*.pyc' -delete"
docker restart costa-api
```
