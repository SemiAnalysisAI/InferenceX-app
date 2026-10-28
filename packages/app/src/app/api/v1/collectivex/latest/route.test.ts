import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeCollectiveXDataset } from '@semianalysisai/inferencex-db/collectivex/test-fixture';

const { mockGetLatest, mockFromRow, mockGetWriteDb, mockCachedJson } = vi.hoisted(() => ({
  mockGetLatest: vi.fn(),
  mockFromRow: vi.fn(),
  mockGetWriteDb: vi.fn(() => 'mock-write-sql'),
  mockCachedJson: vi.fn((_request: Request, data: unknown) => Response.json(data)),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getCollectiveXWriteDb: mockGetWriteDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/collectivex', () => ({
  getLatestCollectiveXRun: mockGetLatest,
  collectiveXDatasetFromRow: mockFromRow,
}));

vi.mock('@/lib/cache/api-cache', () => ({
  cachedJson: mockCachedJson,
  collectiveXCacheTag: () => 'collectivex',
}));

import { NextRequest } from 'next/server';

import { GET } from './route';

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

const dataset = makeCollectiveXDataset();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockGetLatest.mockResolvedValue({ run_id: dataset.run.run_id });
  mockFromRow.mockReturnValue(dataset);
});

describe('GET /api/v1/collectivex/latest', () => {
  it('returns 400 for a missing or unknown version', async () => {
    for (const url of ['/api/v1/collectivex/latest', '/api/v1/collectivex/latest?version=99']) {
      const res = await GET(req(url));
      expect(res.status).toBe(400);
    }
    expect(mockGetLatest).not.toHaveBeenCalled();
  });

  it('serves the newest stored run assembled as a dataset under the CollectiveX tag', async () => {
    const res = await GET(req('/api/v1/collectivex/latest?version=1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(dataset);
    expect(mockGetLatest).toHaveBeenCalledWith('mock-write-sql', 1);
    expect(mockCachedJson).toHaveBeenCalledWith(expect.anything(), dataset, { tag: 'collectivex' });
  });

  it('returns 404 when nothing is stored for the version', async () => {
    mockGetLatest.mockResolvedValue(null);
    const res = await GET(req('/api/v1/collectivex/latest?version=1'));
    expect(res.status).toBe(404);
  });

  it('returns 500 without leaking details on DB failure', async () => {
    mockGetLatest.mockRejectedValue(new Error('boom'));
    const res = await GET(req('/api/v1/collectivex/latest?version=1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
