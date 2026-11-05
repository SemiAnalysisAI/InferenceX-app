import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fixturesMode: false,
  cachedQuery: vi.fn(<T, Args extends unknown[]>(fn: (...args: Args) => Promise<T>) => fn),
  getDataset: vi.fn((_db: unknown, slug: string) =>
    Promise.resolve(slug === 'cc-traces' ? { slug: 'cc-traces', label: 'CC traces' } : null),
  ),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  get FIXTURES_MODE() {
    return mocks.fixturesMode;
  },
  getDb: () => ({}),
}));
vi.mock('@semianalysisai/inferencex-db/queries/datasets', () => ({
  getDataset: mocks.getDataset,
}));
vi.mock('@/lib/cache/api-cache', () => ({ cachedQuery: mocks.cachedQuery }));

import { lookupDatasetPage } from './dataset-pages.server';

describe('lookupDatasetPage', () => {
  beforeEach(() => {
    mocks.fixturesMode = false;
    mocks.getDataset.mockClear();
  });

  it('reads the per-slug dataset cache shared with /api/v1/datasets/[slug]', () => {
    expect(mocks.cachedQuery).toHaveBeenCalledTimes(1);
    expect(mocks.cachedQuery).toHaveBeenCalledWith(expect.any(Function), 'dataset');
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
    mocks.fixturesMode = true;
    await expect(lookupDatasetPage('anything')).resolves.toEqual({ kind: 'unchecked' });
    expect(mocks.getDataset).not.toHaveBeenCalled();
  });
});
