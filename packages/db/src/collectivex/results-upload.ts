/**
 * CollectiveX results uploaded from a local directory into the CollectiveX database.
 *
 * An operator points the ingest CLI (ingest-collectivex.ts) at a `results/` directory exactly
 * as `collectivex/run.sh` writes it on a cluster: `cases.json` (the requested cases) plus one
 * `<sku>/<case_id>.json` per measured case. This module reads exactly those files, validates
 * them, lays them over the latest stored run, and turns the merged set into a new cx_runs row.
 * Each upload is a new run; the dashboard serves the newest run_id. The app itself never ingests.
 */

import fs from 'node:fs';
import path from 'node:path';

import type { CollectiveXRunInsert, CollectiveXRunRow } from '../queries/collectivex';
import { buildDatasetFromNeutral, buildRunSummary, type CollectiveXNeutralRunMeta } from './reader';

export const CASES_FILE = 'cases.json';
const SWAP_SCHEMA = 'collectivex-swap-blocks-v1';
// The benchmark repo's own test caps a result at 1 MiB; leave headroom without letting one
// upload exhaust the CLI's memory.
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
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
 * Exclusive upper bound of a stored run_id. Ids are epoch seconds (below this until the year
 * 2286); the retired lazy ingest keyed runs by GitHub Actions run id, which is at or above it,
 * and migration 005 removes those rows and forbids new ones with a CHECK on this bound.
 */
export const RUN_ID_LIMIT = 10_000_000_000;

/** The uploaded files break the results contract, or the merged run would. */
export class ResultsError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ResultsError';
  }
}

/** One results directory's files, keyed by path relative to it (`cases.json`, `<sku>/<file>.json`). */
export interface ResultsFiles {
  dir: string;
  files: Map<string, Uint8Array>;
}

/**
 * Read a results directory: `cases.json` at the top and every `*.json` exactly one level down
 * (`<sku>/<case_id>.json`). Other files, dot entries and deeper directories are ignored; a symlink anywhere
 * on that path is rejected so an upload cannot pull in files from outside the directory. A file
 * above 4 MiB, or a directory above 256 MiB in total, is rejected before it is read.
 */
export function readResultsDir(dir: string): ResultsFiles {
  const root = path.resolve(dir);
  const rootStat = fs.lstatSync(root, { throwIfNoEntry: false });
  if (!rootStat) throw new ResultsError(`${root} does not exist`);
  if (rootStat.isSymbolicLink()) throw new ResultsError(`${root} is a symlink`);
  if (!rootStat.isDirectory()) throw new ResultsError(`${root} is not a directory`);

  const selected: { relative: string; absolute: string; size: number }[] = [];
  const consider = (relative: string, mustBeFile: boolean) => {
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new ResultsError(`${relative} is a symlink`);
    if (!stat.isFile()) {
      if (mustBeFile) throw new ResultsError(`${relative} is not a regular file`);
      return;
    }
    if (stat.size > MAX_FILE_BYTES) {
      throw new ResultsError(`${relative} exceeds ${MAX_FILE_BYTES} bytes`);
    }
    selected.push({ relative, absolute, size: stat.size });
  };

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new ResultsError(`${entry.name} is a symlink`);
    // Dot entries (for example run.sh's `.shards` staging directory) are never results.
    if (entry.name.startsWith('.')) continue;
    if (entry.name === CASES_FILE) {
      consider(CASES_FILE, true);
    } else if (entry.isDirectory()) {
      for (const child of fs.readdirSync(path.join(root, entry.name), { withFileTypes: true })) {
        const relative = `${entry.name}/${child.name}`;
        if (child.isSymbolicLink()) throw new ResultsError(`${relative} is a symlink`);
        if (!child.name.startsWith('.') && child.name.endsWith('.json')) consider(relative, false);
      }
    }
  }
  const total = selected.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_TOTAL_BYTES) {
    throw new ResultsError(`${root} holds more than ${MAX_TOTAL_BYTES} bytes of results`);
  }

  const files = new Map<string, Uint8Array>();
  for (const file of selected.toSorted((a, b) => a.relative.localeCompare(b.relative))) {
    const data = fs.readFileSync(file.absolute);
    if (data.byteLength > MAX_FILE_BYTES) {
      throw new ResultsError(`${file.relative} exceeds ${MAX_FILE_BYTES} bytes`);
    }
    files.set(file.relative, new Uint8Array(data));
  }
  return { dir: root, files };
}

