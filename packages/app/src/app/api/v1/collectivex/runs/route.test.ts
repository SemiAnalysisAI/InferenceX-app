import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildRunSummary } from '@semianalysisai/inferencex-db/collectivex/reader';
import { makeCollectiveXDataset } from '@semianalysisai/inferencex-db/collectivex/test-fixture';

const { mockList, mockGetDb, mockEnsureList } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
  mockEnsureList: vi.fn(),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getCollectiveXDb: mockGetDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/collectivex', () => ({
  listCollectiveXRuns: mockList,
}));

vi.mock('@/lib/collectivex-lazy-ingest', () => ({
  ensureCollectiveXRunsList: mockEnsureList,
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
}));

import { NextRequest } from 'next/server';

import { GET } from './route';

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

function sweepError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

const summary = buildRunSummary(makeCollectiveXDataset());

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockEnsureList.mockResolvedValue(undefined);
  mockList.mockResolvedValue([summary]);
});

describe('GET /api/v1/collectivex/runs', () => {
  it('returns 400 for a missing or unknown version', async () => {
    for (const url of ['/api/v1/collectivex/runs', '/api/v1/collectivex/runs?version=abc']) {
      const res = await GET(req(url));
      expect(res.status).toBe(400);
    }
    expect(mockEnsureList).not.toHaveBeenCalled();
  });

  it('backfills recent runs then lists stored summaries newest first', async () => {
    const res = await GET(req('/api/v1/collectivex/runs?version=1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 1, runs: [summary] });
    expect(mockEnsureList).toHaveBeenCalledWith(1);
    expect(mockList).toHaveBeenCalledWith('mock-sql', 1);
  });

  it('serves the stored list when the GitHub backfill fails', async () => {
    mockEnsureList.mockRejectedValue(sweepError('unavailable'));
    const res = await GET(req('/api/v1/collectivex/runs?version=1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 1, runs: [summary] });
  });

  it('returns 503 when the backfill fails and nothing is stored', async () => {
    mockEnsureList.mockRejectedValue(sweepError('unavailable'));
    mockList.mockResolvedValue([]);
    const res = await GET(req('/api/v1/collectivex/runs?version=1'));
    expect(res.status).toBe(503);
  });

  it('returns an empty list when GitHub has no runs yet', async () => {
    mockList.mockResolvedValue([]);
    const res = await GET(req('/api/v1/collectivex/runs?version=1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 1, runs: [] });
  });

  it('returns 500 without leaking details on DB failure', async () => {
    mockList.mockRejectedValue(new Error('boom'));
    const res = await GET(req('/api/v1/collectivex/runs?version=1'));
    expect(res.status).toBe(500);
  });
});
