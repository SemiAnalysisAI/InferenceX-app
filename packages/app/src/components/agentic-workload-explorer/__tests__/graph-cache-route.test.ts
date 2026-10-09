import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  computeAndPatchGraphsRefresh: vi.fn(),
  computeAndCacheModels: vi.fn(),
  computeAndCacheOverview: vi.fn(),
  computeAndCacheStatsKind: vi.fn(),
  computeGraphsDataset: vi.fn(),
  computeGraphsSubset: vi.fn(),
  createDirectDb: vi.fn(),
  destroy: vi.fn(),
  getDb: vi.fn(),
  httpDb: { source: 'http' },
  patchStatsCache: vi.fn(),
  readStatsCache: vi.fn(),
  refreshRollupRequestsDaily: vi.fn(),
}));

vi.mock('next/server', () => ({ after: mocks.after }));

vi.mock('@semianalysisai/inferencex-db/proxytrace/connection', () => ({
  createDirectDb: mocks.createDirectDb,
  getDb: mocks.getDb,
}));

vi.mock('@semianalysisai/inferencex-db/proxytrace/stats', () => ({
  computeAndPatchGraphsRefresh: mocks.computeAndPatchGraphsRefresh,
  computeAndCacheModels: mocks.computeAndCacheModels,
  computeAndCacheOverview: mocks.computeAndCacheOverview,
  computeAndCacheStatsKind: mocks.computeAndCacheStatsKind,
  computeGraphsDataset: mocks.computeGraphsDataset,
  computeGraphsSubset: mocks.computeGraphsSubset,
  GRAPH_DATASET_KEYS: ['requestStats', 'hourlyTokens', 'subagentStatsPerSession'],
  patchStatsCache: mocks.patchStatsCache,
  readStatsCache: mocks.readStatsCache,
  refreshRollupRequestsDaily: mocks.refreshRollupRequestsDaily,
  statsCacheKey: (_kind: string, vis: string[] | null, version: number | null) =>
    `graphs:${vis === null ? 'all' : vis.join(',')}:${version ?? 'all'}`,
}));

vi.mock('@semianalysisai/inferencex-db/proxytrace/shared/trace', () => ({
  CURRENT_TRACE_VERSION: 17,
}));

import { GET } from '@/app/api/v1/agentic-workload-explorer/graphs/route';

// The explorer always queries anonymized rows only (ANON_ONLY_VISIBILITY).
const VISIBILITY: string[] = [];
const CACHE_KEY = 'graphs::all';

function graphRequest(include: string): Request {
  const url = new URL(`https://example.test/api/graphs?include=${include}`);
  return Object.assign(new Request(url), { nextUrl: url });
}

describe('graphs GET cache repair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockReturnValue(mocks.httpDb);
    mocks.createDirectDb.mockReturnValue({ destroy: mocks.destroy });
    mocks.destroy.mockResolvedValue(undefined);
    mocks.computeAndPatchGraphsRefresh.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('atomically repairs a missing graph key in an incomplete cache row and reuses it on the next request', async () => {
    const existingRequestStats = { buckets: [{ count: 11 }] };
    const repairedHourlyTokens = { buckets: [{ tokens: 23 }] };
    let persistedData: Record<string, unknown> = {
      requestStats: existingRequestStats,
    };

    mocks.readStatsCache.mockImplementation(() =>
      Promise.resolve({
        cachedAt: new Date(),
        // Every read receives a fresh row snapshot: only the cache patch mock can
        // make the repair durable across requests.
        data: { ...persistedData },
      }),
    );
    mocks.computeGraphsDataset.mockResolvedValue(repairedHourlyTokens);
    mocks.patchStatsCache.mockImplementation(
      (_db: unknown, _key: string, patch: Record<string, unknown>) => {
        persistedData = { ...persistedData, ...patch };
      },
    );

    const firstResponse = await GET(graphRequest('hourlyTokens') as never);
    const secondResponse = await GET(graphRequest('hourlyTokens') as never);

    expect(await firstResponse.json()).toEqual({
      hourlyTokens: repairedHourlyTokens,
    });
    expect(await secondResponse.json()).toEqual({
      hourlyTokens: repairedHourlyTokens,
    });
    expect(mocks.computeGraphsDataset).toHaveBeenCalledOnce();
    expect(mocks.computeGraphsDataset).toHaveBeenCalledWith(
      mocks.httpDb,
      'hourlyTokens',
      VISIBILITY,
      null,
      null,
    );
    expect(mocks.patchStatsCache).toHaveBeenCalledOnce();
    expect(mocks.patchStatsCache).toHaveBeenCalledWith(
      mocks.createDirectDb.mock.results[0]?.value,
      CACHE_KEY,
      { hourlyTokens: repairedHourlyTokens },
    );
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(persistedData).toEqual({
      requestStats: existingRequestStats,
      hourlyTokens: repairedHourlyTokens,
    });
  });
});
