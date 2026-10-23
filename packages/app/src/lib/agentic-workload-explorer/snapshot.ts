import {
  AS_OF_ISO,
  AS_OF_MS,
  SNAPSHOT_START_ISO,
} from '@semianalysisai/inferencex-db/proxytrace/shared/as-of';

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

export function snapshotNow(): Date {
  return new Date(AS_OF_MS);
}

export const SNAPSHOT_NOW_MS = AS_OF_MS;

export function formatSnapshotDate(d: Date | string | number): string {
  return dateFmt.format(new Date(d));
}

export function formatSnapshotClock(d: Date | string | number): string {
  return timeFmt.format(new Date(d));
}

export function formatSnapshotTime(d: Date | string | number): string {
  return `${formatSnapshotDate(d)}, ${formatSnapshotClock(d)} UTC`;
}

export const SNAPSHOT_RANGE_LABEL = `${dateFmt.format(new Date(SNAPSHOT_START_ISO))} – ${dateYearFmt.format(new Date(AS_OF_ISO))}`;

export const SNAPSHOT_END_CLOCK = `${formatSnapshotClock(AS_OF_ISO)} UTC`;

export const LAST_DAY_ISO = new Date(AS_OF_MS).toISOString().slice(0, 10);

export const LAST_DAY_LABEL = formatSnapshotDate(AS_OF_MS);

export const PREV_DAY_LABEL = formatSnapshotDate(AS_OF_MS - DAY_MS);
