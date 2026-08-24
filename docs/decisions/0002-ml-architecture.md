# ADR-0002: ML Architecture Decisions

**Status**: Accepted  
**Date**: 2026-05-11  
**Deciders**: Fernando Injoque

---

## Context

Costa Resiliente requires three distinct ML components with different latency, accuracy, and resource requirements. This ADR documents the choices made for each.

---

## Decision 1: SAR Flood Segmentation. Sen1Floods11 U-Net

**Choice**: 4-level U-Net with skip connections trained on Sen1Floods11 dataset.

**Why**: Sen1Floods11 (Bonafilia et al. 2020) provides labeled Sentinel-1 GRD flood events including the 2017 Peru El Niño event, a directly relevant training set. The U-Net architecture is the established baseline for semantic segmentation of SAR imagery and has strong transfer learning properties.

**Key constraints**:
- Lima's informal urban fabric requires pixel-level resolution, object detection baselines insufficient
- Must run on CPU (8 GB RAM) in under 5 minutes per scene
- Patch inference (512×512, 64px overlap) bounds VRAM to ~2 GB when GPU available

**Normalization**: Sen1Floods11 normalization constants (VV: µ=-14.41, σ=5.24; VH: µ=-20.68, σ=5.43) applied to linear→dB converted backscatter.

---

## Decision 2: Huayco Susceptibility. XGBoost following Castro-Cabrera (2024)

**Choice**: XGBoost binary classifier with 9 features from Castro-Cabrera et al. (2024) "A Comparative Study of Susceptibility and Hazard for Mass Movements in Northern Lima Commonwealth" (Geosciences 14(6):168).

**Why**: Castro-Cabrera directly covers Lima Norte watersheds (Rímac, Chillón, Lurín) and provides feature importance rankings from real Peruvian geology. Their model achieved AUC >0.92 on CENEPRED SIGRID historical events. Replication with dynamic IMERG rainfall features extends the static susceptibility map to near-real-time hazard estimation.

**Risk thresholds**: Castro-Cabrera Table 5 equivalent, <0.2 very_low / <0.4 low / <0.6 medium / <0.8 high / ≥0.8 very_high.

**Fallback**: Slope+rainfall heuristic (0.6×slope_norm + 0.4×rain_norm) when trained weights absent. Not calibrated, development only.

---

## Decision 3: Social Signal Triage. Gemma 3 12B-IT

**Choice**: Gemma 3 12B-IT (Q4_K_M quantization) served via Ollama, structured JSON output via Ollama's `format: "json"` parameter.

**Why**: Grandury et al. (ACL 2025) "La Leaderboard" (arXiv:2507.00999) benchmarks Spanish-language LLM capability. Gemma 3 12B-IT ranks at 90th+ percentile among models that fit on a single consumer GPU. The model produces reliable structured JSON with a well-designed system prompt, enabling Pydantic schema validation without fine-tuning.

**Prompt injection hardening**: Social content sandboxed in `<SEÑAL>` XML tags with explicit system prompt instruction to ignore any instructions inside the tags (Aegis-style cognitive firewall).

---

## Decision 4: Operator Copilot. Intent-Classified RAG with Whitelisted Queries

**Choice**: Two-call LLM pipeline, (1) classify intent and extract slots, (2) execute whitelisted parameterized query, (3) summarize results in Spanish.

**Why**: Direct SQL generation from NL carries injection risk and produces unauditable queries. A whitelist of 6 parameterized templates covers the operator's actual information needs (flood status, huayco risk, river levels, social clusters, infrastructure impact, rainfall) while remaining transparent and safe. The "LLM never fabricates" invariant is enforced by design: the LLM can only summarize rows returned from the DB, not invent numbers.

**Transparency**: `query_plan` field in the response returns the whitelist template key, enabling operators to verify what data was queried.
