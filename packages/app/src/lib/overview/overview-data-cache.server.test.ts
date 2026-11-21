import { beforeEach, describe, expect, it, vi, mock } from 'bun:test';

const mocks = {
  loadRows: vi.fn(),
  buildCube: vi.fn((_rows: unknown, engineScope: string, modelScope: string) => ({
    engineScope,
    modelScope,
    rows: [],
    history: null,
  })),
  buildHistoricalCube: vi.fn(),
  snapshotDate: vi.fn((): string | null => null),
  sliceCube: vi.fn(
    (
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
  ),
};

mock.module('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>) => {
    const bodies = new Map<string, Promise<string>>();
    return async (...args: unknown[]) => {
      const key = JSON.stringify(args);
      if (!bodies.has(key))
        bodies.set(
          key,
          fn(...args).then((value) => JSON.stringify(value)),
        );
      return JSON.parse(await bodies.get(key)!);
    };
  },
}));

// The factory cannot import the module it replaces, so the real exports are captured first.
const actual = { ...(await import('@semianalysisai/inferencex-constants')) };
mock.module('@semianalysisai/inferencex-constants', () => ({
  ...actual,
  DISPLAY_MODEL_TO_DB: { TestModel: ['test-model'] },
}));

mock.module('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: false }));

mock.module('@/lib/benchmarks/benchmark-data.server', () => ({
  getCachedBenchmarks: mocks.loadRows,
  getCachedBenchmarksAsOf: () => Promise.resolve([]),
}));

mock.module('@/lib/overview/overview-data', () => ({
  applyOverviewHardwareRowScope: (data: object, hardwareRowScope: string) => ({
    ...data,
    hardwareRowScope,
  }),
  applyOverviewRowScope: (data: object, rowScope: string) => ({ ...data, rowScope }),
  buildOverviewCube: mocks.buildCube,
  buildOverviewHistoricalCube: mocks.buildHistoricalCube,
  sliceOverviewCube: mocks.sliceCube,
  OVERVIEW_DEFAULT_COMPARISON_MODE: 'hardware',
  OVERVIEW_DEFAULT_HARDWARE_ROW_SCOPE: 'all',
  OVERVIEW_DEFAULT_MODEL_SCOPE: 'default',
  OVERVIEW_DEFAULT_REFERENCE_HARDWARE: 'b200',
  OVERVIEW_DEFAULT_ROW_SCOPE: 'all',
  OVERVIEW_PRIMARY_TIER: 50,
  overviewHistoricalWindow: () => ({ targetDate: '2026-09-01', earliestDate: '2026-08-01' }),
  overviewModelsForScope: () => ['TestModel'],
  overviewSnapshotDate: mocks.snapshotDate,
}));

// Imported after mock.module so the derived cache is built on the mocked unstable_cache.
const { getOverviewPageData } = await import('./overview-data.server');

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

  it('slices warm requests from the cube it already decoded', async () => {
    mocks.loadRows.mockResolvedValue([{ id: 4 }]);
    mocks.snapshotDate.mockReturnValueOnce('2026-10-01');
    mocks.buildHistoricalCube.mockImplementationOnce(
      (
        _current: unknown,
        _baseline: unknown,
        window: unknown,
        engineScope: string,
        modelScope: string,
      ) => ({
        engineScope,
        modelScope,
        rows: Array.from({ length: 5_000 }, (_, id) => ({ id, label: `row-${id}` })),
        history: { window, baseline: [] },
      }),
    );

    await getOverviewPageData(30, 'all', '7d', 'b200', 'default');
    await getOverviewPageData(75, 'all', '7d', 'gb200', 'default', 'changed');

    const [first, second] = mocks.sliceCube.mock.calls.map(([cube]) => cube);
    expect(mocks.buildHistoricalCube).toHaveBeenCalledOnce();
    expect(first).toMatchObject({ engineScope: 'all', modelScope: 'default' });
    expect(second).toBe(first);
  });
});
