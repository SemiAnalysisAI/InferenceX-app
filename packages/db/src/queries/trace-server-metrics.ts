/**
 * Time-series view of one agentic benchmark point: chart-ready arrays for
 * KV utilization, prefix-cache hit rate, queue depth, prefill + decode TPS,
 * and per-source prompt-token counts.
 *
 * Backed by `agentic_trace_replay.chart_series_summary_gz`, the route's
 * series fields precomputed from `chart_series` at ingest (see
 * `etl/chart-series-summary.ts`). Rows without a current summary derive it
 * from `chart_series` in SQL and JS as before, and rows whose
 * `CHART_SERIES_VERSION` is stale re-compute it from `server_metrics_json_gz`
 * (the backfill scripts drain both).
 */

import {
  CHART_SERIES_SUMMARY_VERSION,
  decodeChartSeriesSummary,
  summarizeChartSeries,
  type KvMetricSource,
  type MetricSourceDescriptor,
} from '../etl/chart-series-summary';
import {
  CHART_SERIES_VERSION,
  computeChartSeries,
  type ChartSeries,
  type MetricSourceSeries,
  type QueueDepthPoint,
  type TimeSeriesPoint,
} from '../etl/compute-chart-series';

import type { DbClient } from '../connection.js';
import { writeBackChartSeries } from './agentic-shared';

export type { MetricSourceDescriptor } from '../etl/chart-series-summary';
export type {
  MetricSourceSeries,
  QueueDepthPoint,
  TimeSeriesPoint,
} from '../etl/compute-chart-series';

// The endpoint payload combines chart_series with separately queried point
// metadata. Keep a composite response version so metadata-shape changes roll
// the blob-cache namespace without forcing an expensive chart_series backfill.
const POINT_META_VERSION = 6;
export const TRACE_SERVER_METRICS_VERSION = CHART_SERIES_VERSION * 100 + POINT_META_VERSION;

const INLINE_SUMMARY_BYTES = 32 * 1024 * 1024;

export interface PointMeta {
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
  recipe_fingerprint: string | null;
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
   * Deployment KV-pool capacity in tokens, derived at ingestion for vLLM/ATOM.
   * Nominal capacity: ATOM checkpoints can share this pool with token KV.
   */
  kvCachePoolTokens: number | null;
  /** Orchestrator-normalized metrics grouped by endpoint/worker. */
  metricSources: MetricSourceDescriptor[];
}

