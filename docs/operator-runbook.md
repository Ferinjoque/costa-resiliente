# Operator Runbook — Costa Resiliente

> Updated through Sprint 8 — covers auth, SLA indicators, notifications, and PDF export.

## Quick Start

1. Open browser to `http://<server-ip>:3000`
2. Dashboard loads Lima Metropolitana map
3. Click **Iniciar sesión** (bottom-left) and log in with your SINAGERD credentials
4. Active alerts appear in the Alertas panel (right rail)

### Demo accounts (non-production)

| Username | Password | Role | Scope |
|----------|----------|------|-------|
| `coen_lima` | `demo1234` | COEN | National — full access |
| `coer_lima` | `demo1234` | COER | Lima region |
| `coel_sjl` | `demo1234` | COEL | District 150132 |

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
- **CSV** export button for EDAN-Perú submission workflows
- **PDF** export button → generates A4 EDAN-Perú situational report (active alerts + decision log)

### SLA Indicators
- Each alert card shows elapsed time since creation
- Chip turns red when SINAGERD SLA is breached:
  - Critical: 5 min · High: 10 min · Medium: 30 min · Low: 60 min

### Notificaciones (bell icon)
- Register webhook or SMS-stub subscribers
- Subscribers receive escalated and high-severity alerts automatically
- Delivery history shown in the deliveries tab

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
