export function formatNumber(n: number): string {
  if (n === null || n === undefined || isNaN(n)) return '0';
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function formatDollars(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  if (v >= 100) return `$${v.toFixed(0)}`;
  if (v >= 10) return `$${v.toFixed(1)}`;
  return `$${v.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

/** Convert TPOT (ms/tok) to interactivity (tok/s/user). */
export function formatInteractivity(tpotMs: number): string {
  if (tpotMs <= 0) return '---';
  const tokPerSec = 1000 / tpotMs;
  return `${tokPerSec.toFixed(1)} output tok/s/user`;
}

/** Interactivity without the unit, for table cells. */
export function formatInteractivityCompact(tpotMs: number): string {
  if (tpotMs <= 0) return '---';
  return (1000 / tpotMs).toFixed(1);
}

/** Format prefill speed (input tok/s/query). */
export function formatPrefillSpeed(tokPerSec: number): string {
  if (tokPerSec <= 0 || !isFinite(tokPerSec)) return '---';
  if (tokPerSec >= 1_000_000) return `${(tokPerSec / 1_000_000).toFixed(1)}M input tok/s/query`;
  if (tokPerSec >= 1_000) return `${(tokPerSec / 1_000).toFixed(1)}K input tok/s/query`;
  return `${Math.round(tokPerSec)} input tok/s/query`;
}

/** Compact prefill speed for tight spaces (no unit). */
export function formatPrefillSpeedCompact(tokPerSec: number): string {
  if (tokPerSec <= 0 || !isFinite(tokPerSec)) return '---';
  if (tokPerSec >= 1_000_000) return `${(tokPerSec / 1_000_000).toFixed(1)}M`;
  if (tokPerSec >= 1_000) return `${(tokPerSec / 1_000).toFixed(1)}K`;
  return `${Math.round(tokPerSec)}`;
}

/** Compute prefill speed from cache tokens and TTFT (ms). Returns input tok/s/query or null. */
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

/** Format a timestamp with timezone for display. */
export function formatTimestamp(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/** Format time-only with timezone. */
export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

export function truncateHash(hash: string, len = 8): string {
  return `${hash.slice(0, len)}...`;
}

export function truncateSessionId(id: string): string {
  // UUIDs have dashes — use the first segment. Hex-only IDs use first 8 chars.
  const prefix = id.includes('-') ? id.split('-')[0] : id.slice(0, 8);
  return `${prefix}...`;
}

/**
 * JSON.stringify with hash_ids arrays rendered inline instead of vertically.
 */
export function formatJsonCompact(obj: unknown): string {
  const raw = JSON.stringify(obj, null, 2);
  // Collapse hash_ids arrays onto single lines
  return raw.replaceAll(/"hash_ids":\s*\[\s*(?<ids>[\s\S]*?)\s*\]/gu, (_match, inner: string) => {
    const ids = inner.replaceAll(/\s+/gu, ' ').trim();
    return `"hash_ids": [${ids}]`;
  });
}