export interface ResultDoc {
  record_type?: unknown;
  schema?: unknown;
  case_id?: unknown;
  version?: unknown;
  identity?: { case_id?: unknown; case_factors?: { sku?: unknown } };
  provenance?: { source_sha?: unknown; source_dirty?: unknown };
  runtime?: { sku?: unknown; source_sha?: unknown; source_dirty?: unknown };
}

/** Identity fields of an EP case attempt or a swap_blocks result; null for anything else. */
export function resultIdentity(doc: ResultDoc | null) {
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

function parseJson(file: string, data: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
  } catch (error) {
    throw new ResultsError(`${file} is not UTF-8 JSON`, { cause: error });
  }
}

/** A results contract: cases.json's version and the (sku, case_id) pairs it marks runnable. */
interface CasesContract {
  version: number;
  matrix: unknown;
  runnable: Set<string>;
}

function caseKey(sku: unknown, caseId: unknown): string {
  return JSON.stringify([sku, caseId]);
}

function casesContract(matrixRaw: unknown): CasesContract {
  const matrix = matrixRaw as {
    version?: unknown;
    requested_cases?: { sku?: unknown; disposition?: unknown; case?: { case_id?: unknown } }[];
  };
  if (
    typeof matrix?.version !== 'number' ||
    !Number.isSafeInteger(matrix.version) ||
    matrix.version <= 0 ||
    !Array.isArray(matrix.requested_cases)
  ) {
    throw new ResultsError(`${CASES_FILE} has no version and requested_cases`);
  }
  return {
    version: matrix.version,
    matrix,
    runnable: new Set(
      matrix.requested_cases
        .filter((entry) => entry?.disposition === 'runnable')
        .map((entry) => caseKey(entry.sku, entry.case?.case_id)),
    ),
  };
}

/** One result document with where it came from (named in every error) and its identity. */
export interface ResultEntry {
  /** `<sku>/<case_id>.json` for an uploaded file, or `stored run <id>: <sku>/<case_id>` for a kept one. */
  label: string;
  sku: string;
  caseId: string;
  sourceSha: string;
  doc: unknown;
}

/**
 * Check one result the way the benchmark repo's own test does: it sits at `<sku>/<case_id>.json`
 * matching its document, answers a runnable case in cases.json, was measured from committed code,
 * carries the cases.json version, and names no machine. Every failure names `label`.
 */
function checkResult(
  label: string,
  location: { sku: string; caseId: string } | null,
  doc: unknown,
  contract: CasesContract,
): ResultEntry {
  const result = doc as ResultDoc | null;
  const identity = resultIdentity(result);
  if (!identity) throw new ResultsError(`${label} is not a CollectiveX result document`);
  if (location && (identity.caseId !== location.caseId || identity.sku !== location.sku)) {
    throw new ResultsError(
      `${label} holds case ${String(identity.caseId)} on ${String(identity.sku)}; the file must be ${String(identity.sku)}/${String(identity.caseId)}.json`,
    );
  }
  if (typeof identity.sku !== 'string' || typeof identity.caseId !== 'string') {
    throw new ResultsError(`${label} has no sku and case_id`);
  }
  if (!contract.runnable.has(caseKey(identity.sku, identity.caseId))) {
    throw new ResultsError(`${label} is not a runnable case in ${CASES_FILE}`);
  }
  if (typeof identity.sourceSha !== 'string' || !SHA.test(identity.sourceSha)) {
    throw new ResultsError(`${label} has no 40-hex source_sha`);
  }
  if (identity.sourceDirty !== false) {
    throw new ResultsError(`${label} was not measured from committed collectivex/ code`);
  }
  if (result?.record_type === 'case-attempt' && result.version !== contract.version) {
    throw new ResultsError(
      `${label} has version ${String(result.version)}, ${CASES_FILE} has ${contract.version}`,
    );
  }
  const leaked = machineIdentifier(doc);
  if (leaked) throw new ResultsError(`${label} contains ${leaked}`);
  return {
    label,
    sku: identity.sku,
    caseId: identity.caseId,
    sourceSha: identity.sourceSha,
    doc,
  };
}

