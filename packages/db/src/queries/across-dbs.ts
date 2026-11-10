/**
 * Combine reads of the public database and a downstream deployment's own
 * database into the answer one database holding every run would give. The two
 * hold disjoint runs: a downstream database holds only the runs it ingested,
 * with ids from `DOWNSTREAM_ID_START` up. Each merge takes one part per
 * database in `getReadDbs` order (public first) and returns a single part
 * unchanged.
 */

import { benchmarkCurveScope } from '@semianalysisai/inferencex-constants';

import type { DbClient } from '../connection.js';
import { distinctBy, mergeDistinctRows } from '../lib/distinct-by.js';
import { CONFIG_NATURAL_KEY, naturalKey } from '../lib/public-db-sync.js';
import { getLatestBenchmarks, type BenchmarkRow } from './benchmarks.js';
import type { DatasetRecord } from './datasets.js';
import type { EvalRow } from './evaluations.js';
import type { LatestImageRow } from './latest-images.js';
import type { ReliabilityRow } from './reliability.js';
import type { SubmissionSummaryRow, SubmissionVolumeRow } from './submissions.js';
import type { AvailabilityRow, WorkflowRunRow } from './workflow-info.js';

/**
 * `getLatestBenchmarks` across databases: each curve comes from the database
 * whose newest snapshot of it is newest. An as-of run is resolved in whichever
 * database holds it, so it bounds both.
 */
export async function getLatestBenchmarksAcross(
  dbs: readonly DbClient[],
  modelKey: string | string[],
  date?: string,
  exact?: boolean,
  asOfRunId?: string,
): Promise<BenchmarkRow[]> {
  if (dbs.length === 1) return getLatestBenchmarks(dbs[0]!, modelKey, date, exact, asOfRunId);
  const asOf =
    date && !exact && asOfRunId
      ? { startedAt: await findRunStartedAt(dbs, Number(asOfRunId)) }
      : undefined;
  return mergeLatestBenchmarks(
    await Promise.all(dbs.map((sql) => getLatestBenchmarks(sql, modelKey, date, exact, asOf))),
  );
}

async function findRunStartedAt(dbs: readonly DbClient[], githubRunId: number) {
  const found = await Promise.all(
    dbs.map(
      (sql) => sql`
        SELECT run_started_at::text AS started_at FROM latest_workflow_runs
        WHERE github_run_id = ${githubRunId}
      `,
    ),
  );
  const row = found.flat()[0] as { started_at: string | null } | undefined;
  return row?.started_at ?? null;
}

/** Orders snapshots as `ranked_runs` does: date, then start time (nulls last), then run id. */
function snapshotIsNewer(a: BenchmarkRow, b: BenchmarkRow): boolean {
  const dateA = a.curve_date ?? a.date;
  const dateB = b.curve_date ?? b.date;
  if (dateA !== dateB) return dateA > dateB;
  const startedA = a.curve_run_started_at ?? a.run_started_at ?? null;
  const startedB = b.curve_run_started_at ?? b.run_started_at ?? null;
  if (startedA !== startedB) return startedB === null || (startedA !== null && startedA > startedB);
  return (
    (a.curve_workflow_run_id ?? a.workflow_run_id ?? 0) >
    (b.curve_workflow_run_id ?? b.workflow_run_id ?? 0)
  );
}

/** Keep each curve from the database with its newest snapshot. */
export function mergeLatestBenchmarks(parts: readonly BenchmarkRow[][]): BenchmarkRow[] {
  if (parts.length === 1) return parts[0]!;
  const newest = new Map<string, { part: number; row: BenchmarkRow }>();
  parts.forEach((rows, part) => {
    for (const row of rows) {
      const scope = benchmarkCurveScope(row);
      const held = newest.get(scope);
      if (!held || snapshotIsNewer(row, held.row)) newest.set(scope, { part, row });
    }
  });
  return parts.flatMap((rows, part) =>
    rows.filter((row) => newest.get(benchmarkCurveScope(row))!.part === part),
  );
}

/** Every snapshot of every database, in snapshot date order. */
export function mergeBenchmarkHistory(parts: readonly BenchmarkRow[][]): BenchmarkRow[] {
  if (parts.length === 1) return parts[0]!;
  return parts
    .flat()
    .toSorted((a, b) => (a.curve_date ?? a.date).localeCompare(b.curve_date ?? b.date));
}

/** Past any serial `configs.id`, so a config only the downstream database holds keeps its own id. */
const OWN_CONFIG_ID_OFFSET = 2 ** 31;

function configKeyOf(row: EvalRow): string {
  return naturalKey(CONFIG_NATURAL_KEY.map((column) => row[column]));
}

/**
 * Clients group eval rows by `config_id`, so a downstream row takes the public
 * id of the same config, or a disjoint id when public lacks the config.
 */
