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

// Runtime-value cross-module imports use extensionless relative paths (the
// convention in etl/queries here), NOT the `.js` type-only style below — the
// app bundler (Turbopack) resolves the former but not a `.js` on a value import.
import {
  CHART_SERIES_VERSION,
  computeChartSeries,
  type ChartSeries,
} from './etl/compute-chart-series';
import {
  REQUEST_TIMELINE_VERSION,
  computeRequestTimeline,
  type RequestTimeline,
} from './etl/compute-request-timeline';
import {
  extractIslOsl,
  extractServerMetricSamples,
  percentilesOf,
  STATS_VERSION,
  type AgenticAggregate,
  type AgenticAggregateMap,
} from './queries/agentic-aggregates';
import type { BenchmarkRow, BenchmarkWorkerRow } from './queries/benchmarks.js';
import type { BenchmarkSiblings } from './queries/benchmark-siblings.js';
import type {
  ConversationDetail,
  ConversationList,
  ConversationListItem,
  DatasetDetail,
  DatasetRecord,
  ListConversationsOpts,
} from './queries/datasets.js';
import {
  computeDerivedFromBlob,
  type DerivedAgenticMetric,
  type DerivedAgenticMetricMap,
} from './queries/derived-agentic-metrics';
import type { EvalRow } from './queries/evaluations.js';
import type { ReliabilityRow } from './queries/reliability.js';
import type { TraceHistogramMap, TraceHistogramPoint } from './queries/trace-histograms.js';
import type { PointMeta, TraceServerMetrics } from './queries/trace-server-metrics.js';
import type { ConversationStructure } from './etl/weka-structure.js';
import type {
  AvailabilityRow,
  ChangelogRow,
  DateConfigRow,
  RunConfigRow,
  WorkflowRunRow,
} from './queries/workflow-info.js';
import { gunzipSync } from 'node:zlib';

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
  /** Added by the AgentX schema; older dumps omit it and are treated as off. */
  offload_mode?: string;
  image: string | null;
  metrics: Record<string, number>;
  /** Added in migration 006; older dumps omit this field — surfaced as undefined. */
  workers?: BenchmarkWorkerRow[] | null;
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

/**
 * A serialized bytea column from the dump. dump-db.ts writes postgres.js Buffers
 * via Buffer.prototype.toJSON() → {"type":"Buffer","data":[…]}. Decode with
 * {@link bufferFromJson} back to a Node Buffer for the compute helpers (which
 * take the same `Buffer | null` a live DB read would hand them).
 */
interface BufferJson {
  type: 'Buffer';
  data: number[];
}

/**
 * agentic_trace_replay rows. Blob columns are big (server_metrics_json_gz can be
 * ~17 MB compressed), so this whole table is lazy-loaded like server_logs. The
 * precomputed JSONB columns (aggregate_stats / chart_series / request_timeline)
 * are what the fast paths actually serve; the blobs only feed the version-stale
 * fallback (reusing the exact same compute helpers the SQL path uses).
 */
interface RawTraceReplay {
  id: number;
  profile_export_jsonl_gz: BufferJson | null;
  profile_export_uncompressed_size: number | null;
  server_metrics_csv: BufferJson | null;
  server_metrics_csv_size: number | null;
  server_metrics_json_gz: BufferJson | null;
  server_metrics_json_uncompressed_size: number | null;
  aggregate_stats: Record<string, unknown> | null;
  chart_series: Record<string, unknown> | null;
  request_timeline: Record<string, unknown> | null;
  created_at: string;
}

interface RawDataset {
  id: string;
  slug: string;
  label: string;
  variant: string;
  description: string | null;
  hf_url: string | null;
  license: string | null;
  conversation_count: number;
  summary: Record<string, unknown>;
  chart_data: Record<string, unknown>;
  dataset_version: number;
  ingested_at: string;
}

interface RawDatasetConversation {
  id: number;
  dataset_id: string;
  conv_id: string;
  models: string[];
  num_turns: number;
  num_subagent_groups: number;
  total_in: number;
  total_out: number;
  total_cached: number;
  structure: Record<string, unknown>;
}

interface RawRunDataset {
  workflow_run_id: number;
  dataset_slug: string;
  created_at: string;
}

