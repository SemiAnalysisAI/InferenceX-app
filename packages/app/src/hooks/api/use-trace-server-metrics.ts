import { useByIdQuery } from './benchmark-id-query';

export interface TimeSeriesPoint {
  /** Seconds from benchmark start. */
  t: number;
  value: number;
}
export interface QueueDepthPoint {
  t: number;
  running: number;
  waiting: number;
  total: number;
}
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
  isl: number | null;
  osl: number | null;
  benchmark_type: string;
  date: string;
  run_url: string | null;
  server_gpu_cache_hit_rate: number | null;
  server_cpu_cache_hit_rate: number | null;
}

export type MetricSourceRole = 'router' | 'prefill' | 'decode' | 'combined' | 'unknown';

export interface MetricSource {
  id: string;
  adapter: string;
  role: MetricSourceRole;
  endpointUrl: string | null;
  nativeRole: string | null;
  workerId: string | null;
  dpRank: string | null;
  engine: string | null;
}

export interface MetricSourceSeries {
  source: MetricSource;
  kvCacheUsage: TimeSeriesPoint[];
  prefixCacheHitRate: TimeSeriesPoint[];
  queueDepth: QueueDepthPoint[];
  promptTokensBySource: Record<string, TimeSeriesPoint[]>;
  promptTps: TimeSeriesPoint[];
  generationTps: TimeSeriesPoint[];
  prefixCacheHitsTps: TimeSeriesPoint[];
  hostKvCacheUsage: TimeSeriesPoint[];
  kvCacheUsageByEngine: { engineLabel: string; points: TimeSeriesPoint[] }[];
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

/**
 * Lazy-fetch parsed server-metric time-series for one agentic point.
 * Enabled only when the caller passes `enabled=true` (the detail panel opens),
 * so we don't pay the parse cost on every hover.
 */
export function useTraceServerMetrics(id: number | null, enabled = false) {
  return useByIdQuery<TraceServerMetrics>('trace-server-metrics', id, enabled && Boolean(id));
}
