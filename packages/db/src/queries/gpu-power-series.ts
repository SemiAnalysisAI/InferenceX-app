/**
 * Precomputed PowerX timeline series (`gpu_power_series`, migration 019).
 *
 * `storedPowerSeries` turns an artifact's stored samples into one-second
 * per-GPU watt series. Running it per request means reading every sample of
 * the artifact first, which takes tens of seconds for large runs. Ingest runs
 * it once per artifact instead (`materializePowerSeriesForRun`) and the route
 * reads the stored output (`getPrecomputedPowerSeries`).
 *
 * A stored row is used only when its `format_version` matches
 * `POWER_SERIES_FORMAT_VERSION` and its `input_key` matches the key recomputed
 * from the current series rows, so it can never be staler than the samples.
 * Any miss returns null and the caller keeps today's read-the-samples path.
 */
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

import type { DbClient } from '../connection.js';
import type { Sql } from '../etl/db-utils';
import type { GpuPowerSeries } from '../power-series/power-series';
import {
  storedPowerSeries,
  StoredTelemetryIncompleteError,
} from '../power-series/stored-power-series';
import {
  loadSeriesDetails,
  readLatestRun,
  readSeriesRows,
  seriesVersionKey,
  toWorkflowRun,
  withConsistentSnapshot,
  type GpuMetricsRunPayload,
  type GpuMetricsRunSelection,
  type RawSeriesRow,
} from './gpu-metrics';

/**
 * Bump whenever the output of `power-series/*` changes (bucketing, window cuts,
 * series fields). Stored rows with another version are ignored until
 * `db:backfill-power-series` recomputes them.
 */
export const POWER_SERIES_FORMAT_VERSION = 1;

export interface PrecomputedPowerSeries {
  workflowRun: GpuMetricsRunPayload['workflowRun'];
  series: GpuPowerSeries[];
}

export interface MaterializePowerSeriesResult {
  written: string[];
  unchanged: string[];
  /** Artifacts whose stored telemetry cannot produce a series; readers keep failing them loudly. */
  incomplete: string[];
}

