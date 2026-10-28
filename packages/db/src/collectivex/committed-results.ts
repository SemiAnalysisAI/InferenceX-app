/**
 * CollectiveX results committed to the benchmark repo: `collectivex/results/cases.json`
 * (the requested cases) plus one `collectivex/results/<sku>/<case_id>.json` per measured
 * case. Each InferenceX commit on main that carries measured results becomes one stored
 * run, so this module pins a ref to a commit, reads exactly those files at it, validates
 * them, and turns them into a cx_runs row. Used by the ingest CLI (ingest-collectivex.ts),
 * which the ingest-collectivex workflow runs; the app itself never ingests.
 */

import {
  GITHUB_API_BASE,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_REPO_FULL,
} from '@semianalysisai/inferencex-constants';

import type { CollectiveXRunInsert } from '../queries/collectivex';
import { buildDatasetFromNeutral, buildRunSummary, type CollectiveXNeutralRunMeta } from './reader';

export const RESULTS_DIR = 'collectivex/results';
export const RESULTS_BRANCH = 'main';
const CASES_FILE = 'cases.json';
const SWAP_SCHEMA = 'collectivex-swap-blocks-v1';
// The benchmark repo's own test caps a result at 1 MiB; leave headroom without
// letting one commit exhaust a function's memory.
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const FETCH_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 30_000;
const FETCH_CONCURRENCY = 8;
const COMMITS_PER_PAGE = 100;
const SHA = /^[0-9a-f]{40}$/u;
const RESULT_PATH = /^(?<sku>[^/]+)\/(?<caseId>[^/]+)\.json$/u;
// Mirrors collectivex/tests/test_results.py in the benchmark repo: results must not name
// machines, by IPv4 address in any string or by a host-identifying key anywhere.
const IPV4 = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/u;
const HOST_KEYS = new Set([
  'host',
  'hosts',
  'hostname',
  'nodelist',
  'slurm_nodelist',
  'master_addr',
]);
/**
 * Exclusive upper bound of a committed-results run_id. Ids are epoch seconds (below this
 * until the year 2286); the retired lazy ingest keyed runs by GitHub Actions run id, which
 * is at or above it, and migration 005 removes those rows and forbids new ones.
 */
export const MAX_COMMITTED_RUN_ID = 10_000_000_000;

export interface GithubReadOptions {
  /** Authenticates API and raw reads; without it GitHub's unauthenticated rate limit applies. */
  token?: string;
  fetch?: typeof globalThis.fetch;
}

/** A commit as GitHub lists it. */
export interface GithubCommit {
  sha: string;
  /** Committer time (ISO 8601): when the commit landed on its branch. */
  committedAt: string;
}

/** A results commit in main's history, with the run_id it is stored under. */
export interface ResultsCommit extends GithubCommit {
  /**
   * Committer time in epoch seconds, raised to one past the previous results commit's
   * id when it would not exceed it (two commits in the same second, or a committer
   * clock behind its parent). Derived from main's history alone, so every ingest of a
   * commit assigns it the same id, ids are unique, and they grow with history.
   */
  runId: string;
}

/** One commit's files under RESULTS_DIR, keyed by path relative to it. */
export interface ResultsSource extends ResultsCommit {
  files: Map<string, Uint8Array>;
}

export interface CommittedResults extends ResultsCommit {
  version: number;
  matrix: unknown;
  docs: unknown[];
}

/**
 * `invalid`: the committed files break the results contract. `not-found`: the ref,
 * the results directory, or a main-history results commit does not exist. `absent`: the
 * commit is readable and has no results directory (it deleted them), so there is no run.
 * `unavailable`: GitHub could not be read.
 */
export type CommittedResultsErrorKind = 'invalid' | 'not-found' | 'absent' | 'unavailable';

export class CommittedResultsError extends Error {
  readonly kind: CommittedResultsErrorKind;

  constructor(kind: CommittedResultsErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CommittedResultsError';
    this.kind = kind;
  }
}

function apiHeaders(token?: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof globalThis.fetch,
): Promise<Response> {
  let failure: unknown;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.ok) return response;
      failure = new Error(`${url} returned HTTP ${response.status}`);
      // A raw file the trees API already listed exists, so its 404 is a CDN miss worth retrying;
      // only the API's own 404/422 means the commit or tree is really absent.
      const listedFile = new URL(url).hostname === 'raw.githubusercontent.com';
      if (!listedFile && (response.status === 404 || response.status === 422)) {
        throw new CommittedResultsError('not-found', `${url} returned HTTP ${response.status}`);
      }
      if (listedFile && response.status === 404) {
        if (attempt < FETCH_ATTEMPTS) {
          await new Promise((settle) => {
            setTimeout(settle, 1000 * attempt);
          });
        }
        continue;
      }
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      if (error instanceof CommittedResultsError) throw error;
      failure = error;
    }
    if (attempt < FETCH_ATTEMPTS) {
      await new Promise((settle) => {
        setTimeout(settle, 1000 * attempt);
      });
    }
  }
  throw new CommittedResultsError('unavailable', `Reading ${url} failed`, { cause: failure });
}

