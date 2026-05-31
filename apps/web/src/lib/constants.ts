/**
 * Shared constants used across multiple components.
 * Centralizing them prevents drift between components that must stay in sync.
 */

/**
 * Triage labels considered "urgent" for badge counts, sorting, and alert triggers.
 * Must match the backend's `urgent_social_3h` filter in:
 *   - alert_generator.py `_SOCIAL_CLUSTER_CONFIGS`
 *   - districts.py `urgent_social_3h` subquery
 *   - fusion.py social `urgent` count
 */
export const URGENT_SOCIAL_LABELS = new Set([
  "needs_help",
  "road_blocked",
  "huayco_observation",
  "flood_observation",
  "infrastructure_damage",
]);
