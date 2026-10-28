import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeCollectiveXDataset } from '@semianalysisai/inferencex-db/collectivex/test-fixture';

const { mockGetRun, mockFromRow, mockGetWriteDb, mockCachedJson } = vi.hoisted(() => ({
  mockGetRun: vi.fn(),
  mockFromRow: vi.fn(),
  mockGetWriteDb: vi.fn(() => 'mock-write-sql'),
  mockCachedJson: vi.fn((_request: Request, data: unknown) => Response.json(data)),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getCollectiveXWriteDb: mockGetWriteDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/collectivex', () => ({
  getCollectiveXRun: mockGetRun,
  collectiveXDatasetFromRow: mockFromRow,
}));

vi.mock('@/lib/cache/api-cache', () => ({
  cachedJson: mockCachedJson,
  collectiveXCacheTag: () => 'collectivex',
}));

import { NextRequest } from 'next/server';

import * as route from './route';

const dataset = makeCollectiveXDataset();
const runId = dataset.run.run_id;

function get(url: string, id: string) {
  return route.GET(new NextRequest(new URL(url, 'http://localhost')), {
    params: Promise.resolve({ runId: id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockGetRun.mockResolvedValue({ run_id: runId });
  mockFromRow.mockReturnValue(dataset);
});

describe('GET /api/v1/collectivex/runs/[runId]', () => {
  it('returns 400 for an unknown version or a malformed run id', async () => {
    for (const [url, id] of [
      ['/x', runId],
      ['/x?version=99', runId],
      ['/x?version=1', '0'],
      ['/x?version=1', 'abc'],
    ]) {
      const res = await get(url, id);
      expect(res.status).toBe(400);
    }
    expect(mockGetRun).not.toHaveBeenCalled();
  });

  it('serves a stored run assembled as a dataset under the CollectiveX tag', async () => {
    const res = await get('/x?version=1', runId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(dataset);
    expect(mockGetRun).toHaveBeenCalledWith('mock-write-sql', 1, runId);
    expect(mockCachedJson).toHaveBeenCalledWith(expect.anything(), dataset, { tag: 'collectivex' });
  });

  it('returns 404 for a run that is not stored', async () => {
    mockGetRun.mockResolvedValue(null);
    const res = await get('/x?version=1', '1792089351');
    expect(res.status).toBe(404);
  });

  it('returns 500 without leaking details on DB failure', async () => {
    mockGetRun.mockRejectedValue(new Error('boom'));
    const res = await get('/x?version=1', runId);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });

  it('exposes no mutation handler', () => {
    expect(Object.keys(route)).not.toContain('DELETE');
  });
});
