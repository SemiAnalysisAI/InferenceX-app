import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeCollectiveXDataset } from '@semianalysisai/inferencex-db/collectivex/test-fixture';

const { mockGetLatest, mockFromRow, mockGetDb, mockEnsureLatest } = vi.hoisted(() => ({
  mockGetLatest: vi.fn(),
  mockFromRow: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
  mockEnsureLatest: vi.fn(),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getCollectiveXDb: mockGetDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/collectivex', () => ({
  getLatestCollectiveXRun: mockGetLatest,
  collectiveXDatasetFromRow: mockFromRow,
}));

vi.mock('@/lib/collectivex-lazy-ingest', () => ({
  ensureLatestCollectiveXRun: mockEnsureLatest,
  collectiveXSweepErrorStatus: (error: unknown) => {
    const code = error instanceof Error && 'code' in error ? (error.code as string) : null;
    if (code === 'not-found') return 404;
    if (code === 'unavailable') return 503;
    if (code === 'invalid') return 502;
    return null;
  },
}));

vi.mock('@/lib/api-cache', () => ({
  COLLECTIVEX_CACHE_SCOPE: 'collectivex',
  COLLECTIVEX_CACHE_CONTROL: 'public, max-age=0, s-maxage=60',
  cachedJson: (data: unknown) => Response.json(data),
  collectiveXCacheTag: () => 'collectivex',
}));

import { NextRequest } from 'next/server';

import { GET } from './route';

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

function sweepError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

const dataset = makeCollectiveXDataset();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockEnsureLatest.mockResolvedValue(undefined);
  mockGetLatest.mockResolvedValue({ run_id: dataset.run.run_id });
  mockFromRow.mockReturnValue(dataset);
});

describe('GET /api/v1/collectivex/latest', () => {
  it('returns 400 for a missing or unknown version', async () => {
    for (const url of ['/api/v1/collectivex/latest', '/api/v1/collectivex/latest?version=99']) {
      const res = await GET(req(url));
      expect(res.status).toBe(400);
    }
    expect(mockEnsureLatest).not.toHaveBeenCalled();
  });

  it('lazily ingests then serves the latest run assembled as a dataset', async () => {
    const res = await GET(req('/api/v1/collectivex/latest?version=1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(dataset);
    expect(mockEnsureLatest).toHaveBeenCalledWith(1);
    expect(mockGetLatest).toHaveBeenCalledWith('mock-sql', 1);
  });

  it('serves the stored run when GitHub discovery fails', async () => {
    mockEnsureLatest.mockRejectedValue(sweepError('unavailable'));
    const res = await GET(req('/api/v1/collectivex/latest?version=1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(dataset);
  });

  it('returns 503 when discovery fails and nothing is stored', async () => {
    mockEnsureLatest.mockRejectedValue(sweepError('unavailable'));
    mockGetLatest.mockResolvedValue(null);
    const res = await GET(req('/api/v1/collectivex/latest?version=1'));
    expect(res.status).toBe(503);
  });

  it('returns 404 when neither GitHub nor the DB has a run', async () => {
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
