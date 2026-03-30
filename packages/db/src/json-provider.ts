/**
 * JSON-file-backed query provider for running the app without a database.
 *
 * Loads raw table dumps (from db:dump) into memory and implements the same
 * query logic as the SQL queries, allowing contributors to run the full app
 * with just a dump directory and no live Postgres connection.
 *
 * Set DUMP_DIR in .env to enable (e.g. DUMP_DIR=./inferencex-dump-2026-03-30).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BenchmarkRow } from './queries/benchmarks.js';
import type { EvalRow } from './queries/evaluations.js';
import type { ReliabilityRow } from './queries/reliability.js';
import type {
  AvailabilityRow,
  ChangelogRow,
  DateConfigRow,
  WorkflowRunRow,
} from './queries/workflow-info.js';

// ---------------------------------------------------------------------------
// Raw table types (matching dump-db.ts output)
// ---------------------------------------------------------------------------

interface RawConfig {
  id: number;
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

interface RawWorkflowRun {
  id: number;
  github_run_id: number;
  run_attempt: number;
  name: string;
  status: string;
  conclusion: string | null;
  head_sha: string;
  head_branch: string;
  html_url: string | null;
  created_at: string;
  run_started_at: string | null;
  date: string;
}

interface RawBenchmarkResult {
  id: number;
  workflow_run_id: number;
  config_id: number;
  benchmark_type: string;
  date: string;
  isl: number;
  osl: number;
  conc: number;
  image: string | null;
  metrics: Record<string, number>;
  error: string | null;
  server_log_id: number | null;
}

interface RawRunStat {
  id: number;
  workflow_run_id: number;
  date: string;
  hardware: string;
  n_success: number;
  total: number;
}

interface RawEvalResult {
  id: number;
  workflow_run_id: number;
  config_id: number;
  task: string;
  date: string;
  isl: number | null;
  osl: number | null;
  conc: number | null;
  lm_eval_version: string | null;
  metrics: Record<string, number>;
}

interface RawChangelogEntry {
  id: number;
  workflow_run_id: number;
  date: string;
  base_ref: string;
  head_ref: string;
  config_keys: string[];
  description: string;
  pr_link: string | null;
}

interface RawAvailability {
  model: string;
  isl: number;
  osl: number;
  precision: string;
  hardware: string;
  framework: string;
  spec_method: string;
  disagg: boolean;
  date: string;
}

interface RawServerLog {
  id: number;
  server_log: string;
}

// ---------------------------------------------------------------------------
// In-memory store (lazy-loaded singleton)
// ---------------------------------------------------------------------------

interface Store {
  dumpDir: string;
  configs: Map<number, RawConfig>;
  /** Only the latest attempt per github_run_id (replicates latest_workflow_runs view) */
  latestRuns: Map<number, RawWorkflowRun>;
  /** Map from workflow_runs.id → RawWorkflowRun for the latest runs */
  latestRunsById: Map<number, RawWorkflowRun>;
  benchmarks: RawBenchmarkResult[];
  runStats: RawRunStat[];
  evalResults: RawEvalResult[];
  availability: RawAvailability[];
  changelog: RawChangelogEntry[];
  /** Lazy-loaded: server_logs.json can be multiple GB */
  serverLogs: Map<number, string> | null;
  /** benchmark_result.id → server_log_id (for server-log lookups) */
  benchmarkServerLogMap: Map<number, number>;
}

let store: Store | null = null;

function loadTable<T>(dir: string, filename: string): T[] {
  const filePath = resolve(dir, filename);
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T[];
  } catch {
    console.warn(`  json-provider: ${filename} not found, using empty array`);
    return [];
  }
}

