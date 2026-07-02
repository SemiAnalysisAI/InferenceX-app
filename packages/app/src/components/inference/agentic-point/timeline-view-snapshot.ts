/**
 * Persisted view-state snapshot for the request timeline (zoom window, row
 * mode, phase filter, expansions, scroll offsets). Written to sessionStorage on
 * click-through to a dataset conversation, consumed once on the next mount so
 * the browser back button restores the user's exact position.
 */

import type { StagePhase } from './phase-slice';
import type { RowMode } from './timeline-rows';

// Two phases shown separately (no combined view) — matches the per-point detail
// stage toggle. Reuses StagePhase so the filter predicate is shared.
export type PhaseFilter = StagePhase;

/**
 * Persisted snapshot of the timeline's view state, used to restore the user's
 * zoom / scroll / filter position when they return to the page (e.g. clicking a
 * request to open the dataset flamegraph, then hitting the browser back button).
 * Stored in sessionStorage keyed by point id; written on click-through and
 * consumed once on the next mount.
 */
export interface TimelineViewSnapshot {
  /** Zoom-pan window start (ns offset from dataStart). */
  viewStart: number;
  /** Zoom-pan window end, or null when not zoomed (full extent). */
  viewEnd: number | null;
  rowMode: RowMode;
  phaseFilter: PhaseFilter;
  /** Keys of expanded multi-stream subagent rows. */
  expanded: string[];
  /** Scroll container offsets (vertical row scroll + horizontal). */
  scrollTop: number;
  scrollLeft: number;
}

const TIMELINE_VIEW_SNAPSHOT_PREFIX = 'agentic-timeline-view:';
const ROW_MODE_VALUES: readonly RowMode[] = ['conversation', 'worker'];
const PHASE_FILTER_VALUES: readonly PhaseFilter[] = ['warmup', 'profiling'];

const finiteOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * Parse a persisted snapshot, coercing/validating each field and falling back
 * to defaults so a malformed or stale blob can never break restore. Returns
 * null only when the input is absent or not parseable JSON.
 */
export function parseTimelineViewSnapshot(raw: string | null): TimelineViewSnapshot | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  const rowMode = ROW_MODE_VALUES.includes(record.rowMode as RowMode)
    ? (record.rowMode as RowMode)
    : 'conversation';
  const phaseFilter = PHASE_FILTER_VALUES.includes(record.phaseFilter as PhaseFilter)
    ? (record.phaseFilter as PhaseFilter)
    : 'profiling';
  const viewEnd =
    typeof record.viewEnd === 'number' && Number.isFinite(record.viewEnd) ? record.viewEnd : null;
  const expanded = Array.isArray(record.expanded)
    ? record.expanded.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return {
    viewStart: finiteOr(record.viewStart, 0),
    viewEnd,
    rowMode,
    phaseFilter,
    expanded,
    scrollTop: finiteOr(record.scrollTop, 0),
    scrollLeft: finiteOr(record.scrollLeft, 0),
  };
}

function timelineSnapshotKey(pointId: number): string {
  return `${TIMELINE_VIEW_SNAPSHOT_PREFIX}${pointId}`;
}

export function saveTimelineViewSnapshot(pointId: number, snapshot: TimelineViewSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(timelineSnapshotKey(pointId), JSON.stringify(snapshot));
  } catch {
    // sessionStorage can throw (private mode / quota exceeded) — restore is
    // best-effort, so a failed write just means no restore next time.
  }
}

/**
 * Read AND remove the snapshot (one-shot): we only want to restore once per
 * click-through, so a later reload of the same point starts from defaults.
 */
export function consumeTimelineViewSnapshot(pointId: number): TimelineViewSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = timelineSnapshotKey(pointId);
    const raw = window.sessionStorage.getItem(key);
    window.sessionStorage.removeItem(key);
    return parseTimelineViewSnapshot(raw);
  } catch {
    return null;
  }
}