async function getJson(url: string, options: GithubReadOptions): Promise<unknown> {
  const response = await request(url, apiHeaders(options.token), options.fetch ?? fetch);
  return response.json();
}

function toGithubCommit(body: unknown): GithubCommit {
  const commit = body as { sha?: unknown; commit?: { committer?: { date?: unknown } } } | null;
  const date = commit?.commit?.committer?.date;
  if (
    typeof commit?.sha !== 'string' ||
    !SHA.test(commit.sha) ||
    typeof date !== 'string' ||
    !Number.isFinite(Date.parse(date))
  ) {
    throw new CommittedResultsError('unavailable', 'GitHub returned a malformed commit');
  }
  return { sha: commit.sha, committedAt: date };
}

async function resultsCommitsPage(
  ref: string,
  page: number,
  perPage: number,
  options: GithubReadOptions,
): Promise<GithubCommit[]> {
  const query = new URLSearchParams({
    sha: ref,
    path: RESULTS_DIR,
    per_page: String(perPage),
    page: String(page),
  });
  const body = await getJson(
    `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?${query}`,
    options,
  );
  if (!Array.isArray(body)) {
    throw new CommittedResultsError('unavailable', 'GitHub commit list is not an array');
  }
  return body.map(toGithubCommit);
}

/**
 * Give each results commit of a history (oldest first) its run_id: its committer
 * second, or one more than the previous id when that is not larger.
 */
export function assignRunIds(history: readonly GithubCommit[]): ResultsCommit[] {
  let previous = 0;
  return history.map((commit) => {
    const id = Math.max(Math.floor(Date.parse(commit.committedAt) / 1000), previous + 1);
    if (id >= MAX_COMMITTED_RUN_ID) {
      throw new CommittedResultsError('unavailable', `${commit.sha} has an out-of-range time`);
    }
    previous = id;
    return { ...commit, runId: String(id) };
  });
}

/** Every commit on `branch` that touched RESULTS_DIR, oldest first, with its run_id. */
export async function listResultsCommits(
  branch: string = RESULTS_BRANCH,
  options: GithubReadOptions = {},
): Promise<ResultsCommit[]> {
  const commits: GithubCommit[] = [];
  for (let page = 1; ; page++) {
    const batch = await resultsCommitsPage(branch, page, COMMITS_PER_PAGE, options);
    commits.push(...batch);
    if (batch.length < COMMITS_PER_PAGE) break;
  }
  return assignRunIds(commits.toReversed());
}

/**
 * Pin a branch, tag, or commit to the newest RESULTS_DIR commit at or before it,
 * and require that commit to be on RESULTS_BRANCH. A ref whose own commit did not
 * touch the results (for example main's head after an unrelated merge) therefore
 * resolves to the run already published for those files instead of a duplicate,
 * and results that never landed on main are never published.
 */
export async function resolveResultsCommit(
  ref: string,
  options: GithubReadOptions = {},
): Promise<ResultsCommit> {
  const [commit] = await resultsCommitsPage(ref, 1, 1, options);
  if (!commit) {
    throw new CommittedResultsError(
      'not-found',
      `No commit at or before ${ref} touched ${RESULTS_DIR}`,
    );
  }
  const history = await listResultsCommits(RESULTS_BRANCH, options);
  const entry = history.find((candidate) => candidate.sha === commit.sha);
  if (!entry) {
    throw new CommittedResultsError(
      'not-found',
      `${commit.sha} (from ${ref}) is not a ${RESULTS_DIR} commit on ${RESULTS_BRANCH}`,
    );
  }
  return entry;
}

interface TreeEntry {
  path: string;
  type: string;
  sha: string;
  size?: number;
}

/**
 * Read RESULTS_DIR at one commit: list it with the git trees API, then fetch each
 * blob from raw.githubusercontent.com, which does not count against the REST rate
 * limit. `blobCache` (keyed by blob sha) lets a backfill skip unchanged files.
 */
