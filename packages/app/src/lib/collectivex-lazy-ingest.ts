/**
 * Lazy CollectiveX ingest: the CollectiveX database is a durable cache of
 * GitHub Actions, populated on read. Each `ensure*` function checks the DB
 * first and only then discovers/downloads sweep artifacts from GitHub,
 * persisting the RAW documents so a run outlives its 14-day artifact
 * retention once anyone has viewed it.
 *
 * Rules encoded here:
 *  - Sweep runs are accepted from ANY branch (they are launched via `gh api`
 *    on feature branches); only the workflow identity is checked.
 *  - Discovery never gates on conclusion — a red or partial run still
 *    surfaces what it produced.
 *  - Tombstoned runs (deleted via the dashboard) are never re-ingested.
 *  - GitHub being down must not take the page down: callers read the DB
 *    after `ensure*` and serve whatever is there, so these functions only
 *    matter when the DB has nothing to fall back to.
 */

import AdmZip from 'adm-zip';

import { GITHUB_API_BASE, GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';

import {
  buildDatasetFromNeutral,
  buildRunSummary,
  isMatrixDoc,
  matrixVersion,
} from '@semianalysisai/inferencex-db/collectivex/reader';
import type { CollectiveXVersion } from '@semianalysisai/inferencex-db/collectivex/types';
import { getCollectiveXDb, getCollectiveXWriteDb } from '@semianalysisai/inferencex-db/connection';
import {
  getCollectiveXRunStates,
  insertCollectiveXRun,
  refreshCollectiveXRunAttempt,
} from '@semianalysisai/inferencex-db/queries/collectivex';

const WORKFLOW_PATH = '.github/workflows/collectivex-sweep.yml';
const WORKFLOW_FILE = 'collectivex-sweep.yml';
const WORKFLOW_NAME = 'CollectiveX Sweep';
const RUNS_PER_PAGE = 100;
const ARTIFACTS_PER_PAGE = 100;

// Artifact families uploaded by the sweep.
const MATRIX_PREFIX = 'cxsweep-matrix-';
const SHARD_PREFIX = 'cxshard-';

const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_RUN_BYTES = 256 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUEST_ATTEMPTS = 3;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
// The picker backfill ingests at most this many recent runs per pass; each
// costs one artifact-bundle download, and only once — afterwards they're rows.
const MAX_DISCOVERED_RUNS = 8;

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

/** HTTP status for a sweep-ingest failure; null for unexpected errors. */
export function collectiveXSweepErrorStatus(error: unknown): 404 | 502 | 503 | null {
  const code = collectiveXSweepErrorCode(error);
  if (code === 'not-found') return 404;
  if (code === 'unavailable') return 503;
  if (code === 'invalid') return 502;
  return null;
}

// Concurrent requests for the same target share one discovery pass; the DB is
// the cache, so nothing is memoized beyond the in-flight promise.
const inFlight = new Map<string, Promise<void>>();

function dedupe(key: string, work: () => Promise<void>): Promise<void> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = work().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

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

// Identity check only — never the branch: sweeps run on feature branches.
function isSweepRun(run: WorkflowRun): boolean {
  return (
    run.name === WORKFLOW_NAME &&
    run.path === WORKFLOW_PATH &&
    Number.isSafeInteger(run.id) &&
    run.id > 0 &&
    Number.isSafeInteger(run.run_attempt) &&
    run.run_attempt > 0
  );
}

function runGeneratedAt(run: WorkflowRun): string {
  return run.updated_at || run.run_started_at || run.created_at || '';
}

// Newest-first stream of completed sweep runs across all branches.
async function* sweepRuns(token: string): AsyncGenerator<WorkflowRun> {
  let page = 1;
  let visited = 0;
  let total: number | null = null;
  while (total === null || visited < total) {
    const parameters = new URLSearchParams({
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

// A run's validated matrix, its version tag, and the artifacts that feed
// persistence. Kept separate so discovery can read the version tag cheaply
// (matrix docs are tiny) before committing to a full download.
interface MatrixCandidate {
  matrixDoc: unknown;
  version: number;
  matrixArtifacts: GithubArtifact[];
  resultArtifacts: GithubArtifact[];
}

function resultArtifactsForRun(artifacts: GithubArtifact[], run: WorkflowRun): GithubArtifact[] {
  const suffix = new RegExp(`^${SHARD_PREFIX}(.+)-${run.id}-([1-9][0-9]*)$`, 'u');
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

/**
 * Download a candidate's result docs, validate assembly, persist raw.
 * `refresh` replaces an already-live row whose GitHub attempt is newer (a
 * re-run of failed shards); plain inserts are conflict-safe no-ops.
 */
async function persistRun(
  run: WorkflowRun,
  candidate: MatrixCandidate,
  token: string,
  refresh = false,
): Promise<void> {
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

  const meta = {
    run_id: String(run.id),
    run_attempt: run.run_attempt,
    generated_at: generatedAt,
    conclusion: run.conclusion,
    source_sha: run.head_sha,
  };

  // Assemble once to validate the bundle and precompute the picker summary;
  // only the raw documents are stored.
  let summary;
  try {
    summary = buildRunSummary(buildDatasetFromNeutral(candidate.matrixDoc, docs, meta));
  } catch (error) {
    throw new CollectiveXSweepError('invalid', 'sweep run artifacts failed validation', {
      cause: error,
    });
  }

  const row = {
    ...meta,
    version: candidate.version,
    source_branch: run.head_branch,
    matrix: candidate.matrixDoc,
    summary,
  };
  await (refresh
    ? refreshCollectiveXRunAttempt(getCollectiveXWriteDb(), row, docs)
    : insertCollectiveXRun(getCollectiveXWriteDb(), row, docs));
}

/** Download and version-check a candidate's matrix; null when not ingestible. */
async function matrixCandidateFor(
  run: WorkflowRun,
  version: CollectiveXVersion,
  token: string,
): Promise<MatrixCandidate | null> {
  const artifacts = await listArtifacts(run.id, token);
  if (!hasMatrixArtifact(artifacts, run)) return null;
  const candidate = await loadMatrixCandidate(artifacts, token, run);
  return candidate.version === version ? candidate : null;
}

/**
 * Handle one discovery candidate — the single walker step shared by the
 * latest and runs-list paths: persist absent requested-version runs, refresh
 * live ones whose GitHub attempt is newer (re-run of failed shards), skip
 * everything else. Returns 'match' when the candidate is a live
 * requested-version run in the DB after this call; tombstoned runs are
 * 'skip' — they are invisible to readers and must not satisfy the walk.
 */
async function considerCandidate(
  run: WorkflowRun,
  version: CollectiveXVersion,
  token: string,
): Promise<'match' | 'skip'> {
  const states = await getCollectiveXRunStates(getCollectiveXDb(), [String(run.id)]);
  const known = states[String(run.id)];
  if (known) {
    if (known.version !== version || known.state !== 'live') return 'skip';
    if (run.run_attempt > known.run_attempt) {
      const candidate = await matrixCandidateFor(run, version, token);
      if (candidate) await persistRun(run, candidate, token, true);
    }
    return 'match';
  }
  const candidate = await matrixCandidateFor(run, version, token);
  if (!candidate) return 'skip';
  await persistRun(run, candidate, token);
  return 'match';
}

/**
 * Make sure the newest requested-version sweep run on GitHub is in the DB.
 * Completes silently when GitHub has nothing new; throws only on GitHub or
 * artifact failures (callers fall back to whatever the DB already holds).
 */
export function ensureLatestCollectiveXRun(version: CollectiveXVersion): Promise<void> {
  return dedupe(`latest:${version}`, async () => {
    const token = requireToken();
    for await (const run of sweepRuns(token)) {
      if ((await considerCandidate(run, version, token)) === 'match') return;
    }
  });
}

/**
 * Backfill up to MAX_DISCOVERED_RUNS recent requested-version runs into the
 * DB so the picker lists recent sweeps even before anyone viewed them. Only
 * live matches count toward the cap — tombstoned runs never fill a slot.
 */
export function ensureCollectiveXRunsList(version: CollectiveXVersion): Promise<void> {
  return dedupe(`list:${version}`, async () => {
    const token = requireToken();
    let matched = 0;
    for await (const run of sweepRuns(token)) {
      if ((await considerCandidate(run, version, token)) === 'match') matched += 1;
      if (matched >= MAX_DISCOVERED_RUNS) return;
    }
  });
}

/**
 * Make sure one specific run is in the DB. Throws 'not-found' for absent,
 * non-sweep, cross-version, or tombstoned runs.
 */
export function ensureCollectiveXRun(version: CollectiveXVersion, runId: string): Promise<void> {
  return dedupe(`run:${version}:${runId}`, async () => {
    const numericId = Number(runId);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) {
      throw new CollectiveXSweepError('not-found', 'invalid run id');
    }
    const states = await getCollectiveXRunStates(getCollectiveXDb(), [runId]);
    const known = states[runId];
    if (known) {
      // Tombstoned or cross-version rows both read as absent to the caller.
      if (known.state === 'live' && known.version === version) return;
      throw new CollectiveXSweepError('not-found', 'run is not available');
    }
    const token = requireToken();
    const response = await githubFetch(
      `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${numericId}`,
      token,
    );
    if (response.status === 404) {
      throw new CollectiveXSweepError('not-found', 'sweep run not found');
    }
    if (!response.ok) {
      throw new CollectiveXSweepError(
        'unavailable',
        `GitHub run lookup failed (${response.status})`,
      );
    }
    const run = (await response.json()) as WorkflowRun;
    if (!isSweepRun(run)) {
      throw new CollectiveXSweepError('not-found', 'run is not a CollectiveX sweep');
    }
    // Persisting an in-progress run would freeze a partial snapshot forever
    // (the run_id is then "known" and never re-fetched). Discovery only sees
    // completed runs; hold fetch-by-id to the same bar.
    if (run.status !== 'completed') {
      throw new CollectiveXSweepError('not-found', 'sweep run has not completed');
    }
    const artifacts = await listArtifacts(run.id, token);
    const candidate = await loadMatrixCandidate(artifacts, token, run);
    if (candidate.version !== version) {
      throw new CollectiveXSweepError('not-found', 'run does not match the requested version');
    }
    await persistRun(run, candidate, token);
  });
}
