import AdmZip from 'adm-zip';

import { GITHUB_API_BASE, GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';

import {
  buildDatasetFromNeutral,
  buildRunSummary,
  type CollectiveXNeutralRunMeta,
} from '@/components/collectivex/reader';
import type {
  CollectiveXDataset,
  CollectiveXRunSummary,
  CollectiveXVersion,
} from '@/components/collectivex/types';

const BRANCH = 'collectivex';
const WORKFLOW_PATH = '.github/workflows/collectivex-sweep.yml';
const WORKFLOW_FILE = 'collectivex-sweep.yml';
const WORKFLOW_NAME = 'CollectiveX Sweep';
const RUNS_PER_PAGE = 100;
const ARTIFACTS_PER_PAGE = 100;

// Artifact families uploaded by the current sweep.
const MATRIX_PREFIX = 'cxsweep-matrix-';
const SHARD_PREFIX = 'cxshard-';

const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_RUN_BYTES = 256 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUEST_ATTEMPTS = 3;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const LATEST_TTL_MS = 60_000;
const RUN_TTL_MS = 60_000;
// The picker lists a recent window; each listed run costs one artifact-bundle
// download + build, so the fan-out stays bounded.
const MAX_LISTED_RUNS = 8;

type SweepErrorCode = 'invalid' | 'not-found' | 'unavailable';

interface WorkflowRun {
  id: number;
  name: string;
  path: string;
  head_branch: string | null;
  head_sha: string;
  status: string | null;
  conclusion: string | null;
  run_attempt: number;
  run_started_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

interface GithubArtifact {
  id: number;
  name: string;
  archive_download_url: string;
  expired?: boolean;
  size_in_bytes?: number;
}

class CollectiveXSweepError extends Error {
  readonly code: SweepErrorCode;

  constructor(code: SweepErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CollectiveXSweepError';
    this.code = code;
  }
}

export function collectiveXSweepErrorCode(error: unknown): SweepErrorCode | null {
  return error instanceof CollectiveXSweepError ? error.code : null;
}

const runCache = new Map<string, { expiresAt: number; promise: Promise<CollectiveXDataset> }>();
const latestCache = new Map<
  CollectiveXVersion,
  { expiresAt: number; promise: Promise<CollectiveXDataset> }
>();
const listCache = new Map<
  CollectiveXVersion,
  { expiresAt: number; promise: Promise<CollectiveXRunSummary[]> }
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
  throw new CollectiveXSweepError('unavailable', 'GitHub request failed', { cause: lastError });
}

function requireToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new CollectiveXSweepError('unavailable', 'GITHUB_TOKEN is not configured');
  return token;
}

function isSweepRun(run: WorkflowRun): boolean {
  return (
    run.name === WORKFLOW_NAME &&
    run.path === WORKFLOW_PATH &&
    run.head_branch === BRANCH &&
    Number.isSafeInteger(run.id) &&
    run.id > 0 &&
    Number.isSafeInteger(run.run_attempt) &&
    run.run_attempt > 0
  );
}

function runGeneratedAt(run: WorkflowRun): string {
  return run.updated_at || run.run_started_at || run.created_at || '';
}

// Newest-first stream of completed sweep runs on the branch. Discovery never
// gates on conclusion — a red or partial run still surfaces what it produced.
async function* sweepRuns(token: string): AsyncGenerator<WorkflowRun> {
  let page = 1;
  let visited = 0;
  let total: number | null = null;
  while (total === null || visited < total) {
    const parameters = new URLSearchParams({
      branch: BRANCH,
      status: 'completed',
      per_page: String(RUNS_PER_PAGE),
      page: String(page),
    });
    const response = await githubFetch(
      `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/runs?${parameters}`,
      token,
    );
    if (!response.ok) {
      throw new CollectiveXSweepError(
        'unavailable',
        `GitHub run discovery failed (${response.status})`,
      );
    }
    const payload = (await response.json()) as {
      total_count?: number;
      workflow_runs?: WorkflowRun[];
    };
    const runs = payload.workflow_runs ?? [];
    if (
      total === null &&
      Number.isSafeInteger(payload.total_count) &&
      (payload.total_count ?? -1) >= 0
    ) {
      total = payload.total_count!;
    }
    if (runs.length === 0) break;
    visited += runs.length;
    for (const run of runs) if (isSweepRun(run)) yield run;
    if (runs.length < RUNS_PER_PAGE || (total !== null && visited >= total)) break;
    page += 1;
  }
}

