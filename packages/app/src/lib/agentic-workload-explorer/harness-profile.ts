import { HARNESSES, type Harness } from '@semianalysisai/inferencex-db/proxytrace/shared/harness';

/** Same hues as the harness badges on /sessions and the /graphs harness stack. */
export const HARNESS_COLORS: Record<Harness, string> = {
  'claude-code': '#f97316',
  codex: '#8b5cf6',
  pi: '#10b981',
  omp: '#0ea5e9',
  other: '#a1a1aa',
};

export interface LogBucket {
  bucket: number;
  count: number;
}

export interface ShareRow {
  key: string | null;
  count: number;
}

/** Harnesses present in `rows`, in canonical order. */
export function presentHarnesses(rows: { harness: Harness }[]): Harness[] {
  const seen = new Set(rows.map((r) => r.harness));
  return HARNESSES.filter((h) => seen.has(h));
}

/** Quantile read off log buckets, interpolated geometrically inside the bucket. */
export function bucketQuantile(buckets: LogBucket[], perDecade: number, q: number): number | null {
  const sorted = buckets.toSorted((a, b) => a.bucket - b.bucket);
  const total = sorted.reduce((sum, b) => sum + b.count, 0);
  if (total === 0) return null;
  const target = q * total;
  let running = 0;
  for (const b of sorted) {
    if (running + b.count >= target) {
      const within = b.count > 0 ? (target - running) / b.count : 0;
      return 10 ** ((b.bucket + within) / perDecade);
    }
    running += b.count;
  }
  return 10 ** ((sorted.at(-1)!.bucket + 1) / perDecade);
}

/**
 * The `n` largest keys with their share of the total, plus one `restLabel`
 * row holding everything else (omitted when empty).
 */
export function topShares(
  rows: ShareRow[],
  n: number,
  restLabel = 'other',
): { key: string | null; count: number; share: number }[] {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (total === 0) return [];
  const sorted = rows.toSorted((a, b) => b.count - a.count);
  const top = sorted.slice(0, n);
  const rest = sorted.slice(n).reduce((sum, r) => sum + r.count, 0);
  const out = top.map((r) => ({ ...r, share: r.count / total }));
  if (rest > 0) out.push({ key: restLabel, count: rest, share: rest / total });
  return out;
}
