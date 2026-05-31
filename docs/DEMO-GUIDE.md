# Costa Resiliente — Demo Guide (IEEE Response Quest 2026)

> **Scenario:** El Niño Costero — Lima Metropolitana, March 15–April 2, 2017
> **Setup:** `docker compose up -d` → http://localhost:3000

---

## 2-Minute Express Demo

### Step 0 — Verify via API (5s)

```bash
curl http://localhost:8000/api/v1/health
# → {"status":"ok","version":"0.1.0","sinagerd_level":"EMERGENCIA","active_alerts":7,
#    "max_rain_72h_mm":63.2,"rain_level":"emergencia"}
```

The health endpoint reports SINAGERD level + active alerts + ANA rainfall level — single-call external monitoring.

### Step 1 — System Check (15s)

Open http://localhost:3000.

**What judges see:**
- Top-right HUD: **"EMERGENCIA"** (pulsing red) — from 7 active alerts (3 critical huayco + 1 critical rain)
- Rainfall chip: **63 mm** (red, Rímac watershed above 50mm EMERGENCIA threshold)
- Clock: Lima time (PET, UTC-5)
- Map: Lima Metropolitana — **39 districts colored ALTO** (red), SAR flood polygon, huayco risk dots, rainfall layer

The FEEDS chip (core sources only) shows all 5 core sources active: Bluesky ✓ RSS ✓ IMERG ✓ Stations ✓ Alerts ✓

---

### Step 2 — SITREP Query (30s)

Click **"Consultar"** (C key) → left panel, or tap the Copilot icon.

Click the first suggestion: **"Dame el resumen completo de la situación"**

**What happens:**
- Sitrep mode triggers (5 tools sequential, ~5 seconds, no LLM)
- Response includes: **7 active alerts** (3 crit huayco + 1 crit rain + 3 high) + rainfall 63mm EMERGENCIA, **Chosica 2.41m → acercándose** (2.5m threshold), SAR flood, **Pedregal MUY ALTO 91% · también: Huaycoloro**
- Badge shows **"SITREP · 5 herramientas · sin LLM"** (distinct from regular quick mode)
- Action: **"Activar protocolo EDAN y escalar a COEN. Activar evacuación preventiva quebradas cuenca Rímac."** (combined directive from critical alerts + EMERGENCIA rainfall)

**Why this matters:** No LLM inference cost. Duty officer gets the full picture + specific action directive in ~5 seconds at 3am.

---

### Step 3 — Alerts Panel (20s)

Click **"Alertas"** (A key).

**What judges see:**
- **7 active alerts** shown (sorted: 3 critical first, then 4 high) — SLA breach badges on unacknowledged critical alerts
- Filter by severity: click **"⚠ Crit"** → shows 3 critical alerts (2 huayco + 1 rainfall EMERGENCIA)
- Each alert card shows: type, district, SLA timer, source refs
- AI Recommendation box: specific action using actual district/watershed name
- INDECI Protocol checklist: 4 checkboxes, each logged to Decision Log on completion

If any alert is older than its SLA (5min critical, 10min high), a **danger toast fires** even if the panel is closed.

---

### Step 4 — Copilot Full Query (30s)

In the Copilot panel, type: **"¿Qué subestaciones están en zona inundada?"** (or "hospitales")

**What happens:**
- Multi-quick: "subestaci" + "inundada" → `get_flood_polygons` + `get_infrastructure_impact` (no LLM)
- Answer: **2 SAR polygons + 16 substations** in flood zones → "Verificar accesibilidad para respuesta de emergencia"

Type: **"Nivel del río en Chosica"**

**What happens:**
- Quick mode: `get_river_levels`
- Answer: level in meters, flow m³/s, trend (↑ rising), **SENAMHI threshold comparison** — "⚠ acercándose al umbral 2.5m" (2.41m, within 90% threshold — Session 21 near-threshold warning)

---

### Step 5 — District Fusion (20s)

Click on Lurigancho district on the map.

**FusionCallout opens:**
- Population: 213,386 hab.
- SAR Flood: 1 polygon, 3.0 km²
- Huayco risk: MUY ALTO (91%) — Quebrada Pedregal (trigger: 12 mm/24h)
- **Rainfall: 63 mm (Rímac) · ⚠ EMERGENCIA** (>50mm ANA threshold)
- Social: 0 urgent signals (last 3h)
- Risk level pill: ALTO (elevation from rainfall EMERGENCIA + SAR flood + very high huayco)
- Prose (Spanish): "Lurigancho: 1 polígono SAR activo (3.0 km²; ~213,386 personas) · Riesgo huayco muy alto (91%) · Lluvia 72h cuenca Rímac: 63 mm — ⚠ EMERGENCIA."

Click **"Análisis completo"** → DistrictDashboardPanel shows **6 active alerts** (4 huayco + 2 rainfall) thanks to Session 21 watershed-to-district integration.

---

### Step 6 — Decision Log + EDAN Export (15s)

Click **"Registro"** (L key) → shows all operator actions (copilot queries, alert actions, protocol steps).

Click **CSV** → downloads `decision_log_YYYYMMDD_HHmmSS.csv` (EDAN-Perú format)
Click **PDF** → downloads EDAN-Perú A4 situational report with active alerts table + action log

---

## 5-Minute Full Demo

Add these steps to the express demo:

### A — El Niño 2017 Replay

