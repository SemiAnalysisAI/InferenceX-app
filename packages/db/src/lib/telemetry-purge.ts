/**
 * Explicit deletion of PowerX telemetry during a purge.
 *
 * Migration 016 declares `on delete cascade` from `gpu_metric_series.workflow_run_id`
 * to `workflow_runs` and from `benchmark_result_gpu_metrics.benchmark_result_id` to
 * `benchmark_results`, so a purge already removed telemetry — silently, with no count
 * in the preview and no line in the log. That is the wrong default for this data:
 * past GitHub's 90-day artifact retention the stored samples are the only copy, which
 * is the reason migration 016 exists at all. These helpers make the deletion explicit
 * so the operator sees the cost before confirming and again in the transcript.
 *
 * The two levels differ on purpose:
 *   - A whole-run purge owns the series and deletes them (`deleteRunTelemetry`).
 *   - A point purge only drops the point→series links (`unlinkPointTelemetry`). The
 *     series stays attached to its workflow_run because `/api/gpu-metrics?runId=`
 *     reads series by run, not through the links, and other points of the same run
 *     may still reference it.
 */

import type { Sql } from '../etl/db-utils.js';

export interface TelemetryPurgeCounts {
  /** Rows in `gpu_metric_series`. */
  series: number;
  /** Sum of `gpu_metric_series.sample_count` across those series. */
  samples: number;
}

export const NO_TELEMETRY: TelemetryPurgeCounts = { series: 0, samples: 0 };

/** `count`/`sum` come back as strings over the wire; `sum` is null on an empty set. */
function toCounts(row: { n: unknown; samples: unknown } | undefined): TelemetryPurgeCounts {
  if (!row) return NO_TELEMETRY;
  return { series: Number(row.n ?? 0), samples: Number(row.samples ?? 0) };
}

/**
 * Telemetry a whole-run purge would destroy. Read-only, for the preview line.
 * Sums the stored `sample_count` instead of counting `gpu_metric_samples` so the
 * preview stays cheap against a table holding tens of millions of rows.
 */
export async function countRunTelemetry(
  sql: Sql,
  workflowRunIds: readonly number[],
): Promise<TelemetryPurgeCounts> {
  if (workflowRunIds.length === 0) return NO_TELEMETRY;
  const [row] = await sql`
    SELECT count(*)::int AS n, coalesce(sum(sample_count), 0)::bigint AS samples
    FROM gpu_metric_series
    WHERE workflow_run_id = ANY(${[...workflowRunIds]})
  `;
  return toCounts(row as { n: unknown; samples: unknown } | undefined);
}

/**
 * Delete the telemetry owned by these workflow_runs and report what went, so the
 * caller can log it. Samples and per-GPU stats follow by cascade from the series.
 * Call this before deleting the `workflow_runs` rows themselves.
 */
export async function deleteRunTelemetry(
  sql: Sql,
  workflowRunIds: readonly number[],
): Promise<TelemetryPurgeCounts> {
  if (workflowRunIds.length === 0) return NO_TELEMETRY;
  const [row] = await sql`
    WITH deleted AS (
      DELETE FROM gpu_metric_series
      WHERE workflow_run_id = ANY(${[...workflowRunIds]})
      RETURNING sample_count
    )
    SELECT count(*)::int AS n, coalesce(sum(sample_count), 0)::bigint AS samples FROM deleted
  `;
  return toCounts(row as { n: unknown; samples: unknown } | undefined);
}

/**
 * Drop the point→series links for purged benchmark points and report how many went.
 * Deliberately leaves `gpu_metric_series` in place: it belongs to the workflow_run,
 * which is not being purged here.
 */
export async function unlinkPointTelemetry(
  sql: Sql,
  benchmarkResultIds: readonly number[],
): Promise<number> {
  if (benchmarkResultIds.length === 0) return 0;
  const [row] = await sql`
    WITH deleted AS (
      DELETE FROM benchmark_result_gpu_metrics
      WHERE benchmark_result_id = ANY(${[...benchmarkResultIds]})
      RETURNING series_id
    )
    SELECT count(*)::int AS n FROM deleted
  `;
  return Number((row as { n: unknown } | undefined)?.n ?? 0);
}

/** One-line summary for preview and transcript output. */
export function describeTelemetry(counts: TelemetryPurgeCounts): string {
  return `${counts.series} gpu_metric_series (${counts.samples.toLocaleString('en-US')} samples)`;
}
