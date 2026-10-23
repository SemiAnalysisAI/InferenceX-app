import AdmZip from 'adm-zip';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GITHUB_API_BASE, GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';

import {
  extractZipEntries,
  fetchGithubRunArtifacts,
  fetchGithubWorkflowRun,
  getRunDate,
  normalizeGithubRunInfo,
  resetGithubRunRepositories,
  type GithubArtifact,
  type GithubWorkflowRun,
} from './github-artifacts';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  mockFetch.mockReset();
  resetGithubRunRepositories();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const authHeaders = {
  headers: {
    Accept: 'application/vnd.github.v3+json',
    Authorization: 'Bearer token-123',
  },
};

function workflowRun(overrides: Partial<GithubWorkflowRun> = {}): GithubWorkflowRun {
  return {
    id: 123,
    name: 'nightly',
    head_branch: 'main',
    head_sha: 'abc123',
    created_at: '2026-03-01T05:06:07Z',
    html_url: 'https://github.com/runs/123',
    conclusion: 'success',
    status: 'completed',
    ...overrides,
  };
}

function artifact(id: number, name = 'gpu_metrics'): GithubArtifact {
  return {
    id,
    name,
    archive_download_url: `https://github.com/artifacts/${id}.zip`,
  };
}

describe('normalizeGithubRunInfo', () => {
  it('preserves nullable branch and run state metadata', () => {
    expect(
      normalizeGithubRunInfo(
        workflowRun({
          head_branch: null,
          conclusion: null,
          status: null,
        }),
      ),
    ).toEqual({
      id: 123,
      name: 'nightly',
      branch: null,
      sha: 'abc123',
      createdAt: '2026-03-01T05:06:07Z',
      url: 'https://github.com/runs/123',
      conclusion: null,
      status: null,
    });
  });
});

describe('getRunDate', () => {
  it('uses the run timestamp date when created_at is present', () => {
    expect(getRunDate(workflowRun({ created_at: '2026-02-14T23:59:59Z' }))).toBe('2026-02-14');
  });

  it('falls back to the current UTC date when created_at is missing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-03T12:34:56Z'));

    expect(getRunDate(workflowRun({ created_at: '' }))).toBe('2026-04-03');
  });
});

