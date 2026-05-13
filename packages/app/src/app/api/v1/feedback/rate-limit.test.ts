import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbClient } from '@semianalysisai/inferencex-db/connection';

import { hashIp, incrementHourlyAndGet, isRateLimited, RATE_LIMIT } from './rate-limit';

interface FakeRow {
  count: number;
  windowStart: number;
}

/**
 * In-memory simulator for the on-conflict-update SQL: returns the
 * post-increment count, resetting the window when it has expired.
 */
function makeFakeSql(now: () => number): { sql: DbClient; store: Map<string, FakeRow> } {
  const store = new Map<string, FakeRow>();
  const HOUR = 60 * 60 * 1000;
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?');
    if (text.includes('feedback_rate_limits')) {
      // Index into the joined string lines up with the literal CTE that
      // precedes the insert; the values array first entry is still ipHash.
      const ipHash = String(values[0]);
      const t = now();
      const row = store.get(ipHash);
      const next: FakeRow =
        !row || t - row.windowStart >= HOUR
          ? { count: 1, windowStart: t }
          : { count: row.count + 1, windowStart: row.windowStart };
      store.set(ipHash, next);
      return Promise.resolve([{ count: next.count }]);
    }
    return Promise.resolve([]);
  }) as DbClient;
  return { sql, store };
}

const PEPPER = new Uint8Array(32);

describe('rate-limit', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('hashIp produces a 64-char hex digest deterministically with the same pepper', () => {
    const a = hashIp('203.0.113.5', PEPPER);
    expect(a).toMatch(/^[0-9a-f]{64}$/u);
    expect(hashIp('203.0.113.5', PEPPER)).toBe(a);
    expect(hashIp('203.0.113.6', PEPPER)).not.toBe(a);
  });

  it('hashIp diverges when the pepper changes (peppered, not bare hash)', () => {
    const a = hashIp('203.0.113.5', PEPPER);
    const otherPepper = new Uint8Array(32);
    otherPepper[0] = 1;
    const b = hashIp('203.0.113.5', otherPepper);
    expect(a).not.toBe(b);
  });

  it('isRateLimited triggers strictly above RATE_LIMIT', () => {
    expect(isRateLimited(RATE_LIMIT)).toBe(false);
    expect(isRateLimited(RATE_LIMIT + 1)).toBe(true);
  });

  it('allows up to RATE_LIMIT in a window, rejects the next', async () => {
    const t = 1_000_000;
    const { sql } = makeFakeSql(() => t);
    const ipHash = hashIp('1.1.1.1', PEPPER);
    for (let i = 1; i <= RATE_LIMIT; i++) {
      const c = await incrementHourlyAndGet(sql, ipHash);
      expect(c).toBe(i);
      expect(isRateLimited(c)).toBe(false);
    }
    const c = await incrementHourlyAndGet(sql, ipHash);
    expect(isRateLimited(c)).toBe(true);
  });

  it('resets the count after the 1h window expires', async () => {
    let t = 1_000_000;
    const { sql } = makeFakeSql(() => t);
    const ipHash = hashIp('2.2.2.2', PEPPER);
    for (let i = 0; i < RATE_LIMIT; i++) await incrementHourlyAndGet(sql, ipHash);
    t += 60 * 60 * 1000 + 1;
    const c = await incrementHourlyAndGet(sql, ipHash);
    expect(c).toBe(1);
    expect(isRateLimited(c)).toBe(false);
  });

  it('isolates buckets per IP', async () => {
    const t = 1_000_000;
    const { sql } = makeFakeSql(() => t);
    const a = hashIp('a', PEPPER);
    const b = hashIp('b', PEPPER);
    for (let i = 0; i < RATE_LIMIT; i++) await incrementHourlyAndGet(sql, a);
    expect(isRateLimited(await incrementHourlyAndGet(sql, a))).toBe(true);
    expect(isRateLimited(await incrementHourlyAndGet(sql, b))).toBe(false);
  });
});
