/**
 * Test support for the fixed-sequence request-records path.
 *
 * A "synthetic point" directory is the output of the benchmark repository's
 * `infx/tests/bench_serving/synthetic_point.py`: the real fixed-sequence
 * client measured a scripted local server, and the real aggregation wrote the
 * result rows. It is SYNTHETIC TEST DATA, never a benchmark result, and its
 * `manifest.json` says so and states what every attempt was scripted to be.
 *
 * `fixtures/synthetic-fixed-seq-point` holds one committed output, so the
 * app half of the path is covered without a benchmark checkout. Nothing here
 * is reachable from a page, a route or the preview fixtures.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readBenchmarkArtifacts, type BenchmarkArtifactFile } from '../etl/benchmark-artifacts';
import { bulkIngestBenchmarkRows } from '../etl/benchmark-ingest';
import type { BenchmarkParams } from '../etl/benchmark-mapper';
import { createConfigCache } from '../etl/config-cache';
import type { Sql } from '../etl/db-utils';
import {
  ingestRequestRecords,
  type RequestRecordsIngestResult,
} from '../etl/request-records-ingest';
import { createSkipTracker, type SkipTracker } from '../etl/skip-tracker';
import { createWorkflowRunServices } from '../etl/workflow-run';

export const GOLDEN_SYNTHETIC_POINT_DIR = fileURLToPath(
  new URL('../etl/fixtures/synthetic-fixed-seq-point/', import.meta.url),
);

/** What one attempt was scripted to be, as the manifest states it. */
export interface SyntheticAttempt {
  outcome: string;
  ttft_ms: number | null;
  tpot_ms: number | null;
  e2el_ms: number | null;
  output_len: number | null;
  completion_evidence: number;
}

export interface SyntheticPoint {
  name: string;
  conc: number;
  num_prompts: number;
  warmups: number;
  client_exit_code: number;
  aggregate_exit_code: number;
  /** The aggregate as the job's always-uploaded bundle carries it. */
  aggregate: string;
  /** The aggregate as ingest sees it; `null` when the job failed and uploaded none. */
  uploaded_as_bmk: string | null;
  aggregate_attempt_limit: number | null;
  expected: {
    gate_status: 'passed' | 'failed';
    counts: {
      requested: number;
      dispatched: number;
      completed: number;
      failed: number;
      failed_by_class: Record<string, number>;
      http_status: Record<string, number>;
      warmup_excluded: number;
    };
    accounting_complete: boolean;
    columns_omitted: boolean;
    duration_s: { min: number; max: number };
    attempts: SyntheticAttempt[];
  };
}

export interface SyntheticManifest {
  synthetic: true;
  description: string;
  /** Commit of the benchmark repository that produced the directory. */
  inferencex_commit: string | null;
  request_records_schema_version: number;
  identity: Record<string, string | number>;
  /** How far a measured time may sit from its scripted value. */
  tolerance_ms: { below: number; above: number };
  points: SyntheticPoint[];
}

export function readSyntheticManifest(dir: string): SyntheticManifest {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'),
  ) as SyntheticManifest;
  if (manifest.synthetic !== true) {
    throw new Error(`${dir} is not a synthetic point directory: manifest.synthetic is not true`);
  }
  return manifest;
}

export function readSyntheticRow(dir: string, relative: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, relative), 'utf8')) as Record<string, unknown>;
}

/**
 * Copy the uploaded result rows of a synthetic point directory to `target`,
 * passing each through `change` first. For cases the client cannot be made to
 * produce on demand; a test that uses it says what it changed.
 */
export function copySyntheticResults(
  dir: string,
  target: string,
  change: (row: Record<string, unknown>, point: SyntheticPoint) => void,
): void {
  for (const point of readSyntheticManifest(dir).points) {
    if (point.uploaded_as_bmk === null) continue;
    const row = readSyntheticRow(dir, point.uploaded_as_bmk);
    change(row, point);
    const file = path.join(target, point.uploaded_as_bmk);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(row));
  }
  fs.copyFileSync(path.join(dir, 'manifest.json'), path.join(target, 'manifest.json'));
}

/** A run id no workflow has: the synthetic rows belong to no real run. */
export const SYNTHETIC_GITHUB_RUN_ID = 1;
const SYNTHETIC_DATE = '2026-01-01';

