import AdmZip from 'adm-zip';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeRawMatrix, makeRawShard } from '@/components/collectivex/test-fixture';

const { mockGetStates, mockInsert, mockRefresh, mockGetDb, mockGetWriteDb } = vi.hoisted(() => ({
  mockGetStates: vi.fn(),
  mockInsert: vi.fn(),
  mockRefresh: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
  mockGetWriteDb: vi.fn(() => 'mock-write-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getCollectiveXDb: mockGetDb,
  getCollectiveXWriteDb: mockGetWriteDb,
}));

vi.mock('@semianalysisai/inferencex-db/queries/collectivex', () => ({
  getCollectiveXRunStates: mockGetStates,
  insertCollectiveXRun: mockInsert,
  refreshCollectiveXRunAttempt: mockRefresh,
}));

import {
  collectiveXSweepErrorCode,
  ensureCollectiveXRun,
  ensureCollectiveXRunsList,
  ensureLatestCollectiveXRun,
  resetCollectiveXDiscoveryCooldown,
} from './collectivex-lazy-ingest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Two current matrix shards: NVIDIA scale-up EP8 + AMD scale-out EP16.
const shardA = makeRawShard({ backend: 'deepep-v2', ep: 8 });
const shardB = makeRawShard({
  sku: 'mi355x',
  backend: 'mori',
  implName: 'mori',
  vendor: 'amd',
  ep: 16,
  scaleUpTransport: 'xgmi',
  scaleOutTransport: 'rdma',
  topologyClass: 'mi355x-xgmi-rdma',
  nodes: 2,
  gpusPerNode: 8,
  scaleUpDomain: 8,
});

function requestedOf(shard: Record<string, unknown>) {
  const identity = shard.identity as Record<string, unknown>;
  const factors = identity.case_factors as Record<string, unknown>;
  return {
    caseId: identity.case_id as string,
    sku: factors.sku as string,
    disposition: 'runnable' as const,
    case: factors.case as Record<string, unknown>,
  };
}

const matrix = makeRawMatrix([requestedOf(shardA), requestedOf(shardB)]);
const matrixV2 = makeRawMatrix([requestedOf(shardA), requestedOf(shardB)], 2);

function zipDocs(...docs: unknown[]): ArrayBuffer {
  const zip = new AdmZip();
  docs.forEach((doc, index) => zip.addFile(`doc-${index}.json`, Buffer.from(JSON.stringify(doc))));
  const bytes = zip.toBuffer();
  const archive = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(archive).set(bytes);
  return archive;
}

const matrixZip = zipDocs(matrix);
const matrixZipV2 = zipDocs(matrixV2);
const shardZip = zipDocs(shardA, shardB);
const shardZipV2 = zipDocs({ ...shardA, version: 2 }, { ...shardB, version: 2 });

function runObject(overrides: Record<string, unknown> = {}) {
  return {
    id: 160,
    name: 'CollectiveX Sweep',
    path: '.github/workflows/collectivex-sweep.yml',
    // Deliberately a feature branch: lazy ingest accepts runs from ANY branch.
    head_branch: 'collectivex-fp8-precision',
    head_sha: 'a'.repeat(40),
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/** One page of the run listing. A Response body reads once, so build a fresh one per call. */
function runListing(...runs: ReturnType<typeof runObject>[]) {
  return Response.json({ total_count: runs.length, workflow_runs: runs });
}

const twoRunListing = () => runListing(runObject({ id: 161 }), runObject({ id: 160 }));

function artifactsBody(runId = 160, runAttempt = 1) {
  return {
    total_count: 2,
    artifacts: [
      {
        id: 1,
        name: `cxsweep-matrix-${runId}`,
        archive_download_url: 'https://example.test/matrix.zip',
        expired: false,
      },
      {
        id: 2,
        name: `cxshard-cases-${runId}-${runAttempt}`,
        archive_download_url: 'https://example.test/shards.zip',
        expired: false,
      },
    ],
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  mockGetStates.mockReset().mockResolvedValue({});
  mockInsert.mockReset().mockResolvedValue(true);
  mockRefresh.mockReset().mockResolvedValue(true);
  process.env.GITHUB_TOKEN = 'test-token';
  // Module-level state outlives a case; without this every test after the first
  // would be answered from the discovery cooldown and issue no requests.
  resetCollectiveXDiscoveryCooldown();
});

afterAll(() => {
  delete process.env.GITHUB_TOKEN;
  vi.unstubAllGlobals();
});

describe('ensureLatestCollectiveXRun', () => {
  it('discovers the newest absent run and persists its raw documents', async () => {
    mockFetch
      .mockResolvedValueOnce(Response.json({ total_count: 1, workflow_runs: [runObject()] }))
      .mockResolvedValueOnce(Response.json(artifactsBody()))
      .mockResolvedValueOnce(new Response(matrixZip))
      .mockResolvedValueOnce(new Response(shardZip));

    await ensureLatestCollectiveXRun(1);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const [sql, run, docs] = mockInsert.mock.calls[0];
    expect(sql).toBe('mock-write-sql');
    expect(run).toMatchObject({
      run_id: '160',
      run_attempt: 1,
      version: 1,
      source_branch: 'collectivex-fp8-precision',
      conclusion: 'success',
      matrix,
    });
    expect(run.summary).toMatchObject({ run_id: '160', measured_cases: 2 });
    expect(docs).toEqual([shardA, shardB]);
  });

  it('stops without artifact downloads when the newest matching run is live', async () => {
    mockGetStates.mockResolvedValue({ '160': { state: 'live', version: 1, run_attempt: 1 } });
    mockFetch.mockResolvedValueOnce(
      Response.json({ total_count: 1, workflow_runs: [runObject()] }),
    );

    await ensureLatestCollectiveXRun(1);

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('never re-ingests a tombstoned run — the next candidate wins', async () => {
    mockGetStates.mockImplementation((_sql: unknown, ids: string[]) =>
      Promise.resolve(
        ids[0] === '161' ? { '161': { state: 'deleted', version: 1, run_attempt: 1 } } : {},
      ),
    );
    mockFetch
      .mockResolvedValueOnce(twoRunListing())
      .mockResolvedValueOnce(Response.json(artifactsBody()))
      .mockResolvedValueOnce(new Response(matrixZip))
      .mockResolvedValueOnce(new Response(shardZip));

    await ensureLatestCollectiveXRun(1);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.calls[0][1].run_id).toBe('160');
  });

  it('skips runs tagged for another version', async () => {
    mockFetch
      .mockResolvedValueOnce(twoRunListing())
      // Run 161 carries a v2 matrix — requesting v1 must move on.
      .mockResolvedValueOnce(Response.json(artifactsBody(161)))
      .mockResolvedValueOnce(new Response(matrixZipV2))
      .mockResolvedValueOnce(new Response(shardZipV2))
      .mockResolvedValueOnce(Response.json(artifactsBody()))
      .mockResolvedValueOnce(new Response(matrixZip))
      .mockResolvedValueOnce(new Response(shardZip));

    await ensureLatestCollectiveXRun(1);

    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockInsert.mock.calls[0][1]).toMatchObject({ version: 2, run_id: '161' });
    expect(mockInsert.mock.calls[1][1]).toMatchObject({ version: 1, run_id: '160' });
  });

  it('refreshes a live run when GitHub reports a newer attempt', async () => {
    mockGetStates.mockResolvedValue({ '160': { state: 'live', version: 1, run_attempt: 1 } });
    mockFetch
      .mockResolvedValueOnce(
        Response.json({ total_count: 1, workflow_runs: [runObject({ run_attempt: 2 })] }),
      )
      .mockResolvedValueOnce(Response.json(artifactsBody(160, 2)))
      .mockResolvedValueOnce(new Response(matrixZip))
      .mockResolvedValueOnce(new Response(shardZip));

    await ensureLatestCollectiveXRun(1);

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefresh.mock.calls[0][1]).toMatchObject({ run_id: '160', run_attempt: 2 });
  });

  it('downloads only the highest usable attempt per shard', async () => {
    const artifacts = {
      total_count: 3,
      artifacts: [
        {
          id: 1,
          name: 'cxsweep-matrix-160',
          archive_download_url: 'https://example.test/matrix.zip',
          expired: false,
        },
        {
          id: 2,
          name: 'cxshard-cases-160-1',
          archive_download_url: 'https://example.test/shard-attempt1.zip',
          expired: false,
        },
        {
          id: 3,
          name: 'cxshard-cases-160-2',
          archive_download_url: 'https://example.test/shard-attempt2.zip',
          expired: false,
        },
      ],
    };
    mockFetch
      .mockResolvedValueOnce(
        Response.json({ total_count: 1, workflow_runs: [runObject({ run_attempt: 2 })] }),
      )
      .mockResolvedValueOnce(Response.json(artifacts))
      .mockResolvedValueOnce(new Response(matrixZip))
      .mockResolvedValueOnce(new Response(shardZip));

    await ensureLatestCollectiveXRun(1);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    // 4 fetches total: runs, artifacts, matrix, ONE shard — the attempt-1
    // archive is superseded and never downloaded.
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch.mock.calls[3][0]).toBe('https://example.test/shard-attempt2.zip');
  });

  it('classifies a matrix artifact without a matrix document as invalid', async () => {
    mockFetch
      .mockResolvedValueOnce(Response.json({ total_count: 1, workflow_runs: [runObject()] }))
      .mockResolvedValueOnce(Response.json(artifactsBody()))
      .mockResolvedValueOnce(new Response(zipDocs({ record_type: 'samples' })));

    const caught = await ensureLatestCollectiveXRun(1).catch((error: unknown) => error);
    expect(collectiveXSweepErrorCode(caught)).toBe('invalid');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('reports GitHub outages as unavailable', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 500 }));
    const caught = await ensureLatestCollectiveXRun(1).catch((error: unknown) => error);
    expect(collectiveXSweepErrorCode(caught)).toBe('unavailable');
  });

  it('reports a missing GITHUB_TOKEN as unavailable', async () => {
    delete process.env.GITHUB_TOKEN;
    const caught = await ensureLatestCollectiveXRun(1).catch((error: unknown) => error);
    expect(collectiveXSweepErrorCode(caught)).toBe('unavailable');
  });
});

