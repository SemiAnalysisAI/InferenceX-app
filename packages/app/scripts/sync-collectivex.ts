/**
 * Build the CollectiveX snapshot that the dashboard serves.
 *
 * CollectiveX results are committed to the benchmark repo as
 * `collectivex/results/cases.json` (the requested cases) plus one
 * `collectivex/results/<sku>/<case_id>.json` per measured case. This script pins
 * a ref to one commit, reads only those files, validates them, assembles the
 * dataset with the shared reader, and writes `.collectivex/snapshot.json` for the
 * API routes. Any fetch or validation failure exits non-zero so a build never
 * publishes a partial dataset.
 *
 * Usage (from packages/app):
 *   bun scripts/sync-collectivex.ts                    InferenceX main on GitHub
 *   bun scripts/sync-collectivex.ts --ref <git ref>    another branch, tag, or commit
 *   bun scripts/sync-collectivex.ts --from <checkout>  a local InferenceX clone (HEAD, or --ref)
 *   bun scripts/sync-collectivex.ts --if-missing       keep an existing snapshot
 *
 * COLLECTIVEX_RESULTS_REF sets the ref when --ref is absent, so a preview build
 * can read a results branch; production reads main. GITHUB_TOKEN, when set,
 * authenticates the commit lookup; without it the commit id comes from the
 * archive itself. E2E_FIXTURES=1 skips the sync because fixture mode serves
 * cypress/fixtures/api/collectivex-latest.json instead.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';

import { GITHUB_API_BASE, GITHUB_OWNER, GITHUB_REPO } from '@semianalysisai/inferencex-constants';
import {
  buildDatasetFromNeutral,
  buildRunSummary,
  type CollectiveXNeutralRunMeta,
} from '@semianalysisai/inferencex-db/collectivex/reader';

import type { CollectiveXSnapshot } from '../src/lib/collectivex/snapshot';

export const RESULTS_DIR = 'collectivex/results';
const CASES_FILE = 'cases.json';
const SWAP_SCHEMA = 'collectivex-swap-blocks-v1';
const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;
const FETCH_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 120_000;
const SHA = /^[0-9a-f]{40}$/u;
const RESULT_PATH = /^(?<sku>[^/]+)\/(?<caseId>[^/]+)\.json$/u;

// The file src/lib/collectivex/snapshot.ts serves (COLLECTIVEX_SNAPSHOT_FILE).
export const DEFAULT_SNAPSHOT_PATH = fileURLToPath(
  new URL('../.collectivex/snapshot.json', import.meta.url),
);

/** The committed result files of one InferenceX commit, keyed by path under RESULTS_DIR. */
export interface ResultsSource {
  sha: string;
  /** Commit time, the run time of a snapshot with no result documents. */
  committedAt: string | null;
  files: Map<string, Uint8Array>;
}

interface TarEntry {
  path: string;
  mtime: number;
  data: Uint8Array;
}

function tarString(block: Uint8Array, offset: number, length: number): string {
  const field = block.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return new TextDecoder().decode(end === -1 ? field : field.subarray(0, end));
}

function tarNumber(block: Uint8Array, offset: number, length: number): number {
  const text = tarString(block, offset, length).trim();
  const value = text === '' ? 0 : Number.parseInt(text, 8);
  if (!/^[0-7]*$/u.test(text) || !Number.isSafeInteger(value)) {
    throw new Error('CollectiveX archive has a malformed tar header');
  }
  return value;
}

// Pax records are "<length> <key>=<value>\n"; git archive writes the commit id
// as the global `comment` and long paths as per-entry `path` records.
function paxRecords(data: Uint8Array): Map<string, string> {
  const records = new Map<string, string>();
  const text = new TextDecoder().decode(data);
  for (const line of text.split('\n')) {
    const match = /^\d+ (?<key>[^=]+)=(?<value>.*)$/u.exec(line);
    if (match?.groups) records.set(match.groups.key, match.groups.value);
  }
  return records;
}

/** Regular files of a tar archive plus the commit id `git archive` records in it. */
export function readTar(archive: Uint8Array): { commit: string | null; entries: TarEntry[] } {
  const entries: TarEntry[] = [];
  let commit: string | null = null;
  let pending = new Map<string, string>();
  let offset = 0;
  let ended = false;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      ended = true;
      break;
    }
    let checksum = 0;
    for (const [index, byte] of header.entries()) {
      checksum += index >= 148 && index < 156 ? 0x20 : byte;
    }
    if (checksum !== tarNumber(header, 148, 8)) {
      throw new Error('CollectiveX archive has a corrupt tar header');
    }
    const size = Number(pending.get('size') ?? tarNumber(header, 124, 12));
    const start = offset + 512;
    if (!Number.isSafeInteger(size) || start + size > archive.length) {
      throw new Error('CollectiveX archive is truncated');
    }
    const data = archive.subarray(start, start + size);
    const type = String.fromCodePoint(header[156]);
    if (type === 'g') {
      commit = paxRecords(data).get('comment') ?? commit;
    } else if (type === 'x') {
      pending = paxRecords(data);
    } else {
      if (type === '0' || type === '\0') {
        const prefix = tarString(header, 345, 155);
        const name = tarString(header, 0, 100);
        entries.push({
          path: pending.get('path') ?? (prefix ? `${prefix}/${name}` : name),
          mtime: tarNumber(header, 136, 12),
          data,
        });
      }
      pending = new Map();
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
  // tar ends with zero blocks; a stream that stops before them lost entries.
  if (!ended) throw new Error('CollectiveX archive is truncated');
  return { commit, entries };
}