export async function fetchResultsSource(
  commit: ResultsCommit,
  options: GithubReadOptions & { blobCache?: Map<string, Uint8Array> } = {},
): Promise<ResultsSource> {
  const fetchImpl = options.fetch ?? fetch;
  let tree: { tree?: TreeEntry[]; truncated?: boolean };
  try {
    tree = (await getJson(
      `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/${commit.sha}:${RESULTS_DIR}?recursive=1`,
      options,
    )) as typeof tree;
  } catch (error) {
    if (error instanceof CommittedResultsError && error.kind === 'not-found') {
      // A 404 alone can be a GitHub miss; only a readable parent tree without results/ proves
      // the commit removed them.
      const parent = RESULTS_DIR.slice(0, RESULTS_DIR.lastIndexOf('/'));
      const leaf = RESULTS_DIR.slice(RESULTS_DIR.lastIndexOf('/') + 1);
      const listing = (await getJson(
        `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/${commit.sha}:${parent}`,
        options,
      ).catch(() => null)) as { tree?: TreeEntry[] } | null;
      const absent =
        Array.isArray(listing?.tree) && !listing.tree.some((entry) => entry.path === leaf);
      throw new CommittedResultsError(
        absent ? 'absent' : 'not-found',
        `${RESULTS_DIR} does not exist at ${commit.sha}`,
        {
          cause: error,
        },
      );
    }
    throw error;
  }
  if (tree.truncated || !Array.isArray(tree.tree)) {
    throw new CommittedResultsError(
      'unavailable',
      `GitHub truncated the ${RESULTS_DIR} tree at ${commit.sha}`,
    );
  }
  const blobs = tree.tree.filter((entry) => entry.type === 'blob' && entry.path.endsWith('.json'));
  let total = 0;
  for (const blob of blobs) {
    const size = blob.size ?? 0;
    if (size > MAX_FILE_BYTES) {
      throw new CommittedResultsError(
        'invalid',
        `${RESULTS_DIR}/${blob.path} exceeds ${MAX_FILE_BYTES} bytes`,
      );
    }
    total += size;
  }
  if (total > MAX_TOTAL_BYTES) {
    throw new CommittedResultsError(
      'invalid',
      `${RESULTS_DIR} at ${commit.sha} exceeds ${MAX_TOTAL_BYTES} bytes`,
    );
  }

  const headers: Record<string, string> = options.token
    ? { Authorization: `Bearer ${options.token}` }
    : {};
  const files = new Map<string, Uint8Array>();
  let next = 0;
  const worker = async () => {
    while (next < blobs.length) {
      const blob = blobs[next++];
      let data = options.blobCache?.get(blob.sha);
      if (!data) {
        const path = `${RESULTS_DIR}/${blob.path}`.split('/').map(encodeURIComponent).join('/');
        const response = await request(
          `https://raw.githubusercontent.com/${GITHUB_REPO_FULL}/${commit.sha}/${path}`,
          headers,
          fetchImpl,
        );
        data = new Uint8Array(await response.arrayBuffer());
        options.blobCache?.set(blob.sha, data);
      }
      files.set(blob.path, data);
    }
  };
  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, blobs.length) }, worker));
  return { ...commit, files };
}

interface ResultDoc {
  record_type?: unknown;
  schema?: unknown;
  case_id?: unknown;
  version?: unknown;
  identity?: { case_id?: unknown; case_factors?: { sku?: unknown } };
  provenance?: { source_sha?: unknown; source_dirty?: unknown };
  runtime?: { sku?: unknown; source_sha?: unknown; source_dirty?: unknown };
}

/** Identity fields of an EP case attempt or a swap_blocks result; null for anything else. */
function resultIdentity(doc: ResultDoc | null) {
  if (doc?.record_type === 'case-attempt') {
    return {
      caseId: doc.identity?.case_id,
      sku: doc.identity?.case_factors?.sku,
      sourceSha: doc.provenance?.source_sha,
      sourceDirty: doc.provenance?.source_dirty,
    };
  }
  if (doc?.schema === SWAP_SCHEMA) {
    return {
      caseId: doc.case_id,
      sku: doc.runtime?.sku,
      sourceSha: doc.runtime?.source_sha,
      sourceDirty: doc.runtime?.source_dirty,
    };
  }
  return null;
}

/** The first machine identifier in a document: an IPv4 address or a host-naming key. */
function machineIdentifier(value: unknown): string | null {
  if (typeof value === 'string') return IPV4.test(value) ? 'an IP address' : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = machineIdentifier(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (HOST_KEYS.has(key.toLowerCase())) return `the host-identifying field "${key}"`;
      const found = machineIdentifier(item);
      if (found) return found;
    }
  }
  return null;
}

function parseJson(path: string, data: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
  } catch (error) {
    throw new CommittedResultsError('invalid', `${path} is not UTF-8 JSON`, { cause: error });
  }
}

function runMeta(source: ResultsCommit): CollectiveXNeutralRunMeta {
  const seconds = Math.floor(Date.parse(source.committedAt) / 1000);
  return {
    run_id: source.runId,
    run_attempt: 1,
    generated_at: new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/u, 'Z'),
    conclusion: 'success',
    source_sha: source.sha,
  };
}

