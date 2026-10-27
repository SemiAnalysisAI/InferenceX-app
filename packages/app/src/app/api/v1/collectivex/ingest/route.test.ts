import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as CommittedResults from '@semianalysisai/inferencex-db/collectivex/committed-results';

const { mockResolve, mockLoad, mockUpsert, mockGetWriteDb, mockPurge } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockLoad: vi.fn(),
  mockUpsert: vi.fn(),
  mockGetWriteDb: vi.fn(() => 'mock-write-sql'),
  mockPurge: vi.fn(),
}));

vi.mock('@semianalysisai/inferencex-db/collectivex/committed-results', async (importOriginal) => ({
  ...(await importOriginal<typeof CommittedResults>()),
  resolveResultsCommit: mockResolve,
  loadCommittedRun: mockLoad,
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getCollectiveXWriteDb: mockGetWriteDb,
}));

vi.mock('@semianalysisai/inferencex-db/queries/collectivex', () => ({
  upsertCollectiveXRun: mockUpsert,
}));

vi.mock('@/lib/cache/api-cache', () => ({
  purgeCollectiveX: mockPurge,
}));

import { CommittedResultsError } from '@semianalysisai/inferencex-db/collectivex/committed-results';

import { POST } from './route';

const SECRET = 'test-admin-secret';
const SHA = 'c'.repeat(40);
const commit = { sha: SHA, committedAt: '2026-10-15T18:35:51Z' };
const run = {
  run_id: '1792089351',
  run_attempt: 1,
  version: 1,
  generated_at: '2026-10-15T18:35:51Z',
  source_sha: SHA,
  source_branch: 'main',
  conclusion: 'success',
  matrix: {},
  summary: { requested_cases: 195, measured_cases: 2 },
};

function post(body: unknown, authorization: string | null = `Bearer ${SECRET}`) {
  return POST(
    new Request('http://localhost/api/v1/collectivex/ingest', {
      method: 'POST',
      headers: authorization === null ? {} : { Authorization: authorization },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubEnv('COLLECTIVEX_ADMIN_SECRET', SECRET);
  vi.stubEnv('GITHUB_TOKEN', 'gh-token');
  mockResolve.mockResolvedValue(commit);
  mockLoad.mockResolvedValue({ run, docs: [{}, {}] });
  mockUpsert.mockResolvedValue('inserted');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/v1/collectivex/ingest', () => {
  it('returns 500 when COLLECTIVEX_ADMIN_SECRET is not set', async () => {
    vi.stubEnv('COLLECTIVEX_ADMIN_SECRET', '');
    const res = await post({ sha: SHA });
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('COLLECTIVEX_ADMIN_SECRET is not set');
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it.each([
    ['no Authorization header', null],
    ['a wrong secret', 'Bearer wrong-secret'],
    ['the secret without the Bearer scheme', SECRET],
  ])('returns 401 with %s and does nothing', async (_name, authorization) => {
    const res = await post({ sha: SHA }, authorization);
    expect(res.status).toBe(401);
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockPurge).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty object', {}],
    ['both sha and ref', { sha: SHA, ref: 'main' }],
    ['a malformed sha', { sha: 'not-hex' }],
    ['a ref with ..', { ref: 'main/../x' }],
    ['an extra field', { ref: 'main', force: true }],
    ['an array', [SHA]],
    ['invalid JSON', '{'],
  ])('returns 400 for %s', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('stores the resolved results commit and purges the CollectiveX cache', async () => {
    const res = await post({ sha: SHA });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ingested: 'inserted',
      run_id: run.run_id,
      source_sha: SHA,
      generated_at: run.generated_at,
      version: 1,
      requested_cases: 195,
      measured_cases: 2,
      documents: 2,
    });
    expect(mockResolve).toHaveBeenCalledWith(SHA, { token: 'gh-token' });
    expect(mockLoad).toHaveBeenCalledWith(commit, { token: 'gh-token' });
    expect(mockUpsert).toHaveBeenCalledWith('mock-write-sql', run, [{}, {}]);
    expect(mockPurge).toHaveBeenCalledOnce();
  });

  it('accepts a ref and reports a replaced run', async () => {
    mockUpsert.mockResolvedValue('replaced');
    const res = await post({ ref: 'main' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ingested).toBe('replaced');
    expect(mockResolve).toHaveBeenCalledWith('main', { token: 'gh-token' });
  });

  it('returns 409 and keeps the cache when the run id belongs to another commit', async () => {
    mockUpsert.mockResolvedValue('conflict');
    const res = await post({ sha: SHA });
    expect(res.status).toBe(409);
    expect(mockPurge).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid', 422],
    ['not-found', 404],
    ['unavailable', 502],
  ] as const)('maps a %s results error to %i without writing', async (kind, status) => {
    mockLoad.mockRejectedValue(new CommittedResultsError(kind, `${kind} detail`));
    const res = await post({ sha: SHA });
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: `${kind} detail` });
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockPurge).not.toHaveBeenCalled();
  });

  it('returns 500 without leaking details on DB failure', async () => {
    mockUpsert.mockRejectedValue(new Error('connection string leaked'));
    const res = await post({ sha: SHA });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
