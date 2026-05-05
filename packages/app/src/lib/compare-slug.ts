import { GPU_KEYS, HW_REGISTRY } from '@semianalysisai/inferencex-constants';

const SEPARATOR = '-vs-';

export interface ComparePair {
  a: string;
  b: string;
}

/** Parse a slug like "h100-vs-h200" into { a, b }. Returns null for invalid input. */
export function parseCompareSlug(slug: string): ComparePair | null {
  if (!slug) return null;
  const lower = slug.toLowerCase();
  const idx = lower.indexOf(SEPARATOR);
  if (idx <= 0) return null;
  const a = lower.slice(0, idx);
  const b = lower.slice(idx + SEPARATOR.length);
  if (!a || !b || a === b) return null;
  if (!GPU_KEYS.has(a) || !GPU_KEYS.has(b)) return null;
  return { a, b };
}

/** Build a slug from two GPU keys. Does NOT canonicalize order. */
export function toCompareSlug(a: string, b: string): string {
  return `${a}${SEPARATOR}${b}`;
}

/**
 * Canonical ordering = alphabetical by GPU key. Stable, easy to verify, matches
 * how external links to these pages will look once search engines crawl them.
 */
export function canonicalCompareSlug(a: string, b: string): string {
  const [first, second] = [a, b].toSorted();
  return toCompareSlug(first, second);
}

/** All canonical (alphabetical, distinct) GPU pairs from HW_REGISTRY. */
export function allCanonicalComparePairs(): ComparePair[] {
  const keys = [...GPU_KEYS].toSorted();
  const pairs: ComparePair[] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      pairs.push({ a: keys[i], b: keys[j] });
    }
  }
  return pairs;
}

/** Display label for a pair, e.g. "H100 vs H200" or "GB200 NVL72 vs MI355X". */
export function compareDisplayLabel(a: string, b: string): string {
  const aLabel = HW_REGISTRY[a]?.label ?? a.toUpperCase();
  const bLabel = HW_REGISTRY[b]?.label ?? b.toUpperCase();
  return `${aLabel} vs ${bLabel}`;
}
