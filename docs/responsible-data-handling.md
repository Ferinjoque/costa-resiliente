# Responsible Data Handling: Costa Resiliente

## Legal Basis

- **Peru Ley 29733** (Ley de Protección de Datos Personales) + **DS 016-2024-JUS**
  (2025 Reglamento revision): governs PII handling for citizen-sourced data
- **OCHA Data Responsibility Guidelines** (2025 revision): humanitarian data
  principles: do no harm, purpose limitation, data minimization
- **IASC Operational Guidance on Data Responsibility in Humanitarian Action**
  (April 2023): SINAGERD operational context

## Implementation Commitments (Code, Not Aspirations)

### 1. PII Redaction Pipeline

Every social signal passes through `costa_workers/ml/triage.py` redaction **before**
insertion into `social.signals`. Implementation uses:

- `presidio-analyzer` + `presidio-anonymizer` for text: names, phone numbers,
  email addresses, exact home addresses, ID numbers (DNI), license plates
- spaCy `es_core_news_sm` as the Spanish NER backbone
- CV face detection for image signals (Sprint 4+)

**Invariant**: `social.signals.content_redacted` never contains raw PII.
`content_hash` (SHA-256) enables dedup without storing original content.

### 2. Location Coarsening

Any data exposed outside the closed responder UI is coarsened:
- **Internal responder view**: district-level aggregation
- **Any exported or public-facing data**: manzana centroid (~100m) only
- **Social signal pins on map**: clustered to district centroid for public-facing views

Implementation: PostGIS `ST_Centroid` on manzana polygons; signal `geom` stored
at manzana centroid (not exact location even internally).

### 3. Data Retention Limits

Enforced by the `run-retention` Prefect flow (`apps/workers/src/costa_workers/flows/retention.py`),
deployed as `retention-daily` at 03:00 UTC. The `timescaledb-ha` image does not ship `pg_cron`, so
scheduling lives in Prefect rather than in the database; `expires_at` is still set at ingest time by
the schema, and the flow only deletes rows the schema already marked expired.

| Data type | Retention | Mechanism |
|-----------|-----------|-----------|
| Raw social firehose (social.signals) | 7 days | `retention-daily` flow: `DELETE WHERE expires_at < NOW()` |
| Resolved alerts (closed / false_positive) | 90 days | `retention-daily` flow |
| Share tokens | 30 days | `retention-daily` flow: `expires_at` |
| Security events (guardrail trips) | 180 days | `retention-daily` flow |
| Derived non-PII features | 12 months | Prefect scheduled cleanup flow |
| Aggregated statistics | Indefinite | No deletion |
| Operator decision log | Indefinite | Append-only, no deletion allowed |

### 4. Immutable Operator Decision Log

`ops.decision_log` has a PostgreSQL trigger (`prevent_decision_log_mutation`) that
raises an exception on any UPDATE or DELETE. The table is append-only by database
constraint, not just application convention.

### 5. Citizen Consent

Any optional citizen reporting feature (Sprint 6+) displays a Spanish-only
consent string before submission:

> "Al enviar este reporte, consiente que su información de ubicación (a nivel de
> manzana, no exacta) y el contenido de su mensaje serán procesados por el sistema
> Costa Resiliente para apoyar la respuesta de emergencia en Lima Metropolitana.
> Los datos personales serán eliminados en 7 días. No se compartirán con terceros."

### 6. LLM Anti-Fabrication Guarantee

The Operator Copilot (`apps/api/src/costa_api/routers/copilot.py`) enforces:
- All numerical claims in operator-facing answers must trace to a DB row
- If a query cannot be resolved from structured data, the system explicitly says so
- LLM is never given access to raw social signal text in the operator context
  (injection hardening via XML sandboxing in `costa_workers/ml/triage.py`)

### 7. Prompt Injection Hardening

Social signal content is treated as fully untrusted:
- Sandboxed in `<SEÑAL>...</SEÑAL>` XML tags, never interpolated into system prompt
- Triage prompt instructs model to ignore instructions inside tags
- Aegis-style cognitive firewall: separate model calls for triage vs. operator context
- Operator copilot never receives raw signal content, only structured DB fields

## Audit Trail

All responsible data handling decisions, implementation choices, and gaps are
logged in `docs/decisions/` ADRs as they arise. Current ADRs:

- [ADR-0001](decisions/0001-project-charter.md): Project charter, scope, and stack
