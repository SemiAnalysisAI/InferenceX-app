/**
 * Normalize orchestrator-specific server-metric labels into a stable source
 * identity consumed by the API and frontend. AIPerf owns the export envelope;
 * the serving orchestrator owns the meaning of labels inside each series.
 */

export type MetricSourceRole = 'router' | 'prefill' | 'decode' | 'combined' | 'unknown';

export interface RawMetricSourceSeries {
  endpoint_url?: string;
  labels?: Record<string, string>;
}

export interface ServerMetricsContext {
  /** Canonical framework stored in configs, for example `dynamo-vllm`. */
  framework?: string | null;
  /** Per-worker role series are only meaningful for disaggregated configs. */
  disagg?: boolean;
}

export interface MetricSource {
  /** Stable key used to join this source across different metric names. */
  id: string;
  adapter: string;
  role: MetricSourceRole;
  endpointUrl: string | null;
  nativeRole: string | null;
  workerId: string | null;
  dpRank: string | null;
  engine: string | null;
}

interface ServerMetricsAdapter {
  id: string;
  matches: (context: ServerMetricsContext) => boolean;
  identifySource: (series: RawMetricSourceSeries) => MetricSource;
}

function stableId(adapter: string, parts: (string | null | undefined)[]): string {
  return [adapter, ...parts.map((part) => part ?? '')].join('|');
}

const dynamoAdapter: ServerMetricsAdapter = {
  id: 'dynamo',
  matches: ({ framework }) => framework?.startsWith('dynamo-') ?? false,
  identifySource(series) {
    const labels = series.labels ?? {};
    const nativeRole = labels['dynamo_component'] ?? null;
    const role: MetricSourceRole =
      nativeRole === 'prefill'
        ? 'prefill'
        : nativeRole === 'backend'
          ? 'decode'
          : nativeRole === 'frontend' || nativeRole === 'router'
            ? 'router'
            : 'unknown';
    const endpointUrl = series.endpoint_url ?? labels['dynamo_endpoint'] ?? null;
    const workerId = labels['worker_id'] ?? null;
    return {
      // A source is one WORKER, not one engine inside it. `dp_rank` (sglang)
      // and `engine` (vllm) both name engines *within* a worker, so keying on
      // them split every worker into 4-5 identical-looking entries: a 6p1d run
      // listed 35 endpoints for 7 workers. The endpoint is only identity when
      // the worker is anonymous — otherwise one worker reachable on two URLs
      // would split again.
      id: stableId('dynamo', [role, workerId ?? endpointUrl]),
      adapter: 'dynamo',
      role,
      endpointUrl,
      nativeRole,
      workerId,
      // Null at worker granularity: this source spans every rank/engine the
      // worker owns, so naming one of them would be arbitrary. The per-engine
      // breakdown lives in the source's own `kvCacheUsageByEngine`.
      dpRank: null,
      engine: null,
    };
  },
};

const trtllmAdapter: ServerMetricsAdapter = {
  id: 'trtllm',
  matches: ({ framework }) => framework?.toLowerCase().includes('trt') ?? false,
  identifySource(series) {
    const labels = series.labels ?? {};
    const nativeRole = labels['disaggregation_mode'] ?? labels['dynamo_component'] ?? null;
    const role: MetricSourceRole =
      nativeRole === 'prefill'
        ? 'prefill'
        : nativeRole === 'decode' || nativeRole === 'backend'
          ? 'decode'
          : nativeRole === 'aggregated'
            ? 'combined'
            : 'unknown';
    const endpointUrl = series.endpoint_url ?? null;
    const workerId = labels['worker_id'] ?? null;
    return {
      // Native TRT metrics and Dynamo's rank-labelled gauges share one endpoint.
      id: stableId('trtllm', [role, endpointUrl ?? workerId]),
      adapter: 'trtllm',
      role,
      endpointUrl,
      nativeRole,
      workerId,
      dpRank: null,
      engine: null,
    };
  },
};

const genericAdapter: ServerMetricsAdapter = {
  id: 'generic',
  matches: () => true,
  identifySource(series) {
    const labels = series.labels ?? {};
    const endpointUrl = series.endpoint_url ?? null;
    const workerId = labels['worker_id'] ?? null;
    const dpRank = labels['dp_rank'] ?? null;
    const engine = labels['engine'] ?? labels['engine_idx'] ?? null;
    return {
      id: stableId('generic', [workerId ?? endpointUrl]),
      adapter: 'generic',
      role: endpointUrl || workerId || dpRank || engine ? 'unknown' : 'combined',
      endpointUrl,
      nativeRole: null,
      workerId,
      dpRank: null,
      engine: null,
    };
  },
};

const ADAPTERS: readonly ServerMetricsAdapter[] = [trtllmAdapter, dynamoAdapter, genericAdapter];

export function selectServerMetricsAdapter(context: ServerMetricsContext): ServerMetricsAdapter {
  return ADAPTERS.find((adapter) => adapter.matches(context)) ?? genericAdapter;
}
