import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeCollectiveXDataset } from '@semianalysisai/inferencex-db/collectivex/test-fixture';

const { mockGetRun, mockDelete, mockFromRow, mockGetDb, mockGetWriteDb, mockPurge, mockEnsureRun } =
  vi.hoisted(() => ({
    mockGetRun: vi.fn(),
    mockDelete: vi.fn(),
    mockFromRow: vi.fn(),
    mockGetDb: vi.fn(() => 'mock-sql'),
    mockGetWriteDb: vi.fn(() => 'mock-write-sql'),
    mockPurge: vi.fn(() => Promise.resolve(0)),
    mockEnsureRun: vi.fn(),
  }));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getCollectiveXDb: mockGetDb,
  getCollectiveXWriteDb: mockGetWriteDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/collectivex', () => ({
  getCollectiveXRun: mockGetRun,
  deleteCollectiveXRun: mockDelete,
  collectiveXDatasetFromRow: mockFromRow,
}));

vi.mock('@/lib/collectivex-lazy-ingest', () => ({
  ensureCollectiveXRun: mockEnsureRun,
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
  purgeCollectiveX: mockPurge,
}));

import { NextRequest } from 'next/server';

import { DELETE, GET } from './route';

const SECRET = 'test-admin-secret';
const dataset = makeCollectiveXDataset();
const runId = dataset.run.run_id;

function sweepError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

function get(url: string, id: string) {
  return GET(new NextRequest(new URL(url, 'http://localhost')), {
    params: Promise.resolve({ runId: id }),
  });
}

function del(id: string, token?: string) {
  return DELETE(
    new NextRequest(new URL(`/api/v1/collectivex/runs/${id}`, 'http://localhost'), {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
    { params: Promise.resolve({ runId: id }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('COLLECTIVEX_ADMIN_SECRET', SECRET);
  mockEnsureRun.mockResolvedValue(undefined);
  mockGetRun.mockResolvedValue({ run_id: runId });
  mockFromRow.mockReturnValue(dataset);
  mockDelete.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/v1/collectivex/runs/[runId]', () => {
  it('returns 400 for malformed version or run id', async () => {
    const badRunId = await get(`/x?version=1`, 'abc');
    const badVersion = await get(`/x?version=99`, runId);
    expect(badRunId.status).toBe(400);
    expect(badVersion.status).toBe(400);
    expect(mockEnsureRun).not.toHaveBeenCalled();
  });

  it('lazily ingests then serves the run assembled as a dataset', async () => {
    const res = await get(`/x?version=1`, runId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(dataset);
    expect(mockEnsureRun).toHaveBeenCalledWith(1, runId);
    expect(mockGetRun).toHaveBeenCalledWith('mock-sql', 1, runId);
  });

  it.each([
    ['not-found', 404],
    ['unavailable', 503],
    ['invalid', 502],
  ] as const)('maps %s ingest failures without exposing details', async (code, status) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockEnsureRun.mockRejectedValue(sweepError(code));
    mockGetRun.mockResolvedValue(null);
    const res = await get(`/x?version=1`, runId);
    expect(res.status).toBe(status);
  });

  it('serves a stored run when its GitHub refresh fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockEnsureRun.mockRejectedValue(sweepError('unavailable'));

    const res = await get(`/x?version=1`, runId);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(dataset);
  });

  it('returns 404 when the run is absent after a clean ensure', async () => {
    mockGetRun.mockResolvedValue(null);
    const res = await get(`/x?version=1`, runId);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/collectivex/runs/[runId]', () => {
  it('rejects missing or wrong bearer tokens', async () => {
    const missing = await del(runId);
    const wrong = await del(runId, 'wrong-token');
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('rejects all requests when the secret is not configured', async () => {
    vi.stubEnv('COLLECTIVEX_ADMIN_SECRET', '');
    const res = await del(runId, '');
    expect(res.status).toBe(401);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('tombstones the run and purges only the CollectiveX cache scope', async () => {
    const res = await del(runId, SECRET);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true, runId });
    expect(mockDelete).toHaveBeenCalledWith('mock-write-sql', runId);
    expect(mockPurge).toHaveBeenCalledTimes(1);
  });

  it('returns 404 without purging when the run does not exist', async () => {
    mockDelete.mockResolvedValue(false);
    const res = await del(runId, SECRET);
    expect(res.status).toBe(404);
    expect(mockPurge).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed run ids', async () => {
    const res = await del('not-a-run-id', SECRET);
    expect(res.status).toBe(400);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
