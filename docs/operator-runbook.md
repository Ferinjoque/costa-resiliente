# Operator Runbook — Costa Resiliente

> Updated through Session 23 — covers auth, SLA toasts (server-side age_seconds, SLA breach modal in EscalationModal), notifications (delete confirm), PDF export, HITL proposals (ubigeo validation), population at risk, auto-resolution, 6-tool sitrep mode (alerts + rainfall + rivers + flood + huayco + social clusters), enhanced quick-mode copilot, watershed rainfall in district risk (39 districts → ALTO during EMERGENCIA), quebrada district assignment, social signal district attribution fix.

## Quick Start

1. Open browser to `http://<server-ip>:3000`
2. Dashboard loads Lima Metropolitana map
3. Click **Iniciar sesión** (bottom-left sidebar) and log in with your SINAGERD credentials
4. Active alerts appear in the Alertas panel (right rail)

### Demo accounts (non-production)

| Username | Password | Role | Scope |
|----------|----------|------|-------|
| `coen_lima` | `demo1234` | COEN | National — full access |
| `coer_lima` | `demo1234` | COER | Lima region |
| `coel_sjl` | `demo1234` | COEL | District 150132 |

---

## Panel Guide

### Escenario Panel (top-left)

- Select a district or leave blank for full Lima view
- Adjust time window (1h–72h) — all layers filter to this window
- **El Niño 2017 Replay** button: loads pre-baked SAR fixtures and steps through Mar 15 – Apr 2 2017 using the date scrubber
- Pinned scenario persists across browser sessions (IndexedDB)

### Mapa View (center)

- Layer toggles: Sentinel-1 floods, huayco risk, rainfall, infrastructure, social signals, hazard zones, watersheds, stations
- Click any alert pin to see details
- 3D extrusion toggle shows SAR flood polygons in height-encoded view
- Use scroll/pinch to zoom; keyboard arrow keys to pan

### Alertas Feed (right panel — keyboard shortcut: A)

- Color-coded by severity: red=critical, orange=high, yellow=medium, green=low
- **SLA breach chips**: timer turns red when SINAGERD SLA is exceeded (server-computed age, no clock skew); a danger toast also fires so breach is visible even without the Alertas panel open
  - Critical: 5 min · High: 10 min · Medium: 30 min · Low: 60 min
- **SLA breach modal**: when opening Escalate on a past-SLA alert, a red banner shows "SLA VENCIDO — Xmin sin acción (límite 5min)" — operators see exactly how late they are
- Actions per alert card: **Reconocer**, **Escalar**, **Falsa alarma**, **Despachar**
- All actions logged to Decision Log automatically (action types validated against whitelist)
- **Auto-resolution**: alerts resolve automatically when hazard passes (flood: 7d, huayco: 48h, social-cluster: 4h, rainfall: 6h)
- **Auto-notification**: critical and high alerts fan-out to registered subscribers immediately on creation — no operator trigger needed
- **Rainfall escalation**: if a high rainfall alert exists and rainfall exceeds critical threshold, the high alert is auto-closed and replaced with a critical alert (Session 23)

### Propuestas Panel (bottom-right drawer — keyboard shortcut: P)

- The agentic copilot may submit pre-published alert proposals requiring human approval
- Badge count on LeftRail shows pending critical/high proposals
- **Aprobar**: inserts alert into live ops.alerts + records in Decision Log under your username
- **Rechazar**: removes from queue; reason logged
- HITL (Human-in-the-Loop) — no AI-generated alert reaches the live feed without operator approval

### Consultar Panel / Copilot (keyboard shortcut: C)

- Type a question in Spanish — first suggestion chip: "Dame el resumen completo de la situación"
- **SITREP mode** (~6s): use "resumen completo", "inicio de guardia", "sitrep", or "situation report" → calls 6 tools sequentially (alertas + lluvia + ríos + SAR + huayco + señales sociales) and returns a structured SITREP narrative with UTC timestamp and district context for social signals (Session 23)
- **Quick mode** (~2s): 9 common query patterns bypass the LLM entirely:
  - "¿alertas activas?" / "situación actual" → alert count + severity breakdown
  - "nivel del río / Rímac / Chillón" → river level + flow rate + trend (rising / stable / falling)
  - "zona inundada / SAR" → flood polygon count + total area + largest district
  - "lluvia / IMERG / mm" → 1h, 24h, 72h rainfall + EMERGENCIA/ALERTA/AVISO threshold
  - "población en riesgo / afectados" → estimated persons in flooded zones
  - "huayco / quebrada / Huaycoloro" → susceptibility + probability score
  - "señales sociales / avistamiento / vecinos" → urgent signal breakdown by label
  - "albergue / hospital / puente" → critical infrastructure in flood zones
  - "protocolo / INDECI / qué hacer" → protocol RAG (pgvector)
