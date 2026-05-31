/** Returns a Spanish relative-time string for a given ISO timestamp. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

/** Returns ageMinutes since the given ISO timestamp, or null if no timestamp. */
export function ageMinutes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

/** Returns the staleness level of a data timestamp relative to a threshold in minutes. */
export function stalenessLevel(iso: string | null | undefined, staleMinutes = 60): "ok" | "warn" | "stale" {
  const age = ageMinutes(iso);
  if (age === null) return "stale";
  if (age < staleMinutes) return "ok";
  if (age < staleMinutes * 3) return "warn";
  return "stale";
}