/** Decode a dumped bytea ({type:'Buffer',data:[…]}) back into a Node Buffer. */
function bufferFromJson(b: BufferJson | null | undefined): Buffer | null {
  if (!b || !Array.isArray(b.data)) return null;
  return Buffer.from(b.data);
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
  /** benchmark_result.id → trace_replay_id (for agentic blob-backed lookups) */
  benchmarkTraceReplayMap: Map<number, number>;
  /**
   * Lazy-loaded: agentic_trace_replay.json holds the big compressed blobs.
   * Keyed by trace_replay id. Loaded on first agentic-route access, mirroring
   * the server_logs lazy pattern. Null until then.
   */
  traceReplay: Map<number, RawTraceReplay> | null;
  /** Datasets registry (small, eager). */
  datasets: RawDataset[];
  /** dataset id → dataset (fast lookup). */
  datasetsById: Map<string, RawDataset>;
  /** dataset slug → dataset (slug is unique). */
  datasetsBySlug: Map<string, RawDataset>;
  /** All conversation rows (eager; counts + structure JSONB, no blobs). */
  datasetConversations: RawDatasetConversation[];
  /** workflow_run_id → dataset_slug (for benchmark-siblings SKU deep-link). */
  runDatasetSlugByRunId: Map<number, string>;
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
  // import.meta.dirname is undefined under Turbopack bundling — derive from
  // import.meta.url instead, which Turbopack rewrites to a usable file URL.
  // oxlint-disable-next-line unicorn/prefer-import-meta-properties -- import.meta.dirname is undefined under Turbopack; this is the fallback.
  const thisDir = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
  const pkgRoot = resolve(thisDir, '..');
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
  // Datasets + run_datasets are small (registry rows + one row per run) and
  // dataset_conversations holds only counts + a per-conversation structure
  // JSONB — all comfortably eager. agentic_trace_replay is lazy (blobs) below.
  const rawDatasets = loadTable<RawDataset>(resolvedDir, 'datasets.json');
  const rawDatasetConversations = loadTable<RawDatasetConversation>(
    resolvedDir,
    'dataset_conversations.json',
  );
  const rawRunDatasets = loadTable<RawRunDataset>(resolvedDir, 'run_datasets.json');

  // Postgres bigserial columns serialize as strings in JSON — coerce to numbers.
  for (const wr of rawRuns) {
    wr.id = Number(wr.id);
    wr.github_run_id = Number(wr.github_run_id);
  }
  for (const br of rawBenchmarks) {
    br.id = Number(br.id);
    br.workflow_run_id = Number(br.workflow_run_id);
    if (br.server_log_id !== null && br.server_log_id !== undefined)
      br.server_log_id = Number(br.server_log_id);
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
  // Postgres bigint/bigserial + integer columns serialize as strings in JSON —
  // coerce to numbers so the mirrors do numeric math and JSON parity matches.
  for (const d of rawDatasets) d.conversation_count = Number(d.conversation_count);
  for (const dc of rawDatasetConversations) {
    dc.id = Number(dc.id);
    dc.num_turns = Number(dc.num_turns);
    dc.num_subagent_groups = Number(dc.num_subagent_groups);
    dc.total_in = Number(dc.total_in);
    dc.total_out = Number(dc.total_out);
    dc.total_cached = Number(dc.total_cached);
  }
  for (const rd of rawRunDatasets) rd.workflow_run_id = Number(rd.workflow_run_id);

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
    if (br.server_log_id !== null && br.server_log_id !== undefined) {
      benchmarkServerLogMap.set(br.id, br.server_log_id);
    }
  }

  // Build benchmark → trace_replay_id map. `trace_replay_id` was added by the
  // agentic migration; older dumps lack it (undefined → treated as "no trace").
  const benchmarkTraceReplayMap = new Map<number, number>();
  for (const br of rawBenchmarks) {
    const trId = (br as { trace_replay_id?: number | string | null }).trace_replay_id;
    if (trId !== null && trId !== undefined) {
      benchmarkTraceReplayMap.set(br.id, Number(trId));
    }
  }

  // Datasets indexes
  const datasetsById = new Map<string, RawDataset>();
  const datasetsBySlug = new Map<string, RawDataset>();
  for (const d of rawDatasets) {
    datasetsById.set(d.id, d);
    datasetsBySlug.set(d.slug, d);
  }
  const runDatasetSlugByRunId = new Map<number, string>();
  for (const rd of rawRunDatasets) runDatasetSlugByRunId.set(rd.workflow_run_id, rd.dataset_slug);

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
    benchmarkTraceReplayMap,
    traceReplay: null, // lazy-loaded on first agentic blob-backed access (blobs are big)
    datasets: rawDatasets,
    datasetsById,
    datasetsBySlug,
    datasetConversations: rawDatasetConversations,
    runDatasetSlugByRunId,
  };

  console.log(
    `json-provider: loaded ${rawConfigs.length} configs, ${latestRunsById.size} runs, ` +
      `${rawBenchmarks.length} benchmarks, ${rawDatasets.length} datasets, ` +
      `${rawDatasetConversations.length} conversations`,
  );

  return store;
}

/**
 * Lazy-load agentic_trace_replay.json on first blob-backed access. Mirrors the
 * server_logs lazy pattern — the file carries the big compressed blobs so we
 * only pay to parse it when an agentic route actually needs a fallback (most
 * routes serve the precomputed JSONB columns and never touch the blobs). The
 * blob columns arrive as {type:'Buffer',data:[…]} and are decoded to Buffers on
 * demand by the callers that need them.
 */
