# Costa Resiliente — Agent Instructions

## CRITICAL: Read before any frontend work

**`apps/web/DESIGN_SYSTEM.md`** is the canonical visual spec. Read it before touching any file in `apps/web/src/components/` or `apps/web/src/app/`.

Key rules from it (violating these is a regression):
- Panels use `bg-surface` (warm cream) — **no glass, no `backdrop-blur-*`, no dark bg**
- All interactive elements use primitives from `src/components/ui/primitives.tsx`
- `Toggle` — never pass `label` when the row already shows the label inline
- MapLibre navigation control at `bottom-right`, attribution at `bottom-left`
- LiveTicker text minimum `oklch(72% 0 0)` on dark canvas
- No inline hex — use token classes or CSS variables

## Project

Near-real-time emergency operations platform for Lima Metropolitana. IEEE Response Quest 2026 submission.

- **Backend**: FastAPI + PostGIS + TimescaleDB + Ollama (Gemma 3)
- **Frontend**: Next.js 14 + MapLibre GL + Zustand + TanStack Query
- **Branch**: `develop` — all commits land here, never `main`

## Reference docs

| Doc | When to read |
|-----|-------------|
| `apps/web/DESIGN_SYSTEM.md` | Before any frontend UI work |
| `docs/SUBMISSION_GAPS.md` | To understand rubric + score targets |
| `docs/architecture.md` | System architecture + data flow |
| `BRIEF.md` | Full project spec + tech stack decisions |
| `docs/SPRINT_LOG.md` | What has been built, what was deferred |
| `docs/data-sources.md` | Data sources, endpoints, scraper notes |

## Score target

**~24.0 / 25** (C4 Usability remaining gap: Lighthouse pass on VPS).
Sole deployment blocker: public VPS with HTTPS.

## Running locally

```bash
docker compose up -d        # starts all services
# Web at http://localhost:3000
# API at http://localhost:8000
# API docs at http://localhost:8000/docs
```

## Dev commands

```bash
# Frontend
cd apps/web && npm run dev

# Typecheck
cd apps/web && npx tsc --noEmit

# Build
cd apps/web && npm run build

# Rebuild container after frontend changes
docker compose build web && docker compose up -d web
```