export interface SyntheticIngest {
  workflowRunId: number;
  files: BenchmarkArtifactFile[];
  tracker: SkipTracker;
  /** Mapped rows that reached the database, in file order. */
  mapped: BenchmarkParams[];
  requestRecords: RequestRecordsIngestResult;
  /** `benchmark_results.id` by concurrency. */
  idByConc: Map<number, number>;
}

/**
 * Ingest the uploaded result rows of a synthetic point directory the way the
 * CI ingest does: the artifact reader with the official mapper, the workflow
 * run and configuration writers, the benchmark row writer, then the
 * request-records writer. `sql` must be a local test database.
 */
export async function ingestSyntheticResults(sql: Sql, dir: string): Promise<SyntheticIngest> {
  readSyntheticManifest(dir);
  const tracker = createSkipTracker();
  const files = readBenchmarkArtifacts(path.join(dir, 'results'), {
    runId: SYNTHETIC_GITHUB_RUN_ID,
    tracker,
  });
  const { getOrCreateWorkflowRun } = createWorkflowRunServices(sql);
  const workflowRunId = await getOrCreateWorkflowRun({
    githubRunId: SYNTHETIC_GITHUB_RUN_ID,
    runAttempt: 1,
    name: 'synthetic test point',
    date: SYNTHETIC_DATE,
    createdAt: `${SYNTHETIC_DATE}T00:00:00Z`,
  });
  if (workflowRunId === null) throw new Error('the synthetic run id is purged by run overrides');

  const { getOrCreateConfig } = createConfigCache(sql);
  const mapped = files.flatMap((file) => file.rows.flatMap((row) => row.mapped ?? []));
  const toInsert = [];
  for (const row of mapped) {
    toInsert.push({ ...row, configId: await getOrCreateConfig(row.config) });
  }
  await bulkIngestBenchmarkRows(sql, toInsert, workflowRunId, SYNTHETIC_DATE);
  const requestRecords = await ingestRequestRecords(sql, toInsert, workflowRunId);
  const stored = (await sql`
    select id::int as id, conc from benchmark_results where workflow_run_id = ${workflowRunId}
  `) as unknown as { id: number; conc: number }[];
  return {
    workflowRunId,
    files,
    tracker,
    mapped,
    requestRecords,
    idByConc: new Map(stored.map((row) => [row.conc, row.id])),
  };
}

type Shape = string | Shape[] | { [key: string]: Shape };

/** The kind of every value, with arrays and objects kept in place. */
function kinds(value: unknown): Shape {
  if (Array.isArray(value)) return value.map(kinds);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, kinds(child)]),
    );
  }
  return value === null ? 'null' : typeof value;
}

/** Fields of a block that the script fixes exactly; measured times are not among them. */
const SCRIPTED_BLOCK_FIELDS = [
  'schema_version',
  'counts',
  'accounting',
  'load',
  'outcomes',
  'completion_evidence_bits',
  'tpot_definition',
  'ms_decimals',
  'columns_omitted',
] as const;
const SCRIPTED_COLUMNS = ['outcome', 'output_len', 'completion_evidence'] as const;

/**
 * Everything about a synthetic point directory that does not depend on the
 * machine that ran it: which files exist, the keys and value kinds of every
 * row, the scripted parts of every block, and what the manifest expects. Two
 * runs of the same producer commit give the same shape; a producer change
 * that the committed fixture does not reflect gives a different one.
 */
export function syntheticPointShape(dir: string): unknown {
  const manifest = readSyntheticManifest(dir);
  return {
    schemaVersion: manifest.request_records_schema_version,
    identity: manifest.identity,
    points: manifest.points.map((point) => {
      const row = readSyntheticRow(dir, point.aggregate);
      const block = (row.request_records ?? {}) as Record<string, unknown>;
      const columns = (block.columns ?? null) as Record<string, unknown[]> | null;
      const { duration_s: _measured, ...expected } = point.expected;
      return {
        name: point.name,
        conc: point.conc,
        uploaded: point.uploaded_as_bmk !== null,
        expected,
        rowKinds: kinds(row),
        block: Object.fromEntries(SCRIPTED_BLOCK_FIELDS.map((field) => [field, block[field]])),
        columns:
          columns && Object.fromEntries(SCRIPTED_COLUMNS.map((name) => [name, columns[name]])),
      };
    }),
  };
}
