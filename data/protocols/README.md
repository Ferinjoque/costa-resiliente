# Protocol Documents for RAG

Plain-text extracts of public Peruvian emergency management documents.
Each file corresponds to a key in `apps/workers/src/costa_workers/rag/ingest.py::PROTOCOL_REGISTRY`.

## How to add a new document

1. Create `<stem>.txt` in this directory (UTF-8, plain text, no HTML).
2. Add an entry to `PROTOCOL_REGISTRY` in `ingest.py`.
3. Run: `docker compose run --rm prefect-worker python -m costa_workers.rag.ingest`

## Sources

| File | Source | URL | Public |
|------|--------|-----|--------|
| `indeci_plan_familiar_2024.txt` | INDECI Plan Familiar de Emergencia | indeci.gob.pe | ✅ |
| `cenepred_movimientos_masa.txt` | CENEPRED Susceptibilidad por Movimientos en Masa | cenepred.gob.pe | ✅ |
| `minsa_protocolo_emergencias.txt` | MINSA Protocolo de Emergencias | minsa.gob.pe | ✅ |
| `senamhi_guia_hidrometeorologica.txt` | SENAMHI Guía Hidrometeorológica | senamhi.gob.pe | ✅ |
| `mml_plan_huaycos_lima.txt` | MML Plan Lima ante Huaycos | munlima.gob.pe | ✅ |
| `ana_umbrales_lluvia_lima.txt` | ANA Umbrales de Lluvia para Alertas Lima (INDECI/ANA) | ana.gob.pe | ✅ |

## Privacy

These are public government documents. No personal data is included.
Do NOT add documents with PII, restricted access, or proprietary content.
