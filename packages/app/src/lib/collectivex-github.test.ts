import AdmZip from 'adm-zip';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeRawMatrix, makeRawShard } from '@/components/collectivex/test-fixture';

import {
  clearCollectiveXSweepCache,
  collectiveXSweepErrorCode,
  listCollectiveXSweepRuns,
  loadCollectiveXSweepRun,
} from './collectivex-github';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// The two measured shards a canonical sweep run uploads (scale-up EP8 + scale-out EP16).
const shardA = makeRawShard({ backend: 'deepep-v2', ep: 8 });
const shardB = makeRawShard({
  backend: 'deepep',
  implName: 'deepep',
  deepepVersion: '2.1',
  backendLineage: 'deepep-v2',
  ep: 16,
  scope: 'scale-out',
  scaleOutTransport: 'rdma',
  transport: 'rdma',
  topologyClass: 'multi-node',
  nodes: 2,
  gpusPerNode: 8,
  scaleUpDomain: 8,
});

// The neutral matrix declares every requested case; here it mirrors the two shards.
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

function zipDocs(...docs: unknown[]): ArrayBuffer {
  const zip = new AdmZip();
  docs.forEach((doc, index) => zip.addFile(`doc-${index}.json`, Buffer.from(JSON.stringify(doc))));
  // Copy into a fresh ArrayBuffer so Response accepts the bytes as a plain BodyInit.
  const bytes = zip.toBuffer();
  const archive = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(archive).set(bytes);
  return archive;
}

const matrixZip = zipDocs(matrix);
const shardZip = zipDocs(shardA, shardB);

// A second-generation matrix (numeric version 2): the same structural shape but a
// different content `version`. Requesting version 1 must skip it.
const matrixV2 = makeRawMatrix([requestedOf(shardA), requestedOf(shardB)], 2);
const matrixZipV2 = zipDocs(matrixV2);

function runObject(overrides: Record<string, unknown> = {}) {
  return {
    id: 160,
    name: 'CollectiveX Sweep',
    path: '.github/workflows/collectivex-sweep.yml',
    head_branch: 'collectivex',
    head_sha: 'a'.repeat(40),
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
    updated_at: '2026-07-08T12:20:00Z',
    ...overrides,
  };
}

function artifactsBody() {
  return {
    total_count: 2,
    artifacts: [
      {
        id: 1,
        name: 'cxsweep-matrix-160',
        archive_download_url: 'https://example.test/matrix.zip',
        expired: false,
      },
      {
        id: 2,
        name: 'cxshard-cases',
        archive_download_url: 'https://example.test/shards.zip',
        expired: false,
      },
    ],
  };
}

// Queue the fetch sequence a run assembly performs: matrix download, then result downloads.
function installArtifactDownloads() {
  mockFetch
    .mockResolvedValueOnce(new Response(matrixZip))
    .mockResolvedValueOnce(new Response(shardZip));
}

beforeEach(() => {
  clearCollectiveXSweepCache();
  mockFetch.mockReset();
  process.env.GITHUB_TOKEN = 'test-token';
});

afterAll(() => {
  delete process.env.GITHUB_TOKEN;
  vi.unstubAllGlobals();
});