describe('fetchGithubWorkflowRun', () => {
  it('reads only the primary repository when no source repositories are configured', async () => {
    vi.stubEnv('INFERENCEX_SOURCE_REPOS', undefined);
    const notFound = new Response(null, { status: 404, statusText: 'Not Found' });
    mockFetch.mockResolvedValueOnce(notFound);

    await expect(fetchGithubWorkflowRun('456', 'token-123')).resolves.toBe(notFound);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      `${GITHUB_API_BASE}/repos/SemiAnalysisAI/InferenceX/actions/runs/456`,
      authHeaders,
    );
  });

  it('falls back to configured source repositories in order', async () => {
    vi.stubEnv('INFERENCEX_SOURCE_REPOS', 'example-org/bench-a,example-org/bench-b');
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 404, statusText: 'Not Found' }))
      .mockResolvedValueOnce(new Response(null, { status: 404, statusText: 'Not Found' }))
      .mockResolvedValueOnce(Response.json(workflowRun({ id: 456 })));

    const response = await fetchGithubWorkflowRun('456', 'token-123');

    expect(await response.json()).toMatchObject({ id: 456 });
    expect(mockFetch.mock.calls).toEqual([
      [`${GITHUB_API_BASE}/repos/SemiAnalysisAI/InferenceX/actions/runs/456`, authHeaders],
      [`${GITHUB_API_BASE}/repos/example-org/bench-a/actions/runs/456`, authHeaders],
      [`${GITHUB_API_BASE}/repos/example-org/bench-b/actions/runs/456`, authHeaders],
    ]);
  });

  it('asks the known owner first for artifacts after the run lookup found it', async () => {
    vi.stubEnv('INFERENCEX_SOURCE_REPOS', 'example-org/bench-a,example-org/bench-b');
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json(workflowRun({ id: 456 })))
      .mockResolvedValueOnce(Response.json({ artifacts: [] }));

    await fetchGithubWorkflowRun('456', 'token-123');
    await fetchGithubRunArtifacts('456', 'token-123');

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch.mock.calls[3][0]).toBe(
      `${GITHUB_API_BASE}/repos/example-org/bench-b/actions/runs/456/artifacts?per_page=100&page=1`,
    );
  });

  it('stops at the first repository that has the run', async () => {
    vi.stubEnv('INFERENCEX_SOURCE_REPOS', 'example-org/bench-a');
    mockFetch.mockResolvedValueOnce(Response.json(workflowRun({ id: 456 })));

    const response = await fetchGithubWorkflowRun('456', 'token-123');
    expect(response.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('reports an API failure instead of a later repository 404', async () => {
    vi.stubEnv('INFERENCEX_SOURCE_REPOS', 'example-org/bench-a,example-org/bench-b');
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 404, statusText: 'Not Found' }))
      .mockResolvedValueOnce(new Response(null, { status: 502, statusText: 'Bad Gateway' }))
      .mockResolvedValueOnce(new Response(null, { status: 404, statusText: 'Not Found' }));

    const response = await fetchGithubWorkflowRun('456', 'token-123');

    expect(response.status).toBe(502);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe('fetchGithubRunArtifacts', () => {
  it('paginates artifacts and returns accumulated results when a later page fails', async () => {
    const page1Artifacts = Array.from({ length: 100 }, (_, index) => artifact(index + 1));

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ artifacts: page1Artifacts }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
      });

    const artifacts = await fetchGithubRunArtifacts('456', 'token-123');

    expect(artifacts).toEqual(page1Artifacts);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/456/artifacts?per_page=100&page=1`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: 'Bearer token-123',
        },
      },
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/456/artifacts?per_page=100&page=2`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: 'Bearer token-123',
        },
      },
    );
  });

  it('returns no artifacts after a single request by default', async () => {
    vi.stubEnv('INFERENCEX_SOURCE_REPOS', undefined);
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 404, statusText: 'Not Found' }));

    await expect(fetchGithubRunArtifacts('456', 'token-123')).resolves.toEqual([]);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('falls back to the next source repository when a run listing fails', async () => {
    vi.stubEnv('INFERENCEX_SOURCE_REPOS', 'example-org/bench-a,example-org/bench-b');
    const sourceArtifacts = [artifact(7, 'results_bmk')];
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 404, statusText: 'Not Found' }))
      .mockResolvedValueOnce(Response.json({ artifacts: sourceArtifacts }));

    await expect(fetchGithubRunArtifacts('456', 'token-123')).resolves.toEqual(sourceArtifacts);
    expect(mockFetch.mock.calls).toEqual([
      [
        `${GITHUB_API_BASE}/repos/SemiAnalysisAI/InferenceX/actions/runs/456/artifacts?per_page=100&page=1`,
        authHeaders,
      ],
      [
        `${GITHUB_API_BASE}/repos/example-org/bench-a/actions/runs/456/artifacts?per_page=100&page=1`,
        authHeaders,
      ],
    ]);
  });

  it('keeps the owning repository listing even when it is empty or partial', async () => {
    vi.stubEnv('INFERENCEX_SOURCE_REPOS', 'example-org/bench-a');
    mockFetch.mockResolvedValueOnce(Response.json({ artifacts: [] }));
    await expect(fetchGithubRunArtifacts('456', 'token-123')).resolves.toEqual([]);
    expect(mockFetch).toHaveBeenCalledOnce();

    mockFetch.mockReset();
    const page1Artifacts = Array.from({ length: 100 }, (_, index) => artifact(index + 1));
    mockFetch
      .mockResolvedValueOnce(Response.json({ artifacts: page1Artifacts }))
      .mockResolvedValueOnce(new Response(null, { status: 502, statusText: 'Bad Gateway' }));
    await expect(fetchGithubRunArtifacts('456', 'token-123')).resolves.toEqual(page1Artifacts);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('extractZipEntries', () => {
  it('skips non-matching files and continues after parse errors', () => {
    const zip = new AdmZip();
    zip.addFile('good.json', Buffer.from('{"id":1}', 'utf8'));
    zip.addFile('upper.JSON', Buffer.from('{"id":2}', 'utf8'));
    zip.addFile('bad.json', Buffer.from('not json', 'utf8'));
    zip.addFile('notes.txt', Buffer.from('ignore me', 'utf8'));

    const parseErrors: string[] = [];
    const rows = extractZipEntries(
      zip.toBuffer(),
      '.json',
      (entryName, contents) => [{ entryName, payload: JSON.parse(contents) as { id: number } }],
      (entryName) => {
        parseErrors.push(entryName);
      },
    );

    expect(rows).toEqual([
      { entryName: 'good.json', payload: { id: 1 } },
      { entryName: 'upper.JSON', payload: { id: 2 } },
    ]);
    expect(parseErrors).toEqual(['bad.json']);
  });
});