/** Keep only RESULTS_DIR from an archive whose paths carry one top-level directory. */
export function resultFiles(entries: readonly TarEntry[]): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  for (const entry of entries) {
    const repoPath = entry.path.slice(entry.path.indexOf('/') + 1);
    if (repoPath.startsWith(`${RESULTS_DIR}/`)) {
      files.set(repoPath.slice(RESULTS_DIR.length + 1), entry.data);
    }
  }
  return files;
}

function gunzipArchive(gzip: Uint8Array): Uint8Array {
  try {
    return gunzipSync(gzip, { maxOutputLength: MAX_ARCHIVE_BYTES });
  } catch (error) {
    throw new Error('CollectiveX archive is not a readable gzip under 1 GiB', { cause: error });
  }
}

async function download(url: string, headers: Record<string, string> = {}): Promise<Uint8Array> {
  let failure: unknown;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      failure = new Error(`${url} returned HTTP ${response.status}`);
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      failure = error;
    }
    if (attempt < FETCH_ATTEMPTS) {
      await new Promise((settle) => {
        setTimeout(settle, 1000 * attempt);
      });
    }
  }
  throw new Error(`Downloading ${url} failed`, { cause: failure });
}

// Branch names may contain slashes; GitHub URLs keep them as path separators.
function refPath(ref: string): string {
  return ref.split('/').map(encodeURIComponent).join('/');
}

/**
 * Pin `ref` to a commit and read its results from the codeload archive. The
 * authenticated commit API names the commit when a token is available;
 * otherwise the archive of `ref` names its own commit in its pax header.
 */
export async function fetchResults(ref: string, token?: string): Promise<ResultsSource> {
  let pinned: { sha: string; committedAt: string | null } | null = null;
  if (token) {
    const body = JSON.parse(
      new TextDecoder().decode(
        await download(
          `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits/${refPath(ref)}`,
          {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        ),
      ),
    ) as { sha?: unknown; commit?: { committer?: { date?: unknown } } };
    if (typeof body.sha !== 'string' || !SHA.test(body.sha)) {
      throw new Error(`GitHub did not resolve ${ref} to a commit`);
    }
    const date = body.commit?.committer?.date;
    pinned = { sha: body.sha, committedAt: typeof date === 'string' ? date : null };
  }
  const archive = readTar(
    gunzipArchive(
      await download(
        `https://codeload.github.com/${GITHUB_OWNER}/${GITHUB_REPO}/tar.gz/${refPath(pinned?.sha ?? ref)}`,
      ),
    ),
  );
  const sha = pinned?.sha ?? archive.commit;
  if (!sha || !SHA.test(sha) || (archive.commit !== null && archive.commit !== sha)) {
    throw new Error(`The ${ref} archive does not identify commit ${sha ?? '(none)'}`);
  }
  // git archive stamps every entry with the commit time.
  const mtime = archive.entries[0]?.mtime;
  return {
    sha,
    committedAt:
      pinned?.committedAt ?? (mtime === undefined ? null : new Date(mtime * 1000).toISOString()),
    files: resultFiles(archive.entries),
  };
}

/** Read results from a local InferenceX clone's object store, never its working tree. */
export function readCheckoutResults(checkout: string, ref: string): ResultsSource {
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', checkout, ...args], {
      maxBuffer: MAX_ARCHIVE_BYTES,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const sha = git('rev-parse', '--verify', `${ref}^{commit}`).toString().trim();
  const committedAt = git('show', '-s', '--format=%cI', sha).toString().trim();
  let archive: Uint8Array;
  try {
    archive = git('archive', '--format=tar', '--prefix=InferenceX/', sha, RESULTS_DIR);
  } catch (error) {
    throw new Error(`${RESULTS_DIR} does not exist at ${ref} (${sha})`, { cause: error });
  }
  return { sha, committedAt, files: resultFiles(readTar(archive).entries) };
}

interface ResultDoc {
  record_type?: unknown;
  schema?: unknown;
  case_id?: unknown;
  generated_at?: unknown;
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
    throw new Error(`${path} is not UTF-8 JSON`, { cause: error });
  }
}

