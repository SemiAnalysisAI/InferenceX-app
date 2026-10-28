import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildRunSummary } from '@semianalysisai/inferencex-db/collectivex/reader';
import { makeCollectiveXDataset } from '@semianalysisai/inferencex-db/collectivex/test-fixture';

const { mockList, mockGetWriteDb, mockEnsureList, mockLastOutcome, mockCachedJson, afterTasks } =
  vi.hoisted(() => ({
    mockList: vi.fn(),
    mockGetWriteDb: vi.fn(() => 'mock-write-sql'),
    mockEnsureList: vi.fn(),
    mockLastOutcome: vi.fn(),
    mockCachedJson: vi.fn((_request: Request, data: unknown) => Response.json(data)),
    afterTasks: [] as (() => Promise<unknown>)[],
  }));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  after: (task: () => Promise<unknown>) => afterTasks.push(task),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getCollectiveXWriteDb: mockGetWriteDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/collectivex', () => ({
  listCollectiveXRuns: mockList,
}));

vi.mock('@/lib/collectivex/collectivex-lazy-ingest', () => ({
  ensureCollectiveXRunsList: mockEnsureList,
  lastCollectiveXRunsListOutcome: mockLastOutcome,
  collectiveXSweepErrorStatus: (error: unknown) => {
    const code = error instanceof Error && 'code' in error ? (error.code as string) : null;
    if (code === 'not-found') return 404;
    if (code === 'unavailable') return 503;
    if (code === 'invalid') return 502;
    return null;
  },
}));

vi.mock('@/lib/cache/api-cache', () => ({
  COLLECTIVEX_CACHE_SCOPE: 'collectivex',
  COLLECTIVEX_CACHE_CONTROL: 'public, max-age=0, s-maxage=60',
  cachedJson: mockCachedJson,
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

const summary = buildRunSummary(makeCollectiveXDataset());

beforeEach(() => {
  vi.clearAllMocks();
  afterTasks.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockEnsureList.mockResolvedValue(true);
  mockLastOutcome.mockReturnValue(undefined);
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

  it('serves stored runs at once and discovers after the response', async () => {
    mockLastOutcome.mockReturnValue(true);
    mockEnsureList.mockReturnValue(new Promise(() => {}));

    const res = await GET(req('/api/v1/collectivex/runs?version=1'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 1, runs: [summary], discovery_complete: true });
    expect(mockList).toHaveBeenCalledWith('mock-write-sql', 1);
    expect(mockCachedJson).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ cacheControl: 'public, max-age=0, s-maxage=60' }),
    );
    expect(mockEnsureList).not.toHaveBeenCalled();
    expect(afterTasks).toHaveLength(1);
    void afterTasks[0]!();
    expect(mockEnsureList).toHaveBeenCalledWith(1);
  });

  it('marks the stored list incomplete when the last pass here needed another pass', async () => {
    mockLastOutcome.mockReturnValue(false);

    const res = await GET(req('/api/v1/collectivex/runs?version=1'));

    expect(await res.json()).toEqual({ version: 1, runs: [summary], discovery_complete: false });
    expect(mockLastOutcome).toHaveBeenCalledWith(1);
    expect(mockCachedJson).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ cacheControl: 'private, no-store' }),
    );
    expect(afterTasks).toHaveLength(1);
  });

  it('reads the stored list as incomplete before any pass has finished on this instance', async () => {
    mockEnsureList.mockReturnValue(new Promise(() => {}));

    const res = await GET(req('/api/v1/collectivex/runs?version=1'));

    expect(await res.json()).toEqual({ version: 1, runs: [summary], discovery_complete: false });
    expect(mockCachedJson).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ cacheControl: 'private, no-store' }),
    );
    expect(afterTasks).toHaveLength(1);
  });

  it('logs a failed background pass instead of rejecting', async () => {
    mockEnsureList.mockRejectedValue(sweepError('unavailable'));

    await GET(req('/api/v1/collectivex/runs?version=1'));

    await expect(afterTasks[0]!()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      'CollectiveX background run discovery failed:',
      expect.any(Error),
    );
  });

  it('waits for the first discovery pass when nothing is stored yet', async () => {
    mockList.mockResolvedValueOnce([]).mockResolvedValueOnce([summary]);
    mockEnsureList.mockResolvedValue(false);

    const res = await GET(req('/api/v1/collectivex/runs?version=1'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 1, runs: [summary], discovery_complete: false });
    expect(mockEnsureList).toHaveBeenCalledWith(1);
    expect(mockCachedJson).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ cacheControl: 'private, no-store' }),
    );
    expect(afterTasks).toHaveLength(0);
  });

  it('serves runs persisted before a failed first pass as incomplete', async () => {
    mockList.mockResolvedValueOnce([]).mockResolvedValueOnce([summary]);
    mockEnsureList.mockRejectedValue(sweepError('unavailable'));

    const res = await GET(req('/api/v1/collectivex/runs?version=1'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 1, runs: [summary], discovery_complete: false });
  });

  it('returns 503 when the first pass fails and nothing is stored', async () => {
    mockEnsureList.mockRejectedValue(sweepError('unavailable'));
    mockList.mockResolvedValue([]);
    const res = await GET(req('/api/v1/collectivex/runs?version=1'));
    expect(res.status).toBe(503);
  });

  it('returns an empty list when GitHub has no runs yet', async () => {
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
