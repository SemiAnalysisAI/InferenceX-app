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

export type {
  MetricSourceSeries,
  QueueDepthPoint,
  TimeSeriesPoint,
} from '../etl/compute-chart-series';

// The endpoint payload combines chart_series with separately queried point
// metadata. Keep a composite response version so metadata-shape changes roll
// the blob-cache namespace without forcing an expensive chart_series backfill.
const POINT_META_VERSION = 4;
export const TRACE_SERVER_METRICS_VERSION = CHART_SERIES_VERSION * 100 + POINT_META_VERSION;

export interface MetricSourceDescriptor {
  source: MetricSourceSeries['source'];
}

export interface PointMeta {
  id: number;
  hardware: string;
  framework: string;
  model: string;
  precision: string;
  spec_method: string;
  disagg: boolean;
  is_multinode: boolean;
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
   * Fresh prefill is combined with physical cache-tier hits when the producer
   * exposes them; older rows retain their logical cache-hit buckets.
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
  metricSources: MetricSourceDescriptor[];
}

type ChartSeriesSummary = Omit<ChartSeries, 'metricSources'> & {
  metricSources: MetricSourceDescriptor[];
};

type KvMetricSource = Pick<MetricSourceSeries, 'source' | 'kvCacheUsage' | 'kvCacheUsageByEngine'>;

interface RawMetaRow extends PointMeta {
  trace_replay_id: number | null;
  has_blob: boolean;
  chart_series: Omit<ChartSeries, 'metricSources'> | null;
  metric_sources: KvMetricSource[];
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
    is_multinode: row.is_multinode,
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
  series: Omit<ChartSeries, 'metricSources'>,
  kvCachePoolTokens: number | null,
  metricSources: MetricSourceDescriptor[],
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
    metricSources,
  };
}

/** Mean of several engine series, matched on scrape instant. */
function meanOfEngines(engines: readonly { points: TimeSeriesPoint[] }[]): TimeSeriesPoint[] {
  const active = engines.filter((engine) => engine.points.length > 0);
  if (active.length === 0) return [];
  if (active.length === 1) return active[0]!.points;
  // Engines inside one worker are scraped together, so they share instants and
  // a pointwise mean is exact. A `t` only some of them reported averages those,
  // rather than counting the absent ones as zero.
  const byT = new Map<number, { sum: number; n: number }>();
  for (const engine of active) {
    for (const point of engine.points) {
      const at = byT.get(point.t);
      if (at) {
        at.sum += point.value;
        at.n++;
      } else {
        byT.set(point.t, { sum: point.value, n: 1 });
      }
    }
  }
  return [...byT.entries()]
    .toSorted((a, b) => a[0] - b[0])
    .map(([t, { sum, n }]) => ({ t, value: sum / n }));
}

/**
 * All-endpoints KV overlay: one line per WORKER, averaged over the ranks it
 * owns.
 *
 * `chart_series.kvCacheUsageByEngine` is per rank, which stops being readable
 * on a PD-disaggregated run — 6 prefill workers at DP4 plus a decode worker is
 * 28 lines, and ranks inside one worker track each other closely, so the
 * comparison worth seeing is worker-vs-worker.
 *
 * Derived here rather than in the ETL because everything it needs is already
 * stored: each source carries its own per-rank breakdown, and this layer is
 * the last place that sees it before `metricSources` is trimmed to
 * descriptors. Keeping it out of `chart_series` means no version bump and no
 * backfill for what is a presentation choice.
 *
 * Returns null when collapsing would not help — a single worker, or a run with
 * no per-source data, keeps the per-rank overlay, which is exactly where rank
 * skew is the signal.
 */
function collapseKvByWorker(
  sources: readonly KvMetricSource[],
): { engineLabel: string; points: TimeSeriesPoint[] }[] | null {
  if (sources.length < 2) return null;
  const entries = sources
    .map((entry) => ({
      source: entry.source,
      // Single-pool workers intentionally omit the per-engine array because
      // it would duplicate their aggregate line. Preserve that worker when a
      // sibling with multiple ranks makes the all-endpoints collapse useful.
      engines:
        entry.kvCacheUsageByEngine?.length > 0
          ? entry.kvCacheUsageByEngine
          : entry.kvCacheUsage.length > 0
            ? [{ points: entry.kvCacheUsage }]
            : [],
    }))
    .filter((entry) => entry.engines.length > 0);
  if (entries.length < 2) return null;
  // Already one engine per worker — nothing to average, so leave the stored
  // labels alone rather than relabelling for no gain.
  const totalEngines = entries.reduce((sum, entry) => sum + entry.engines.length, 0);
  if (totalEngines <= entries.length) return null;

  const workersPerRole = new Map<string, number>();
  for (const { source } of entries) {
    workersPerRole.set(source.role, (workersPerRole.get(source.role) ?? 0) + 1);
  }
  const used = new Set<string>();
  return entries.map(({ source, engines }, index) => {
    const worker = source.workerId;
    const short = worker && worker.length > 4 ? worker.slice(-4) : worker;
    // Qualify by worker only when the role actually has several, so a lone
    // decode worker reads "decode" rather than "decode 0842".
    const base =
      (workersPerRole.get(source.role) ?? 0) > 1 && short
        ? `${source.role} ${short}`
        : (source.role ?? short ?? `#${index}`);
    let label = base;
    for (let n = 2; used.has(label); n++) label = `${base} #${n}`;
    used.add(label);
    return { engineLabel: label, points: meanOfEngines(engines) };
  });
}

function summarizeSeries(
  series: Omit<ChartSeries, 'metricSources'>,
  sources: readonly KvMetricSource[],
): ChartSeriesSummary {
  return {
    ...series,
    kvCacheUsageByEngine: collapseKvByWorker(sources) ?? series.kvCacheUsageByEngine ?? [],
    metricSources: sources.map(({ source }) => ({ source })),
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
      case
        when atr.chart_series is null then null
        else atr.chart_series - 'metricSources'
      end as chart_series,
      coalesce((
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
      ), '[]'::jsonb) as metric_sources,
      br.id, c.hardware, c.framework, c.model, c.precision, c.spec_method,
      c.disagg, c.is_multinode,
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
    const summary = summarizeSeries(row.chart_series, row.metric_sources);
    return merge(meta, summary, kvCachePoolTokens, summary.metricSources);
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

  // Self-heal the stored chart_series so the next request takes the fast path
  // instead of re-decompressing this (tens-of-MB) blob. `series` is complete
  // and stamped at CHART_SERIES_VERSION here; fire-and-forget and best-effort
  // (no-ops on a read-only replica). trace_replay_id is non-null on this path.
  writeBackTraceReplayJsonb(sql, 'chart_series', row.trace_replay_id, series);

  const summary = summarizeSeries(series, series.metricSources);
  return merge(meta, summary, kvCachePoolTokens, summary.metricSources);
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
  writeBackTraceReplayJsonb(sql, 'chart_series', row.trace_replay_id, series);
  return series.metricSources.find(({ source }) => source.id === sourceId) ?? null;
}
