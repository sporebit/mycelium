/**
 * Cadence the agent reports on, in seconds. M5 will make this a stored
 * setting the agent reads back from the POST response; until then the
 * dashboard and the agent share this default by convention.
 */
export const DEFAULT_INTERVAL_S = 60;

/**
 * A machine counts as offline once it has missed three consecutive reports.
 *
 * Derived from the cadence rather than hardcoded at 120s, which was wrong in
 * both directions: at the old 30s cadence it waited four missed reports to go
 * red, and at a 60s cadence it would have gone red after a single late one.
 */
export function offlineThresholdS(intervalS: number = DEFAULT_INTERVAL_S): number {
  return intervalS * 3;
}
