/**
 * Bulk DB insert functions for `benchmark_results` and `run_stats`.
 */

import postgres from 'postgres';
import type { BenchmarkParams } from './benchmark-mapper';

type Sql = ReturnType<typeof postgres>;

/**
 * Bulk-insert benchmark results for a single artifact in one DB round-trip using `UNNEST`.
 * Rows are deduplicated within the batch on the conflict key `(config_id, isl, osl, conc)`
 * before sending, because Postgres rejects an `ON CONFLICT DO UPDATE` statement that
 * would update the same row twice in a single query.
 *
 * @param sql - Active `postgres` connection.
 * @param rows - Mapped benchmark rows with their resolved `configId`.
 * @param workflowRunId - DB id of the parent `workflow_runs` row.
 * @param date - ISO date string (`YYYY-MM-DD`) for the `date` column.
 * @returns Counts of newly inserted rows and rows that hit the conflict path.
 */
export async function bulkIngestBenchmarkRows(
  sql: Sql,
  rows: Array<BenchmarkParams & { configId: number }>,
  workflowRunId: number,
  date: string,
): Promise<{ newCount: number; dupCount: number; insertedIds: number[] }> {
  if (rows.length === 0) return { newCount: 0, dupCount: 0, insertedIds: [] };

  // Postgres rejects ON CONFLICT DO UPDATE if the same conflict key appears
  // more than once in a single batch. Deduplicate within the batch, keeping
  // the last occurrence (last metrics for each unique config/isl/osl/conc).
  const seen = new Map<string, BenchmarkParams & { configId: number }>();
  for (const r of rows) seen.set(`${r.configId}-${r.isl}-${r.osl}-${r.conc}`, r);
  const deduped = [...seen.values()];

  const configIds = deduped.map((r) => r.configId);
  const isls = deduped.map((r) => r.isl);
  const osls = deduped.map((r) => r.osl);
  const concs = deduped.map((r) => r.conc);
  const images = deduped.map((r) => r.image);
  const metricsJsons = deduped.map((r) => JSON.stringify(r.metrics));

  const result = await sql<{ inserted: boolean; id: number }[]>`
    insert into benchmark_results (
      workflow_run_id, config_id, benchmark_type, date,
      isl, osl, conc, image, metrics
    )
    select
      ${workflowRunId},
      unnest(${sql.array(configIds)}::int[]),
      'single_turn',
      ${date}::date,
      unnest(${sql.array(isls)}::int[]),
      unnest(${sql.array(osls)}::int[]),
      unnest(${sql.array(concs)}::int[]),
      unnest(${sql.array(images)}),
      unnest(${sql.array(metricsJsons)}::jsonb[])
    on conflict (workflow_run_id, config_id, benchmark_type, isl, osl, conc)
    do update set
      metrics = excluded.metrics,
      image = excluded.image
    returning (xmax = 0) as inserted, id
  `;

  const newCount = result.filter((r) => r.inserted).length;
  return { newCount, dupCount: deduped.length - newCount, insertedIds: result.map((r) => r.id) };
}

/**
 * Insert a server log once and link it to the given benchmark result IDs.
 * Idempotent: skips rows that already have a server_log_id set.
 */
export async function insertServerLog(
  sql: Sql,
  benchmarkResultIds: number[],
  serverLog: string,
): Promise<void> {
  if (benchmarkResultIds.length === 0) return;

  // Only link rows that don't already have a server log
  const unlinked = await sql<{ id: number }[]>`
    select id from benchmark_results
    where id = any(${sql.array(benchmarkResultIds)}::bigint[])
      and server_log_id is null
  `;
  if (unlinked.length === 0) return;

  const [{ id: logId }] = await sql<{ id: number }[]>`
    insert into server_logs (server_log) values (${serverLog})
    returning id
  `;
  await sql`
    update benchmark_results
    set server_log_id = ${logId}
    where id = any(${sql.array(unlinked.map((r) => r.id))}::bigint[])
  `;
}

/**
 * Bulk-insert `run_stats` rows for one workflow run in a single DB round-trip.
 * Rows are deduplicated within the batch on `hardware` before sending.
 * On conflict the `n_success` and `total` counts are overwritten with the latest values.
 *
 * @param sql - Active `postgres` connection.
 * @param rows - Hardware success/total stats to insert.
 * @param workflowRunId - DB id of the parent `workflow_runs` row.
 * @param date - ISO date string (`YYYY-MM-DD`) for the `date` column.
 * @returns Counts of newly inserted rows and rows that hit the conflict path.
 */
export async function bulkIngestRunStats(
  sql: Sql,
  rows: Array<{ hardware: string; nSuccess: number; total: number }>,
  workflowRunId: number,
  date: string,
): Promise<{ newCount: number; dupCount: number }> {
  if (rows.length === 0) return { newCount: 0, dupCount: 0 };

  // Deduplicate on conflict key (workflow_run_id, hardware) — keep last occurrence.
  const seen = new Map<string, { hardware: string; nSuccess: number; total: number }>();
  for (const r of rows) seen.set(r.hardware, r);
  const deduped = [...seen.values()];

  const result = await sql<{ inserted: boolean }[]>`
    insert into run_stats (workflow_run_id, date, hardware, n_success, total)
    select
      ${workflowRunId},
      ${date}::date,
      unnest(${sql.array(deduped.map((r) => r.hardware))}::text[]),
      unnest(${sql.array(deduped.map((r) => r.nSuccess))}::int[]),
      unnest(${sql.array(deduped.map((r) => r.total))}::int[])
    on conflict (workflow_run_id, hardware)
    do update set n_success = excluded.n_success, total = excluded.total
    returning (xmax = 0) as inserted
  `;

  const newCount = result.filter((r) => r.inserted).length;
  return { newCount, dupCount: deduped.length - newCount };
}

/**
 * Bulk-upsert rows into the `availability` table.
 * Rows are deduplicated within the batch before sending. ON CONFLICT DO NOTHING
 * makes re-runs idempotent.
 */
export async function bulkUpsertAvailability(
  sql: Sql,
  rows: Array<{
    model: string;
    isl: number;
    osl: number;
    precision: string;
    hardware: string;
    framework: string;
    specMethod: string;
    disagg: boolean;
  }>,
  date: string,
): Promise<void> {
  if (rows.length === 0) return;

  const seen = new Set<string>();
  const unique: typeof rows = [];
  for (const r of rows) {
    const key = `${r.model}|${r.isl}|${r.osl}|${r.precision}|${r.hardware}|${r.framework}|${r.specMethod}|${r.disagg}|${date}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }

  await sql`
    insert into availability (model, isl, osl, precision, hardware, framework, spec_method, disagg, date)
    select
      unnest(${sql.array(unique.map((r) => r.model))}::text[]),
      unnest(${sql.array(unique.map((r) => r.isl))}::int[]),
      unnest(${sql.array(unique.map((r) => r.osl))}::int[]),
      unnest(${sql.array(unique.map((r) => r.precision))}::text[]),
      unnest(${sql.array(unique.map((r) => r.hardware))}::text[]),
      unnest(${sql.array(unique.map((r) => r.framework))}::text[]),
      unnest(${sql.array(unique.map((r) => r.specMethod))}::text[]),
      unnest(${sql.array(unique.map((r) => r.disagg))}::bool[]),
      ${date}::date
    on conflict do nothing
  `;
}
