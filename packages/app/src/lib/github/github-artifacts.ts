import AdmZip from 'adm-zip';

import { benchmarkSourceRepos, GITHUB_API_BASE } from '@semianalysisai/inferencex-constants';

const GITHUB_HEADERS = {
  Accept: 'application/vnd.github.v3+json',
} as const;

export interface GithubArtifact {
  id: number;
  name: string;
  archive_download_url: string;
}

export interface GithubWorkflowRun {
  id: number;
  name: string;
  head_branch: string | null;
  head_sha: string;
  created_at: string;
  html_url: string;
  conclusion: string | null;
  status: string | null;
}

export interface GithubRunInfo {
  id: number;
  name: string;
  branch: string | null;
  sha: string;
  createdAt: string;
  url: string;
  conclusion: string | null;
  status: string | null;
}

export function getGithubToken(): string | undefined {
  return process.env.GITHUB_TOKEN;
}

export function normalizeGithubRunInfo(run: GithubWorkflowRun): GithubRunInfo {
  return {
    id: run.id,
    name: run.name,
    branch: run.head_branch,
    sha: run.head_sha,
    createdAt: run.created_at,
    url: run.html_url,
    conclusion: run.conclusion,
    status: run.status,
  };
}

export function getRunDate(run: GithubWorkflowRun): string {
  return run.created_at ? run.created_at.split('T')[0] : new Date().toISOString().split('T')[0];
}

function appendPaginationParams(url: string, page: number): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}per_page=100&page=${page}`;
}

/**
 * Fetches a workflow run from the first source repository that has it. Otherwise returns the
 * first failure other than 404 (a 404 only means another repository owns the run), else the
 * last 404.
 */
export async function fetchGithubWorkflowRun(runId: string, token: string): Promise<Response> {
  let failure: Response | undefined;
  for (const repo of benchmarkSourceRepos()) {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${repo}/actions/runs/${runId}`, {
      headers: {
        ...GITHUB_HEADERS,
        Authorization: `Bearer ${token}`,
      },
    });
    if (response.ok) return response;
    if (!failure || failure.status === 404) failure = response;
  }
  return failure!;
}

/** Pages one repository's artifact listing; null when its first page fails (no such run). */
async function fetchRepoRunArtifacts(
  repo: string,
  runId: string,
  token: string,
): Promise<GithubArtifact[] | null> {
  const url = `${GITHUB_API_BASE}/repos/${repo}/actions/runs/${runId}/artifacts`;
  const artifacts: GithubArtifact[] = [];
  let page = 1;

  while (true) {
    const response = await fetch(appendPaginationParams(url, page), {
      headers: {
        ...GITHUB_HEADERS,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      return page === 1 ? null : artifacts;
    }

    const data = (await response.json()) as { artifacts?: GithubArtifact[] };
    const pageArtifacts = data.artifacts ?? [];
    if (pageArtifacts.length === 0) {
      break;
    }

    artifacts.push(...pageArtifacts);
    if (pageArtifacts.length < 100) {
      break;
    }
    page++;
  }

  return artifacts;
}

/** Lists a run's artifacts from the first source repository whose listing succeeds. */
export async function fetchGithubRunArtifacts(
  runId: string,
  token: string,
): Promise<GithubArtifact[]> {
  for (const repo of benchmarkSourceRepos()) {
    const artifacts = await fetchRepoRunArtifacts(repo, runId, token);
    if (artifacts) return artifacts;
  }
  return [];
}

export function downloadGithubArtifact(url: string, token: string): Promise<Response> {
  return fetch(url, {
    headers: {
      ...GITHUB_HEADERS,
      Authorization: `Bearer ${token}`,
    },
  });
}

export function readZipEntries(
  buffer: Buffer,
  predicate: (entryName: string) => boolean,
): Map<string, string> {
  const zip = new AdmZip(buffer);
  const files = new Map<string, string>();
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !predicate(entry.entryName)) continue;
    files.set(entry.entryName, entry.getData().toString('utf8'));
  }
  return files;
}

export function extractZipEntries<T>(
  buffer: Buffer,
  extension: string,
  parseEntry: (entryName: string, contents: string) => T[],
  onParseError?: (entryName: string, error: unknown) => void,
): T[] {
  const zip = new AdmZip(buffer);
  const rows: T[] = [];

  for (const entry of zip.getEntries()) {
    if (!entry.entryName.toLowerCase().endsWith(extension.toLowerCase())) {
      continue;
    }

    try {
      rows.push(...parseEntry(entry.entryName, entry.getData().toString('utf8')));
    } catch (error) {
      onParseError?.(entry.entryName, error);
    }
  }

  return rows;
}
