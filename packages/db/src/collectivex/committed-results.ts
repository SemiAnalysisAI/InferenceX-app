/**
 * CollectiveX results committed to the benchmark repo: `collectivex/results/cases.json`
 * (the requested cases) plus one `collectivex/results/<sku>/<case_id>.json` per measured
 * case. Each InferenceX commit that carries results becomes one stored run, so this
 * module pins a ref to a commit, reads exactly those files at it, validates them, and
 * turns them into a cx_runs row. Shared by the ingest CLI and the app's ingest route.
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

export interface GithubReadOptions {
  /** Authenticates API and raw reads; without it GitHub's unauthenticated rate limit applies. */
  token?: string;
  fetch?: typeof globalThis.fetch;
}

export interface ResultsCommit {
  sha: string;
  /** Committer time (ISO 8601): when the commit landed on its branch. */
  committedAt: string;
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
 * the results directory, or a main-history results commit does not exist.
 * `unavailable`: GitHub could not be read.
 */
export type CommittedResultsErrorKind = 'invalid' | 'not-found' | 'unavailable';

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
      if (response.status === 404 || response.status === 422) {
        throw new CommittedResultsError('not-found', `${url} returned HTTP ${response.status}`);
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

function toResultsCommit(body: unknown): ResultsCommit {
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
): Promise<ResultsCommit[]> {
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
  return body.map(toResultsCommit);
}

/** Every commit on `branch` that touched RESULTS_DIR, oldest first. */
export async function listResultsCommits(
  branch: string = RESULTS_BRANCH,
  options: GithubReadOptions = {},
): Promise<ResultsCommit[]> {
  const commits: ResultsCommit[] = [];
  for (let page = 1; ; page++) {
    const batch = await resultsCommitsPage(branch, page, COMMITS_PER_PAGE, options);
    commits.push(...batch);
    if (batch.length < COMMITS_PER_PAGE) break;
  }
  return commits.toReversed();
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
  if (!history.some((entry) => entry.sha === commit.sha)) {
    throw new CommittedResultsError(
      'not-found',
      `${commit.sha} (from ${ref}) is not a ${RESULTS_DIR} commit on ${RESULTS_BRANCH}`,
    );
  }
  return commit;
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
      throw new CommittedResultsError(
        'not-found',
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
  provenance?: { source_dirty?: unknown };
  runtime?: { sku?: unknown; source_dirty?: unknown };
}

/** Identity fields of an EP case attempt or a swap_blocks result; null for anything else. */
function resultIdentity(doc: ResultDoc | null) {
  if (doc?.record_type === 'case-attempt') {
    return {
      caseId: doc.identity?.case_id,
      sku: doc.identity?.case_factors?.sku,
      sourceDirty: doc.provenance?.source_dirty,
    };
  }
  if (doc?.schema === SWAP_SCHEMA) {
    return { caseId: doc.case_id, sku: doc.runtime?.sku, sourceDirty: doc.runtime?.source_dirty };
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
    run_id: String(seconds),
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
    if (identity.sourceDirty !== false) {
      throw new CommittedResultsError(
        'invalid',
        `${path} was not measured from committed collectivex/ code`,
      );
    }
    if (doc?.record_type === 'case-attempt' && Number(doc.version) !== version) {
      throw new CommittedResultsError(
        'invalid',
        `${path} has version ${String(doc.version)}, ${CASES_FILE} has ${version}`,
      );
    }
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
    version,
    matrix,
    docs: results.map(({ doc }) => doc),
  };
}

/**
 * The cx_runs row for one results commit. run_id is the commit time in epoch
 * seconds, so it grows with main's history and `ORDER BY run_id DESC` still means
 * "latest"; each commit is one attempt whose documents are replaced wholesale when
 * it is ingested again.
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
