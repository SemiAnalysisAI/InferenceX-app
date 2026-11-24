import { beforeEach, describe, expect, it, vi, mock } from 'bun:test';

const mocks = {
  cachedQuery: vi.fn(
    <T, Args extends unknown[]>(fn: (...args: Args) => Promise<T>, _keyPrefix: string) => fn,
  ),
  getDataset: vi.fn((_db: unknown, slug: string) =>
    Promise.resolve(slug === 'cc-traces' ? { slug: 'cc-traces', label: 'CC traces' } : null),
  ),
};

// bun:test snapshots mocked exports, so a getter would be read once. Re-mocking the module
// updates the FIXTURES_MODE binding the code under test already imported.
function mockConnection(fixturesMode: boolean) {
  mock.module('@semianalysisai/inferencex-db/connection', () => ({
    FIXTURES_MODE: fixturesMode,
    getDb: () => ({}),
  }));
}
mockConnection(false);
mock.module('@semianalysisai/inferencex-db/queries/datasets', () => ({
  getDataset: mocks.getDataset,
}));
mock.module('@/lib/cache/api-cache', () => ({ cachedQuery: mocks.cachedQuery }));

// Imported after the mocks: the dataset cache is created with cachedQuery when the module loads.
const { lookupDatasetPage } = await import('./dataset-pages.server');

// Keep the calls made while the module loaded, before any test clears mock history.
const moduleLoadCachedQueryCalls = [...mocks.cachedQuery.mock.calls];

describe('lookupDatasetPage', () => {
  beforeEach(() => {
    mockConnection(false);
    mocks.getDataset.mockClear();
  });

  it('reads the per-slug dataset cache shared with /api/v1/datasets/[slug]', () => {
    expect(moduleLoadCachedQueryCalls).toEqual([[expect.any(Function), 'dataset']]);
  });

  it('finds ingested datasets with a lookup for that slug alone', async () => {
    await expect(lookupDatasetPage('cc-traces')).resolves.toMatchObject({
      kind: 'found',
      record: { label: 'CC traces' },
    });
    expect(mocks.getDataset).toHaveBeenCalledExactlyOnceWith({}, 'cc-traces');
  });

  it('reports unknown slugs as missing so the page can 404 instead of a soft-404', async () => {
    await expect(lookupDatasetPage('does-not-exist')).resolves.toEqual({ kind: 'missing' });
    expect(mocks.getDataset).toHaveBeenCalledExactlyOnceWith({}, 'does-not-exist');
  });

  it('skips the database in fixture builds', async () => {
    mockConnection(true);
    await expect(lookupDatasetPage('anything')).resolves.toEqual({ kind: 'unchecked' });
    expect(mocks.getDataset).not.toHaveBeenCalled();
  });
});
