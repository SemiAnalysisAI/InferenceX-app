import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildRunSummary } from '@semianalysisai/inferencex-db/collectivex/reader';
import { makeCollectiveXDataset } from '@semianalysisai/inferencex-db/collectivex/test-fixture';

const { mockList, mockGetWriteDb, mockCachedJson } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockGetWriteDb: vi.fn(() => 'mock-write-sql'),
  mockCachedJson: vi.fn((data: unknown) => Response.json(data)),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getCollectiveXWriteDb: mockGetWriteDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/collectivex', () => ({
  listCollectiveXRuns: mockList,
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

const summary = buildRunSummary(makeCollectiveXDataset());

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockList.mockResolvedValue([summary]);
});

describe('GET /api/v1/collectivex/runs', () => {
  it('returns 400 for a missing or unknown version', async () => {
    for (const url of ['/api/v1/collectivex/runs', '/api/v1/collectivex/runs?version=99']) {
      const res = await GET(req(url));
      expect(res.status).toBe(400);
    }
    expect(mockList).not.toHaveBeenCalled();
  });

  it('lists stored runs with a complete-discovery flag under the CollectiveX tag', async () => {
    const res = await GET(req('/api/v1/collectivex/runs?version=1'));
    expect(res.status).toBe(200);
    const body = { version: 1, runs: [summary], discovery_complete: true };
    expect(await res.json()).toEqual(body);
    expect(mockList).toHaveBeenCalledWith('mock-write-sql', 1);
    expect(mockCachedJson).toHaveBeenCalledWith(body, { tag: 'collectivex' });
  });

  it('returns an empty list, not an error, when nothing is stored', async () => {
    mockList.mockResolvedValue([]);
    const res = await GET(req('/api/v1/collectivex/runs?version=1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 1, runs: [], discovery_complete: true });
  });

  it('returns 500 without leaking details on DB failure', async () => {
    mockList.mockRejectedValue(new Error('boom'));
    const res = await GET(req('/api/v1/collectivex/runs?version=1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
