/**
 * Recompute AgentX server metrics for stored rows from stored raw data only:
 * the scrape CSV and the server-log bundle. Ingest and the
 * historical backfill share this path.
 */

import type { TransactionSql } from 'postgres';

import { configCacheKey, type ConfigParams } from '../config-cache';
import type { Sql } from '../db-utils';
import { BENCHMARK_POINT_BACKFILLS } from '../run-overrides';
import {
  AGENTX_SERVER_METRIC_KEYS,
  agentxServerMetricsInput,
  deriveAgentxServerMetrics,
  startupLinePattern,
  workerOfLogFile,
  type AgentxServerMetricKey,
  type LogFileLines,
} from './index';

type Db = Sql | TransactionSql;

/** Characters per regex call; PostgreSQL expands text to 4-byte chars and caps one allocation at 1 GiB. */
const SCAN_CHUNK_CHARS = 16 * 1024 * 1024;
/** A line shorter than this that crosses a slice boundary is whole in the earlier slice. */
const SCAN_OVERLAP_CHARS = 64 * 1024;

/** Startup lines of every worker log in a bundle, filtered inside PostgreSQL. */
export async function collectWorkerLogLines(
  sql: Db,
  serverLogId: number,
  framework: string,
): Promise<LogFileLines[]> {
  // List names first: measuring a TOASTed log's length decompresses it, so only worker logs pay that.
  const files = await sql<{ primary: boolean; file_name: string }[]>`
    select true as primary, file_name from server_logs where id = ${serverLogId}
    union all
    select false, file_name from server_log_files where server_log_id = ${serverLogId}
  `;
  const out: LogFileLines[] = [];
  for (const file of files) {
    if (!workerOfLogFile(file.file_name)) continue;
    const [{ length }] = file.primary
      ? await sql<{ length: number }[]>`
          select length(server_log) as length from server_logs where id = ${serverLogId}`
      : await sql<{ length: number }[]>`
          select length(log_text) as length from server_log_files
          where server_log_id = ${serverLogId} and file_name = ${file.file_name}`;
    const lines = new Set<string>();
    for (let offset = 0; offset < Math.max(length, 1); offset += SCAN_CHUNK_CHARS) {
      const pattern = startupLinePattern(framework, offset === 0);
      if (!pattern) break;
      const last = offset + SCAN_CHUNK_CHARS >= length;
      const rows = await sql<{ line: string | null; token: string | null }[]>`
        with chunk as materialized (
          select substring(server_log from ${offset + 1}::integer
              for ${SCAN_CHUNK_CHARS + SCAN_OVERLAP_CHARS}::integer) as text
          from server_logs where ${file.primary} and id = ${serverLogId}
          union all
          select substring(log_text from ${offset + 1}::integer
              for ${SCAN_CHUNK_CHARS + SCAN_OVERLAP_CHARS}::integer)
          from server_log_files
          where not ${file.primary} and server_log_id = ${serverLogId}
            and file_name = ${file.file_name}
        )
        select match.parts[1] as line, match.parts[2] as token
        from chunk, lateral regexp_matches(
          case when ${last} then chunk.text || E'\\n' else chunk.text end, ${pattern}, 'g'
        ) as match(parts)
      `;
      for (const row of rows) lines.add(row.line ?? row.token ?? '');
    }
    lines.delete('');
    out.push({ fileName: file.file_name, lines: [...lines] });
  }
  return out;
}

interface AgentxRow {
  id: number;
  metrics: Record<string, unknown>;
  server_log_id: number | null;
  scrape_csv: string | null;
  github_run_id: number;
  run_attempt: number;
  benchmark_type: string;
  isl: number | null;
  osl: number | null;
  conc: number;
  offload_mode: string;
  recipe_fingerprint: string | null;
  hardware: string;
  framework: string;
  model: string;
  precision: string;
  spec_method: string;
  disagg: boolean;
  is_multinode: boolean;
  prefill_tp: number;
  prefill_ep: number;
  prefill_dp_attention: boolean;
  prefill_num_workers: number;
  decode_tp: number;
  decode_ep: number;
  decode_dp_attention: boolean;
  decode_num_workers: number;
  num_prefill_gpu: number;
  num_decode_gpu: number;
}

function rowConfig(row: AgentxRow): ConfigParams {
  return {
    hardware: row.hardware,
    framework: row.framework,
    model: row.model,
    precision: row.precision,
    specMethod: row.spec_method,
    disagg: row.disagg,
    isMultinode: row.is_multinode,
    prefillTp: row.prefill_tp,
    prefillEp: row.prefill_ep,
    prefillDpAttn: row.prefill_dp_attention,
    prefillNumWorkers: row.prefill_num_workers,
    decodeTp: row.decode_tp,
    decodeEp: row.decode_ep,
    decodeDpAttn: row.decode_dp_attention,
    decodeNumWorkers: row.decode_num_workers,
    numPrefillGpu: row.num_prefill_gpu,
    numDecodeGpu: row.num_decode_gpu,
  };
}