Scenario Panel → **"Replay El Niño 2017"** button → date scrubber at Mar 15, 2017.

TutorialOverlay opens (or press **?** key) → step-by-step spotlight walkthrough tied to 2017 event.

Advance to Apr 2, 2017 (highest flood extent day).

### B — Proposals Panel (HITL)

Click **"Propuestas"** (P key) → AI-submitted alert proposals awaiting operator approval.

Approve one: toast shows **"Propuesta aprobada — publicada como alerta · N suscriptores notificados"** (NEW Session 20).

### C — Social Feed

Click **"Social"** (S key) → urgent signals (huayco_observation, needs_help, road_blocked, flood_observation) sorted by urgency.

Click **"Reporte de Campo"** → operator submits field observation (persisted to DB, logged to Decision Log).

### D — Notifications

Click **"Notificaciones [N]"** → subscriber management.

Add a webhook URL → all critical/high alerts auto-notify this endpoint (no operator trigger needed).

### E — Share

Click **"Compartir"** → operator shares read-only link of current scenario with COEN coordinators. Link encodes: district, time window, active layers, replay mode.

---

## Key Differentiators for Judges

| Feature | Why it matters |
|---------|----------------|
| **SITREP mode (~5s)** | Start-of-shift: 5 tools sequential, all sections guaranteed (no race condition) |
| **SENAMHI thresholds in copilot** | Level 2.41m at Chosica rising +0.130m/h → "⚠ sobre umbral ALERTA SENAMHI (2.5m)" |
| **Rainfall in FusionCallout** | District-level rainfall context (Rímac watershed 63mm) integrated into multi-hazard view |
| **SLA breach toasts** | Operator never misses an unacknowledged alert even if Alerts panel is closed |
| **ANA protocol RAG (7 docs)** | "¿cómo lleno el EDAN?" + "¿qué hago en EMERGENCIA?" from real INDECI/ANA/SINAGERD documents |
| **Health API** | `curl /health` → `sinagerd_level:EMERGENCIA, active_alerts:7, rain_level:emergencia` — single-call monitoring |
| **FEEDS chip (core only)** | No false alarms from expected-offline reddit/telegram/SAR between acquisitions |
| **Province filter bug fix** | Rainfall alerts (district-less) correctly appear in Lima Metro view |
| **Local Ollama (zero cloud)** | All ML inference local — no API keys, no data egress, works offline |
| **663 API tests** | End-to-end coverage of every endpoint, guardrail, quick-mode, sitrep, rainfall-mm, province filter, risk elevation |
| **SINAGERD level consistency** | Rainfall ≥50mm always elevates to EMERGENCIA across health API, HUD, SituationBrief, CityOverview, EDAN — 5 consistent surfaces |
| **Append-only decision log** | DB trigger rejects UPDATE/DELETE — full audit trail for SINAGERD post-event review |
| **Map: 39 districts show ALTO** | District risk map includes watershed rainfall — Rímac EMERGENCIA elevates all intersecting districts |
| **7 active alerts + 3 critical** | El Niño scenario: 2 critical huayco (Huaycoloro/Pedregal) + 1 critical rainfall + 4 high alerts |
| **Alerts sorted critical-first** | Critical alerts always appear before high within active group — no operator context loss |
| **Copilot: minimum severity filter** | `get_active_alerts(severity="high")` returns both high+critical (prior exact-match hid criticals) |
| **Copilot: sequential tool dispatch** | All 3 dispatch paths run tools sequentially — eliminates AsyncSession race, all sections always present |
| **Copilot: combined action directive** | SITREP action augments with specific evacuation directive when EMERGENCIA rain AND critical huayco present |
| **Alerts: idempotent actions** | Acknowledging/escalating an alert twice returns 200 (no duplicate fan-out notifications) |
| **Near-threshold warnings** | Chosica 2.41m → "⚠ acercándose al umbral 2.5m" shown in copilot + dashboard |

---

## Technical Stack Summary

```
9 Docker containers:
  PostgreSQL 16 + PostGIS 3.4 + TimescaleDB + pgstac + pgvector
  FastAPI (Python 3.12) — 32+ REST endpoints + SSE
  Prefect 3 — 9 ingestion/ML/alert flows
  Ollama — qwen2.5:7b (copilot) + gemma2:2b (guardrails) + nomic-embed-text (RAG)
  Next.js 14 — PWA, WCAG AA, ES/EN, offline cache

10 data sources:
  Sentinel-1 GRD (Planetary Computer)
  NASA IMERG Late Run V07B
  ANA Observatorio Chirilu (gauge scraper + Redis cache)
  SENAMHI (Open-Meteo fallback)
  INDECI SINPAD 2003–2020 (2,063 Lima events)
  INEI 2017 census
  OpenStreetMap infrastructure (43,072 POIs)
  Bluesky Jetstream v2 (AT Protocol)
  RSS: RPP + Andina + El Comercio + La República + Gestión + Peru21
  Reddit r/Peru + r/Lima + r/Chosica
  Telegram Senamhi_Peru

7 RAG protocol documents (51 chunks):
  INDECI Plan Familiar 2024, CENEPRED Movimientos en Masa
  MINSA Protocolo Emergencias, SENAMHI Guía Hidrometeorológica
  MML Plan Huaycos Lima, ANA Umbrales Lluvia Lima
  SINAGERD Acciones Rápidas COER Lima
```
