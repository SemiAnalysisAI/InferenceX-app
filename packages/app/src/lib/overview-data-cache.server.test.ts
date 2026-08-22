import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadRows: vi.fn(),
  assemble: vi.fn(
    (_rows: unknown, tier: number, engineScope: string, referenceHardware: string) => ({
      tier,
      engineScope,
      referenceHardware,
      comparisonMode: 'hardware',
      models: [],
    }),
  ),
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

vi.mock('@semianalysisai/inferencex-constants', () => ({
  DISPLAY_MODEL_TO_DB: { TestModel: ['test-model'] },
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: false }));

vi.mock('@/lib/benchmark-data.server', () => ({
  getCachedBenchmarks: mocks.loadRows,
  getCachedBenchmarksAsOf: vi.fn(),
}));

vi.mock('@/lib/overview-data', () => ({
  applyOverviewHardwareRowScope: (data: unknown) => data,
  applyOverviewRowScope: (data: unknown) => data,
  assembleOverviewHistoricalPageData: vi.fn(),
  assembleOverviewPageData: mocks.assemble,
  OVERVIEW_DEFAULT_COMPARISON_MODE: 'hardware',
  OVERVIEW_DEFAULT_HARDWARE_ROW_SCOPE: 'all',
  OVERVIEW_DEFAULT_MODEL_SCOPE: 'default',
  OVERVIEW_DEFAULT_REFERENCE_HARDWARE: 'b200',
  OVERVIEW_DEFAULT_ROW_SCOPE: 'all',
  OVERVIEW_PRIMARY_TIER: 50,
  overviewHistoricalWindow: vi.fn(),
  overviewModelsForScope: () => ['TestModel'],
  overviewSnapshotDate: vi.fn(),
}));

import { getOverviewPageData } from './overview-data.server';

describe('getOverviewPageData derived cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('canonicalizes omitted defaults and bypasses repeated source work', async () => {
    mocks.loadRows.mockResolvedValueOnce([{ id: 1 }]);

    const implicit = await getOverviewPageData();
    const explicit = await getOverviewPageData(
      50,
      'community',
      'hardware',
      'b200',
      'default',
      'all',
      'all',
    );

    expect(explicit).toBe(implicit);
    expect(mocks.loadRows).toHaveBeenCalledTimes(1);
    expect(mocks.assemble).toHaveBeenCalledTimes(1);
  });

  it('keeps distinct selector states in distinct entries', async () => {
    mocks.loadRows.mockResolvedValue([{ id: 2 }]);

    const tier30 = await getOverviewPageData(30);
    const tier75 = await getOverviewPageData(75);

    expect(tier30.tier).toBe(30);
    expect(tier75.tier).toBe(75);
    expect(mocks.loadRows).toHaveBeenCalledTimes(2);
  });
});
