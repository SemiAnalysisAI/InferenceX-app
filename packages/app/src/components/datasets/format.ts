/**
 * Compact number formatter for dataset token/count displays:
 * 1234 → "1.2k", 1_200_000 → "1.2M", 3.2e9 → "3.2B", 0.82 → "0.82".
 */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  if (abs > 0 && abs < 1) return n.toFixed(2);
  return String(Math.round(n));
}

/** Format a per-conversation count without hiding a meaningful fractional mean. */
export function perConversation(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** Format a 0–1 fraction as a whole percent ("42%"), em dash when absent. */
export function formatPct(fraction: number | undefined): string {
  return typeof fraction === 'number' ? `${(fraction * 100).toFixed(0)}%` : '—';
}

/** Percent share of `part` in `total` ("42%"), em dash when `total` is 0. */
export function formatShare(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(0)}%` : '—';
}
