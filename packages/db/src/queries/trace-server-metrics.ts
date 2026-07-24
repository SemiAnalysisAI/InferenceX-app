/**
 * Time-series view of one agentic benchmark point: chart-ready arrays for
 * KV utilization, prefix-cache hit rate, queue depth, prefill + decode TPS,
 * and per-source prompt-token counts.
 *
 * Backed by `agentic_trace_replay.chart_series` (pre-computed at ingest
 * time, see `etl/compute-chart-series.ts`). The fast path is a single SQL
 * row read; the slow path re-computes from `server_metrics_json_gz` and is
 * only taken when the column is missing or the stored
 * `CHART_SERIES_VERSION` is stale (the backfill script should drain that).
 */

import {
  CHART_SERIES_VERSION,
  computeChartSeries,
  type ChartSeries,
  type MetricSourceSeries,
  type QueueDepthPoint,
  type TimeSeriesPoint,
} from '../etl/compute-chart-series';

import type { DbClient } from '../connection.js';
import { writeBackTraceReplayJsonb } from './agentic-shared';

export type { TimeSeriesPoint, QueueDepthPoint } from '../etl/compute-chart-series';

// The endpoint payload combines chart_series with separately queried point
// metadata. Keep a composite response version so metadata-shape changes roll
// the blob-cache namespace without forcing an expensive chart_series backfill.
const POINT_META_VERSION = 2;
export const TRACE_SERVER_METRICS_VERSION = CHART_SERIES_VERSION * 100 + POINT_META_VERSION;

export interface PointMeta {
  id: number;
  hardware: string;
  framework: string;
  model: string;
  precision: string;
  spec_method: string;
  disagg: boolean;
  conc: number;
  offload_mode: string | null;
  kv_offloading: string | null;
  kv_offload_backend: string | null;
  kv_offload_backend_version: string | null;
  kv_p2p_transfer: string | null;
  router_name: string | null;
  router_version: string | null;
  isl: number | null;
  osl: number | null;
  benchmark_type: string;
  date: string;
  /** GitHub Actions run URL for jumping to the source. */
  run_url: string | null;
  /** Cumulative end-of-run cache-hit number the dashboard already shows. */
  server_gpu_cache_hit_rate: number | null;
  /** Cumulative end-of-run CPU offload cache-hit. */
  server_cpu_cache_hit_rate: number | null;
}

export interface TraceServerMetrics {
  /** Point context — hardware, model, conc, etc. for the page header. */
  meta: PointMeta;
  /** ns wall-clock of the first window's start; for debugging only. */
  startNs: number;
  /** ns wall-clock of the last window's end. */
  endNs: number;
  /** Total benchmark window in seconds. */
  durationS: number;
  /** Number of 1Hz windows captured. */
  timeslicesCount: number;
  /** vllm:kv_cache_usage_perc avg per scrape, values in 0..1. */
  kvCacheUsage: TimeSeriesPoint[];
  /** Per-window prefix-cache hit rate computed as Δhits / Δqueries (0..1). */
  prefixCacheHitRate: TimeSeriesPoint[];
  /** Request queue depth: running, waiting, total per scrape. */
  queueDepth: QueueDepthPoint[];
  /**
   * Per-source prompt-token counts over time (counter rate per scrape).
   * Keyed by the value of the `source` label (typically `local_cache_hit`,
   * `external_cache_hit`, `miss`, etc.). Plot as stacked area.
   */
  promptTokensBySource: Record<string, TimeSeriesPoint[]>;
  /** Prefill throughput: vllm:prompt_tokens rate (tokens/sec) per scrape. */
  prefillTps: TimeSeriesPoint[];
  /** Decode throughput: vllm:generation_tokens rate (tokens/sec) per scrape. */
  decodeTps: TimeSeriesPoint[];
  /** Tokens served from prefix cache per scrape (vllm:prefix_cache_hits rate). */
  prefixCacheHitsTps: TimeSeriesPoint[];
  /** Host (CPU offload) KV cache utilization, 0..1. SGLang hicache only. */
  hostKvCacheUsage: TimeSeriesPoint[];
  /**
   * Per-DP-rank KV cache utilization. Empty for single-engine deployments —
   * the cluster-average `kvCacheUsage` line covers that case alone.
   */
  kvCacheUsageByEngine: { engineLabel: string; points: TimeSeriesPoint[] }[];
  /**
   * Total KV-cache pool size in tokens (num_gpu_blocks × block_size, summed
   * across engines). vLLM only — null for SGLang/TRT or older rows.
   */
  kvCachePoolTokens: number | null;
  /** Orchestrator-normalized metrics grouped by endpoint/worker. */
  metricSources: MetricSourceSeries[];
}

interface RawMetaRow extends PointMeta {
  trace_replay_id: number | null;
  has_blob: boolean;
  chart_series: ChartSeries | null;
  /** Derived at server-log ingest from "GPU KV cache size: N tokens" lines. */
  kv_cache_pool_tokens: string | null;
}

interface RawBlobRow {
  blob: Buffer | null;
}

