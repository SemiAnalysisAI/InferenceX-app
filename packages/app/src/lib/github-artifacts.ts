import AdmZip from 'adm-zip';

import { GITHUB_API_BASE, GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';

/**
 * DO NOT ADD CACHING around these GitHub artifact fetches.
 * Workflow run metadata/artifacts can change while a run is still in progress.
 */
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
  // GitHub can return null here for detached refs or in-progress runs.
  head_branch: string | null;
  head_sha: string;
  created_at: string;
  html_url: string;
  // conclusion/status may be null while a workflow run is still active.
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

export async function fetchGithubWorkflowRun(runId: string, token: string): Promise<Response> {
  return fetch(`${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}`, {
    headers: {
      ...GITHUB_HEADERS,
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchGithubRunArtifacts(
  runId: string,
  token: string,
): Promise<GithubArtifact[]> {
  const url = `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}/artifacts`;
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
      // Preserve old route behavior: stop pagination on API failure and return what we have.
      break;
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

export async function downloadGithubArtifact(url: string, token: string): Promise<Response> {
  return fetch(url, {
    headers: {
      ...GITHUB_HEADERS,
      Authorization: `Bearer ${token}`,
    },
  });
}

export function extractZipEntries<T>(
  buffer: Buffer,
  extension: string,
  parseEntry: (entryName: string, contents: string) => T[],
  onParseError?: (entryName: string, error: unknown) => void,
): T[] {
  // Preserve partial-success behavior: malformed matching files are skipped after optional reporting.
  const zip = new AdmZip(buffer);
  const rows: T[] = [];

  for (const entry of zip.getEntries()) {
    if (!entry.entryName.endsWith(extension)) {
      continue;
    }

    try {
      rows.push(...parseEntry(entry.entryName, zip.readAsText(entry)));
    } catch (error) {
      onParseError?.(entry.entryName, error);
    }
  }

  return rows;
}
