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

const POINT_META_VERSION = 6;
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
  run_url: string | null;
  server_gpu_cache_hit_rate: number | null;
  server_cpu_cache_hit_rate: number | null;
}

export interface TraceServerMetrics {
  meta: PointMeta;
  startNs: number;
  endNs: number;
  durationS: number;
  timeslicesCount: number;
  kvCacheUsage: TimeSeriesPoint[];
  prefixCacheHitRate: TimeSeriesPoint[];
  queueDepth: QueueDepthPoint[];
  promptTokensBySource: Record<string, TimeSeriesPoint[]>;
  prefillTps: TimeSeriesPoint[];
  decodeTps: TimeSeriesPoint[];
  prefixCacheHitsTps: TimeSeriesPoint[];
  hostKvCacheUsage: TimeSeriesPoint[];
  kvCacheUsageByEngine: { engineLabel: string; points: TimeSeriesPoint[] }[];
  kvCachePoolTokens: number | null;
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
    prefixCacheHitsTps: series.prefixCacheHitsTps ?? [],
    hostKvCacheUsage: series.hostKvCacheUsage ?? [],
    kvCacheUsageByEngine: series.kvCacheUsageByEngine ?? [],
    metricSources,
  };
}

function meanOfEngines(engines: readonly { points: TimeSeriesPoint[] }[]): TimeSeriesPoint[] {
  const active = engines.filter((engine) => engine.points.length > 0);
  if (active.length === 0) return [];
  if (active.length === 1) return active[0]!.points;
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

function collapseKvByWorker(
  sources: readonly KvMetricSource[],
): { engineLabel: string; points: TimeSeriesPoint[] }[] | null {
  if (sources.length < 2) return null;
  const entries = sources
    .map((entry) => ({
      source: entry.source,
      engines:
        entry.kvCacheUsageByEngine?.length > 0
          ? entry.kvCacheUsageByEngine
          : entry.kvCacheUsage.length > 0
            ? [{ points: entry.kvCacheUsage }]
            : [],
    }))
    .filter((entry) => entry.engines.length > 0);
  if (entries.length < 2) return null;
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
    where br.id = ${benchmarkResultId}
  `) as unknown as RawMetaRow[];
  const row = rows[0];
  if (!row) return null;
  if (!row.has_blob || row.trace_replay_id === null) return null;
  const meta = buildMeta(row);
  const kvCachePoolTokens =
    row.kv_cache_pool_tokens === null ? null : Number(row.kv_cache_pool_tokens);

  if (row.chart_series && Number(row.chart_series.version) === CHART_SERIES_VERSION) {
    const summary = summarizeSeries(row.chart_series, row.metric_sources);
    return merge(meta, summary, kvCachePoolTokens, summary.metricSources);
  }

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