function getStore(): Store {
  if (store) return store;

  const dir = process.env.DUMP_DIR;
  if (!dir) throw new Error('DUMP_DIR is not set');

  // Resolve relative paths from the monorepo root (packages/db/../../), not CWD,
  // since Next.js runs from packages/app/ but .env paths are repo-root-relative.
  const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const monoRoot = resolve(pkgRoot, '../..');
  const resolvedDir = existsSync(resolve(dir)) ? resolve(dir) : resolve(monoRoot, dir);

  console.log(`json-provider: loading dump from ${resolvedDir}`);

  // Load raw tables
  const rawConfigs = loadTable<RawConfig>(resolvedDir, 'configs.json');
  const rawRuns = loadTable<RawWorkflowRun>(resolvedDir, 'workflow_runs.json');
  const rawBenchmarks = loadTable<RawBenchmarkResult>(resolvedDir, 'benchmark_results.json');
  const rawRunStats = loadTable<RawRunStat>(resolvedDir, 'run_stats.json');
  const rawEvals = loadTable<RawEvalResult>(resolvedDir, 'eval_results.json');
  const rawAvailability = loadTable<RawAvailability>(resolvedDir, 'availability.json');
  const rawChangelog = loadTable<RawChangelogEntry>(resolvedDir, 'changelog_entries.json');

  // Postgres bigserial columns serialize as strings in JSON — coerce to numbers.
  for (const wr of rawRuns) {
    wr.id = Number(wr.id);
    wr.github_run_id = Number(wr.github_run_id);
  }
  for (const br of rawBenchmarks) {
    br.id = Number(br.id);
    br.workflow_run_id = Number(br.workflow_run_id);
    if (br.server_log_id != null) br.server_log_id = Number(br.server_log_id);
  }
  for (const rs of rawRunStats) {
    rs.id = Number(rs.id);
    rs.workflow_run_id = Number(rs.workflow_run_id);
  }
  for (const er of rawEvals) {
    er.id = Number(er.id);
    er.workflow_run_id = Number(er.workflow_run_id);
  }
  for (const cl of rawChangelog) {
    cl.id = Number(cl.id);
    cl.workflow_run_id = Number(cl.workflow_run_id);
  }

  // Build configs index
  const configs = new Map<number, RawConfig>();
  for (const c of rawConfigs) configs.set(c.id, c);

  // Build latest_workflow_runs (highest run_attempt per github_run_id)
  const latestByGithubId = new Map<number, RawWorkflowRun>();
  for (const wr of rawRuns) {
    const existing = latestByGithubId.get(wr.github_run_id);
    if (!existing || wr.run_attempt > existing.run_attempt) {
      latestByGithubId.set(wr.github_run_id, wr);
    }
  }
  const latestRunsById = new Map<number, RawWorkflowRun>();
  for (const wr of latestByGithubId.values()) {
    latestRunsById.set(wr.id, wr);
  }

  // Build benchmark → server_log_id map
  const benchmarkServerLogMap = new Map<number, number>();
  for (const br of rawBenchmarks) {
    if (br.server_log_id != null) {
      benchmarkServerLogMap.set(br.id, br.server_log_id);
    }
  }

  store = {
    dumpDir: resolvedDir,
    configs,
    latestRuns: latestByGithubId,
    latestRunsById,
    benchmarks: rawBenchmarks,
    runStats: rawRunStats,
    evalResults: rawEvals,
    availability: rawAvailability,
    changelog: rawChangelog,
    serverLogs: null, // lazy-loaded on first getServerLog() call (can be multiple GB)
    benchmarkServerLogMap,
  };

  console.log(
    `json-provider: loaded ${rawConfigs.length} configs, ${latestRunsById.size} runs, ${rawBenchmarks.length} benchmarks`,
  );

  return store;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateString(d: string): string {
  // Dump may store dates as "2026-03-28" or "2026-03-28T00:00:00.000Z"
  return d.slice(0, 10);
}

function buildRunUrl(wr: RawWorkflowRun): string | null {
  return wr.html_url ? `${wr.html_url}/attempts/${wr.run_attempt}` : null;
}

function toBenchmarkRow(
  br: RawBenchmarkResult,
  c: RawConfig,
  wr: RawWorkflowRun,
  metrics?: Record<string, number>,
): BenchmarkRow {
  return {
    hardware: c.hardware,
    framework: c.framework,
    model: c.model,
    precision: c.precision,
    spec_method: c.spec_method,
    disagg: c.disagg,
    is_multinode: c.is_multinode,
    prefill_tp: c.prefill_tp,
    prefill_ep: c.prefill_ep,
    prefill_dp_attention: c.prefill_dp_attention,
    prefill_num_workers: c.prefill_num_workers,
    decode_tp: c.decode_tp,
    decode_ep: c.decode_ep,
    decode_dp_attention: c.decode_dp_attention,
    decode_num_workers: c.decode_num_workers,
    num_prefill_gpu: c.num_prefill_gpu,
    num_decode_gpu: c.num_decode_gpu,
    isl: br.isl,
    osl: br.osl,
    conc: br.conc,
    image: br.image,
    metrics: metrics ?? br.metrics,
    date: toDateString(br.date),
    run_url: buildRunUrl(wr),
  };
}

// ---------------------------------------------------------------------------
// Query implementations
// ---------------------------------------------------------------------------

const STRIP_HISTORY_KEYS = new Set([
  'std_ttft',
  'std_tpot',
  'std_e2el',
  'std_intvty',
  'std_itl',
  'mean_ttft',
  'mean_tpot',
  'mean_e2el',
  'mean_intvty',
  'mean_itl',
]);

export function getLatestBenchmarks(
  modelKey: string,
  date?: string,
  exact?: boolean,
): BenchmarkRow[] {
  const s = getStore();
  const dateStr = date ? toDateString(date) : undefined;

  // Filter to successful benchmarks for this model with a valid latest workflow run
  const candidates = s.benchmarks.filter((br) => {
    if (br.error != null) return false;
    const c = s.configs.get(br.config_id);
    if (!c || c.model !== modelKey) return false;
    if (!s.latestRunsById.has(br.workflow_run_id)) return false;
    if (dateStr) {
      const brDate = toDateString(br.date);
      return exact ? brDate === dateStr : brDate <= dateStr;
    }
    return true;
  });

  // DISTINCT ON (config_id, conc, isl, osl) — keep the one with the latest date
  const seen = new Map<string, RawBenchmarkResult>();
  // Sort by date DESC so first-seen wins
  candidates.sort((a, b) => toDateString(b.date).localeCompare(toDateString(a.date)));
  for (const br of candidates) {
    const key = `${br.config_id}:${br.conc}:${br.isl}:${br.osl}`;
    if (!seen.has(key)) seen.set(key, br);
  }

  return [...seen.values()].map((br) => {
    const c = s.configs.get(br.config_id)!;
    const wr = s.latestRunsById.get(br.workflow_run_id)!;
    return toBenchmarkRow(br, c, wr);
  });
}

export function getAllBenchmarksForHistory(
  modelKey: string,
  isl: number,
  osl: number,
): BenchmarkRow[] {
  const s = getStore();

  const results: BenchmarkRow[] = [];
  for (const br of s.benchmarks) {
    if (br.error != null) continue;
    if (br.isl !== isl || br.osl !== osl) continue;
    const c = s.configs.get(br.config_id);
    if (!c || c.model !== modelKey) continue;
    const wr = s.latestRunsById.get(br.workflow_run_id);
    if (!wr) continue;

    // Strip std_* and mean_* metrics (matches SQL: metrics - '{...}'::text[])
    const filtered: Record<string, number> = {};
    for (const [k, v] of Object.entries(br.metrics)) {
      if (!STRIP_HISTORY_KEYS.has(k)) filtered[k] = v;
    }
    results.push(toBenchmarkRow(br, c, wr, filtered));
  }

  results.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    // Secondary sort: mimic ORDER BY c.id, br.conc
    return a.conc - b.conc;
  });

  return results;
}

