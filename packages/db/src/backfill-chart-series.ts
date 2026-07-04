/**
 * Backfill `agentic_trace_replay.chart_series` for rows that are missing it
 * or were computed by an older `CHART_SERIES_VERSION`.
 *
 * The ingest path now computes the time-series inline, but existing rows
 * (and rows whose computation logic has since changed) still need this
 * pass. Run after the agentic schema migration and any time `CHART_SERIES_VERSION`
 * bumps.
 *
 * Strategy:
 *   - Stream rows one at a time (server_metrics_json_gz can decompress
 *     past 500 MB on high-conc TP+EP points — one in memory at a time
 *     avoids OOM).
 *   - Skip rows whose stored version already matches.
 *   - Recompute via the same `computeChartSeries()` helper the ingest
 *     path uses, so behavior cannot drift.
 *
 * Usage:
 *   pnpm --filter @semianalysisai/inferencex-db db:backfill-chart-series
 *     [--limit N]   only process the first N candidate rows
 *     [--force]     recompute every row, even if version already matches
 *     [--yes]       skip the confirmation prompt
 */

import { hasNoSslFlag } from './cli-utils.js';
import { CHART_SERIES_VERSION, computeChartSeries } from './etl/compute-chart-series.js';
import { createAdminSql } from './etl/db-utils.js';
import {
  confirmProceed,
  jsonbParam,
  parseLimitForceFlags,
  runBackfillMain,
  runPerIdBackfill,
} from './lib/backfill-runner.js';

const flags = parseLimitForceFlags();

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
  max: 1,
  onnotice: () => {},
});

async function main(): Promise<void> {
  console.log('=== backfill-chart-series ===');
  console.log(`  CHART_SERIES_VERSION = ${CHART_SERIES_VERSION}`);
  console.log(`  force = ${flags.force}`);
  console.log(`  limit = ${flags.limit ?? 'none'}`);

  // Only rows that actually have a server_metrics blob can produce a
  // chart_series. Rows without the blob legitimately keep `chart_series`
  // null and the API serves them via the slow path (which also returns
  // null because there's no blob to parse — so the page falls into the
  // "no stored trace_replay blob" branch).
  const candidates = flags.force
    ? await sql<{ id: number }[]>`
        select id
        from agentic_trace_replay
        where server_metrics_json_gz is not null
        order by id
        ${flags.limit ? sql`limit ${flags.limit}` : sql``}
      `
    : await sql<{ id: number }[]>`
        select id
        from agentic_trace_replay
        where server_metrics_json_gz is not null
          and (
            chart_series is null
            or coalesce((chart_series->>'version')::int, -1) <> ${CHART_SERIES_VERSION}
          )
        order by id
        ${flags.limit ? sql`limit ${flags.limit}` : sql``}
      `;

  if (candidates.length === 0) {
    console.log('\n  Nothing to do — all rows up to date.');
    return;
  }

  if (!(await confirmProceed(`${candidates.length} candidate row(s).`))) return;

  await runPerIdBackfill(
    candidates.map((c) => c.id),
    async (id) => {
      const [row] = await sql<
        {
          server_metrics_json_gz: Buffer | null;
          framework: string | null;
          disagg: boolean | null;
        }[]
      >`
        select atr.server_metrics_json_gz, source.framework, source.disagg
        from agentic_trace_replay atr
        left join lateral (
          select c.framework, c.disagg
          from benchmark_results br
          join configs c on c.id = br.config_id
          where br.trace_replay_id = atr.id
          order by br.id
          limit 1
        ) source on true
        where atr.id = ${id}
      `;
      if (!row) {
        console.warn(`  id=${id}: row vanished, skipping`);
        return 'skipped';
      }

      const series = await computeChartSeries(row.server_metrics_json_gz, {
        framework: row.framework,
        disagg: row.disagg ?? false,
      });

      await sql`
        update agentic_trace_replay
        set chart_series = ${series === null ? null : jsonbParam(sql, series)}
        where id = ${id}
      `;
      return 'ok';
    },
  );
}

runBackfillMain('backfill-chart-series', sql, main);
