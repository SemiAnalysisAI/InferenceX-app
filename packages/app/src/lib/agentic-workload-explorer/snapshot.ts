import {
  AS_OF_ISO,
  AS_OF_MS,
  SNAPSHOT_START_ISO,
} from '@semianalysisai/inferencex-db/proxytrace/shared/as-of';

/**
 * UI helpers for the frozen snapshot. Every chart window and label that used
 * to mean "relative to now" is anchored to the snapshot's as-of time instead,
 * so pages read the same no matter when they are viewed.
 */

const DAY_MS = 86_400_000;

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const dateYearFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const timeFmt = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});

/** The snapshot's "now" as a Date (never the viewer's clock). */
export function snapshotNow(): Date {
  return new Date(AS_OF_MS);
}

/** Epoch ms of the snapshot's "now". */
export const SNAPSHOT_NOW_MS = AS_OF_MS;

/** "Sep 26" */
export function formatSnapshotDate(d: Date | string | number): string {
  return dateFmt.format(new Date(d));
}

/** "08:07" (UTC) */
export function formatSnapshotClock(d: Date | string | number): string {
  return timeFmt.format(new Date(d));
}

/** "Sep 25, 14:02 UTC" — absolute replacement for "3h ago" style timestamps. */
export function formatSnapshotTime(d: Date | string | number): string {
  return `${formatSnapshotDate(d)}, ${formatSnapshotClock(d)} UTC`;
}

/** "Jun 8 – Sep 26, 2026" */
export const SNAPSHOT_RANGE_LABEL = `${dateFmt.format(new Date(SNAPSHOT_START_ISO))} – ${dateYearFmt.format(new Date(AS_OF_ISO))}`;

/** "08:07 UTC" — when the snapshot ends on its last day. */
export const SNAPSHOT_END_CLOCK = `${formatSnapshotClock(AS_OF_ISO)} UTC`;

/** The snapshot's last UTC day as YYYY-MM-DD (partial day). */
export const LAST_DAY_ISO = new Date(AS_OF_MS).toISOString().slice(0, 10);

/** The snapshot's last UTC day, which is partial: "Sep 26". */
export const LAST_DAY_LABEL = formatSnapshotDate(AS_OF_MS);

/** The last complete UTC day: "Sep 25". */
export const PREV_DAY_LABEL = formatSnapshotDate(AS_OF_MS - DAY_MS);
