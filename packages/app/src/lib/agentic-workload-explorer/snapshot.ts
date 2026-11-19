import {
  AS_OF_ISO,
  AS_OF_MS,
  SNAPSHOT_START_ISO,
} from '@semianalysisai/inferencex-db/proxytrace/shared/as-of';

import { localeTag, type Locale } from '@/lib/i18n/i18n';

const DAY_MS = 86_400_000;

function buildDateFormats(
  options: Intl.DateTimeFormatOptions,
): Record<Locale, Intl.DateTimeFormat> {
  return {
    en: new Intl.DateTimeFormat(localeTag('en'), options),
    zh: new Intl.DateTimeFormat(localeTag('zh'), options),
  };
}

const dateFmt = buildDateFormats({ month: 'short', day: 'numeric', timeZone: 'UTC' });
const dateYearFmt = buildDateFormats({
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

export function formatSnapshotDate(d: Date | string | number, locale: Locale = 'en'): string {
  return dateFmt[locale].format(new Date(d));
}

export function formatSnapshotClock(d: Date | string | number): string {
  return timeFmt.format(new Date(d));
}

export function formatSnapshotTime(d: Date | string | number, locale: Locale = 'en'): string {
  const sep = locale === 'zh' ? ' ' : ', ';
  return `${formatSnapshotDate(d, locale)}${sep}${formatSnapshotClock(d)} UTC`;
}

export function snapshotRangeLabel(locale: Locale = 'en'): string {
  return `${dateFmt[locale].format(new Date(SNAPSHOT_START_ISO))} – ${dateYearFmt[locale].format(new Date(AS_OF_ISO))}`;
}

export const SNAPSHOT_END_CLOCK = `${formatSnapshotClock(AS_OF_ISO)} UTC`;

export const LAST_DAY_ISO = new Date(AS_OF_MS).toISOString().slice(0, 10);

export function lastDayLabel(locale: Locale = 'en'): string {
  return formatSnapshotDate(AS_OF_MS, locale);
}

export function prevDayLabel(locale: Locale = 'en'): string {
  return formatSnapshotDate(AS_OF_MS - DAY_MS, locale);
}
