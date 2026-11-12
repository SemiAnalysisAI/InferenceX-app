import { localeTag, type Locale } from '@/lib/i18n/i18n';

export function formatNumber(n: number): string {
  if (n === null || n === undefined || isNaN(n)) return '0';
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function formatDollars(v: number): string {
  if (v === 0) return '$0';
  if (v > 0 && v < 0.01) return '<$0.01';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  if (v >= 100) return `$${v.toFixed(0)}`;
  return `$${v.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function formatInteractivity(tpotMs: number): string {
  if (tpotMs <= 0) return '---';
  const tokPerSec = 1000 / tpotMs;
  return `${tokPerSec.toFixed(1)} output tok/s/user`;
}

export function formatInteractivityCompact(tpotMs: number): string {
  if (tpotMs <= 0) return '---';
  return (1000 / tpotMs).toFixed(1);
}

export function formatPrefillSpeed(tokPerSec: number): string {
  if (tokPerSec <= 0 || !isFinite(tokPerSec)) return '---';
  if (tokPerSec >= 1_000_000) return `${(tokPerSec / 1_000_000).toFixed(1)}M input tok/s/query`;
  if (tokPerSec >= 1_000) return `${(tokPerSec / 1_000).toFixed(1)}K input tok/s/query`;
  return `${Math.round(tokPerSec)} input tok/s/query`;
}

export function formatPrefillSpeedCompact(tokPerSec: number): string {
  if (tokPerSec <= 0 || !isFinite(tokPerSec)) return '---';
  if (tokPerSec >= 1_000_000) return `${(tokPerSec / 1_000_000).toFixed(1)}M`;
  if (tokPerSec >= 1_000) return `${(tokPerSec / 1_000).toFixed(1)}K`;
  return `${Math.round(tokPerSec)}`;
}

export function computePrefillSpeed(
  cacheRead: number | null,
  cacheWrite: number | null,
  ttftMs: number | null,
): number | null {
  if (ttftMs === null || ttftMs <= 0) return null;
  const totalCache = (cacheRead ?? 0) + (cacheWrite ?? 0);
  if (totalCache <= 0) return null;
  return totalCache / (ttftMs / 1000);
}

/** Display label for a grouping value; the `unknown` fallback bucket is translated in zh. */
export function bucketLabel(label: string, locale: Locale): string {
  return locale === 'zh' && label === 'unknown' ? '未知' : label;
}

/** Short zone label as the English UI shows it (e.g. `CDT`, `UTC`), in every locale. */
export function formatZoneLabel(date: Date | string | number, timeZone?: string): string {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
      .formatToParts(new Date(date))
      .find((part) => part.type === 'timeZoneName')?.value ?? ''
  );
}

/**
 * Explorer date/time label. English output is exactly `toLocaleString('en-US', options)`.
 * Chinese keeps the zh month/day form but uses a zero-padded 24-hour clock and the English zone
 * label, since zh-CN would otherwise produce long forms like `GMT-5上午4时`.
 * `axisTick` writes the zh month/day as `9/26` so a tick is no wider than its English twin.
 */
export function formatExplorerDateTime(
  date: Date | string | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
  { axisTick = false }: { axisTick?: boolean } = {},
): string {
  const d = new Date(date);
  if (locale === 'en') return d.toLocaleString('en-US', options);
  const { timeZone } = options;
  const parts: string[] = [];
  if (options.year || options.month || options.day) {
    const compact = axisTick && !options.year && options.month && options.day;
    parts.push(
      d.toLocaleDateString(localeTag(locale), {
        year: options.year,
        month: compact ? 'numeric' : options.month,
        day: options.day,
        timeZone,
      }),
    );
  }
  if (options.hour) {
    if (options.minute) {
      parts.push(
        d.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: options.second ? '2-digit' : undefined,
          hourCycle: 'h23',
          timeZone,
        }),
      );
    } else {
      const hour = d.toLocaleTimeString('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone });
      parts.push(`${hour}:00`);
    }
  }
  if (options.timeZoneName) parts.push(formatZoneLabel(d, timeZone));
  return parts.join(' ');
}

export function formatTime(date: string | Date, locale: Locale = 'en'): string {
  return formatExplorerDateTime(date, locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

export function truncateHash(hash: string, len = 8): string {
  return `${hash.slice(0, len)}...`;
}

export function truncateSessionId(id: string): string {
  const prefix = id.includes('-') ? id.split('-')[0] : id.slice(0, 8);
  return `${prefix}...`;
}

export function formatJsonCompact(obj: unknown): string {
  const raw = JSON.stringify(obj, null, 2);
  return raw.replaceAll(/"hash_ids":\s*\[\s*(?<ids>[\s\S]*?)\s*\]/gu, (_match, inner: string) => {
    const ids = inner.replaceAll(/\s+/gu, ' ').trim();
    return `"hash_ids": [${ids}]`;
  });
}