function utcSeconds(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

/**
 * Validate one commit's results and assemble the dataset. The snapshot is one
 * synthetic run: its id is the newest result's generated_at in epoch seconds
 * (the commit time when there are no results) and its SHA is the results commit.
 */
export function assembleSnapshot(source: ResultsSource): CollectiveXSnapshot {
  const casesBytes = source.files.get(CASES_FILE);
  if (!casesBytes) throw new Error(`${RESULTS_DIR}/${CASES_FILE} is missing at ${source.sha}`);
  const cases = parseJson(`${RESULTS_DIR}/${CASES_FILE}`, casesBytes) as {
    version?: unknown;
    requested_cases?: { sku: string; disposition: string; case: { case_id?: string } }[];
  };
  if (!Number.isSafeInteger(cases.version) || !Array.isArray(cases.requested_cases)) {
    throw new TypeError(`${RESULTS_DIR}/${CASES_FILE} has no version and requested_cases`);
  }
  const runnable = new Set(
    cases.requested_cases
      .filter((entry) => entry.disposition === 'runnable')
      .map((entry) => JSON.stringify([entry.sku, entry.case.case_id])),
  );

  const results: { path: string; doc: unknown }[] = [];
  let newest = Number.NEGATIVE_INFINITY;
  for (const [file, data] of [...source.files].toSorted(([a], [b]) => a.localeCompare(b))) {
    const path = `${RESULTS_DIR}/${file}`;
    if (file === CASES_FILE || !file.endsWith('.json')) continue;
    const location = RESULT_PATH.exec(file)?.groups;
    if (!location) throw new Error(`${path} is not at <sku>/<case_id>.json`);
    const doc = parseJson(path, data) as ResultDoc | null;
    const identity = resultIdentity(doc);
    if (!identity) throw new Error(`${path} is not a CollectiveX result document`);
    if (identity.caseId !== location.caseId || identity.sku !== location.sku) {
      throw new Error(
        `${path} holds case ${String(identity.caseId)} on ${String(identity.sku)}; the file must be ${String(identity.sku)}/${String(identity.caseId)}.json`,
      );
    }
    if (!runnable.has(JSON.stringify([location.sku, location.caseId]))) {
      throw new Error(`${path} is not a runnable case in ${CASES_FILE}`);
    }
    if (identity.sourceDirty !== false) {
      throw new Error(`${path} was not measured from committed collectivex/ code`);
    }
    const generatedAt = Date.parse(typeof doc?.generated_at === 'string' ? doc.generated_at : '');
    if (!Number.isFinite(generatedAt)) throw new Error(`${path} has no valid generated_at`);
    newest = Math.max(newest, generatedAt);
    results.push({ path, doc });
  }

  const committedAt = Date.parse(source.committedAt ?? '');
  const runTime = results.length > 0 ? newest : committedAt;
  if (!Number.isFinite(runTime)) throw new Error(`No timestamp for the snapshot of ${source.sha}`);
  const seconds = Math.floor(runTime / 1000);
  const meta: CollectiveXNeutralRunMeta = {
    run_id: String(seconds),
    run_attempt: 1,
    generated_at: utcSeconds(seconds),
    conclusion: 'success',
    source_sha: source.sha,
  };
  // Validate each document alone first so a failure names its file.
  for (const { path, doc } of results) {
    try {
      buildDatasetFromNeutral(cases, [doc], meta);
    } catch (error) {
      throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  }
  const dataset = buildDatasetFromNeutral(
    cases,
    results.map(({ doc }) => doc),
    meta,
  );
  return { summary: buildRunSummary(dataset), dataset };
}

export async function writeSnapshot(path: string, snapshot: CollectiveXSnapshot): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  // Write then rename, so a failed sync never leaves a partial file for --if-missing to keep.
  const partial = `${path}.${process.pid}.partial`;
  await writeFile(partial, JSON.stringify(snapshot));
  await rename(partial, path);
}

export interface SyncOptions {
  output?: string;
  ifMissing?: boolean;
  from?: string;
  ref?: string;
  /** Where E2E_FIXTURES, COLLECTIVEX_RESULTS_REF, and GITHUB_TOKEN are read from. */
  env?: Readonly<Record<string, string | undefined>>;
}

/** Returns the written snapshot, or null when the sync was skipped. */
export async function syncCollectiveX({
  output = DEFAULT_SNAPSHOT_PATH,
  ifMissing = false,
  from,
  ref,
  env = process.env,
}: SyncOptions = {}): Promise<CollectiveXSnapshot | null> {
  if (env.E2E_FIXTURES === '1') {
    console.log('CollectiveX sync skipped: E2E_FIXTURES=1 serves the cypress fixture.');
    return null;
  }
  if (ifMissing && existsSync(output)) {
    console.log(`CollectiveX sync skipped: ${output} exists.`);
    return null;
  }
  const target = ref ?? (env.COLLECTIVEX_RESULTS_REF?.trim() || (from ? 'HEAD' : 'main'));
  const source = from
    ? readCheckoutResults(resolve(from), target)
    : await fetchResults(target, env.GITHUB_TOKEN);
  const snapshot = assembleSnapshot(source);
  await writeSnapshot(output, snapshot);
  const { summary } = snapshot;
  console.log(
    `CollectiveX snapshot of ${target} @ ${source.sha.slice(0, 12)}: run ${summary.run_id}, ` +
      `${summary.measured_cases}/${summary.requested_cases} cases measured -> ${output}`,
  );
  return snapshot;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'if-missing': { type: 'boolean', default: false },
      from: { type: 'string' },
      ref: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  await syncCollectiveX({ ifMissing: values['if-missing'], from: values.from, ref: values.ref });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
