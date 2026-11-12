import type { DbClient } from '../connection.js';
import { withStoredPerPoolBasis } from '../etl/disagg-throughput';
import {
  type EngineLogFacts,
  parseEngineLog,
  parseSrtctlSweepLog,
  type SrtctlLaunch,
} from '../lib/launch-record';
import type { BenchmarkRow } from './benchmarks';
import { getServerLogChunk, getServerLogFileNames } from './server-logs';

export interface ReproduceRun {
  github_run_id: number;
  run_attempt: number;
  head_sha: string | null;
  run_url: string | null;
  created_at: string | null;
}

export interface ReproduceLogs {
  files: string[];
  /** srtctl sweep log the launch steps were read from. */
  launch_file: string | null;
  /** Engine log whose first characters supplied engine args and versions. */
  engine_file: string | null;
  launch: SrtctlLaunch | null;
  engine: EngineLogFacts | null;
}

export interface ReproduceSource {
  row: BenchmarkRow;
  run: ReproduceRun;
  logs: ReproduceLogs | null;
}

/** Characters read from the sweep log. Every launch line precedes the benchmark output. */
export const LAUNCH_LOG_CHARACTERS = 2 * 1024 * 1024;
/** Characters read from the engine log. Startup args and NCCL banners land well inside. */
export const ENGINE_LOG_CHARACTERS = 1024 * 1024;

const SWEEP_LOG = /(?:^|\/)sweep_\d+\.log$/u;
const FIRST_WORKER_LOG = /_(?:agg|prefill|decode)_w0\.out$/u;
const SERVER_LOG = /(?:^|\/)server\.log$/u;

/** Pick the srtctl sweep log and one engine log from a stored bundle's file names. */
export function selectLaunchLogFiles(files: readonly string[]): {
  launch: string | null;
  engine: string | null;
} {
  const launch = files.find((file) => SWEEP_LOG.test(file)) ?? null;
  const engine =
    files.filter((file) => FIRST_WORKER_LOG.test(file)).toSorted()[0] ??
    files.find((file) => SERVER_LOG.test(file)) ??
    (launch ? null : (files[0] ?? null));
  return { launch, engine };
}

async function readLogs(sql: DbClient, id: number): Promise<ReproduceLogs | null> {
  const files = await getServerLogFileNames(sql, id);
  if (!files) return null;
  const selected = selectLaunchLogFiles(files);
  const [launchText, engineText] = await Promise.all([
    selected.launch ? getServerLogChunk(sql, id, 0, LAUNCH_LOG_CHARACTERS, selected.launch) : null,
    selected.engine ? getServerLogChunk(sql, id, 0, ENGINE_LOG_CHARACTERS, selected.engine) : null,
  ]);
  return {
    files,
    launch_file: selected.launch,
    engine_file: selected.engine,
    launch: launchText ? parseSrtctlSweepLog(launchText.serverLog) : null,
    engine: engineText ? parseEngineLog(engineText.serverLog) : null,
  };
}

/** Load one stored benchmark result with its producing run and the launch facts its logs record. */
export async function getReproduceSource(
  sql: DbClient,
  id: number,
): Promise<ReproduceSource | null> {
  const rows = (await sql`
    SELECT
      br.id,
      c.hardware,
      c.framework,
      c.model,
      c.precision,
      c.spec_method,
      c.disagg,
      c.is_multinode,
      c.prefill_tp,
      c.prefill_ep,
      c.prefill_dp_attention,
      c.prefill_num_workers,
      c.decode_tp,
      c.decode_ep,
      c.decode_dp_attention,
      c.decode_num_workers,
      c.num_prefill_gpu,
      c.num_decode_gpu,
      br.benchmark_type,
      br.offload_mode,
      br.isl,
      br.osl,
      br.conc,
      br.image,
      br.recipe_fingerprint,
      br.metrics,
      br.workers,
      br.power_invalid_reasons,
      br.power_audit,
      br.date::text,
      br.workflow_run_id,
      wr.run_started_at::text,
      CASE WHEN wr.github_run_id < 0 THEN wr.html_url WHEN wr.html_url IS NOT NULL THEN wr.html_url || '/attempts/' || wr.run_attempt ELSE NULL END AS run_url,
      wr.github_run_id,
      wr.run_attempt,
      wr.head_sha,
      wr.created_at::text AS created_at,
      br.server_log_id IS NOT NULL AS has_log
    FROM benchmark_results br
    JOIN configs c ON c.id = br.config_id
    JOIN workflow_runs wr ON wr.id = br.workflow_run_id
    WHERE br.id = ${id}
  `) as unknown as (BenchmarkRow & {
    github_run_id: number | string;
    run_attempt: number;
    head_sha: string | null;
    created_at: string | null;
    has_log: boolean;
  })[];
  const found = rows[0];
  if (!found) return null;
  const { github_run_id, run_attempt, head_sha, created_at, has_log, ...benchmark } = found;
  const [row] = withStoredPerPoolBasis([benchmark as BenchmarkRow]);
  return {
    row: row!,
    run: {
      github_run_id: Number(github_run_id),
      run_attempt,
      head_sha,
      run_url: benchmark.run_url,
      created_at,
    },
    logs: has_log ? await readLogs(sql, id) : null,
  };
}
