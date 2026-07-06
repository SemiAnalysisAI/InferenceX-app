import { createHash } from 'node:crypto';

import AdmZip from 'adm-zip';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  makeCollectiveXDataset,
  makeCollectiveXDiagnosticDataset,
} from '@/components/collectivex/test-fixture';

import {
  clearCollectiveXPublicationCache,
  collectiveXPublicationErrorCode,
  loadCollectiveXPublication,
} from './collectivex-github';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(value: unknown, status = 200) {
  return Response.json(value, {
    status,
  });
}

function publicationArchive(value = makeCollectiveXDataset(), extra = false) {
  const body = Buffer.from(`${JSON.stringify(value)}\n`);
  const digest = createHash('sha256').update(body).digest('hex');
  const zip = new AdmZip();
  zip.addFile(`collectivex_public_v1_${digest}.ndjson`, body);
  if (extra) zip.addFile(`collectivex_public_v1_${'f'.repeat(64)}.ndjson`, body);
  return { body, digest, zip: zip.toBuffer() };
}

function installGithubResponses(archive: ReturnType<typeof publicationArchive>) {
  mockFetch
    .mockResolvedValueOnce(
      jsonResponse({
        total_count: 1,
        workflow_runs: [
          {
            id: 456,
            name: 'CollectiveX Sweep',
            path: '.github/workflows/collectivex-sweep.yml',
            head_branch: 'collectivex',
            head_sha: 'a'.repeat(40),
            status: 'completed',
            conclusion: 'success',
            run_attempt: 1,
          },
        ],
      }),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        artifacts: [
          {
            id: 123,
            name: 'cxpublication-v1-456-1',
            archive_download_url: 'https://example.test/publication.zip',
            expired: false,
            size_in_bytes: archive.zip.byteLength,
          },
        ],
      }),
    )
    .mockResolvedValueOnce(
      new Response(archive.zip, {
        headers: { 'Content-Length': String(archive.zip.byteLength) },
      }),
    );
}

beforeEach(() => {
  clearCollectiveXPublicationCache();
  mockFetch.mockReset();
  process.env.GITHUB_TOKEN = 'test-token';
});

afterAll(() => {
  delete process.env.GITHUB_TOKEN;
  vi.unstubAllGlobals();
});

describe('CollectiveX GitHub publication loader', () => {
  it('discovers, downloads, validates, and caches the latest NDJSON publication', async () => {
    const archive = publicationArchive();
    installGithubResponses(archive);

    const first = await loadCollectiveXPublication('v1');
    const second = await loadCollectiveXPublication('v1');

    expect(first).toMatchObject({
      artifactId: 123,
      digest: archive.digest,
      runId: 456,
      runAttempt: 1,
      version: 'v1',
    });
    expect(Buffer.from(first.body)).toEqual(archive.body);
    expect(first.dataset.promotion.status).toBe('promoted');
    expect(second).toBe(first);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[0][0]).toContain('/actions/workflows/collectivex-sweep.yml/runs?');
  });

  it('paginates workflow runs until it finds a publication operation', async () => {
    const archive = publicationArchive();
    const ordinaryRuns = Array.from({ length: 100 }, (_, index) => ({
      id: 1000 - index,
      name: 'CollectiveX Sweep',
      path: '.github/workflows/collectivex-sweep.yml',
      head_branch: 'collectivex',
      head_sha: 'a'.repeat(40),
      status: 'completed',
      conclusion: 'failure',
      run_attempt: 1,
    }));
    ordinaryRuns[0].conclusion = 'success';
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ total_count: 101, workflow_runs: ordinaryRuns }))
      .mockResolvedValueOnce(jsonResponse({ artifacts: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          total_count: 101,
          workflow_runs: [
            {
              id: 456,
              name: 'CollectiveX Sweep',
              path: '.github/workflows/collectivex-sweep.yml',
              head_branch: 'collectivex',
              head_sha: 'a'.repeat(40),
              status: 'completed',
              conclusion: 'success',
              run_attempt: 1,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          artifacts: [
            {
              id: 123,
              name: 'cxpublication-v1-456-1',
              archive_download_url: 'https://example.test/publication.zip',
              expired: false,
              size_in_bytes: archive.zip.byteLength,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        new Response(archive.zip, {
          headers: { 'Content-Length': String(archive.zip.byteLength) },
        }),
      );

    await expect(loadCollectiveXPublication('v1')).resolves.toMatchObject({ runId: 456 });
    expect(mockFetch.mock.calls[0][0]).toContain('page=1');
    expect(mockFetch.mock.calls[2][0]).toContain('page=2');
  });

  it('selects only the artifact from the current run attempt', async () => {
    const archive = publicationArchive();
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          total_count: 1,
          workflow_runs: [
            {
              id: 456,
              name: 'CollectiveX Sweep',
              path: '.github/workflows/collectivex-sweep.yml',
              head_branch: 'collectivex',
              head_sha: 'a'.repeat(40),
              status: 'completed',
              conclusion: 'success',
              run_attempt: 2,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          artifacts: [
            {
              id: 122,
              name: 'cxpublication-v1-456-1',
              archive_download_url: 'https://example.test/stale.zip',
              expired: false,
            },
            {
              id: 123,
              name: 'cxpublication-v1-456-2',
              archive_download_url: 'https://example.test/publication.zip',
              expired: false,
              size_in_bytes: archive.zip.byteLength,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        new Response(archive.zip, {
          headers: { 'Content-Length': String(archive.zip.byteLength) },
        }),
      );

    await expect(loadCollectiveXPublication('v1')).resolves.toMatchObject({
      artifactId: 123,
      runAttempt: 2,
    });
    expect(mockFetch).not.toHaveBeenCalledWith('https://example.test/stale.zip', expect.anything());
  });

  it('resolves an immutable digest from the publication cache', async () => {
    const archive = publicationArchive();
    installGithubResponses(archive);
    await loadCollectiveXPublication('v1');

    await expect(loadCollectiveXPublication('v1', archive.digest)).resolves.toMatchObject({
      digest: archive.digest,
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('retries transient GitHub failures with bounded attempts', async () => {
    const archive = publicationArchive();
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 503));
    installGithubResponses(archive);

    await expect(loadCollectiveXPublication('v1')).resolves.toMatchObject({
      digest: archive.digest,
    });
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('rejects non-promoted and ambiguous publication artifacts', async () => {
    const diagnostic = publicationArchive(makeCollectiveXDiagnosticDataset());
    installGithubResponses(diagnostic);
    await expect(loadCollectiveXPublication('v1')).rejects.toSatisfy(
      (error: unknown) => collectiveXPublicationErrorCode(error) === 'invalid',
    );

    clearCollectiveXPublicationCache();
    mockFetch.mockReset();
    const ambiguous = publicationArchive(makeCollectiveXDataset(), true);
    installGithubResponses(ambiguous);
    await expect(loadCollectiveXPublication('v1')).rejects.toSatisfy(
      (error: unknown) => collectiveXPublicationErrorCode(error) === 'invalid',
    );
  });

  it('fails as unavailable without a server-side GitHub token', async () => {
    delete process.env.GITHUB_TOKEN;

    await expect(loadCollectiveXPublication('v1')).rejects.toSatisfy(
      (error: unknown) => collectiveXPublicationErrorCode(error) === 'unavailable',
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