async function listArtifacts(runId: number, token: string): Promise<GithubArtifact[]> {
  const artifacts: GithubArtifact[] = [];
  let page = 1;
  let total: number | null = null;
  while (total === null || artifacts.length < total) {
    const response = await githubFetch(
      `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}/artifacts?per_page=${ARTIFACTS_PER_PAGE}&page=${page}`,
      token,
    );
    if (!response.ok) {
      throw new CollectiveXSweepError(
        'unavailable',
        `GitHub artifact discovery failed (${response.status})`,
      );
    }
    const payload = (await response.json()) as {
      total_count?: number;
      artifacts?: GithubArtifact[];
    };
    const page_artifacts = payload.artifacts ?? [];
    if (
      total === null &&
      Number.isSafeInteger(payload.total_count) &&
      (payload.total_count ?? -1) >= 0
    ) {
      total = payload.total_count!;
    }
    if (page_artifacts.length === 0) break;
    artifacts.push(...page_artifacts);
    if (page_artifacts.length < ARTIFACTS_PER_PAGE) break;
    page += 1;
  }
  return artifacts.filter((artifact) => !artifact.expired);
}

function hasMatrixArtifact(artifacts: GithubArtifact[], run: WorkflowRun): boolean {
  return artifacts.some((artifact) => artifact.name === `${MATRIX_PREFIX}${run.id}`);
}

async function collectDocs(artifact: GithubArtifact, token: string): Promise<unknown[]> {
  if (artifact.size_in_bytes !== undefined && artifact.size_in_bytes > MAX_ARTIFACT_BYTES) {
    throw new CollectiveXSweepError('invalid', `artifact ${artifact.name} is oversized`);
  }
  const response = await githubFetch(artifact.archive_download_url, token);
  if (!response.ok) {
    throw new CollectiveXSweepError(
      'unavailable',
      `GitHub artifact download failed (${response.status})`,
    );
  }
  const archive = Buffer.from(await response.arrayBuffer());
  if (archive.byteLength > MAX_ARTIFACT_BYTES) {
    throw new CollectiveXSweepError('invalid', `artifact ${artifact.name} archive is oversized`);
  }
  let zip: AdmZip;
  try {
    zip = new AdmZip(archive);
  } catch (error) {
    throw new CollectiveXSweepError('invalid', `artifact ${artifact.name} is not a ZIP`, {
      cause: error,
    });
  }
  const docs: unknown[] = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !entry.entryName.endsWith('.json')) continue;
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(entry.getData());
    } catch (error) {
      throw new CollectiveXSweepError('invalid', `artifact ${artifact.name} has non-UTF-8 entry`, {
        cause: error,
      });
    }
    try {
      docs.push(JSON.parse(text));
    } catch (error) {
      throw new CollectiveXSweepError('invalid', `artifact ${artifact.name} has invalid JSON`, {
        cause: error,
      });
    }
  }
  return docs;
}

// A run's validated matrix, its selectable version tag, and the artifacts that
// feed dataset assembly. Kept separate from assembly so run selection can read
// the version tag cheaply (matrix docs are tiny) before committing to a build.
interface MatrixCandidate {
  matrixDoc: unknown;
  version: number;
  matrixArtifacts: GithubArtifact[];
  resultArtifacts: GithubArtifact[];
}

