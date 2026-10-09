import { inflateRawSync } from 'node:zlib';

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

export function fetchGithubWorkflowRun(runId: string, token: string): Promise<Response> {
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

export function downloadGithubArtifact(url: string, token: string): Promise<Response> {
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
      rows.push(...parseEntry(entry.entryName, entry.getData().toString('utf8')));
    } catch (error) {
      onParseError?.(entry.entryName, error);
    }
  }

  return rows;
}

/**
 * Read selected entries of a remote ZIP through HTTP range requests: the end of
 * central directory, the directory itself, then only the matching entries. An
 * AgentX raw artifact is tens of MB; its scrape summary is a few KB.
 */
export async function readRemoteZipEntries(
  url: string,
  wanted: (entryName: string) => boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, Buffer>> {
  const read = async (range: string): Promise<{ data: Buffer; total: number }> => {
    const response = await fetchImpl(url, { headers: { Range: `bytes=${range}` } });
    if (response.status !== 206) throw new Error(`ZIP range read failed: ${response.status}`);
    const total = Number(response.headers.get('content-range')?.split('/')[1]);
    return { data: Buffer.from(await response.arrayBuffer()), total };
  };
  // The end-of-central-directory record is 22 bytes plus an up to 64 KiB comment.
  const { data: tail, total } = await read('-65557');
  const eocd = tail.lastIndexOf(Buffer.from('PK\u0005\u0006', 'latin1'));
  if (eocd === -1 || !Number.isSafeInteger(total)) throw new Error('ZIP end record not found');
  const size = tail.readUInt32LE(eocd + 12);
  const offset = tail.readUInt32LE(eocd + 16);
  if (offset === 2 ** 32 - 1) throw new Error('ZIP64 archives are not supported');
  const tailStart = total - tail.length;
  let directory: Buffer = tail.subarray(offset - tailStart, offset - tailStart + size);
  if (offset < tailStart) ({ data: directory } = await read(`${offset}-${offset + size - 1}`));

  const entries = new Map<string, Buffer>();
  for (
    let p = 0;
    p + 46 <= directory.length && directory.toString('latin1', p, p + 4) === 'PK\u0001\u0002';
  ) {
    const method = directory.readUInt16LE(p + 10);
    const compressedSize = directory.readUInt32LE(p + 20);
    const nameLength = directory.readUInt16LE(p + 28);
    const localOffset = directory.readUInt32LE(p + 42);
    const name = directory.toString('utf8', p + 46, p + 46 + nameLength);
    p += 46 + nameLength + directory.readUInt16LE(p + 30) + directory.readUInt16LE(p + 32);
    if (!wanted(name)) continue;
    const { data: header } = await read(`${localOffset}-${localOffset + 29}`);
    const start = localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    let data: Buffer = Buffer.alloc(0);
    if (compressedSize > 0) ({ data } = await read(`${start}-${start + compressedSize - 1}`));
    entries.set(name, method === 8 ? inflateRawSync(data) : data);
  }
  return entries;
}

/** GitHub serves artifact ZIPs through a short-lived redirect that supports range reads. */
export async function resolveGithubArtifactUrl(url: string, token: string): Promise<string> {
  const response = await fetch(url, {
    headers: { ...GITHUB_HEADERS, Authorization: `Bearer ${token}` },
    redirect: 'manual',
  });
  const location = response.headers.get('location');
  if (!location) throw new Error(`Artifact redirect missing: ${response.status}`);
  return location;
}
