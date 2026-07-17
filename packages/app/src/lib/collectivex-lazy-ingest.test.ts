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
    updated_at: '2026-07-08T12:20:00Z',
    ...overrides,
  };
}

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
      .mockResolvedValueOnce(
        Response.json({
          total_count: 2,
          workflow_runs: [runObject({ id: 161 }), runObject({ id: 160 })],
        }),
      )
      .mockResolvedValueOnce(Response.json(artifactsBody()))
      .mockResolvedValueOnce(new Response(matrixZip))
      .mockResolvedValueOnce(new Response(shardZip));

    await ensureLatestCollectiveXRun(1);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.calls[0][1].run_id).toBe('160');
  });

  it('skips runs tagged for another version', async () => {
    mockFetch
      .mockResolvedValueOnce(
        Response.json({
          total_count: 2,
          workflow_runs: [runObject({ id: 161 }), runObject({ id: 160 })],
        }),
      )
      // Run 161 carries a v2 matrix — requesting v1 must move on.
      .mockResolvedValueOnce(Response.json(artifactsBody(161)))
      .mockResolvedValueOnce(new Response(matrixZipV2))
      .mockResolvedValueOnce(Response.json(artifactsBody()))
      .mockResolvedValueOnce(new Response(matrixZip))
      .mockResolvedValueOnce(new Response(shardZip));

    await ensureLatestCollectiveXRun(1);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.calls[0][1].version).toBe(1);
    expect(mockInsert.mock.calls[0][1].run_id).toBe('160');
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

describe('ensureCollectiveXRunsList', () => {
  it('backfills absent recent runs and counts live ones toward the cap', async () => {
    mockGetStates.mockImplementation((_sql: unknown, ids: string[]) =>
      Promise.resolve(
        ids[0] === '161' ? { '161': { state: 'live', version: 1, run_attempt: 1 } } : {},
      ),
    );
    mockFetch
      .mockResolvedValueOnce(
        Response.json({
          total_count: 2,
          workflow_runs: [runObject({ id: 161 }), runObject({ id: 160 })],
        }),
      )
      .mockResolvedValueOnce(Response.json(artifactsBody()))
      .mockResolvedValueOnce(new Response(matrixZip))
      .mockResolvedValueOnce(new Response(shardZip));

    await ensureCollectiveXRunsList(1);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.calls[0][1].run_id).toBe('160');
  });
});

describe('ensureCollectiveXRun', () => {
  it('treats tombstoned runs as not found', async () => {
    mockGetStates.mockResolvedValue({ '160': { state: 'deleted', version: 1, run_attempt: 1 } });
    const caught = await ensureCollectiveXRun(1, '160').catch((error: unknown) => error);
    expect(collectiveXSweepErrorCode(caught)).toBe('not-found');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns immediately for live matching runs', async () => {
    mockGetStates.mockResolvedValue({ '160': { state: 'live', version: 1, run_attempt: 1 } });
    await ensureCollectiveXRun(1, '160');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
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