interface RawMetaRow extends PointMeta {
  trace_replay_id: number | null;
  has_blob: boolean;
  summary_gz: string | null;
  chart_series: Omit<ChartSeries, 'metricSources'> | null;
  metric_sources: KvMetricSource[];
  /** Derived from startup logs, plus allocated block counts for ATOM. */
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
    is_multinode: row.is_multinode,
    prefill_tp: row.prefill_tp,
    prefill_ep: row.prefill_ep,
    prefill_dp_attention: row.prefill_dp_attention,
    prefill_num_workers: row.prefill_num_workers,
    decode_tp: row.decode_tp,
    decode_ep: row.decode_ep,
    decode_dp_attention: row.decode_dp_attention,
    decode_num_workers: row.decode_num_workers,
    num_prefill_gpu: row.num_prefill_gpu,
    num_decode_gpu: row.num_decode_gpu,
    recipe_fingerprint: row.recipe_fingerprint,
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

export async function getTraceServerMetrics(
  sql: DbClient,
  benchmarkResultId: number,
): Promise<TraceServerMetrics | null> {
  const rows = (await sql`
    select
      br.trace_replay_id,
      (atr.server_metrics_json_gz is not null) as has_blob,
      case when summary.is_current then encode(atr.chart_series_summary_gz, 'base64') end as summary_gz,
      case
        when summary.is_current or atr.chart_series is null then null
        else atr.chart_series - 'metricSources'
      end as chart_series,
      case when summary.is_current then '[]'::jsonb else coalesce((
        select jsonb_agg(jsonb_build_object(
          'source', metric_source->'source',
          'kvCacheUsage', coalesce(metric_source->'kvCacheUsage', '[]'::jsonb),
          'kvCacheUsageByEngine', coalesce(
            metric_source->'kvCacheUsageByEngine',
            '[]'::jsonb
          )
        ))
        from jsonb_array_elements(
          coalesce(atr.chart_series->'metricSources', '[]'::jsonb)
        ) as metric_source
      ), '[]'::jsonb) end as metric_sources,
      br.id, c.hardware, c.framework, c.model, c.precision, c.spec_method,
      c.disagg, c.is_multinode,
      c.prefill_tp, c.prefill_ep, c.prefill_dp_attention, c.prefill_num_workers,
      c.decode_tp, c.decode_ep, c.decode_dp_attention, c.decode_num_workers,
      c.num_prefill_gpu, c.num_decode_gpu,
      br.recipe_fingerprint,
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
    cross join lateral (
      select coalesce(
        atr.chart_series_summary_version = ${CHART_SERIES_SUMMARY_VERSION}
          and octet_length(atr.chart_series_summary_gz) <= ${INLINE_SUMMARY_BYTES},
        false
      ) as is_current
    ) summary
    where br.id = ${benchmarkResultId}
  `) as unknown as RawMetaRow[];
  const row = rows[0];
  if (!row) return null;
  if (!row.has_blob || row.trace_replay_id === null) return null;
  const meta = buildMeta(row);
  const kvCachePoolTokens =
    row.kv_cache_pool_tokens === null ? null : Number(row.kv_cache_pool_tokens);

  if (row.summary_gz !== null) {
    return {
      meta,
      kvCachePoolTokens,
      ...decodeChartSeriesSummary(Buffer.from(row.summary_gz, 'base64')),
    };
  }
  if (row.chart_series && Number(row.chart_series.version) === CHART_SERIES_VERSION) {
    return {
      meta,
      kvCachePoolTokens,
      ...summarizeChartSeries(row.chart_series, row.metric_sources),
    };
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

  // `computeChartSeries` streams blobs that exceed its in-memory fast-path
  // ceiling so high-conc TP+EP rows succeed before the backfill drains them.
  const series = await computeChartSeries(blob, {
    framework: row.framework,
    disagg: row.disagg,
  });
  if (!series) return null;

  writeBackChartSeries(sql, row.trace_replay_id, series);

  return { meta, kvCachePoolTokens, ...summarizeChartSeries(series, series.metricSources) };
}

interface RawMetricSourceRow {
  trace_replay_id: number | null;
  has_blob: boolean;
  chart_series_version: number | null;
  framework: string;
  disagg: boolean;
  metric_source: MetricSourceSeries | null;
}

/** Fetch one source's full series only after the user selects it. */
export async function getTraceServerMetricSource(
  sql: DbClient,
  benchmarkResultId: number,
  sourceId: string,
): Promise<MetricSourceSeries | null> {
  const rows = (await sql`
    select
      br.trace_replay_id,
      (atr.server_metrics_json_gz is not null) as has_blob,
      (atr.chart_series->>'version')::int as chart_series_version,
      c.framework,
      c.disagg,
      (
        select metric_source
        from jsonb_array_elements(atr.chart_series->'metricSources') as metric_source
        where metric_source->'source'->>'id' = ${sourceId}
        limit 1
      ) as metric_source
    from benchmark_results br
    join configs c on c.id = br.config_id
    left join agentic_trace_replay atr on atr.id = br.trace_replay_id
    where br.id = ${benchmarkResultId}
  `) as unknown as RawMetricSourceRow[];
  const row = rows[0];
  if (!row || !row.has_blob || row.trace_replay_id === null) return null;

  if (row.chart_series_version === CHART_SERIES_VERSION) return row.metric_source;

  const blobRows = (await sql`
    select server_metrics_json_gz as blob
    from agentic_trace_replay
    where id = ${row.trace_replay_id}
  `) as unknown as RawBlobRow[];
  const blob = blobRows[0]?.blob;
  if (!blob) return null;
  const series = await computeChartSeries(blob, {
    framework: row.framework,
    disagg: row.disagg,
  });
  if (!series) return null;
  writeBackChartSeries(sql, row.trace_replay_id, series);
  return series.metricSources.find(({ source }) => source.id === sourceId) ?? null;
}