/**
 * Check one commit's files the way the benchmark repo's own test does: every
 * result sits at `<sku>/<case_id>.json` matching its document, answers a
 * runnable case in cases.json, was measured from committed code, and carries
 * the cases.json version. Every failure names the offending file.
 */
export function validateCommittedResults(source: ResultsSource): CommittedResults {
  const casesPath = `${RESULTS_DIR}/${CASES_FILE}`;
  const casesBytes = source.files.get(CASES_FILE);
  if (!casesBytes)
    throw new CommittedResultsError('invalid', `${casesPath} is missing at ${source.sha}`);
  const matrix = parseJson(casesPath, casesBytes) as {
    version?: unknown;
    requested_cases?: { sku?: unknown; disposition?: unknown; case?: { case_id?: unknown } }[];
  };
  if (
    typeof matrix?.version !== 'number' ||
    !Number.isSafeInteger(matrix.version) ||
    matrix.version <= 0 ||
    !Array.isArray(matrix.requested_cases)
  ) {
    throw new CommittedResultsError('invalid', `${casesPath} has no version and requested_cases`);
  }
  const { version } = matrix;
  const runnable = new Set(
    matrix.requested_cases
      .filter((entry) => entry?.disposition === 'runnable')
      .map((entry) => JSON.stringify([entry.sku, entry.case?.case_id])),
  );

  const results: { path: string; doc: unknown }[] = [];
  for (const [file, data] of [...source.files].toSorted(([a], [b]) => a.localeCompare(b))) {
    if (file === CASES_FILE) continue;
    const path = `${RESULTS_DIR}/${file}`;
    const location = RESULT_PATH.exec(file)?.groups;
    if (!location)
      throw new CommittedResultsError('invalid', `${path} is not at <sku>/<case_id>.json`);
    const doc = parseJson(path, data) as ResultDoc | null;
    const identity = resultIdentity(doc);
    if (!identity)
      throw new CommittedResultsError('invalid', `${path} is not a CollectiveX result document`);
    if (identity.caseId !== location.caseId || identity.sku !== location.sku) {
      throw new CommittedResultsError(
        'invalid',
        `${path} holds case ${String(identity.caseId)} on ${String(identity.sku)}; the file must be ${String(identity.sku)}/${String(identity.caseId)}.json`,
      );
    }
    if (!runnable.has(JSON.stringify([location.sku, location.caseId]))) {
      throw new CommittedResultsError('invalid', `${path} is not a runnable case in ${CASES_FILE}`);
    }
    if (typeof identity.sourceSha !== 'string' || !SHA.test(identity.sourceSha)) {
      throw new CommittedResultsError('invalid', `${path} has no 40-hex source_sha`);
    }
    if (identity.sourceDirty !== false) {
      throw new CommittedResultsError(
        'invalid',
        `${path} was not measured from committed collectivex/ code`,
      );
    }
    if (doc?.record_type === 'case-attempt' && doc.version !== version) {
      throw new CommittedResultsError(
        'invalid',
        `${path} has version ${String(doc.version)}, ${CASES_FILE} has ${version}`,
      );
    }
    const leaked = machineIdentifier(doc);
    if (leaked) throw new CommittedResultsError('invalid', `${path} contains ${leaked}`);
    results.push({ path, doc });
  }

  // Assemble each document alone first so a reader failure names its file.
  const meta = runMeta(source);
  for (const { path, doc } of results) {
    try {
      buildDatasetFromNeutral(matrix, [doc], meta);
    } catch (error) {
      throw new CommittedResultsError(
        'invalid',
        `${path}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
  return {
    sha: source.sha,
    committedAt: source.committedAt,
    runId: source.runId,
    version,
    matrix,
    docs: results.map(({ doc }) => doc),
  };
}

/**
 * The cx_runs row for one results commit. run_id comes from assignRunIds, so it grows
 * with main's history and `ORDER BY run_id DESC` still means "latest"; each commit is
 * one attempt whose documents are replaced wholesale when it is ingested again.
 */
export function committedRun(results: CommittedResults): {
  run: CollectiveXRunInsert;
  docs: unknown[];
} {
  const meta = runMeta(results);
  const summary = buildRunSummary(buildDatasetFromNeutral(results.matrix, results.docs, meta));
  return {
    run: {
      ...meta,
      version: results.version,
      source_branch: RESULTS_BRANCH,
      matrix: results.matrix,
      summary,
    },
    docs: results.docs,
  };
}

/** Fetch, validate, and assemble one main-history results commit into its cx_runs row. */
export async function loadCommittedRun(
  commit: ResultsCommit,
  options: GithubReadOptions & { blobCache?: Map<string, Uint8Array> } = {},
): Promise<{ run: CollectiveXRunInsert; docs: unknown[] }> {
  return committedRun(validateCommittedResults(await fetchResultsSource(commit, options)));
}
