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
import {
  matrixArtifactName,
  selectShardArtifacts,
} from '@semianalysisai/inferencex-db/collectivex/artifact-selection';
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

const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_RUN_BYTES = 256 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUEST_ATTEMPTS = 3;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
// The workflow retains artifacts for 14 days. Older runs already persisted in
// the DB remain visible, but unknown runs beyond this window cannot be
// assembled and need not spend one GitHub artifact-list request apiece.
const ARTIFACT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
// GitHub permits a workflow rerun for 30 days after creation. Include that
// whole window plus artifact retention so the created-date filter still finds
// the oldest run whose newest rerun artifacts could be downloadable.
const WORKFLOW_RERUN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const DISCOVERY_LOOKBACK_MS = WORKFLOW_RERUN_WINDOW_MS + ARTIFACT_RETENTION_MS;
// Bound one origin request's work. The runs route reports whether discovery is
// complete, and the client refetches while more ingestible runs remain.
const MAX_CHANGED_RUNS_PER_PASS = 8;

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

// Concurrent requests for the same target share one discovery pass.
const inFlight = new Map<string, Promise<unknown>>();

function dedupe<T>(key: string, work: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = work().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

// Cooldown for the latest-run walk. The DB is the durable cache, but sharing
// only the in-flight promise still left every latest read walking GitHub. The
// runs-list path is intentionally not throttled while incomplete: its response
// is uncached and the client requests the next bounded discovery batch.
//
// Failures are remembered too, and rethrown for the rest of their (shorter)
// window: swallowing them would let a GitHub outage read as "discovery fine,
// nothing found", which downgrades the routes' 502/503 to a 404 when the DB is
// empty. The window is the upper bound on how stale "latest" can be.
const DISCOVERY_COOLDOWN_MS = 60_000;
const DISCOVERY_FAILURE_COOLDOWN_MS = 10_000;

interface DiscoveryOutcome {
  until: number;
  error: unknown;
}

const discoveryCooldown = new Map<string, DiscoveryOutcome>();

function throttled(key: string, work: () => Promise<void>): () => Promise<void> {
  return async () => {
    const settled = discoveryCooldown.get(key);
    if (settled && Date.now() < settled.until) {
      if (settled.error !== null) throw settled.error;
      return;
    }
    try {
      await work();
    } catch (error) {
      discoveryCooldown.set(key, { until: Date.now() + DISCOVERY_FAILURE_COOLDOWN_MS, error });
      throw error;
    }
    discoveryCooldown.set(key, { until: Date.now() + DISCOVERY_COOLDOWN_MS, error: null });
  };
}

/**
 * Test-only: drop every discovery cooldown. The module keeps this state for the
 * lifetime of the process, so a suite driving successive passes must clear it
 * between cases.
 */
export function resetCollectiveXDiscoveryCooldown(): void {
  discoveryCooldown.clear();
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

function artifactsMayBeAvailable(run: WorkflowRun): boolean {
  const timestamp = Date.parse(runGeneratedAt(run));
  return !Number.isFinite(timestamp) || Date.now() - timestamp <= ARTIFACT_RETENTION_MS;
}

// Newest-first stream of completed sweep runs across all branches. GitHub's
// created filter bounds cold-origin discovery without excluding any run whose
// original or rerun artifacts could still be within their retention window.
async function* sweepRuns(token: string): AsyncGenerator<WorkflowRun> {
  let page = 1;
  let visited = 0;
  let total: number | null = null;
  const createdSince = new Date(Date.now() - DISCOVERY_LOOKBACK_MS).toISOString();
  while (total === null || visited < total) {
    const parameters = new URLSearchParams({
      status: 'completed',
      created: `>=${createdSince}`,
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
  return artifacts.some((artifact) => artifact.name === matrixArtifactName(String(run.id)));
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
  return selectShardArtifacts(artifacts, String(run.id), run.run_attempt).toSorted((left, right) =>
    left.name.localeCompare(right.name),
  );
}

async function loadMatrixCandidate(
  artifacts: GithubArtifact[],
  token: string,
  run: WorkflowRun,
): Promise<MatrixCandidate> {
  const matrixArtifacts = artifacts
    .filter((artifact) => artifact.name === matrixArtifactName(String(run.id)))
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
): Promise<boolean> {
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

  // Assemble once to validate the bundle and precompute the run-table summary;
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
  return refresh
    ? refreshCollectiveXRunAttempt(getCollectiveXWriteDb(), row, docs)
    : insertCollectiveXRun(getCollectiveXWriteDb(), row, docs);
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
 * everything else. `changed-match` means this pass inserted or refreshed the
 * requested version; `changed-other` means an absent run was persisted under
 * its actual version while walking. Known live rows are `match` but do not
 * consume the runs-list batch. Tombstoned rows are `skip`.
 */
type CandidateResult = 'changed-match' | 'changed-other' | 'match' | 'skip';

async function considerCandidate(
  run: WorkflowRun,
  version: CollectiveXVersion,
  token: string,
): Promise<CandidateResult> {
  const states = await getCollectiveXRunStates(getCollectiveXDb(), [String(run.id)]);
  const known = states[String(run.id)];
  if (known) {
    if (known.version !== version || known.state !== 'live') return 'skip';
    if (run.run_attempt > known.run_attempt) {
      const candidate = await matrixCandidateFor(run, version, token);
      if (candidate) {
        const changed = await persistRun(run, candidate, token, true);
        return changed ? 'changed-match' : 'match';
      }
    }
    return 'match';
  }
  const artifacts = await listArtifacts(run.id, token);
  if (!hasMatrixArtifact(artifacts, run)) return 'skip';
  const candidate = await loadMatrixCandidate(artifacts, token, run);
  const changed = await persistRun(run, candidate, token);
  if (!changed) return candidate.version === version ? 'match' : 'skip';
  return candidate.version === version ? 'changed-match' : 'changed-other';
}

/**
 * Make sure the newest requested-version sweep run on GitHub is in the DB.
 * Completes silently when GitHub has nothing new; throws only on GitHub or
 * artifact failures (callers fall back to whatever the DB already holds).
 */
export function ensureLatestCollectiveXRun(version: CollectiveXVersion): Promise<void> {
  const key = `latest:${version}`;
  return dedupe(
    key,
    throttled(key, async () => {
      const token = requireToken();
      for await (const run of sweepRuns(token)) {
        const result = await considerCandidate(run, version, token);
        if (result === 'match' || result === 'changed-match') return;
      }
    }),
  );
}

/**
 * Progressively backfill every requested-version run whose artifacts may
 * still be available. Known live rows do not consume the per-request batch,
 * so successive calls advance through the workflow history instead of
 * revisiting the same newest rows forever.
 *
 * Returns true once the current GitHub history has been exhausted, or false
 * when this pass stopped at the mutation budget and the caller should refetch.
 */
export function ensureCollectiveXRunsList(version: CollectiveXVersion): Promise<boolean> {
  const key = `list:${version}`;
  return dedupe(key, async () => {
    const token = requireToken();
    let changed = 0;
    for await (const run of sweepRuns(token)) {
      if (!artifactsMayBeAvailable(run)) continue;
      let result: CandidateResult;
      try {
        result = await considerCandidate(run, version, token);
      } catch (error) {
        const code = collectiveXSweepErrorCode(error);
        // One incomplete or malformed workflow run must not hide every valid
        // run behind it. Network/service failures still abort so the route can
        // serve its stored fallback and expose the outage when no fallback exists.
        if (code === 'invalid' || code === 'not-found') continue;
        throw error;
      }
      if (result === 'changed-match' || result === 'changed-other') changed += 1;
      if (changed >= MAX_CHANGED_RUNS_PER_PASS) return false;
    }
    return true;
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
    if (known && (known.state !== 'live' || known.version !== version)) {
      // Tombstoned or cross-version rows both read as absent to the caller.
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
    if (known && run.run_attempt <= known.run_attempt) return;
    const artifacts = await listArtifacts(run.id, token);
    const candidate = await loadMatrixCandidate(artifacts, token, run);
    if (candidate.version !== version) {
      throw new CollectiveXSweepError('not-found', 'run does not match the requested version');
    }
    await persistRun(run, candidate, token, known !== undefined);
  });
}
