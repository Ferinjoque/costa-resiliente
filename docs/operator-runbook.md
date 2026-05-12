# Operator Runbook — Costa Resiliente

> Sprint 7 deliverable — this is the working draft.

## Quick Start

1. Open browser to `http://<server-ip>:3000`
2. Dashboard loads Lima Metropolitana map
3. Active alerts appear in the Alertas panel (right rail)

## Panel Guide

### Escenario Panel (top-left)
- Select a district or leave blank for full Lima view
- Adjust time window (1h–72h) — all layers filter to this window
- Pinned scenario persists across browser sessions (IndexedDB)

### Mapa View (center)
- Layer toggles: Sentinel-1 floods, huayco risk, rainfall, infrastructure
- Click any alert pin to see details
- Use scroll/pinch to zoom; keyboard arrow keys to pan

### Alertas Feed (right panel)
- Color-coded by severity: red=critical, orange=high, yellow=medium, green=low
- Click ✓ to acknowledge; right-click for escalate / false-positive
- All actions logged to Decision Log automatically

### Consultar Panel (ask icon)
- Type a question in Spanish
- System queries PostGIS and summarizes in Spanish prose
- All numerical answers cite their data source and timestamp

### Registro (log icon)
- Immutable record of all operator actions
- Export button → CSV for EDAN-Perú submission workflows

## Emergency Procedures

### Service Down
```bash
docker compose ps         # check which service is unhealthy
docker compose logs api   # inspect logs
docker compose restart api
```

### Database Full
```bash
docker exec costa-postgres psql -U costa -c \
  "SELECT pg_size_pretty(pg_database_size('costa_resiliente'));"
# Clear old social signals manually if cron failed:
docker exec costa-postgres psql -U costa -c \
  "DELETE FROM social.signals WHERE expires_at < NOW();"
```

### IMERG Feed Gap
- Check `http://localhost:4200` (Prefect UI) for failed imerg-hourly runs
- Manual trigger: Prefect UI → Deployments → imerg-hourly → Quick Run

## Data Freshness Indicators

| Layer | Expected refresh | Staleness alert |
|-------|-----------------|-----------------|
| Sentinel-1 | Every 6 days | >8 days |
| IMERG | Every 30 min | >2h |
| ANA stations | Every 15 min | >1h |
| Social signals | Every 15 min | >30 min |
| Flood polygons | After each S1 scene | — |
