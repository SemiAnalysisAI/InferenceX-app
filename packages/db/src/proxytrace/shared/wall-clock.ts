// Constants shared by the wall-clock breakdown query (packages/db) and the
// graphs dashboard cards that render it (packages/app). Kept here so the
// cutoff quoted in the UI can never drift from the one the SQL applies.

/**
 * Idle gaps at or beyond this are the user walking away — abandoned sessions,
 * lunch, a laptop closed mid-turn — not reading and typing. Excluded from the
 * idle histogram and from the idle sums in the composition bars, and counted
 * separately as `walkedAway`. Matches the tool-timings idle cutoff so the two
 * gap families are bounded identically.
 */
export const IDLE_GAP_CUTOFF_MS = 30 * 60 * 1000;

/** Maximum days of UTC history fetched for the wall-clock composition bars. */
export const WALL_CLOCK_DAILY_DAYS = 90;
