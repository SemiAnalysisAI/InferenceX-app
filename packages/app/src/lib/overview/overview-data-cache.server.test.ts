import type * as Constants from '@semianalysisai/inferencex-constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadRows: vi.fn(),
  buildCube: vi.fn((_rows: unknown, engineScope: string, modelScope: string) => ({
    engineScope,
    modelScope,
    rows: [],
    history: null,
  })),
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

vi.mock('@semianalysisai/inferencex-constants', async (importOriginal) => ({
  ...(await importOriginal<typeof Constants>()),
  DISPLAY_MODEL_TO_DB: { TestModel: ['test-model'] },
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: false }));

vi.mock('@/lib/benchmarks/benchmark-data.server', () => ({
  getCachedBenchmarks: mocks.loadRows,
  getCachedBenchmarksAsOf: vi.fn(),
}));

vi.mock('@/lib/overview/overview-data', () => ({
  applyOverviewHardwareRowScope: (data: object, hardwareRowScope: string) => ({
    ...data,
    hardwareRowScope,
  }),
  applyOverviewRowScope: (data: object, rowScope: string) => ({ ...data, rowScope }),
  buildOverviewCube: mocks.buildCube,
  buildOverviewHistoricalCube: vi.fn(),
  sliceOverviewCube: (
    cube: { engineScope: string; modelScope: string },
    tier: number,
    referenceHardware: string,
  ) => ({
    tier,
    engineScope: cube.engineScope,
    modelScope: cube.modelScope,
    referenceHardware,
    comparisonMode: 'hardware',
    models: [],
  }),
  OVERVIEW_DEFAULT_COMPARISON_MODE: 'hardware',
  OVERVIEW_DEFAULT_HARDWARE_ROW_SCOPE: 'all',
  OVERVIEW_DEFAULT_MODEL_SCOPE: 'default',
  OVERVIEW_DEFAULT_REFERENCE_HARDWARE: 'b200',
  OVERVIEW_DEFAULT_ROW_SCOPE: 'all',
  OVERVIEW_PRIMARY_TIER: 50,
  overviewHistoricalWindow: vi.fn(),
  overviewModelsForScope: () => ['TestModel'],
  overviewSnapshotDate: () => null,
}));

import { getOverviewPageData } from './overview-data.server';

describe('getOverviewPageData derived cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('canonicalizes omitted defaults and bypasses repeated source work', async () => {
    mocks.loadRows.mockResolvedValue([{ id: 1 }]);

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

    expect(explicit).toEqual(implicit);
    expect(mocks.loadRows).toHaveBeenCalledTimes(1);
    expect(mocks.buildCube).toHaveBeenCalledTimes(1);
  });

  it('slices tier, reference and row scopes from one cached cube', async () => {
    mocks.loadRows.mockResolvedValue([{ id: 2 }]);

    const tier30 = await getOverviewPageData(30, 'all');
    const tier75 = await getOverviewPageData(
      75,
      'all',
      'hardware',
      'b300',
      'default',
      'changed',
      'priced',
    );

    expect(tier30).toMatchObject({ tier: 30, referenceHardware: 'b200', hardwareRowScope: 'all' });
    expect(tier75).toMatchObject({
      tier: 75,
      referenceHardware: 'b300',
      rowScope: 'changed',
      hardwareRowScope: 'priced',
    });
    expect(mocks.loadRows).toHaveBeenCalledTimes(1);
    expect(mocks.buildCube).toHaveBeenCalledTimes(1);
  });

  it('keeps engine, comparison and model scopes in distinct cubes', async () => {
    mocks.loadRows.mockResolvedValue([{ id: 3 }]);

    const community = await getOverviewPageData(50, 'community', 'hardware', 'b200', 'all');
    const all = await getOverviewPageData(50, 'all', 'hardware', 'b200', 'all');
    const history = await getOverviewPageData(50, 'community', '30d', 'b200', 'all');

    expect(community).toMatchObject({ engineScope: 'community', modelScope: 'all' });
    expect(all).toMatchObject({ engineScope: 'all', modelScope: 'all' });
    expect(history.comparisonMode).toBe('30d');
    expect(mocks.loadRows).toHaveBeenCalledTimes(3);
  });
});