export function getAvailabilityData(): AvailabilityRow[] {
  const s = getStore();

  // Build a fast lookup set for valid (model, hardware, framework, precision, isl, osl, date) combos
  const validKeys = new Set<string>();
  for (const br of s.benchmarks) {
    if (br.error != null) continue;
    const wr = s.latestRunsById.get(br.workflow_run_id);
    if (!wr || wr.conclusion == null) continue;
    const c = s.configs.get(br.config_id);
    if (!c) continue;
    validKeys.add(
      `${c.model}|${c.hardware}|${c.framework}|${c.precision}|${br.isl}|${br.osl}|${toDateString(br.date)}`,
    );
  }

  const rows: AvailabilityRow[] = [];
  for (const a of s.availability) {
    const key = `${a.model}|${a.hardware}|${a.framework}|${a.precision}|${a.isl}|${a.osl}|${toDateString(a.date)}`;
    if (validKeys.has(key)) {
      rows.push({ ...a, date: toDateString(a.date) });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

export function getReliabilityStats(): ReliabilityRow[] {
  const s = getStore();

  const rows: ReliabilityRow[] = [];
  for (const rs of s.runStats) {
    if (!s.latestRunsById.has(rs.workflow_run_id)) continue;
    rows.push({
      hardware: rs.hardware,
      date: toDateString(rs.date),
      n_success: rs.n_success,
      total: rs.total,
    });
  }

  rows.sort((a, b) => b.date.localeCompare(a.date));
  return rows;
}

export function getAllEvalResults(): EvalRow[] {
  const s = getStore();

  const rows: EvalRow[] = [];
  for (const er of s.evalResults) {
    const c = s.configs.get(er.config_id);
    if (!c) continue;
    const wr = s.latestRunsById.get(er.workflow_run_id);
    if (!wr) continue;

    rows.push({
      config_id: er.config_id,
      hardware: c.hardware,
      framework: c.framework,
      model: c.model,
      precision: c.precision,
      spec_method: c.spec_method,
      decode_tp: c.decode_tp,
      decode_ep: c.decode_ep,
      decode_dp_attention: c.decode_dp_attention,
      task: er.task,
      date: toDateString(er.date),
      conc: er.conc,
      metrics: er.metrics,
      timestamp: wr.created_at,
      run_url: wr.html_url,
    });
  }

  rows.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return a.hardware.localeCompare(b.hardware);
  });

  return rows;
}

export function getWorkflowRunsByDate(date: string): WorkflowRunRow[] {
  const s = getStore();
  const dateStr = toDateString(date);

  const rows: WorkflowRunRow[] = [];
  for (const wr of s.latestRunsById.values()) {
    if (toDateString(wr.date) !== dateStr) continue;
    if (wr.conclusion == null) continue;

    rows.push({
      github_run_id: wr.github_run_id,
      name: wr.name,
      conclusion: wr.conclusion,
      run_attempt: wr.run_attempt,
      html_url: wr.html_url,
      created_at: wr.created_at,
      date: toDateString(wr.date),
    });
  }

  rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return rows;
}

export function getChangelogByDate(date: string): ChangelogRow[] {
  const s = getStore();
  const dateStr = toDateString(date);

  const rows: ChangelogRow[] = [];
  for (const cl of s.changelog) {
    if (toDateString(cl.date) !== dateStr) continue;
    const wr = s.latestRunsById.get(cl.workflow_run_id);
    if (!wr) continue;

    rows.push({
      workflow_run_id: wr.github_run_id,
      date: toDateString(cl.date),
      base_ref: cl.base_ref,
      head_ref: cl.head_ref,
      config_keys: cl.config_keys,
      description: cl.description,
      pr_link: cl.pr_link,
    });
  }

  rows.sort((a, b) => b.date.localeCompare(a.date));
  return rows;
}

export function getDateConfigs(date: string): DateConfigRow[] {
  const s = getStore();
  const dateStr = toDateString(date);

  const seen = new Set<string>();
  const rows: DateConfigRow[] = [];

  for (const br of s.benchmarks) {
    if (br.error != null) continue;
    if (toDateString(br.date) !== dateStr) continue;
    const wr = s.latestRunsById.get(br.workflow_run_id);
    if (!wr) continue;
    const c = s.configs.get(br.config_id);
    if (!c) continue;

    const key = `${c.model}|${br.isl}|${br.osl}|${c.precision}|${c.hardware}|${c.framework}|${c.spec_method}|${c.disagg}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      model: c.model,
      isl: br.isl,
      osl: br.osl,
      precision: c.precision,
      hardware: c.hardware,
      framework: c.framework,
      spec_method: c.spec_method,
      disagg: c.disagg,
    });
  }

  return rows;
}

export function getServerLog(benchmarkResultId: number): string | null {
  const s = getStore();
  const logId = s.benchmarkServerLogMap.get(benchmarkResultId);
  if (logId == null) return null;

  // Lazy-load server_logs.json on first access (can be multiple GB)
  if (!s.serverLogs) {
    console.log('json-provider: loading server_logs.json (this may take a moment)...');
    const raw = loadTable<RawServerLog>(s.dumpDir, 'server_logs.json');
    s.serverLogs = new Map<number, string>();
    for (const sl of raw) s.serverLogs.set(sl.id, sl.server_log);
    console.log(`json-provider: loaded ${s.serverLogs.size} server logs`);
  }

  return s.serverLogs.get(logId) ?? null;
}
