import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadRows: vi.fn(),
  compute: vi.fn(),
  summarize: vi.fn((_: unknown, hardware: string) => ({ hardware })),
}));

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>) => {
    const entries = new Map<string, Promise<unknown>>();
    return (...args: unknown[]) => {
      const key = JSON.stringify(args);
      const existing = entries.get(key);
      if (existing) return existing;
      const value = fn(...args);
      entries.set(key, value);
      return value;
    };
  },
}));

vi.mock('@/lib/benchmark-data.server', () => ({
  getCachedBenchmarks: mocks.loadRows,
}));

vi.mock('@/lib/compare-pair-defaults', () => ({
  pickPairDefaults: () => ({ sequence: '1k/1k', precision: 'fp8' }),
}));

vi.mock('@/lib/compare-ssr', () => ({
  computeCompareTableData: mocks.compute,
  dateRangeForPair: () => ({ oldest: '2026-01-01', newest: '2026-02-01' }),
  summarize: mocks.summarize,
}));

import { getComparePageDerivedData, initialCompareBenchmarkRows } from './compare-page-data.server';

const TABLE = {
  defaultTargets: [10],
  ssrRows: [],
  interactivityRange: { min: 1, max: 2 },
};

describe('getComparePageDerivedData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadRows.mockResolvedValue([{ id: 1, hardware: 'h100' }]);
    mocks.compute.mockReturnValue(TABLE);
  });

  it('reuses one source read while preserving identical derived values', async () => {
    const first = await getComparePageDerivedData(['model-a', 'model-b'], 'h100', 'h200');
    const second = await getComparePageDerivedData(['model-a', 'model-b'], 'h100', 'h200');

    expect(second).toEqual(first);
    expect(mocks.compute).toHaveBeenCalledTimes(2);
    expect(mocks.loadRows).toHaveBeenCalledWith(['model-a', 'model-b']);
    expect(first.initialPairBenchmarkRows).toEqual([{ id: 1, hardware: 'h100' }]);
  });

  it('does not collide distinct meaningful selector states', async () => {
    const defaultData = await getComparePageDerivedData(['model-c'], 'h100', 'h200');
    const selectedData = await getComparePageDerivedData(
      ['model-c'],
      'h100',
      'h200',
      '8k/1k',
      'bf16',
    );

    expect(defaultData.sequence).toBe('1k/1k');
    expect(selectedData.sequence).toBe('8k/1k');
    expect(selectedData.precision).toBe('bf16');
    expect(mocks.loadRows).toHaveBeenCalledTimes(1);
    expect(mocks.compute).toHaveBeenCalledTimes(2);
    expect(mocks.compute).toHaveBeenLastCalledWith(
      [{ id: 1, hardware: 'h100' }],
      'h100',
      'h200',
      '8k/1k',
      'bf16',
    );
  });

  it('keeps the largest fixture GPU pair below the unstable_cache payload limit', () => {
    const rows = JSON.parse(
      readFileSync(new URL('../../cypress/fixtures/api/benchmarks.json', import.meta.url), 'utf8'),
    ) as { hardware: string }[];
    const countByHardware = new Map<string, number>();
    for (const row of rows) {
      countByHardware.set(row.hardware, (countByHardware.get(row.hardware) ?? 0) + 1);
    }
    const largestPair = [...countByHardware.entries()]
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([hardware]) => hardware);
    const pairRows = rows.filter((row) => largestPair.includes(row.hardware));

    expect(Buffer.byteLength(JSON.stringify(pairRows))).toBeLessThan(2 * 1024 * 1024);
  });
});

describe('initialCompareBenchmarkRows', () => {
  it('never seeds slug rows under an overridden model key', () => {
    const rows = [{ hardware: 'h100' }] as never[];

    expect(initialCompareBenchmarkRows('Slug Model', 'Slug Model', rows)).toBe(rows);
    expect(initialCompareBenchmarkRows('Slug Model', 'Override Model', rows)).toBeUndefined();
  });
});
