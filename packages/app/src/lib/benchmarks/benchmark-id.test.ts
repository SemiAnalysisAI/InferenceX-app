import { describe, expect, it } from 'vitest';

import { isPersistedBenchmarkId } from './benchmark-id';

describe('isPersistedBenchmarkId', () => {
  it('accepts a positive integer (a real bigserial row id)', () => {
    expect(isPersistedBenchmarkId(1)).toBe(true);
    expect(isPersistedBenchmarkId(206863)).toBe(true);
  });

  it('rejects 0 — bigserial starts at 1, so 0 is never a real row', () => {
    expect(isPersistedBenchmarkId(0)).toBe(false);
  });

  it('rejects negatives', () => {
    expect(isPersistedBenchmarkId(-1)).toBe(false);
  });

  it('rejects NaN (what Number(undefined) yields for overlay rows)', () => {
    expect(isPersistedBenchmarkId(Number(undefined))).toBe(false);
    expect(isPersistedBenchmarkId(NaN)).toBe(false);
  });

  it('rejects non-integers', () => {
    expect(isPersistedBenchmarkId(1.5)).toBe(false);
    expect(isPersistedBenchmarkId(Infinity)).toBe(false);
  });

  it('rejects null / undefined', () => {
    expect(isPersistedBenchmarkId(null)).toBe(false);
    expect(isPersistedBenchmarkId(undefined)).toBe(false);
  });
});