function buildMeta(row: RawMetaRow): PointMeta {
  return {
    id: Number(row.id),
    hardware: row.hardware,
    framework: row.framework,
    model: row.model,
    precision: row.precision,
    spec_method: row.spec_method,
    disagg: row.disagg,
    conc: row.conc,
    offload_mode: row.offload_mode,
    kv_offloading: row.kv_offloading,
    kv_offload_backend: row.kv_offload_backend,
    kv_offload_backend_version: row.kv_offload_backend_version,
    kv_p2p_transfer: row.kv_p2p_transfer,
    router_name: row.router_name,
    router_version: row.router_version,
    isl: row.isl,
    osl: row.osl,
    benchmark_type: row.benchmark_type,
    date: row.date,
    run_url: row.run_url,
    server_gpu_cache_hit_rate:
      row.server_gpu_cache_hit_rate === null ? null : Number(row.server_gpu_cache_hit_rate),
    server_cpu_cache_hit_rate:
      row.server_cpu_cache_hit_rate === null ? null : Number(row.server_cpu_cache_hit_rate),
  };
}

function merge(
  meta: PointMeta,
  series: ChartSeries,
  kvCachePoolTokens: number | null,
): TraceServerMetrics {
  return {
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
    // v2 chart_series rows pre-backfill don't have this field — default to []
    prefixCacheHitsTps: series.prefixCacheHitsTps ?? [],
    hostKvCacheUsage: series.hostKvCacheUsage ?? [],
    // v8+ field; older chart_series rows lack it → omit per-engine overlay.
    kvCacheUsageByEngine: series.kvCacheUsageByEngine ?? [],
    // v9+ field; old rows are served without a source selector until backfilled.
    metricSources: series.metricSources ?? [],
  };
}

export async function getTraceServerMetrics(
  sql: DbClient,
  benchmarkResultId: number,
): Promise<TraceServerMetrics | null> {
  const rows = (await sql`
    select
      br.trace_replay_id,
      (atr.server_metrics_json_gz is not null) as has_blob,
      atr.chart_series,
      br.id, c.hardware, c.framework, c.model, c.precision, c.spec_method, c.disagg,
      br.conc, br.offload_mode, br.isl, br.osl, br.benchmark_type,
      br.date::text,
      case when wr.html_url is not null then wr.html_url || '/attempts/' || wr.run_attempt else null end as run_url,
      nullif(br.metrics ->> 'kv_offloading', '') as kv_offloading,
      nullif(br.metrics ->> 'kv_offload_backend', '') as kv_offload_backend,
      nullif(br.metrics ->> 'kv_offload_backend_version', '') as kv_offload_backend_version,
      nullif(br.metrics ->> 'kv_p2p_transfer', '') as kv_p2p_transfer,
      nullif(br.metrics ->> 'router_name', '') as router_name,
      nullif(br.metrics ->> 'router_version', '') as router_version,
      (br.metrics ->> 'server_gpu_cache_hit_rate')::numeric as server_gpu_cache_hit_rate,
      (br.metrics ->> 'server_cpu_cache_hit_rate')::numeric as server_cpu_cache_hit_rate,
      (br.metrics ->> 'kv_cache_pool_tokens')::numeric as kv_cache_pool_tokens
    from benchmark_results br
    join configs c on c.id = br.config_id
    join workflow_runs wr on wr.id = br.workflow_run_id
    left join agentic_trace_replay atr on atr.id = br.trace_replay_id
    where br.id = ${benchmarkResultId}
  `) as unknown as RawMetaRow[];
  const row = rows[0];
  if (!row) return null;
  if (!row.has_blob || row.trace_replay_id === null) return null;
  const meta = buildMeta(row);
  const kvCachePoolTokens =
    row.kv_cache_pool_tokens === null ? null : Number(row.kv_cache_pool_tokens);

  // Fast path: pre-computed chart_series at the current version.
  if (row.chart_series && Number(row.chart_series.version) === CHART_SERIES_VERSION) {
    return merge(meta, row.chart_series, kvCachePoolTokens);
  }

  // Slow path only: fetch the large raw blob after establishing that the
  // pre-computed series is missing or stale. Disaggregated blobs can be tens
  // of MB compressed, so selecting this in the metadata query defeats the
  // fast path even when chart_series is current.
  const blobRows = (await sql`
    select server_metrics_json_gz as blob
    from agentic_trace_replay
    where id = ${row.trace_replay_id}
  `) as unknown as RawBlobRow[];
  const blob = blobRows[0]?.blob;
  if (!blob) return null;

  // `computeChartSeries` handles
  // ERR_STRING_TOO_LONG via a stream-parse fallback so high-conc TP+EP
  // rows succeed even before the backfill drains them.
  const series = await computeChartSeries(blob, {
    framework: row.framework,
    disagg: row.disagg,
  });
  if (!series) return null;

  // Self-heal the stored chart_series so the next request takes the fast path
  // instead of re-decompressing this (tens-of-MB) blob. `series` is complete
  // and stamped at CHART_SERIES_VERSION here; fire-and-forget and best-effort
  // (no-ops on a read-only replica). trace_replay_id is non-null on this path.
  writeBackTraceReplayJsonb(sql, 'chart_series', row.trace_replay_id, series);

  return merge(meta, series, kvCachePoolTokens);
}