describe('CollectiveX GitHub sweep loader', () => {
  it('discovers the latest run, assembles its neutral artifacts, and caches it', async () => {
    mockFetch
      .mockResolvedValueOnce(Response.json({ total_count: 1, workflow_runs: [runObject()] }))
      .mockResolvedValueOnce(Response.json(artifactsBody()));
    installArtifactDownloads();

    const first = await loadCollectiveXSweepRun(1);
    const second = await loadCollectiveXSweepRun(1);

    expect(first.format).toBe('collectivex.view.v1');
    expect(first.run.run_id).toBe('160');
    expect(first.run.conclusion).toBe('success');
    expect(first.series).toHaveLength(2);
    expect(second).toBe(first);
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch.mock.calls[0][0]).toContain('/actions/workflows/collectivex-sweep.yml/runs?');
  });

  it('resolves a specific run by id', async () => {
    mockFetch
      .mockResolvedValueOnce(Response.json(runObject()))
      .mockResolvedValueOnce(Response.json(artifactsBody()));
    installArtifactDownloads();

    const dataset = await loadCollectiveXSweepRun(1, '160');

    expect(dataset.run.run_id).toBe('160');
    expect(dataset.series).toHaveLength(2);
    expect(mockFetch.mock.calls[0][0]).toContain('/actions/runs/160');
  });

  it('lists recent runs as run summaries', async () => {
    mockFetch
      .mockResolvedValueOnce(Response.json({ total_count: 1, workflow_runs: [runObject()] }))
      .mockResolvedValueOnce(Response.json(artifactsBody()));
    installArtifactDownloads();

    const summaries = await listCollectiveXSweepRuns(1);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].run_id).toBe('160');
    expect(summaries[0].terminal_counts.measured).toBeGreaterThan(0);
  });

  it('fails as unavailable without a server-side GitHub token', async () => {
    delete process.env.GITHUB_TOKEN;

    await expect(loadCollectiveXSweepRun(1)).rejects.toSatisfy(
      (error: unknown) => collectiveXSweepErrorCode(error) === 'unavailable',
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports not-found when no sweep run carries artifacts', async () => {
    mockFetch.mockResolvedValueOnce(Response.json({ total_count: 0, workflow_runs: [] }));

    await expect(loadCollectiveXSweepRun(1)).rejects.toSatisfy(
      (error: unknown) => collectiveXSweepErrorCode(error) === 'not-found',
    );
  });

  it('rejects a run whose matrix artifact carries no matrix document', async () => {
    mockFetch
      .mockResolvedValueOnce(Response.json({ total_count: 1, workflow_runs: [runObject()] }))
      .mockResolvedValueOnce(
        Response.json({
          total_count: 1,
          artifacts: [
            {
              id: 1,
              name: 'cxsweep-matrix-160',
              archive_download_url: 'https://example.test/matrix.zip',
              expired: false,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response(zipDocs(shardA)));

    await expect(loadCollectiveXSweepRun(1)).rejects.toSatisfy(
      (error: unknown) => collectiveXSweepErrorCode(error) === 'invalid',
    );
  });

  it('skips a newer run tagged for another version and resolves the newest match', async () => {
    // Run 161 is newest but carries a version-2 matrix; the version-1 request
    // must fall through to run 160 without erroring.
    mockFetch
      .mockResolvedValueOnce(
        Response.json({
          total_count: 2,
          workflow_runs: [runObject({ id: 161 }), runObject({ id: 160 })],
        }),
      )
      .mockResolvedValueOnce(Response.json(artifactsBody()))
      .mockResolvedValueOnce(new Response(matrixZipV2))
      .mockResolvedValueOnce(Response.json(artifactsBody()))
      .mockResolvedValueOnce(new Response(matrixZip))
      .mockResolvedValueOnce(new Response(shardZip));

    const dataset = await loadCollectiveXSweepRun(1);

    expect(dataset.run.run_id).toBe('160');
    expect(dataset.series).toHaveLength(2);
    // The mismatched run costs only its matrix peek (no result download).
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });

  it('reports not-found when a run resolved by id is tagged for another version', async () => {
    mockFetch
      .mockResolvedValueOnce(Response.json(runObject()))
      .mockResolvedValueOnce(Response.json(artifactsBody()))
      .mockResolvedValueOnce(new Response(matrixZipV2));

    await expect(loadCollectiveXSweepRun(1, '160')).rejects.toSatisfy(
      (error: unknown) => collectiveXSweepErrorCode(error) === 'not-found',
    );
    // The version peek stops assembly before any result artifact is fetched.
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
