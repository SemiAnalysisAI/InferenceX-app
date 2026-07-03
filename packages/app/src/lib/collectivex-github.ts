import { createHash } from 'node:crypto';

import AdmZip from 'adm-zip';

import { GITHUB_API_BASE, GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';

import { parseCollectiveXDatasetText } from '@/components/collectivex/reader';
import type { CollectiveXDataset, CollectiveXVersion } from '@/components/collectivex/types';

const BRANCH = 'collectivex';
const PUBLICATION_POLICY: Record<CollectiveXVersion, { file: RegExp; workflowName: string }> = {
  v1: {
    file: /^collectivex_public_v1_(?<digest>[a-f0-9]{64})\.ndjson$/,
    workflowName: 'CollectiveX Publish V1',
  },
};
const MAX_PUBLICATION_BYTES = 32 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUEST_ATTEMPTS = 3;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const LATEST_TTL_MS = 60_000;
const DIGEST_TTL_MS = 10 * 60_000;

type PublicationErrorCode = 'invalid' | 'not-found' | 'unavailable';

interface WorkflowRun {
  id: number;
  name: string;
  head_branch: string | null;
  head_sha: string;
  status: string | null;
  conclusion: string | null;
}

interface GithubArtifact {
  id: number;
  name: string;
  archive_download_url: string;
  expired?: boolean;
  size_in_bytes?: number;
}

interface PublicationCandidate {
  artifact: GithubArtifact;
  run: WorkflowRun;
}

export interface CollectiveXGithubPublication {
  artifactId: number;
  body: Uint8Array<ArrayBuffer>;
  dataset: CollectiveXDataset;
  digest: string;
  runId: number;
  version: CollectiveXVersion;
}

class CollectiveXPublicationError extends Error {
  readonly code: PublicationErrorCode;

  constructor(code: PublicationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CollectiveXPublicationError';
    this.code = code;
  }
}

export function collectiveXPublicationErrorCode(error: unknown): PublicationErrorCode | null {
  return error instanceof CollectiveXPublicationError ? error.code : null;
}

const digestCache = new Map<
  string,
  { expiresAt: number; publication: CollectiveXGithubPublication }
>();
const latestCache = new Map<
  CollectiveXVersion,
  { expiresAt: number; promise: Promise<CollectiveXGithubPublication> }
>();

function githubHeaders(token: string) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function waitBeforeRetry(attempt: number): Promise<void> {
  const delay = process.env.NODE_ENV === 'test' ? 0 : Math.min(250 * 2 ** (attempt - 1), 2000);
  await new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}

async function githubFetch(url: string, token: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: githubHeaders(token),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (
        response.ok ||
        !RETRYABLE_STATUSES.has(response.status) ||
        attempt === MAX_REQUEST_ATTEMPTS
      ) {
        return response;
      }
      lastError = new Error(`GitHub returned ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === MAX_REQUEST_ATTEMPTS) break;
    }
    await waitBeforeRetry(attempt);
  }
  throw new CollectiveXPublicationError('unavailable', 'GitHub request failed', {
    cause: lastError,
  });
}

async function publicationCandidates(
  version: CollectiveXVersion,
  token: string,
): Promise<PublicationCandidate[]> {
  const policy = PUBLICATION_POLICY[version];
  const parameters = new URLSearchParams({
    branch: BRANCH,
    status: 'completed',
    per_page: '20',
  });
  const runsResponse = await githubFetch(
    `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/collectivex-publish.yml/runs?${parameters}`,
    token,
  );
  if (!runsResponse.ok) {
    throw new CollectiveXPublicationError(
      'unavailable',
      `GitHub publication discovery failed (${runsResponse.status})`,
    );
  }
  const runs =
    ((await runsResponse.json()) as { workflow_runs?: WorkflowRun[] }).workflow_runs ?? [];
  const candidates: PublicationCandidate[] = [];
  for (const run of runs) {
    if (
      run.name !== policy.workflowName ||
      run.head_branch !== BRANCH ||
      run.status !== 'completed' ||
      run.conclusion !== 'success' ||
      !/^[a-f0-9]{40}$/.test(run.head_sha)
    ) {
      continue;
    }
    const artifactsResponse = await githubFetch(
      `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${run.id}/artifacts?per_page=100`,
      token,
    );
    if (!artifactsResponse.ok) {
      throw new CollectiveXPublicationError(
        'unavailable',
        `GitHub artifact discovery failed (${artifactsResponse.status})`,
      );
    }
    const artifacts = ((await artifactsResponse.json()) as { artifacts?: GithubArtifact[] })
      .artifacts;
    const matching = (artifacts ?? []).filter(
      (artifact) => artifact.name.startsWith(`cxpublication-${version}-`) && !artifact.expired,
    );
    if (matching.length > 1) {
      throw new CollectiveXPublicationError('invalid', 'publication run has duplicate artifacts');
    }
    if (matching[0]) candidates.push({ artifact: matching[0], run });
  }
  return candidates;
}

async function downloadPublication(
  version: CollectiveXVersion,
  candidate: PublicationCandidate,
  token: string,
): Promise<CollectiveXGithubPublication> {
  const policy = PUBLICATION_POLICY[version];
  if (
    candidate.artifact.size_in_bytes !== undefined &&
    candidate.artifact.size_in_bytes > MAX_PUBLICATION_BYTES
  ) {
    throw new CollectiveXPublicationError('invalid', 'publication artifact is oversized');
  }
  const response = await githubFetch(candidate.artifact.archive_download_url, token);
  if (!response.ok) {
    throw new CollectiveXPublicationError(
      'unavailable',
      `GitHub publication download failed (${response.status})`,
    );
  }
  const declaredBytes = Number(response.headers.get('Content-Length') ?? 0);
  if (declaredBytes > MAX_PUBLICATION_BYTES) {
    throw new CollectiveXPublicationError('invalid', 'publication archive is oversized');
  }
  const archive = Buffer.from(await response.arrayBuffer());
  if (archive.byteLength > MAX_PUBLICATION_BYTES) {
    throw new CollectiveXPublicationError('invalid', 'publication archive is oversized');
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(archive);
  } catch (error) {
    throw new CollectiveXPublicationError('invalid', 'publication artifact is not a ZIP', {
      cause: error,
    });
  }
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  if (
    entries.length !== 1 ||
    entries[0].entryName.includes('/') ||
    !policy.file.test(entries[0].entryName)
  ) {
    throw new CollectiveXPublicationError('invalid', 'publication archive layout is invalid');
  }
  if (entries[0].header.size > MAX_PUBLICATION_BYTES) {
    throw new CollectiveXPublicationError('invalid', 'publication dataset is oversized');
  }
  const bytes = entries[0].getData();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PUBLICATION_BYTES) {
    throw new CollectiveXPublicationError('invalid', 'publication dataset size is invalid');
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new CollectiveXPublicationError('invalid', 'publication dataset is not UTF-8', {
      cause: error,
    });
  }
  const lines = text.split('\n');
  if (lines.length !== 2 || lines[1] !== '' || lines[0].length === 0 || lines[0].includes('\r')) {
    throw new CollectiveXPublicationError(
      'invalid',
      'publication artifact must contain exactly one NDJSON record',
    );
  }
  let dataset: CollectiveXDataset;
  try {
    dataset = parseCollectiveXDatasetText(lines[0]);
  } catch (error) {
    throw new CollectiveXPublicationError('invalid', 'publication dataset failed validation', {
      cause: error,
    });
  }
  if (dataset.promotion.status !== 'promoted') {
    throw new CollectiveXPublicationError('invalid', 'publication dataset is not promoted');
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  const namedDigest = policy.file.exec(entries[0].entryName)?.groups?.digest;
  if (digest !== namedDigest) {
    throw new CollectiveXPublicationError('invalid', 'publication filename digest differs');
  }
  return {
    artifactId: candidate.artifact.id,
    body: Uint8Array.from(bytes),
    dataset,
    digest,
    runId: candidate.run.id,
    version,
  };
}

async function fetchPublication(
  version: CollectiveXVersion,
  digest?: string,
): Promise<CollectiveXGithubPublication> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new CollectiveXPublicationError('unavailable', 'GITHUB_TOKEN is not configured');
  }
  const candidates = await publicationCandidates(version, token);
  if (candidates.length === 0) {
    throw new CollectiveXPublicationError('not-found', 'no CollectiveX publication artifact');
  }
  for (const candidate of candidates) {
    const publication = await downloadPublication(version, candidate, token);
    digestCache.set(`${version}:${publication.digest}`, {
      expiresAt: Date.now() + DIGEST_TTL_MS,
      publication,
    });
    if (!digest || publication.digest === digest) return publication;
  }
  throw new CollectiveXPublicationError('not-found', 'CollectiveX publication digest not found');
}

export function loadCollectiveXPublication(
  version: CollectiveXVersion,
  digest?: string,
): Promise<CollectiveXGithubPublication> {
  const now = Date.now();
  if (digest) {
    const cacheKey = `${version}:${digest}`;
    const cached = digestCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return Promise.resolve(cached.publication);
    digestCache.delete(cacheKey);
    return fetchPublication(version, digest);
  }
  const cached = latestCache.get(version);
  if (cached && cached.expiresAt > now) return cached.promise;
  const promise = fetchPublication(version).catch((error) => {
    latestCache.delete(version);
    throw error;
  });
  latestCache.set(version, { expiresAt: now + LATEST_TTL_MS, promise });
  return promise;
}

export function clearCollectiveXPublicationCache(): void {
  digestCache.clear();
  latestCache.clear();
}