describe('discovery cooldown', () => {
  it('serves a warm target from the cooldown without calling GitHub again', async () => {
    mockGetStates.mockResolvedValue({ '160': { state: 'live', version: 1, run_attempt: 1 } });
    mockFetch.mockImplementation(() => Promise.resolve(runListing(runObject())));

    await ensureLatestCollectiveXRun(1);
    const afterFirst = mockFetch.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    await ensureLatestCollectiveXRun(1);
    await ensureLatestCollectiveXRun(1);
    expect(mockFetch.mock.calls.length).toBe(afterFirst);
  });

  it('walks again once the cooldown window has elapsed', async () => {
    vi.useFakeTimers();
    try {
      mockGetStates.mockResolvedValue({ '160': { state: 'live', version: 1, run_attempt: 1 } });
      mockFetch.mockImplementation(() => Promise.resolve(runListing(runObject())));

      await ensureLatestCollectiveXRun(1);
      const afterFirst = mockFetch.mock.calls.length;

      vi.advanceTimersByTime(61_000);
      await ensureLatestCollectiveXRun(1);
      expect(mockFetch.mock.calls.length).toBeGreaterThan(afterFirst);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rethrows a remembered failure so an outage stays 502/503 rather than 404', async () => {
    mockFetch.mockResolvedValue(new Response('nope', { status: 500 }));

    const first = await ensureLatestCollectiveXRun(1).catch((error: unknown) => error);
    expect(collectiveXSweepErrorCode(first)).toBe('unavailable');
    const afterFirst = mockFetch.mock.calls.length;

    // Same error object, and no fresh requests while the failure window holds.
    const second = await ensureLatestCollectiveXRun(1).catch((error: unknown) => error);
    expect(second).toBe(first);
    expect(mockFetch.mock.calls.length).toBe(afterFirst);
  });
});

describe('ensureCollectiveXRunsList', () => {
  it('bounds GitHub discovery to runs that could still have rerun artifacts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-29T00:00:00.000Z');
    try {
      mockFetch.mockResolvedValueOnce(runListing());

      await expect(ensureCollectiveXRunsList(1)).resolves.toBe(true);

      const discoveryUrl = new URL(mockFetch.mock.calls[0][0] as string);
      expect(discoveryUrl.searchParams.get('created')).toBe('>=2026-06-15T00:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not probe artifacts for unknown runs beyond the retention window', async () => {
    mockFetch.mockResolvedValueOnce(runListing(runObject({ updated_at: '2020-01-01T00:00:00Z' })));

    await expect(ensureCollectiveXRunsList(1)).resolves.toBe(true);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockGetStates).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('continues past more than eight known rows to backfill an older run', async () => {
    const runs = Array.from({ length: 10 }, (_unused, index) => runObject({ id: 169 - index }));
    mockGetStates.mockImplementation((_sql: unknown, ids: string[]) =>
      Promise.resolve(
        ids[0] === '160' ? {} : { [ids[0]]: { state: 'live', version: 1, run_attempt: 1 } },
      ),
    );
    mockFetch
      .mockResolvedValueOnce(runListing(...runs))
      .mockResolvedValueOnce(Response.json(artifactsBody()))
      .mockResolvedValueOnce(new Response(matrixZip))
      .mockResolvedValueOnce(new Response(shardZip));

    const complete = await ensureCollectiveXRunsList(1);

    expect(complete).toBe(true);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.calls[0][1].run_id).toBe('160');
  });

  it('continues past one malformed run instead of hiding later valid runs', async () => {
    mockFetch
      .mockResolvedValueOnce(twoRunListing())
      .mockResolvedValueOnce(Response.json(artifactsBody(161)))
      .mockResolvedValueOnce(new Response(zipDocs({ record_type: 'samples' })))
      .mockResolvedValueOnce(Response.json(artifactsBody()))
      .mockResolvedValueOnce(new Response(matrixZip))
      .mockResolvedValueOnce(new Response(shardZip));

    await expect(ensureCollectiveXRunsList(1)).resolves.toBe(true);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.calls[0][1].run_id).toBe('160');
  });

  it('reports an incomplete pass after changing eight runs', async () => {
    const runs = Array.from({ length: 8 }, (_unused, index) => runObject({ id: 167 - index }));
    mockFetch.mockResolvedValueOnce(runListing(...runs));
    for (const run of runs) {
      mockFetch
        .mockResolvedValueOnce(Response.json(artifactsBody(run.id)))
        .mockResolvedValueOnce(new Response(matrixZip))
        .mockResolvedValueOnce(new Response(shardZip));
    }

    await expect(ensureCollectiveXRunsList(1)).resolves.toBe(false);
    expect(mockInsert).toHaveBeenCalledTimes(8);
  });

  it('does not consume the mutation budget when concurrent inserts are no-ops', async () => {
    const runs = Array.from({ length: 8 }, (_unused, index) => runObject({ id: 167 - index }));
    mockInsert.mockResolvedValue(false);
    mockFetch.mockResolvedValueOnce(runListing(...runs));
    for (const run of runs) {
      mockFetch
        .mockResolvedValueOnce(Response.json(artifactsBody(run.id)))
        .mockResolvedValueOnce(new Response(matrixZip))
        .mockResolvedValueOnce(new Response(shardZip));
    }

    await expect(ensureCollectiveXRunsList(1)).resolves.toBe(true);
    expect(mockInsert).toHaveBeenCalledTimes(8);
  });

  it('does not consume the mutation budget when guarded refreshes are no-ops', async () => {
    const runs = Array.from({ length: 8 }, (_unused, index) =>
      runObject({ id: 167 - index, run_attempt: 2 }),
    );
    mockGetStates.mockImplementation((_sql: unknown, ids: string[]) =>
      Promise.resolve({ [ids[0]]: { state: 'live', version: 1, run_attempt: 1 } }),
    );
    mockRefresh.mockResolvedValue(false);
    mockFetch.mockResolvedValueOnce(runListing(...runs));
    for (const run of runs) {
      mockFetch
        .mockResolvedValueOnce(Response.json(artifactsBody(run.id, 2)))
        .mockResolvedValueOnce(new Response(matrixZip))
        .mockResolvedValueOnce(new Response(shardZip));
    }

    await expect(ensureCollectiveXRunsList(1)).resolves.toBe(true);
    expect(mockRefresh).toHaveBeenCalledTimes(8);
  });
});

describe('ensureCollectiveXRun', () => {
  it('treats tombstoned runs as not found', async () => {
    mockGetStates.mockResolvedValue({ '160': { state: 'deleted', version: 1, run_attempt: 1 } });
    const caught = await ensureCollectiveXRun(1, '160').catch((error: unknown) => error);
    expect(collectiveXSweepErrorCode(caught)).toBe('not-found');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('checks the GitHub attempt for a live matching run without downloading artifacts', async () => {
    mockGetStates.mockResolvedValue({ '160': { state: 'live', version: 1, run_attempt: 1 } });
    mockFetch.mockResolvedValueOnce(Response.json(runObject()));

    await ensureCollectiveXRun(1, '160');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('refreshes a live matching run when GitHub has a newer attempt', async () => {
    mockGetStates.mockResolvedValue({ '160': { state: 'live', version: 1, run_attempt: 1 } });
    mockFetch
      .mockResolvedValueOnce(Response.json(runObject({ run_attempt: 2 })))
      .mockResolvedValueOnce(Response.json(artifactsBody(160, 2)))
      .mockResolvedValueOnce(new Response(matrixZip))
      .mockResolvedValueOnce(new Response(shardZip));

    await ensureCollectiveXRun(1, '160');

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefresh.mock.calls[0][1]).toMatchObject({ run_id: '160', run_attempt: 2 });
  });

  it('persists an absent run fetched by id', async () => {
    mockFetch
      .mockResolvedValueOnce(Response.json(runObject()))
      .mockResolvedValueOnce(Response.json(artifactsBody()))
      .mockResolvedValueOnce(new Response(matrixZip))
      .mockResolvedValueOnce(new Response(shardZip));

    await ensureCollectiveXRun(1, '160');

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.calls[0][1].run_id).toBe('160');
  });

  it('rejects runs from other workflows as not found', async () => {
    mockFetch.mockResolvedValueOnce(
      Response.json(runObject({ path: '.github/workflows/run-sweep.yml' })),
    );
    const caught = await ensureCollectiveXRun(1, '160').catch((error: unknown) => error);
    expect(collectiveXSweepErrorCode(caught)).toBe('not-found');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects malformed run ids without touching GitHub', async () => {
    const caught = await ensureCollectiveXRun(1, 'abc').catch((error: unknown) => error);
    expect(collectiveXSweepErrorCode(caught)).toBe('not-found');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