/** Audited point backfills that pin server metrics keep their values over the derivation. */
function pinnedServerMetrics(
  row: AgentxRow,
  config: ConfigParams,
): Partial<Record<AgentxServerMetricKey, unknown>> {
  const pinned: Partial<Record<AgentxServerMetricKey, unknown>> = {};
  for (const backfill of BENCHMARK_POINT_BACKFILLS) {
    const offloadModes = [backfill.offloadMode, backfill.set.offloadMode ?? backfill.offloadMode];
    const fingerprints = [
      backfill.recipeFingerprint ?? null,
      backfill.set.recipeFingerprint ?? backfill.recipeFingerprint ?? null,
    ];
    if (
      backfill.githubRunId !== Number(row.github_run_id) ||
      backfill.runAttempt !== row.run_attempt ||
      configCacheKey(backfill.config) !== configCacheKey(config) ||
      backfill.benchmarkType !== row.benchmark_type ||
      backfill.isl !== row.isl ||
      backfill.osl !== row.osl ||
      backfill.conc !== row.conc ||
      !offloadModes.includes(row.offload_mode) ||
      !fingerprints.includes(row.recipe_fingerprint)
    ) {
      continue;
    }
    for (const key of AGENTX_SERVER_METRIC_KEYS) {
      if (backfill.set.metricsMerge && key in backfill.set.metricsMerge) {
        pinned[key] = backfill.set.metricsMerge[key];
      }
    }
  }
  return pinned;
}

export interface AgentxServerMetricsResult {
  id: number;
  framework: string;
  disagg: boolean;
  before: Partial<Record<AgentxServerMetricKey, unknown>>;
  after: Partial<Record<AgentxServerMetricKey, unknown>>;
  kvPoolReason: string | null;
  changed: boolean;
}

/**
 * Derive and (unless `dryRun`) write every server metric for the given
 * AgentX rows. Keys that cannot be derived are removed from `metrics`.
 */
export async function recomputeAgentxServerMetrics(
  sql: Db,
  benchmarkIds: readonly number[],
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<AgentxServerMetricsResult[]> {
  if (benchmarkIds.length === 0) return [];
  const rows = await sql<AgentxRow[]>`
    select br.id, br.metrics, br.server_log_id, convert_from(atr.server_metrics_csv, 'UTF8') as scrape_csv,
      wr.github_run_id, wr.run_attempt, br.benchmark_type, br.isl, br.osl, br.conc, br.offload_mode,
      br.recipe_fingerprint, c.hardware, c.framework, c.model, c.precision, c.spec_method, c.disagg,
      c.is_multinode, c.prefill_tp, c.prefill_ep, c.prefill_dp_attention, c.prefill_num_workers,
      c.decode_tp, c.decode_ep, c.decode_dp_attention, c.decode_num_workers, c.num_prefill_gpu,
      c.num_decode_gpu
    from benchmark_results br
    join configs c on c.id = br.config_id
    join workflow_runs wr on wr.id = br.workflow_run_id
    left join agentic_trace_replay atr on atr.id = br.trace_replay_id
    where br.id = any(${`{${benchmarkIds.join(',')}}`}::bigint[])
      and br.benchmark_type = 'agentic_traces'
    order by br.id
  `;
  const results: AgentxServerMetricsResult[] = [];
  const logLines = new Map<string, LogFileLines[]>();
  for (const row of rows) {
    const logKey = `${row.server_log_id}|${row.framework}`;
    if (row.server_log_id !== null && !logLines.has(logKey)) {
      logLines.set(logKey, await collectWorkerLogLines(sql, row.server_log_id, row.framework));
    }
    const config = rowConfig(row);
    const derived = deriveAgentxServerMetrics(
      agentxServerMetricsInput(config, row.metrics, {
        scrapeCsv: row.scrape_csv,
        logFiles: row.server_log_id === null ? null : logLines.get(logKey)!,
      }),
    );
    const after: Partial<Record<AgentxServerMetricKey, unknown>> = {
      ...Object.fromEntries(Object.entries(derived.metrics).filter(([, value]) => value !== null)),
      ...pinnedServerMetrics(row, config),
    };
    const before = Object.fromEntries(
      AGENTX_SERVER_METRIC_KEYS.filter((key) => key in row.metrics).map((key) => [
        key,
        row.metrics[key],
      ]),
    );
    const changed = JSON.stringify(sortKeys(before)) !== JSON.stringify(sortKeys(after));
    if (changed && !dryRun) {
      await sql`
        update benchmark_results
        set metrics = (metrics - ${sql.array([...AGENTX_SERVER_METRIC_KEYS])}::text[])
          || ${sql.json(after as Parameters<typeof sql.json>[0])}
        where id = ${row.id}
      `;
    }
    results.push({
      id: row.id,
      framework: row.framework,
      disagg: row.disagg,
      before,
      after,
      kvPoolReason: derived.kvPoolReason,
      changed,
    });
  }
  return results;
}

function sortKeys(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).toSorted(([a], [b]) => a.localeCompare(b)));
}
