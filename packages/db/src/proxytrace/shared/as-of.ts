/**
 * The read-only deployment serves a frozen snapshot of ProxyTrace data. Every
 * "now", "today" and "last N days" in queries and UI is anchored here instead
 * of the wall clock, so results never drift as real time passes.
 */

/** First request in the snapshot. */
export const SNAPSHOT_START_ISO = '2026-06-08T20:12:49Z';

/** The snapshot's "now": just after the last recorded session activity. */
export const AS_OF_ISO = '2026-09-26T08:07:23Z';

export const SNAPSHOT_START_MS = Date.parse(SNAPSHOT_START_ISO);
export const AS_OF_MS = Date.parse(AS_OF_ISO);

export function asOfDate(): Date {
  return new Date(AS_OF_MS);
}
