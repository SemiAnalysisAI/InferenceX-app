/**
 * Stores the per-attempt data of fixed-sequence benchmark points.
 *
 * A fixed-sequence result row may carry a `request_records` block: one entry
 * per measured attempt with its outcome and latencies, the counts the client
 * kept, and its measurement window. Rows from runs that predate the block
 * carry none, and nothing here invents one for them.
 */

import { benchmarkPointIngestKey, type BenchmarkPersistenceInput } from './benchmark-ingest';
import type { Sql } from './db-utils';
import {
  SLA_ATTEMPTS_VERSION,
  encodeSlaAttempts,
  slaAttemptsFromRequestRecords,
  slaAttemptsSha256,
  type RequestRecordsUnavailableReason,
} from './sla-attempts';

export type RequestRecordsPoint = Pick<
  BenchmarkPersistenceInput,
  'configId' | 'benchmarkType' | 'isl' | 'osl' | 'conc' | 'offloadMode' | 'recipeFingerprint'
> & { requestRecords?: unknown };

export interface RequestRecordsIngestResult {
  /** Points whose attempt data was stored. */
  stored: number;
  /** Points stored with the reason their block could not be read. */
  unavailable: Partial<Record<RequestRecordsUnavailableReason, number>>;
  /** Migration 031 is not applied; nothing was written. */
  tableAbsent: boolean;
}

/**
 * Whether migration 031 has been applied. Migrations are applied by hand, so
 * ingest can run ahead of its database; until then benchmark rows ingest as
 * before and the blocks are left in the artifacts.
 */
async function hasSlaAttemptsTable(sql: Sql): Promise<boolean> {
  const rows = await sql<{ present: boolean }[]>`
    select to_regclass('public.benchmark_sla_attempts') is not null as present
  `;
  return rows[0]?.present === true;
}

/**
 * Store the attempt data of every point in `rows` that carries a
 * `request_records` block. Call after the benchmark rows of the same run are
 * inserted: points are matched to them by their natural key.
 */
export async function ingestRequestRecords(
  sql: Sql,
  rows: readonly RequestRecordsPoint[],
  workflowRunId: number,
): Promise<RequestRecordsIngestResult> {
  const result: RequestRecordsIngestResult = { stored: 0, unavailable: {}, tableAbsent: false };
  const points = new Map<string, RequestRecordsPoint>();
  for (const row of rows) {
    if (row.requestRecords !== undefined) points.set(benchmarkPointIngestKey(row), row);
  }
  if (points.size === 0) return result;
  if (!(await hasSlaAttemptsTable(sql))) {
    result.tableAbsent = true;
    return result;
  }

  const prepared = [...points.values()].map((point) => {
    const attempts = slaAttemptsFromRequestRecords(point.requestRecords);
    if (attempts.kind === 'unavailable') {
      result.unavailable[attempts.reason] = (result.unavailable[attempts.reason] ?? 0) + 1;
      return { point, gzHex: null, shaHex: null, loadKind: null, limit: null, ...attempts };
    }
    result.stored += 1;
    const gz = encodeSlaAttempts(attempts.blob);
    return {
      point,
      // Hex text rather than a bytea array: it survives every driver unchanged.
      gzHex: gz.toString('hex'),
      shaHex: slaAttemptsSha256(gz),
      loadKind: attempts.loadKind,
      limit: attempts.concurrencyLimit,
      reason: null,
      detail: null,
    };
  });

  await sql`
    insert into benchmark_sla_attempts (
      benchmark_result_id, sla_attempts_gz, sla_attempts_version, sla_attempts_sha256,
      load_kind, concurrency_limit, unavailable_reason, unavailable_detail
    )
    select
      br.id, decode(v.gz_hex, 'hex'), ${SLA_ATTEMPTS_VERSION}, decode(v.sha_hex, 'hex'),
      v.load_kind, v.concurrency_limit, v.reason, v.detail
    from unnest(
      ${sql.array(prepared.map((p) => p.point.configId))}::int[],
      ${sql.array(prepared.map((p) => p.point.benchmarkType))}::text[],
      ${sql.array(prepared.map((p) => p.point.isl))}::int[],
      ${sql.array(prepared.map((p) => p.point.osl))}::int[],
      ${sql.array(prepared.map((p) => p.point.conc))}::int[],
      ${sql.array(prepared.map((p) => p.point.offloadMode))}::text[],
      ${sql.array(prepared.map((p) => p.point.recipeFingerprint))}::text[],
      ${sql.array(prepared.map((p) => p.gzHex))}::text[],
      ${sql.array(prepared.map((p) => p.shaHex))}::text[],
      ${sql.array(prepared.map((p) => p.loadKind))}::text[],
      ${sql.array(prepared.map((p) => p.limit))}::int[],
      ${sql.array(prepared.map((p) => p.reason))}::text[],
      ${sql.array(prepared.map((p) => p.detail))}::text[]
    ) as v(
      config_id, benchmark_type, isl, osl, conc, offload_mode, recipe_fingerprint,
      gz_hex, sha_hex, load_kind, concurrency_limit, reason, detail
    )
    join benchmark_results br
      on br.workflow_run_id = ${workflowRunId}
     and br.config_id = v.config_id
     and br.benchmark_type = v.benchmark_type
     and br.isl is not distinct from v.isl
     and br.osl is not distinct from v.osl
     and br.conc = v.conc
     and br.offload_mode = v.offload_mode
     and br.recipe_fingerprint is not distinct from v.recipe_fingerprint
    on conflict (benchmark_result_id) do update set
      sla_attempts_gz = excluded.sla_attempts_gz,
      sla_attempts_version = excluded.sla_attempts_version,
      sla_attempts_sha256 = excluded.sla_attempts_sha256,
      load_kind = excluded.load_kind,
      concurrency_limit = excluded.concurrency_limit,
      unavailable_reason = excluded.unavailable_reason,
      unavailable_detail = excluded.unavailable_detail
  `;
  return result;
}

/** One line per outcome worth an operator's attention; silent when no point carried a block. */
export function logRequestRecordsIngest(prefix: string, result: RequestRecordsIngestResult): void {
  if (result.tableAbsent) {
    console.warn(
      `${prefix}[WARN] request_records not stored: migration 031 (benchmark_sla_attempts) is not applied`,
    );
    return;
  }
  if (result.stored > 0) console.log(`${prefix}request records: ${result.stored} point(s) stored`);
  for (const [reason, points] of Object.entries(result.unavailable)) {
    console.warn(`${prefix}[WARN] request records unavailable (${reason}): ${points} point(s)`);
  }
}