function resultArtifactsForRun(artifacts: GithubArtifact[], run: WorkflowRun): GithubArtifact[] {
  const suffix = new RegExp(`^${SHARD_PREFIX}(.+)-${run.id}-([1-9][0-9]*)$`);
  const selected = new Map<string, { artifact: GithubArtifact; attempt: number }>();
  for (const artifact of artifacts) {
    const match = suffix.exec(artifact.name);
    if (!match) continue;
    const attempt = Number(match[2]);
    if (attempt > run.run_attempt) continue;
    const previous = selected.get(match[1]);
    if (
      !previous ||
      attempt > previous.attempt ||
      (attempt === previous.attempt && artifact.id > previous.artifact.id)
    ) {
      selected.set(match[1], { artifact, attempt });
    }
  }
  return [...selected.values()]
    .map(({ artifact }) => artifact)
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

function matrixVersion(doc: unknown): number | null {
  const value = (doc as { version?: unknown } | null)?.version;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

// Download + structurally validate a run's matrix artifact and read its neutral
// `version` tag. The matrix doc no longer carries a `format`/`record_type` tag, so it
// is identified structurally by its requested_cases[] + include[] arrays and a valid
// numeric `version`; that `version` field is the content axis the frontend selects on.
function isMatrixDoc(doc: unknown): boolean {
  const candidate = doc as { requested_cases?: unknown; include?: unknown } | null;
  return (
    Array.isArray(candidate?.requested_cases) &&
    Array.isArray(candidate?.include) &&
    matrixVersion(doc) !== null
  );
}

async function loadMatrixCandidate(
  artifacts: GithubArtifact[],
  token: string,
  run: WorkflowRun,
): Promise<MatrixCandidate> {
  const matrixArtifacts = artifacts
    .filter((artifact) => artifact.name === `${MATRIX_PREFIX}${run.id}`)
    .toSorted((left, right) => right.id - left.id)
    .slice(0, 1);
  if (matrixArtifacts.length === 0) {
    throw new CollectiveXSweepError('not-found', 'sweep run has no matrix artifact');
  }
  const matrixDocs: unknown[] = [];
  for (const artifact of matrixArtifacts) matrixDocs.push(...(await collectDocs(artifact, token)));
  const matrixCandidates = matrixDocs.filter((doc) => isMatrixDoc(doc));
  if (matrixCandidates.length !== 1) {
    throw new CollectiveXSweepError('invalid', 'sweep run must carry exactly one matrix document');
  }
  const version = matrixVersion(matrixCandidates[0]);
  if (version === null) {
    throw new CollectiveXSweepError('invalid', 'matrix document has no valid version tag');
  }
  const resultArtifacts = resultArtifactsForRun(artifacts, run);
  return { matrixDoc: matrixCandidates[0], version, matrixArtifacts, resultArtifacts };
}

async function assembleRun(
  run: WorkflowRun,
  candidate: MatrixCandidate,
  token: string,
): Promise<CollectiveXDataset> {
  const generatedAt = runGeneratedAt(run);
  if (!generatedAt) {
    throw new CollectiveXSweepError('invalid', 'sweep run is missing a timestamp');
  }

  let totalBytes = 0;
  for (const artifact of [...candidate.matrixArtifacts, ...candidate.resultArtifacts]) {
    totalBytes += artifact.size_in_bytes ?? 0;
    if (totalBytes > MAX_RUN_BYTES) {
      throw new CollectiveXSweepError('invalid', 'sweep run artifacts exceed the size budget');
    }
  }

  const docs: unknown[] = [];
  for (const artifact of candidate.resultArtifacts) {
    docs.push(...(await collectDocs(artifact, token)));
  }

  const meta: CollectiveXNeutralRunMeta = {
    run_id: String(run.id),
    run_attempt: run.run_attempt,
    generated_at: generatedAt,
    conclusion: run.conclusion,
    source_sha: run.head_sha,
  };

  try {
    return buildDatasetFromNeutral(candidate.matrixDoc, docs, meta);
  } catch (error) {
    throw new CollectiveXSweepError('invalid', 'sweep run artifacts failed validation', {
      cause: error,
    });
  }
}

async function fetchRunById(
  version: CollectiveXVersion,
  runId: string,
): Promise<CollectiveXDataset> {
  const token = requireToken();
  const numericId = Number(runId);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    throw new CollectiveXSweepError('not-found', 'invalid run id');
  }
  const response = await githubFetch(
    `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${numericId}`,
    token,
  );
  if (response.status === 404) {
    throw new CollectiveXSweepError('not-found', 'sweep run not found');
  }
  if (!response.ok) {
    throw new CollectiveXSweepError('unavailable', `GitHub run lookup failed (${response.status})`);
  }
  const run = (await response.json()) as WorkflowRun;
  if (!isSweepRun(run)) {
    throw new CollectiveXSweepError('not-found', 'run is not a CollectiveX sweep');
  }
  const artifacts = await listArtifacts(run.id, token);
  const candidate = await loadMatrixCandidate(artifacts, token, run);
  if (candidate.version !== version) {
    throw new CollectiveXSweepError('not-found', 'run does not match the requested version');
  }
  return assembleRun(run, candidate, token);
}

async function fetchLatestRun(version: CollectiveXVersion): Promise<CollectiveXDataset> {
  const token = requireToken();
  // Newest-wins within the requested version: skip runs tagged for another
  // version rather than erroring, so a future vN rollout never breaks vN-1.
  for await (const run of sweepRuns(token)) {
    const artifacts = await listArtifacts(run.id, token);
    if (!hasMatrixArtifact(artifacts, run)) continue;
    const candidate = await loadMatrixCandidate(artifacts, token, run);
    if (candidate.version !== version) continue;
    return assembleRun(run, candidate, token);
  }
  throw new CollectiveXSweepError('not-found', 'no CollectiveX sweep run with artifacts');
}

async function fetchRunList(version: CollectiveXVersion): Promise<CollectiveXRunSummary[]> {
  const token = requireToken();
  const summaries: CollectiveXRunSummary[] = [];
  for await (const run of sweepRuns(token)) {
    const artifacts = await listArtifacts(run.id, token);
    if (!hasMatrixArtifact(artifacts, run)) continue;
    const candidate = await loadMatrixCandidate(artifacts, token, run);
    if (candidate.version !== version) continue;
    const cacheKey = `${version}:${run.id}`;
    const cached = runCache.get(cacheKey);
    let datasetPromise = cached && cached.expiresAt > Date.now() ? cached.promise : undefined;
    if (!datasetPromise) {
      datasetPromise = assembleRun(run, candidate, token);
      runCache.set(cacheKey, { expiresAt: Date.now() + RUN_TTL_MS, promise: datasetPromise });
      datasetPromise.catch(() => runCache.delete(cacheKey));
    }
    summaries.push(buildRunSummary(await datasetPromise));
    if (summaries.length >= MAX_LISTED_RUNS) break;
  }
  return summaries;
}

export function loadCollectiveXSweepRun(
  version: CollectiveXVersion,
  runId?: string,
): Promise<CollectiveXDataset> {
  const now = Date.now();
  if (runId) {
    const cacheKey = `${version}:${runId}`;
    const cached = runCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.promise;
    const promise = fetchRunById(version, runId).catch((error) => {
      runCache.delete(cacheKey);
      throw error;
    });
    runCache.set(cacheKey, { expiresAt: now + RUN_TTL_MS, promise });
    return promise;
  }
  const cached = latestCache.get(version);
  if (cached && cached.expiresAt > now) return cached.promise;
  const promise = fetchLatestRun(version).catch((error) => {
    latestCache.delete(version);
    throw error;
  });
  latestCache.set(version, { expiresAt: now + LATEST_TTL_MS, promise });
  return promise;
}

export function listCollectiveXSweepRuns(
  version: CollectiveXVersion,
): Promise<CollectiveXRunSummary[]> {
  const now = Date.now();
  const cached = listCache.get(version);
  if (cached && cached.expiresAt > now) return cached.promise;
  const promise = fetchRunList(version).catch((error) => {
    listCache.delete(version);
    throw error;
  });
  listCache.set(version, { expiresAt: now + LATEST_TTL_MS, promise });
  return promise;
}

export function clearCollectiveXSweepCache(): void {
  runCache.clear();
  latestCache.clear();
  listCache.clear();
}