function getTraceReplay(): Map<number, RawTraceReplay> {
  const s = getStore();
  if (s.traceReplay) return s.traceReplay;
  console.log('json-provider: loading agentic_trace_replay.json (this may take a moment)...');
  const raw = loadTable<RawTraceReplay>(s.dumpDir, 'agentic_trace_replay.json');
  const map = new Map<number, RawTraceReplay>();
  for (const tr of raw) map.set(Number(tr.id), tr);
  s.traceReplay = map;
  console.log(`json-provider: loaded ${map.size} agentic_trace_replay rows`);
  return map;
}

/** Resolve a benchmark_result id → its agentic_trace_replay row (or null). */
function traceReplayForBenchmark(benchmarkResultId: number): RawTraceReplay | null {
  const s = getStore();
  const trId = s.benchmarkTraceReplayMap.get(benchmarkResultId);
  if (trId === null || trId === undefined) return null;
  return getTraceReplay().get(trId) ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateString(d: string): string {
  // Dump may store dates as "2026-03-28" or "2026-03-28T00:00:00.000Z"
  return d.slice(0, 10);
}

/**
 * Render a dumped timestamptz to match Postgres `<col>::text` output, so the
 * datasets mirrors are byte-identical to the SQL path. postgres.js decodes a
 * timestamptz to a JS Date, which the dump serialized as ISO
 * ("2026-07-02T09:00:00.000Z"); Postgres `::text` instead yields
 * "2026-07-02 09:00:00+00" (space separator, no trailing ".000", "+00" offset,
 * fractional seconds only when non-zero). Convert ISO → that form; pass through
 * anything already in Postgres form (e.g. a dump produced without the Date step).
 */
const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

function pgTimestampText(v: string): string {
  // Already Postgres text form (has a space date/time separator, no 'T').
  if (!v.includes('T')) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const base =
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  const ms = d.getUTCMilliseconds();
  // Postgres prints fractional seconds only when non-zero (up to 6 digits;
  // a Date carries at most ms precision, and dumps here have zero fractions).
  const frac = ms === 0 ? '' : `.${pad(ms, 3).replace(/0+$/u, '')}`;
  return `${base}${frac}+00`;
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
    id: br.id,
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
    benchmark_type: br.benchmark_type ?? 'single_turn',
    offload_mode: (br as { offload_mode?: string }).offload_mode ?? 'off',
    isl: br.isl,
    osl: br.osl,
    conc: br.conc,
    image: br.image,
    metrics: metrics ?? br.metrics,
    // workers: optional sibling JSONB column. Older dumps (pre-migration 006)
    // simply lack the field — defensively narrow to an array or undefined so
    // downstream consumers can rely on the property being well-typed.
    workers: Array.isArray(br.workers) ? br.workers : undefined,
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

/**
 * Run-recency comparator used to pick the newest run per line: latest calendar day first,
 * then — for sweeps on the same day — the latest workflow run first by `run_started_at`
 * (NULLS LAST). Mirrors the `br.date DESC, wr.run_started_at DESC NULLS LAST` portion of the
 * SQL ORDER BY; callers apply a `workflow_run_id` DESC final tiebreak on top so exactly one
 * run wins. `run_started_at` is an ISO-8601 string, so localeCompare orders it chronologically.
 * Exported so the same-day tiebreak is unit-tested in parity with the SQL.
 */
export function compareBenchmarkRecency(
  aDate: string,
  bDate: string,
  aStarted: string | null,
  bStarted: string | null,
): number {
  const dateCmp = bDate.localeCompare(aDate);
  if (dateCmp !== 0) return dateCmp;
  if (aStarted === bStarted) return 0;
  if (aStarted === null) return 1;
  if (bStarted === null) return -1;
  return bStarted.localeCompare(aStarted);
}

/** Chart-line identity: one config + sequence + offload mode. All concurrencies of a line come from one run. */
const lineKey = (br: RawBenchmarkResult): string =>
  `${br.config_id}:${br.benchmark_type}:${br.isl}:${br.osl}:${br.offload_mode ?? 'off'}`;

export function getLatestBenchmarks(
  modelKey: string | string[],
  date?: string,
  exact?: boolean,
  asOfRunId?: string,
): BenchmarkRow[] {
  const s = getStore();
  const dateStr = date ? toDateString(date) : undefined;
  const modelKeys = new Set(Array.isArray(modelKey) ? modelKey : [modelKey]);

  // "As of run" cutoff (main chart only): the selected run's start time. Mirrors the
  // SQL runFilter — results from runs that started after this are excluded. Null/unknown
  // means no cutoff (a no-op, matching the SQL COALESCE-to-infinity behavior).
  const asOfStartedAt =
    !exact && asOfRunId ? (s.latestRuns.get(Number(asOfRunId))?.run_started_at ?? null) : null;

  // Filter to successful benchmarks for this model with a valid latest workflow run
  const candidates = s.benchmarks.filter((br) => {
    if (br.error !== null && br.error !== undefined) return false;
    const c = s.configs.get(br.config_id);
    if (!c || !modelKeys.has(c.model)) return false;
    if (!s.latestRunsById.has(br.workflow_run_id)) return false;
    if (asOfStartedAt) {
      // Keep NULL run_started_at (old history) so it never blanks out; drop runs
      // that started after the selected one.
      const started = s.latestRunsById.get(br.workflow_run_id)?.run_started_at ?? null;
      if (started !== null && started > asOfStartedAt) return false;
    }
    if (dateStr) {
      const brDate = toDateString(br.date);
      return exact ? brDate === dateStr : brDate <= dateStr;
    }
    return true;
  });

  // Single run per LINE (config_id, benchmark_type, isl, osl, offload_mode): pick the newest run that
  // produced data for the line, then keep EVERY concurrency that one run measured. Sort by
  // recency (date, then run_started_at) with a final workflow_run_id DESC tiebreak so exactly
  // one run wins even when run_started_at is equal/null — matching the SQL ORDER BY.
  candidates.sort((a, b) => {
    const recency = compareBenchmarkRecency(
      toDateString(a.date),
      toDateString(b.date),
      s.latestRunsById.get(a.workflow_run_id)?.run_started_at ?? null,
      s.latestRunsById.get(b.workflow_run_id)?.run_started_at ?? null,
    );
    return recency === 0 ? b.workflow_run_id - a.workflow_run_id : recency;
  });
  const winningRun = new Map<string, number>();
  for (const br of candidates) {
    const key = lineKey(br);
    if (!winningRun.has(key)) winningRun.set(key, br.workflow_run_id);
  }

  return candidates
    .filter((br) => winningRun.get(lineKey(br)) === br.workflow_run_id)
    .map((br) => {
      const c = s.configs.get(br.config_id)!;
      const wr = s.latestRunsById.get(br.workflow_run_id)!;
      return toBenchmarkRow(br, c, wr);
    });
}

/** In-memory mirror of {@link import('./queries/benchmarks.js').getBenchmarksForRun}. */
export function getBenchmarksForRun(
  modelKey: string | string[],
  githubRunId: string | number,
): BenchmarkRow[] {
  const s = getStore();
  const modelKeys = new Set(Array.isArray(modelKey) ? modelKey : [modelKey]);
  const run = s.latestRuns.get(Number(githubRunId));
  if (!run) return [];

  const seen = new Map<string, RawBenchmarkResult>();
  for (const br of s.benchmarks) {
    if (br.error !== null && br.error !== undefined) continue;
    if (br.workflow_run_id !== run.id) continue;
    const c = s.configs.get(br.config_id);
    if (!c || !modelKeys.has(c.model)) continue;
    const key = `${br.config_id}:${br.conc}:${br.isl}:${br.osl}:${br.offload_mode ?? 'off'}`;
    if (!seen.has(key)) seen.set(key, br);
  }

  return [...seen.values()].map((br) => {
    const c = s.configs.get(br.config_id)!;
    return toBenchmarkRow(br, c, run);
  });
}

export function getAllBenchmarksForHistory(
  modelKey: string | string[],
  isl: number,
  osl: number,
): BenchmarkRow[] {
  const s = getStore();
  const modelKeys = new Set(Array.isArray(modelKey) ? modelKey : [modelKey]);

  const results: BenchmarkRow[] = [];
  for (const br of s.benchmarks) {
    if (br.error !== null && br.error !== undefined) continue;
    if (br.isl !== isl || br.osl !== osl) continue;
    const c = s.configs.get(br.config_id);
    if (!c || !modelKeys.has(c.model)) continue;
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
    if (br.error !== null && br.error !== undefined) continue;
    const wr = s.latestRunsById.get(br.workflow_run_id);
    if (!wr || wr.conclusion === null || wr.conclusion === undefined) continue;
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
      rows.push({
        ...a,
        benchmark_type: (a as { benchmark_type?: string }).benchmark_type ?? 'single_turn',
        date: toDateString(a.date),
      });
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
      id: er.id,
      config_id: er.config_id,
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
    if (wr.conclusion === null || wr.conclusion === undefined) continue;

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
    if (br.error !== null && br.error !== undefined) continue;
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

export function getRunConfigsByDate(date: string): RunConfigRow[] {
  const s = getStore();
  const dateStr = toDateString(date);

  const seen = new Set<string>();
  const rows: RunConfigRow[] = [];

  for (const br of s.benchmarks) {
    if (br.error !== null && br.error !== undefined) continue;
    if (toDateString(br.date) !== dateStr) continue;
    const wr = s.latestRunsById.get(br.workflow_run_id);
    if (!wr) continue;
    const c = s.configs.get(br.config_id);
    if (!c) continue;

    const key = `${wr.github_run_id}|${c.model}|${c.precision}|${c.hardware}|${c.framework}|${c.spec_method}|${c.disagg}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      github_run_id: wr.github_run_id,
      run_started_at: wr.run_started_at ?? wr.created_at,
      html_url: wr.html_url,
      head_sha: wr.head_sha,
      model: c.model,
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
  if (logId === null || logId === undefined) return null;

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

// ---------------------------------------------------------------------------
// Agentic per-point mirrors (blob-backed; lazy trace_replay)
//
// Parity strategy: the SQL fast path reads the precomputed JSONB column
// (aggregate_stats / chart_series / request_timeline) when its inner `version`
// matches the current constant, else it re-derives from the gzipped blob using
// a shared pure helper (computeChartSeries / computeRequestTimeline /
// extract*+percentilesOf / computeDerivedFromBlob). These mirrors take the
// same two branches so dump mode yields the same payloads: serve the stored
// JSONB at the current version, otherwise gunzip the dumped blob and reuse the
// identical helper (the blobs ARE in the dump). Only if a stale/missing JSONB
// row also has no usable blob do we fall through to null — exactly as the SQL
// path does. No version-gated payload is ever served blindly.
// ---------------------------------------------------------------------------

function blankAggregate(id: number): AgenticAggregate {
  return { id, isl: null, osl: null, kvCacheUtil: null, prefixCacheHitRate: null };
}

/** Read a finite numeric metric out of a benchmark_results.metrics JSONB (or null). */
function readFiniteMetric(m: Record<string, number>, key: string): number | null {
  const v = m[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * NULLS-FIRST rank for an offload_mode value, mirroring the SQL
 * `order by … br.offload_mode nulls first`: null → rank 0, else rank 1 keyed by
 * the string value.
 */
function offloadRank(v: string | null | undefined): [number, string] {
  return v === null || v === undefined ? [0, ''] : [1, v];
}

/** conv_id ASC tie-break, matching Postgres en_US.utf8 `order by conv_id asc`. */
function compareConvId(a: RawDatasetConversation, b: RawDatasetConversation): number {
  return a.conv_id.localeCompare(b.conv_id);
}

/**
 * Mirror of {@link import('./queries/agentic-aggregates.js').getAgenticAggregates}.
 * Fast path: aggregate_stats at the current STATS_VERSION. Fallback: gunzip the
 * profile blob for isl/osl percentiles and the server blob for KV/prefix, reusing
 * the same extract*+percentilesOf helpers the SQL path uses.
 */
export function getAgenticAggregates(benchmarkResultIds: number[]): AgenticAggregateMap {
  if (benchmarkResultIds.length === 0) return {};
  const result: AgenticAggregateMap = {};
  for (const id of benchmarkResultIds) {
    const agg = blankAggregate(id);
    const tr = traceReplayForBenchmark(id);
    if (tr) {
      const stats = tr.aggregate_stats as {
        version?: number;
        isl?: AgenticAggregate['isl'];
        osl?: AgenticAggregate['osl'];
        kvCacheUtil?: AgenticAggregate['kvCacheUtil'];
        prefixCacheHitRate?: AgenticAggregate['prefixCacheHitRate'];
      } | null;
      if (stats && Number(stats.version) === STATS_VERSION) {
        agg.isl = stats.isl ?? null;
        agg.osl = stats.osl ?? null;
        agg.kvCacheUtil = stats.kvCacheUtil ?? null;
        agg.prefixCacheHitRate = stats.prefixCacheHitRate ?? null;
      } else {
        // Stale/missing precomputed stats → re-derive from the dumped blobs,
        // reusing the exact SQL-path helpers (blobs are in the dump).
        const profile = bufferFromJson(tr.profile_export_jsonl_gz);
        if (profile) {
          try {
            const jsonl = gunzipSync(profile).toString('utf8');
            const { isl, osl } = extractIslOsl(jsonl);
            agg.isl = percentilesOf(isl);
            agg.osl = percentilesOf(osl);
          } catch {
            // malformed blob — leave nulls
          }
        }
        const server = bufferFromJson(tr.server_metrics_json_gz);
        if (server) {
          try {
            const json = gunzipSync(server).toString('utf8');
            const samples = extractServerMetricSamples(json);
            agg.kvCacheUtil = percentilesOf(samples.kvCacheUtil);
            agg.prefixCacheHitRate = percentilesOf(samples.prefixCacheHitRate);
          } catch {
            // dump-mode blobs are small (no >512 MB decompress case) — leave nulls
          }
        }
      }
    }
    result[id] = agg;
  }
  return result;
}

/**
 * Mirror of {@link import('./queries/derived-agentic-metrics.js').getDerivedAgenticMetrics}.
 * Fast path: aggregate_stats at STATS_VERSION. Fallback: computeDerivedFromBlob
 * over the gunzipped profile blob (same helper as the SQL path). Ids without a
 * trace_replay row are omitted, matching the SQL join.
 */
export function getDerivedAgenticMetrics(benchmarkResultIds: number[]): DerivedAgenticMetricMap {
  if (benchmarkResultIds.length === 0) return {};
  const result: DerivedAgenticMetricMap = {};
  for (const id of benchmarkResultIds) {
    const tr = traceReplayForBenchmark(id);
    if (!tr) continue; // SQL joins on trace_replay — no row → omitted
    const stats = tr.aggregate_stats as {
      version?: number;
      normalizedSessionTimeS?: number | null;
      p90PrefillTpsPerUser?: number | null;
      normalizedE2e400?: { p75?: number | null; p90?: number | null } | null;
    } | null;
    if (stats && Number(stats.version) === STATS_VERSION) {
      result[id] = {
        id,
        normalized_session_time_s: stats.normalizedSessionTimeS ?? null,
        p90_prefill_tps_per_user: stats.p90PrefillTpsPerUser ?? null,
        p75_normalized_e2e_400_s: stats.normalizedE2e400?.p75 ?? null,
        p90_normalized_e2e_400_s: stats.normalizedE2e400?.p90 ?? null,
      };
      continue;
    }
    // Fallback: re-derive from the dumped profile blob via the shared helper.
    const profile = bufferFromJson(tr.profile_export_jsonl_gz);
    if (!profile) continue; // SQL fallback requires the blob to be non-null
    try {
      const jsonl = gunzipSync(profile).toString('utf8');
      const { normalized_session_time_s, p90_prefill_tps_per_user, normalized_e2e_400 } =
        computeDerivedFromBlob(jsonl);
      const entry: DerivedAgenticMetric = {
        id,
        normalized_session_time_s,
        p90_prefill_tps_per_user,
        p75_normalized_e2e_400_s: normalized_e2e_400?.p75 ?? null,
        p90_normalized_e2e_400_s: normalized_e2e_400?.p90 ?? null,
      };
      result[id] = entry;
    } catch {
      // malformed blob — omit id (SQL treats missing as "no data")
    }
  }
  return result;
}

/**
 * Mirror of {@link import('./queries/request-timeline.js').getRequestTimeline}.
 * Fast path: request_timeline at REQUEST_TIMELINE_VERSION. Fallback:
 * computeRequestTimeline over the profile blob (same helper as the SQL path).
 */
export function getRequestTimeline(benchmarkResultId: number): RequestTimeline | null {
  const tr = traceReplayForBenchmark(benchmarkResultId);
  if (!tr) return null;
  const stored = tr.request_timeline as (RequestTimeline & { version?: number }) | null;
  if (stored && Number(stored.version) === REQUEST_TIMELINE_VERSION) return stored;
  return computeRequestTimeline(bufferFromJson(tr.profile_export_jsonl_gz));
}

/**
 * Mirror of {@link import('./queries/trace-server-metrics.js').getTraceServerMetrics}.
 * Fast path: chart_series at CHART_SERIES_VERSION. Fallback: computeChartSeries
 * over the server blob (same helper as the SQL path). Returns null when the point
 * has no server_metrics blob, matching the SQL `has_blob` gate.
 */
export async function getTraceServerMetrics(
  benchmarkResultId: number,
): Promise<TraceServerMetrics | null> {
  const s = getStore();
  const br = s.benchmarks.find((b) => b.id === benchmarkResultId);
  if (!br) return null;
  const c = s.configs.get(br.config_id);
  const wr = s.latestRunsById.get(br.workflow_run_id) ?? null;
  if (!c) return null;
  const tr = traceReplayForBenchmark(benchmarkResultId);
  // SQL gates on (server_metrics blob present AND trace_replay_id non-null).
  const hasServerBlob = tr ? tr.server_metrics_json_gz !== null : false;
  if (!tr || !hasServerBlob) return null;

  const num = (key: string): number | null => {
    const v = br.metrics?.[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const meta: PointMeta = {
    id: br.id,
    hardware: c.hardware,
    framework: c.framework,
    model: c.model,
    precision: c.precision,
    spec_method: c.spec_method,
    disagg: c.disagg,
    conc: br.conc,
    offload_mode: (br as { offload_mode?: string | null }).offload_mode ?? null,
    isl: br.isl,
    osl: br.osl,
    benchmark_type: br.benchmark_type ?? 'single_turn',
    date: toDateString(br.date),
    run_url: wr ? buildRunUrl(wr) : null,
    server_gpu_cache_hit_rate: num('server_gpu_cache_hit_rate'),
    server_cpu_cache_hit_rate: num('server_cpu_cache_hit_rate'),
  };
  const kvCachePoolTokens = num('kv_cache_pool_tokens');

  const merge = (series: ChartSeries): TraceServerMetrics => ({
    meta,
    kvCachePoolTokens,
    startNs: series.startNs,
    endNs: series.endNs,
    durationS: series.durationS,
    timeslicesCount: series.timeslicesCount,
    kvCacheUsage: series.kvCacheUsage,
    prefixCacheHitRate: series.prefixCacheHitRate,
    queueDepth: series.queueDepth,
    promptTokensBySource: series.promptTokensBySource,
    prefillTps: series.prefillTps,
    decodeTps: series.decodeTps,
    prefixCacheHitsTps: series.prefixCacheHitsTps ?? [],
    hostKvCacheUsage: series.hostKvCacheUsage ?? [],
    kvCacheUsageByEngine: series.kvCacheUsageByEngine ?? [],
    metricSources: series.metricSources ?? [],
  });

  const stored = tr.chart_series as (ChartSeries & { version?: number }) | null;
  if (stored && Number(stored.version) === CHART_SERIES_VERSION) return merge(stored);

  const series = await computeChartSeries(bufferFromJson(tr.server_metrics_json_gz), {
    framework: c.framework,
    disagg: c.disagg,
  });
  if (!series) return null;
  return merge(series);
}

/**
 * Mirror of {@link import('./queries/trace-histograms.js').getTraceHistograms}.
 * Fast path: pull isl/osl out of a current request_timeline. Fallback: parse the
 * profile blob's per-request input/output_sequence_length. Ids without a
 * trace_replay row are omitted (SQL joins on it).
 */
export function getTraceHistograms(benchmarkResultIds: number[]): TraceHistogramMap {
  if (benchmarkResultIds.length === 0) return {};
  const result: TraceHistogramMap = {};
  for (const id of benchmarkResultIds) {
    const tr = traceReplayForBenchmark(id);
    if (!tr) continue;
    const timeline = tr.request_timeline as (RequestTimeline & { version?: number }) | null;
    if (timeline && Number(timeline.version) === REQUEST_TIMELINE_VERSION) {
      const isl: number[] = [];
      const osl: number[] = [];
      for (const req of timeline.requests) {
        if (typeof req.isl === 'number' && Number.isFinite(req.isl)) isl.push(req.isl);
        if (typeof req.osl === 'number' && Number.isFinite(req.osl)) osl.push(req.osl);
      }
      result[id] = { id, isl, osl } satisfies TraceHistogramPoint;
      continue;
    }
    // Fallback: parse the profile blob (same field extraction the SQL path uses).
    const profile = bufferFromJson(tr.profile_export_jsonl_gz);
    if (!profile) continue;
    try {
      const jsonl = gunzipSync(profile).toString('utf8');
      const { isl, osl } = extractIslOsl(jsonl);
      result[id] = { id, isl, osl } satisfies TraceHistogramPoint;
    } catch {
      // malformed blob — omit id
    }
  }
  return result;
}

/**
 * Mirror of {@link import('./queries/benchmark-siblings.js').getBenchmarkSiblings}.
 * Plain-row logic: resolve the seed SKU, then every row in the same workflow_run
 * sharing hw/framework/model/precision/spec_method/benchmark_type. Sort mirrors
 * the SQL `order by decode_tp, decode_ep, offload_mode nulls first, conc`.
 */
export function getBenchmarkSiblings(benchmarkResultId: number): BenchmarkSiblings | null {
  const s = getStore();
  const seed = s.benchmarks.find((b) => b.id === benchmarkResultId);
  if (!seed) return null;
  const seedC = s.configs.get(seed.config_id);
  const seedWr = s.latestRunsById.get(seed.workflow_run_id);
  // getBenchmarkSiblings joins workflow_runs (inner) for github_run_id — a
  // missing run yields no seed row in SQL.
  if (!seedC || !seedWr) return null;
  const seedType = seed.benchmark_type ?? 'single_turn';

  const rows = s.benchmarks
    .filter((b) => {
      if (b.workflow_run_id !== seed.workflow_run_id) return false;
      if ((b.benchmark_type ?? 'single_turn') !== seedType) return false;
      const c = s.configs.get(b.config_id);
      if (!c) return false;
      return (
        c.hardware === seedC.hardware &&
        c.framework === seedC.framework &&
        c.model === seedC.model &&
        c.precision === seedC.precision &&
        c.spec_method === seedC.spec_method
      );
    })
    .map((b) => ({ b, c: s.configs.get(b.config_id)! }))
    // ORDER BY c.decode_tp, c.decode_ep, br.offload_mode NULLS FIRST, br.conc
    .toSorted((x, y) => {
      if (x.c.decode_tp !== y.c.decode_tp) return x.c.decode_tp - y.c.decode_tp;
      if (x.c.decode_ep !== y.c.decode_ep) return x.c.decode_ep - y.c.decode_ep;
      const [xr, xv] = offloadRank((x.b as { offload_mode?: string | null }).offload_mode);
      const [yr, yv] = offloadRank((y.b as { offload_mode?: string | null }).offload_mode);
      if (xr !== yr) return xr - yr;
      if (xv !== yv) return xv.localeCompare(yv);
      return x.b.conc - y.b.conc;
    });

  const siblings = rows.map(({ b, c }) => {
    const totalRequests =
      readFiniteMetric(b.metrics, 'total_requests_completed') ??
      readFiniteMetric(b.metrics, 'num_requests_total');
    return {
      id: b.id,
      conc: b.conc,
      offload_mode: (b as { offload_mode?: string | null }).offload_mode ?? null,
      decode_tp: c.decode_tp,
      decode_ep: c.decode_ep,
      decode_dp_attention: c.decode_dp_attention,
      decode_num_workers: c.decode_num_workers,
      prefill_tp: c.prefill_tp,
      prefill_ep: c.prefill_ep,
      prefill_dp_attention: c.prefill_dp_attention,
      prefill_num_workers: c.prefill_num_workers,
      num_prefill_gpu: c.num_prefill_gpu,
      num_decode_gpu: c.num_decode_gpu,
      disagg: c.disagg,
      is_multinode: c.is_multinode,
      tput_per_gpu: readFiniteMetric(b.metrics, 'tput_per_gpu'),
      total_requests: totalRequests,
      is_current: b.id === benchmarkResultId,
      has_trace: s.benchmarkTraceReplayMap.has(b.id),
    };
  });

  return {
    sku: {
      hardware: seedC.hardware,
      framework: seedC.framework,
      model: seedC.model,
      precision: seedC.precision,
      spec_method: seedC.spec_method,
      benchmark_type: seedType,
      github_run_id: seedWr.github_run_id,
      date: toDateString(seed.date),
      dataset_slug: s.runDatasetSlugByRunId.get(seed.workflow_run_id) ?? null,
    },
    siblings,
  };
}

// ---------------------------------------------------------------------------
// Dataset mirrors (plain-row logic)
// ---------------------------------------------------------------------------

/** Mirror of {@link import('./queries/datasets.js').listDatasets}: newest first. */
export function listDatasets(): DatasetRecord[] {
  const s = getStore();
  // ORDER BY ingested_at DESC, slug ASC. ingested_at is an ISO string.
  const sorted = s.datasets.toSorted((a, b) => {
    const t = b.ingested_at.localeCompare(a.ingested_at);
    return t === 0 ? a.slug.localeCompare(b.slug) : t;
  });
  return sorted.map((d) => ({
    id: d.id,
    slug: d.slug,
    label: d.label,
    variant: d.variant,
    description: d.description,
    hf_url: d.hf_url,
    license: d.license,
    conversation_count: Number(d.conversation_count),
    summary: d.summary,
    ingested_at: pgTimestampText(d.ingested_at),
  }));
}

/** Mirror of {@link import('./queries/datasets.js').getDataset}: one dataset incl. chart_data. */
export function getDataset(slug: string): DatasetDetail | null {
  const s = getStore();
  const d = s.datasetsBySlug.get(slug);
  if (!d) return null;
  return {
    id: d.id,
    slug: d.slug,
    label: d.label,
    variant: d.variant,
    description: d.description,
    hf_url: d.hf_url,
    license: d.license,
    conversation_count: Number(d.conversation_count),
    summary: d.summary,
    chart_data: d.chart_data,
    ingested_at: pgTimestampText(d.ingested_at),
  };
}

const CONVERSATIONS_MAX_LIMIT = 200;

/**
 * Mirror of {@link import('./queries/datasets.js').listConversations}. Applies
 * the same ILIKE (case-insensitive substring) search, sort (tokens/turns/
 * subagents/id), limit clamp (1..200), and offset the SQL uses. `total`
 * reflects the filtered count before pagination.
 */
export function listConversations(
  slug: string,
  opts: ListConversationsOpts = {},
): ConversationList | null {
  const s = getStore();
  const dataset = s.datasetsBySlug.get(slug);
  if (!dataset) return null;

  const limit = Math.min(CONVERSATIONS_MAX_LIMIT, Math.max(1, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);
  const search = opts.search?.trim();
  const needle = search ? search.toLowerCase() : null;

  const filtered = s.datasetConversations.filter(
    (dc) =>
      dc.dataset_id === dataset.id &&
      (needle === null || dc.conv_id.toLowerCase().includes(needle)),
  );
  const total = filtered.length;

  // ORDER BY <sort key> [DESC], conv_id ASC — replicate the SQL tie-break.
  const sort = opts.sort ?? 'tokens';
  const sorted = filtered.toSorted((a, b) => {
    if (sort === 'turns') return b.num_turns - a.num_turns || compareConvId(a, b);
    if (sort === 'subagents')
      return b.num_subagent_groups - a.num_subagent_groups || compareConvId(a, b);
    if (sort === 'id') return compareConvId(a, b);
    return b.total_in - a.total_in || compareConvId(a, b); // 'tokens' (default)
  });

  const items: ConversationListItem[] = sorted.slice(offset, offset + limit).map((dc) => ({
    conv_id: dc.conv_id,
    models: dc.models,
    num_turns: Number(dc.num_turns),
    num_subagent_groups: Number(dc.num_subagent_groups),
    total_in: Number(dc.total_in),
    total_out: Number(dc.total_out),
    total_cached: Number(dc.total_cached),
  }));

  return { total, items };
}

/** Mirror of {@link import('./queries/datasets.js').getConversation}: one flamegraph. */
export function getConversation(slug: string, convId: string): ConversationDetail | null {
  const s = getStore();
  const dataset = s.datasetsBySlug.get(slug);
  if (!dataset) return null;
  const dc = s.datasetConversations.find(
    (r) => r.dataset_id === dataset.id && r.conv_id === convId,
  );
  if (!dc) return null;
  return {
    conv_id: dc.conv_id,
    models: dc.models,
    num_turns: Number(dc.num_turns),
    num_subagent_groups: Number(dc.num_subagent_groups),
    total_in: Number(dc.total_in),
    total_out: Number(dc.total_out),
    total_cached: Number(dc.total_cached),
    structure: dc.structure as unknown as ConversationStructure,
  };
}
