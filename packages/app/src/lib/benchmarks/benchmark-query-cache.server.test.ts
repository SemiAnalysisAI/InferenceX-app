import { describe, expect, it, vi } from 'vitest';

const keys: string[] = [];

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  FIXTURES_MODE: false,
  getDb: vi.fn(() => ({})),
}));

vi.mock('@semianalysisai/inferencex-db/queries/benchmarks', () => ({
  getLatestBenchmarks: vi.fn(() => Promise.resolve([])),
  getBenchmarksForRun: vi.fn(() => Promise.resolve([])),
  getAllBenchmarksForHistory: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/lib/cache/api-cache', () => ({
  cachedQuery: (fn: unknown, key: string) => {
    keys.push(key);
    return fn;
  },
}));

describe('benchmark-query-cache.server', () => {
  it('declares each shared cache slot once, under the page-endpoint keys', async () => {
    await import('./benchmark-query-cache.server');
    expect(keys.toSorted()).toEqual([
      'benchmark-history',
      'benchmark-history-agentic-curve-scope-v2',
      'benchmarks-agentic-curve-scope-v2',
      'benchmarks-calculator-agentic-curve-scope-v2',
      'benchmarks-run-agentic-curve-scope-v2',
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
