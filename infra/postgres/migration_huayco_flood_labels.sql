-- Migration: Add huayco_observation + flood_observation to triage_label CHECK constraint
-- Applied: 2026-05-25 (Session 12)
-- Context: Two new field-report labels for debris flow and flood sightings.
--   Ollama triage prompt updated to produce these labels from organic social signals.
--   alert_generator.py clusters huayco_observation (threshold=3, critical) and
--   flood_observation (threshold=5) into social_cluster alerts automatically.

ALTER TABLE social.signals
    DROP CONSTRAINT IF EXISTS signals_triage_label_check;

ALTER TABLE social.signals
    ADD CONSTRAINT signals_triage_label_check CHECK (triage_label IN (
        'needs_help',
        'infrastructure_damage',
        'road_blocked',
        'huayco_observation',
        'flood_observation',
        'weather_observation',
        'false_alarm',
        'irrelevant'
    ));
