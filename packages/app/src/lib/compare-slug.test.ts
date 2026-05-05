import { describe, it, expect } from 'vitest';

import {
  allCanonicalComparePairs,
  canonicalCompareSlug,
  compareDisplayLabel,
  parseCompareSlug,
  toCompareSlug,
} from './compare-slug';

describe('parseCompareSlug', () => {
  it('parses a valid canonical slug', () => {
    expect(parseCompareSlug('h100-vs-h200')).toEqual({ a: 'h100', b: 'h200' });
  });

  it('parses a non-canonical slug (preserves order)', () => {
    expect(parseCompareSlug('h200-vs-h100')).toEqual({ a: 'h200', b: 'h100' });
  });

  it('handles uppercase input', () => {
    expect(parseCompareSlug('H100-VS-H200')).toEqual({ a: 'h100', b: 'h200' });
  });

  it('returns null for unknown GPU keys', () => {
    expect(parseCompareSlug('a100-vs-h100')).toBeNull();
  });

  it('returns null when both sides are the same GPU', () => {
    expect(parseCompareSlug('h100-vs-h100')).toBeNull();
  });

  it('returns null for malformed slugs', () => {
    expect(parseCompareSlug('h100')).toBeNull();
    expect(parseCompareSlug('')).toBeNull();
    expect(parseCompareSlug('-vs-h100')).toBeNull();
    expect(parseCompareSlug('h100-vs-')).toBeNull();
    expect(parseCompareSlug('h100-and-h200')).toBeNull();
  });

  it('handles AMD GPU keys', () => {
    expect(parseCompareSlug('mi300x-vs-mi325x')).toEqual({ a: 'mi300x', b: 'mi325x' });
  });
});

describe('toCompareSlug', () => {
  it('joins with -vs-', () => {
    expect(toCompareSlug('h100', 'h200')).toBe('h100-vs-h200');
  });

  it('does not canonicalize order', () => {
    expect(toCompareSlug('h200', 'h100')).toBe('h200-vs-h100');
  });
});

describe('canonicalCompareSlug', () => {
  it('returns alphabetical order regardless of input order', () => {
    expect(canonicalCompareSlug('h200', 'h100')).toBe('h100-vs-h200');
    expect(canonicalCompareSlug('h100', 'h200')).toBe('h100-vs-h200');
  });

  it('handles cross-vendor pairs', () => {
    expect(canonicalCompareSlug('mi300x', 'h100')).toBe('h100-vs-mi300x');
  });
});

describe('allCanonicalComparePairs', () => {
  it('produces no duplicates and no self-pairs', () => {
    const pairs = allCanonicalComparePairs();
    const seen = new Set<string>();
    for (const { a, b } of pairs) {
      expect(a).not.toBe(b);
      expect(a < b).toBe(true);
      const key = `${a}|${b}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('count = n*(n-1)/2', () => {
    const pairs = allCanonicalComparePairs();
    // GPU_KEYS currently has 9 entries → 9*8/2 = 36
    // Test the formula rather than the literal count so this stays valid
    // when new GPUs are added.
    const seenKeys = new Set<string>();
    for (const { a, b } of pairs) {
      seenKeys.add(a);
      seenKeys.add(b);
    }
    const n = seenKeys.size;
    expect(pairs.length).toBe((n * (n - 1)) / 2);
  });
});

describe('compareDisplayLabel', () => {
  it('uses HW_REGISTRY labels', () => {
    expect(compareDisplayLabel('h100', 'h200')).toBe('H100 vs H200');
    expect(compareDisplayLabel('gb200', 'mi355x')).toBe('GB200 NVL72 vs MI355X');
  });
});