- **Full mode** (~15–30s): all other queries go through the 9-tool agentic loop:
  - `get_flood_polygons` — SAR flood extents
  - `get_huayco_risk` — quebrada susceptibility
  - `get_river_levels` — station readings + 1h trend
  - `get_social_clusters` — triage-labeled social signals
  - `get_infrastructure_impact` — hospitals, bridges, substations in hazard zones
  - `get_rainfall_accumulation` — IMERG 1h–72h per watershed
  - `get_active_alerts` — ops.alerts with true total count
  - `search_protocols` — pgvector RAG over INDECI / MINSA / CENEPRED protocols
  - `get_population_at_risk` — INEI 2017 census × SAR flood polygon spatial join
- All numerical answers cite their data source and timestamp
- The LLM never fabricates — if a tool returns 0 rows, the answer says so explicitly

### Registro (keyboard shortcut: L)

- Immutable record of all operator actions (DB trigger rejects UPDATE/DELETE)
- **CSV** export button for EDAN-Perú submission workflows
- **PDF** export button → generates A4 EDAN-Perú situational report (active alerts + decision log)

### Señales Sociales (keyboard shortcut: S)

- Triage-labelled signals from Bluesky, Reddit (r/Peru, r/Lima, r/Chosica), RSS, and Telegram
- Each signal shows date, triage label, and source link
- **Reporte de Campo** form: operator can record a field observation — persists to `social.signals` (source='campo') and appends to Decision Log

### Notificaciones (bell icon)

- Register **webhook** or **SMS** (Twilio) subscribers
- Configure per-subscriber severity threshold and optional district filter
- Subscribers receive escalated and high/critical severity alerts automatically (on insert, not just on escalate)
- Delivery history shown in the deliveries tab

### FEEDS Chip (OperationalHUD, top-right)

- Shows data freshness across all upstream sources
- Green: all feeds live · Yellow: 1–2 offline or stale · Red: ≥3 offline
- Click to jump to DataSources panel for per-source health

---

## Alert Lifecycle

```
Alert created (auto or operator)
  → SSE push → frontend AlertsPanel
  → Auto-notification fan-out (critical/high only)
  → Operator: Reconocer / Escalar / FalsaAlarma / Despachar
  → Decision Log entry (immutable)
  → Auto-resolution timer starts (based on alert_type)
```

---

## Quick Status Check

```bash
# Check current SINAGERD level and active alert count (no auth required)
curl http://localhost:8000/api/v1/health
# Returns: {"status":"ok","sinagerd_level":"EMERGENCIA","active_alerts":7,...}
```

---

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
# Clear old social signals manually if pg_cron failed:
docker exec costa-postgres psql -U costa -c \
  "DELETE FROM social.signals WHERE expires_at < NOW();"
```

### IMERG Feed Gap

- Check `http://localhost:4200` (Prefect UI) for failed imerg-30min runs
- Manual trigger: Prefect UI → Deployments → imerg-30min → Quick Run

### ANA / SENAMHI Station Scraper Down

- The scraper caches last known gauge readings in Redis (24h TTL)
- During a government site outage, the station layer shows cached readings with a `from_cache=true` flag
- The FEEDS chip will show yellow/red; click to verify which sources are stale
- If scraper recovers, next scheduled run (every 15 min) repopulates live readings

### Copilot Slow / LLM Timeout

- Common queries (see Quick Mode above) return in ~2s regardless of LLM state
- Full agentic queries time out at 30s and fall back to keyword dispatch
- If Ollama is unresponsive: `docker compose restart ollama` then wait ~60s for model load

### Prefect Flows Not Running

```bash
docker compose logs prefect-worker
# If zero deployments registered, recreate the worker:
docker compose up -d --force-recreate prefect-worker
```

---

## Data Freshness Indicators

| Layer | Expected refresh | Staleness alert |
|-------|-----------------|-----------------|
| Sentinel-1 | Every 6 days | >8 days |
| IMERG | Every 30 min | >2h |
| ANA stations | Every 15 min | >1h (shows cached after outage) |
| SENAMHI stations | Every 15 min | >1h |
| Social signals | Every 15 min | >30 min |
| Flood polygons | After each S1 scene | — |
| Alert auto-resolution | Continuous | — |

---

## SINAGERD Role Reference

| Role | Tier | Default scope |
|------|------|--------------|
| COEN | National | All districts, all watersheds |
| COER | Regional | Lima province (43 districts) |
| COEL | District | Single ubigeo |

All three roles share the same interface. COEN sees all district dashboards without restriction; COEL sees their assigned district pre-selected in ScenarioPanel.