export function mergeEvalResults(parts: readonly EvalRow[][]): EvalRow[] {
  if (parts.length === 1) return parts[0]!;
  const [publicRows = [], ...ownParts] = parts;
  const publicConfigIds = new Map(publicRows.map((row) => [configKeyOf(row), row.config_id]));
  const ownRows = ownParts.flat().map((row) => ({
    ...row,
    config_id: publicConfigIds.get(configKeyOf(row)) ?? OWN_CONFIG_ID_OFFSET + row.config_id,
  }));
  return [...publicRows, ...ownRows].toSorted(
    (a, b) => b.date.localeCompare(a.date) || a.hardware.localeCompare(b.hardware),
  );
}

export function mergeReliabilityStats(parts: readonly ReliabilityRow[][]): ReliabilityRow[] {
  if (parts.length === 1) return parts[0]!;
  return parts.flat().toSorted((a, b) => b.date.localeCompare(a.date));
}

const SUMMARY_GROUP = [
  'model',
  'hardware',
  'framework',
  'precision',
  'spec_method',
  'disagg',
  'is_multinode',
  'num_prefill_gpu',
  'num_decode_gpu',
  'prefill_tp',
  'prefill_ep',
  'decode_tp',
  'decode_ep',
  'date',
] as const satisfies readonly (keyof SubmissionSummaryRow)[];

/**
 * A config both databases submitted on one date becomes one row; its distinct
 * counts are then the larger of the two, a lower bound.
 */
export function mergeSubmissionSummaries(
  parts: readonly SubmissionSummaryRow[][],
): SubmissionSummaryRow[] {
  if (parts.length === 1) return parts[0]!;
  const merged = new Map<string, SubmissionSummaryRow>();
  for (const row of parts.flat()) {
    const key = JSON.stringify(SUMMARY_GROUP.map((column) => row[column]));
    const held = merged.get(key);
    merged.set(
      key,
      held
        ? {
            ...held,
            total_datapoints: held.total_datapoints + row.total_datapoints,
            distinct_sequences: Math.max(held.distinct_sequences, row.distinct_sequences),
            distinct_concurrencies: Math.max(
              held.distinct_concurrencies,
              row.distinct_concurrencies,
            ),
            max_concurrency: Math.max(held.max_concurrency, row.max_concurrency),
            image: held.image ?? row.image,
          }
        : row,
    );
  }
  return [...merged.values()].toSorted(
    (a, b) => b.date.localeCompare(a.date) || b.total_datapoints - a.total_datapoints,
  );
}

export function mergeSubmissionVolumes(
  parts: readonly SubmissionVolumeRow[][],
): SubmissionVolumeRow[] {
  if (parts.length === 1) return parts[0]!;
  const merged = new Map<string, SubmissionVolumeRow>();
  for (const row of parts.flat()) {
    const key = JSON.stringify([row.date, row.hardware]);
    const held = merged.get(key);
    merged.set(key, held ? { ...held, datapoints: held.datapoints + row.datapoints } : row);
  }
  return [...merged.values()].toSorted((a, b) => a.date.localeCompare(b.date));
}

/** The latest image of each line. */
export function mergeLatestImages(parts: readonly LatestImageRow[][]): LatestImageRow[] {
  if (parts.length === 1) return parts[0]!;
  const latest = new Map<string, LatestImageRow>();
  for (const row of parts.flat()) {
    const { image: _image, date: _date, ...line } = row;
    const key = JSON.stringify(line);
    const held = latest.get(key);
    if (!held || row.date > held.date) latest.set(key, row);
  }
  return [...latest.values()];
}

/** Each GitHub run attempt once, in date and creation order. */
export function mergeWorkflowRuns(parts: readonly WorkflowRunRow[][]): WorkflowRunRow[] {
  if (parts.length === 1) return parts[0]!;
  return distinctBy(parts.flat(), (run) => `${run.github_run_id}#${run.run_attempt}`).toSorted(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.created_at.localeCompare(b.created_at) ||
      a.github_run_id - b.github_run_id,
  );
}

export function mergeAvailabilityRows(parts: readonly AvailabilityRow[][]): AvailabilityRow[] {
  if (parts.length === 1) return parts[0]!;
  return mergeDistinctRows(parts).toSorted((a, b) => a.date.localeCompare(b.date));
}

/** Each slug once (the public database's), newest first. */
export function mergeDatasetLists(parts: readonly DatasetRecord[][]): DatasetRecord[] {
  if (parts.length === 1) return parts[0]!;
  return distinctBy(parts.flat(), (dataset) => dataset.slug).toSorted(
    (a, b) => b.ingested_at.localeCompare(a.ingested_at) || a.slug.localeCompare(b.slug),
  );
}