/** Hash of everything `storedPowerSeries` reads for one artifact besides the samples themselves. */
function powerSeriesInputKey(rows: readonly RawSeriesRow[]): string {
  const parts = [...rows]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((row) => [seriesVersionKey(row), row.power_audits ?? []]);
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function groupByArtifact(rows: readonly RawSeriesRow[]): Map<string, RawSeriesRow[]> {
  const groups = new Map<string, RawSeriesRow[]>();
  for (const row of rows) {
    const group = groups.get(row.artifact_name);
    if (group) group.push(row);
    else groups.set(row.artifact_name, [row]);
  }
  return groups;
}

function decodeSeries(value: unknown): GpuPowerSeries[] {
  if (!(value instanceof Uint8Array)) throw new Error('gpu_power_series.series_gz is not bytea');
  const parsed: unknown = JSON.parse(gunzipSync(value).toString('utf8'));
  if (!Array.isArray(parsed)) throw new Error('gpu_power_series.series_gz is not a series array');
  return parsed as GpuPowerSeries[];
}

/**
 * Stored timeline series for the artifacts `selection` scopes, in the order the
 * samples path returns them. Null when the run has no stored telemetry or any
 * scoped artifact lacks a current precomputed row. Window-level `sourceResults`
 * filtering is left to the caller, as on the samples path.
 *
 * One query reads every scoped artifact: the largest stored run is a few MB of
 * gzip, far below the Neon HTTP driver's 64 MiB response cap even hex-encoded.
 */
export function getPrecomputedPowerSeries(
  sql: DbClient,
  githubRunId: number,
  selection: Pick<GpuMetricsRunSelection, 'prefix' | 'sourceResults'> = {},
): Promise<PrecomputedPowerSeries | null> {
  return withConsistentSnapshot(async () => {
    const run = await readLatestRun(sql, githubRunId);
    if (!run?.has_series) return null;
    const workflowRunId = Number(run.id);
    const groups = groupByArtifact(
      await readSeriesRows(sql, {
        workflowRunId,
        seriesIds: null,
        prefix: selection.prefix ?? null,
        sources: selection.sourceResults ?? null,
      }),
    );
    if (groups.size === 0) return null;
    const stored = (await sql`
      select artifact_name, input_key, series_gz
      from gpu_power_series
      where workflow_run_id = ${workflowRunId}
        and format_version = ${POWER_SERIES_FORMAT_VERSION}
        and artifact_name = any(${[...groups.keys()]}::text[])
    `) as { artifact_name: string; input_key: string; series_gz: unknown }[];
    const byArtifact = new Map(stored.map((row) => [row.artifact_name, row]));
    const series: GpuPowerSeries[] = [];
    for (const [artifact, rows] of groups) {
      const row = byArtifact.get(artifact);
      if (!row || row.input_key !== powerSeriesInputKey(rows)) return null;
      series.push(...decodeSeries(row.series_gz));
    }
    return { workflowRun: toWorkflowRun(run), series };
  });
}

/**
 * Compute and store the timeline series of every telemetry artifact of one
 * workflow run (DB id). Reads one artifact's samples at a time to bound
 * memory. Skips artifacts whose current row already matches unless `force`.
 * Artifacts that `storedPowerSeries` rejects get no row, so the route keeps
 * reporting them as incomplete instead of serving a partial series.
 */
export async function materializePowerSeriesForRun(
  sql: DbClient | Sql,
  workflowRunId: number,
  { force = false }: { force?: boolean } = {},
): Promise<MaterializePowerSeriesResult> {
  const db = sql as unknown as DbClient;
  const result: MaterializePowerSeriesResult = { written: [], unchanged: [], incomplete: [] };
  const groups = groupByArtifact(
    await readSeriesRows(db, { workflowRunId, seriesIds: null, prefix: null, sources: null }),
  );
  const current = (await db`
    select artifact_name, input_key
    from gpu_power_series
    where workflow_run_id = ${workflowRunId} and format_version = ${POWER_SERIES_FORMAT_VERSION}
  `) as { artifact_name: string; input_key: string }[];
  const currentKeys = new Map(current.map((row) => [row.artifact_name, row.input_key]));

  for (const [artifact, listed] of groups) {
    if (!force && currentKeys.get(artifact) === powerSeriesInputKey(listed)) {
      result.unchanged.push(artifact);
      continue;
    }
    const computed = await withConsistentSnapshot(async () => {
      // Re-read the rows with the samples: `loadSeriesDetails` proves they
      // belong to the same series versions the key is computed from.
      const rows = await readSeriesRows(db, {
        workflowRunId,
        seriesIds: listed.map((row) => Number(row.id)),
        prefix: null,
        sources: null,
      });
      const details = await loadSeriesDetails(db, rows);
      try {
        return { key: powerSeriesInputKey(rows), series: storedPowerSeries(details) };
      } catch (error) {
        if (error instanceof StoredTelemetryIncompleteError) return null;
        throw error;
      }
    });
    if (!computed) {
      await db`
        delete from gpu_power_series
        where workflow_run_id = ${workflowRunId} and artifact_name = ${artifact}
      `;
      result.incomplete.push(artifact);
      continue;
    }
    const gz = gzipSync(JSON.stringify(computed.series));
    await db`
      insert into gpu_power_series
        (workflow_run_id, artifact_name, format_version, input_key, series_gz)
      values (${workflowRunId}, ${artifact}, ${POWER_SERIES_FORMAT_VERSION}, ${computed.key}, ${gz})
      on conflict (workflow_run_id, artifact_name) do update set
        format_version = excluded.format_version,
        input_key = excluded.input_key,
        series_gz = excluded.series_gz,
        computed_at = now()
    `;
    result.written.push(artifact);
  }

  // Artifacts that no longer hold telemetry (a re-ingest dropped them).
  await db`
    delete from gpu_power_series
    where workflow_run_id = ${workflowRunId}
      and not (artifact_name = any(${[...groups.keys()]}::text[]))
  `;
  return result;
}
