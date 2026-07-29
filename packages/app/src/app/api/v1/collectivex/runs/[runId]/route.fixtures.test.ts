import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildDataset,
  makeCollectiveXDataset,
} from '@semianalysisai/inferencex-db/collectivex/test-fixture';
import { buildRunSummary } from '@semianalysisai/inferencex-db/collectivex/reader';

const { mockLoadFixture } = vi.hoisted(() => ({
  mockLoadFixture: vi.fn(),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  FIXTURES_MODE: true,
  getCollectiveXDb: vi.fn(),
  getCollectiveXWriteDb: vi.fn(),
}));

vi.mock('@semianalysisai/inferencex-db/queries/collectivex', () => ({
  collectiveXDatasetFromRow: vi.fn(),
  deleteCollectiveXRun: vi.fn(),
  getCollectiveXRun: vi.fn(),
}));

vi.mock('@/lib/collectivex-lazy-ingest', () => ({
  collectiveXSweepErrorStatus: vi.fn(),
  ensureCollectiveXRun: vi.fn(),
}));

vi.mock('@/lib/api-cache', () => ({
  COLLECTIVEX_CACHE_CONTROL: 'public, max-age=0, s-maxage=60',
  cachedJson: (data: unknown) => Response.json(data),
  collectiveXCacheTag: () => 'collectivex',
  purgeCollectiveX: vi.fn(),
}));

vi.mock('@/lib/test-fixtures', () => ({
  loadFixture: mockLoadFixture,
}));

import { NextRequest } from 'next/server';

import { GET } from './route';

const latest = makeCollectiveXDataset();
const comparison = buildDataset({ meta: { run_id: '159' } });
const fixtureList = {
  version: 1,
  runs: [buildRunSummary(latest), buildRunSummary(comparison)],
};

function get(runId: string) {
  return GET(new NextRequest(new URL(`/x?version=1`, 'http://localhost')), {
    params: Promise.resolve({ runId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadFixture.mockImplementation((name: string) => {
    if (name === 'collectivex-runs') return fixtureList;
    if (name === 'collectivex-latest') return latest;
    if (name === `collectivex-run-${comparison.run.run_id}`) return comparison;
    throw new Error(`Unexpected fixture: ${name}`);
  });
});

describe('GET /api/v1/collectivex/runs/[runId] in fixture mode', () => {
  it('reuses the latest fixture when its run id was requested', async () => {
    const response = await get(latest.run.run_id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(latest);
    expect(mockLoadFixture).toHaveBeenCalledWith('collectivex-latest');
  });

  it('serves an older dataset from its run-id-keyed fixture', async () => {
    const response = await get(comparison.run.run_id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(comparison);
    expect(mockLoadFixture).toHaveBeenCalledWith(`collectivex-run-${comparison.run.run_id}`);
  });

  it('returns 404 instead of substituting the latest fixture for an unknown run', async () => {
    const response = await get('999');

    expect(response.status).toBe(404);
    expect(mockLoadFixture).toHaveBeenCalledTimes(1);
    expect(mockLoadFixture).toHaveBeenCalledWith('collectivex-runs');
  });
});