/** Assemble each document alone so a reader failure names its file. */
function assembleEach(matrix: unknown, entries: readonly ResultEntry[]): void {
  const meta: CollectiveXNeutralRunMeta = {
    run_id: '1',
    run_attempt: 1,
    generated_at: '1970-01-01T00:00:00Z',
    conclusion: 'success',
    source_sha: '0'.repeat(40),
  };
  for (const entry of entries) {
    try {
      buildDatasetFromNeutral(matrix, [entry.doc], meta);
    } catch (error) {
      throw new ResultsError(
        `${entry.label}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
}

/** A validated upload: its cases.json contract and its result documents, in path order. */
export interface ValidatedUpload extends CasesContract {
  results: ResultEntry[];
}

/** Validate an uploaded results directory on its own. Every failure names the offending file. */
export function validateResults(upload: Pick<ResultsFiles, 'files'>): ValidatedUpload {
  const casesBytes = upload.files.get(CASES_FILE);
  if (!casesBytes) throw new ResultsError(`${CASES_FILE} is missing`);
  const contract = casesContract(parseJson(CASES_FILE, casesBytes));

  const results: ResultEntry[] = [];
  for (const [file, data] of [...upload.files].toSorted(([a], [b]) => a.localeCompare(b))) {
    if (file === CASES_FILE) continue;
    const location = RESULT_PATH.exec(file)?.groups;
    if (!location) throw new ResultsError(`${file} is not at <sku>/<case_id>.json`);
    results.push(
      checkResult(
        file,
        { sku: location.sku, caseId: location.caseId },
        parseJson(file, data),
        contract,
      ),
    );
  }
  assembleEach(contract.matrix, results);
  return { ...contract, results };
}

/**
 * The one source_sha every uploaded document shares (EP `provenance.source_sha`, swap_blocks
 * `runtime.source_sha`). It becomes the run's source_sha, so an upload that mixes measurements
 * from different collectivex/ code, or that holds no result at all, is refused.
 */
export function uploadSourceSha(upload: ValidatedUpload): string {
  const bySha = new Map<string, ResultEntry[]>();
  for (const entry of upload.results) {
    bySha.set(entry.sourceSha, [...(bySha.get(entry.sourceSha) ?? []), entry]);
  }
  if (bySha.size === 0) throw new ResultsError('the upload holds no result files');
  if (bySha.size > 1) {
    const groups = [...bySha]
      .map(([sha, entries]) => `${sha}: ${entries.map((entry) => entry.label).join(', ')}`)
      .join('; ');
    throw new ResultsError(`uploaded results do not share one source_sha (${groups})`);
  }
  return [...bySha.keys()][0];
}

/** A stored document left out of the new run, and why. */
export interface DroppedResult {
  sku: string;
  caseId: string;
  reason: string;
}

/** What an upload does to the latest stored run. */
export interface UploadPlan {
  /** The stored run the upload is laid over; null when nothing is stored yet. */
  baseRunId: string | null;
  uploaded: number;
  /** Uploaded cases that replace a stored document of the same (sku, case_id). */
  replaced: number;
  /** Stored documents carried into the new run unchanged. */
  kept: number;
  dropped: DroppedResult[];
}

export interface UploadedRun {
  run: CollectiveXRunInsert;
  docs: unknown[];
  plan: UploadPlan;
}

function utcSeconds(now: Date): { seconds: number; iso: string } {
  const seconds = Math.floor(now.getTime() / 1000);
  return { seconds, iso: new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/u, 'Z') };
}

/**
 * Build the next run from an upload and the latest stored run of its version.
 *
 * The new cases.json is the run's matrix. Stored documents are keyed by (sku, case_id) and an
 * uploaded file replaces that case's stored document; the others are kept unless they are not
 * runnable in the new cases.json or carry another version, in which case they are dropped and
 * listed in the plan. The merged set is validated as a whole before anything is written.
 *
 * run_id is the current epoch second, raised past `maxStoredRunId` (the highest run_id stored in
 * any version) so it always sorts last; it must stay below RUN_ID_LIMIT.
 */
export function buildUploadedRun(
  upload: ValidatedUpload,
  latest: CollectiveXRunRow | null,
  { maxStoredRunId, now = new Date() }: { maxStoredRunId: string | null; now?: Date },
): UploadedRun {
  const sourceSha = uploadSourceSha(upload);
  const uploadedKeys = new Set(upload.results.map((entry) => caseKey(entry.sku, entry.caseId)));

  const kept: ResultEntry[] = [];
  const dropped: DroppedResult[] = [];
  const storedKeys = new Set<string>();
  // Stored docs come back in insertion order; a duplicate key keeps the later document.
  const stored = new Map<string, { sku: string; caseId: string; doc: unknown }>();
  for (const doc of latest?.docs ?? []) {
    const identity = resultIdentity(doc as ResultDoc | null);
    const sku = String(identity?.sku);
    const caseId = String(identity?.caseId);
    stored.set(caseKey(sku, caseId), { sku, caseId, doc });
  }
  for (const [key, { sku, caseId, doc }] of stored) {
    storedKeys.add(key);
    if (uploadedKeys.has(key)) continue;
    const result = doc as ResultDoc | null;
    if (!resultIdentity(result)) {
      dropped.push({ sku, caseId, reason: 'not a CollectiveX result document' });
    } else if (!upload.runnable.has(key)) {
      dropped.push({ sku, caseId, reason: `not a runnable case in the new ${CASES_FILE}` });
    } else if (result?.record_type === 'case-attempt' && result.version !== upload.version) {
      dropped.push({
        sku,
        caseId,
        reason: `version ${String(result.version)}, ${CASES_FILE} has ${upload.version}`,
      });
    } else {
      kept.push(checkResult(`stored run ${latest!.run_id}: ${sku}/${caseId}`, null, doc, upload));
    }
  }

  const merged = [...kept, ...upload.results].toSorted(
    (a, b) => a.sku.localeCompare(b.sku) || a.caseId.localeCompare(b.caseId),
  );
  assembleEach(upload.matrix, kept);

  const { seconds, iso } = utcSeconds(now);
  const runId = Math.max(seconds, maxStoredRunId === null ? 0 : Number(maxStoredRunId) + 1);
  if (!Number.isSafeInteger(runId) || runId <= 0 || runId >= RUN_ID_LIMIT) {
    throw new ResultsError(`run_id ${runId} is outside (0, ${RUN_ID_LIMIT})`);
  }
  const meta: CollectiveXNeutralRunMeta = {
    run_id: String(runId),
    run_attempt: 1,
    generated_at: iso,
    conclusion: 'success',
    source_sha: sourceSha,
  };
  const docs = merged.map((entry) => entry.doc);
  let summary: ReturnType<typeof buildRunSummary>;
  try {
    summary = buildRunSummary(buildDatasetFromNeutral(upload.matrix, docs, meta));
  } catch (error) {
    throw new ResultsError(
      `the merged run does not assemble: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return {
    run: {
      ...meta,
      version: upload.version,
      source_branch: null,
      matrix: upload.matrix,
      summary,
    },
    docs,
    plan: {
      baseRunId: latest?.run_id ?? null,
      uploaded: upload.results.length,
      replaced: [...uploadedKeys].filter((key) => storedKeys.has(key)).length,
      kept: kept.length,
      dropped,
    },
  };
}
