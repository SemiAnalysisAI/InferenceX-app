import AdmZip from 'adm-zip';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GITHUB_API_BASE, GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';

import {
  extractZipEntries,
  fetchGithubRunArtifacts,
  getRunDate,
  normalizeGithubRunInfo,
  type GithubArtifact,
  type GithubWorkflowRun,
} from './github-artifacts';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  mockFetch.mockReset();
  vi.useRealTimers();
});

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

describe('fetchGithubRunArtifacts', () => {
  it('paginates artifacts and returns accumulated results when a later page fails', async () => {
    const page1Artifacts = Array.from({ length: 100 }, (_, index) => artifact(index + 1));

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ artifacts: page1Artifacts }),
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
});

describe('extractZipEntries', () => {
  it('skips non-matching files and continues after parse errors', () => {
    const zip = new AdmZip();
    zip.addFile('good.json', Buffer.from('{"id":1}', 'utf8'));
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

    expect(rows).toEqual([{ entryName: 'good.json', payload: { id: 1 } }]);
    expect(parseErrors).toEqual(['bad.json']);
  });
});
