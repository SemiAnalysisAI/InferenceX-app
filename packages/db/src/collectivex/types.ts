export type CollectiveXPhase = 'decode' | 'prefill';
export type CollectiveXPrecision = 'bf16' | 'fp8';
export type CollectiveXMode = 'normal' | 'low-latency';
export const COLLECTIVEX_VERSIONS = [1] as const;
export type CollectiveXVersion = (typeof COLLECTIVEX_VERSIONS)[number];
export const COLLECTIVEX_DEFAULT_VERSION: CollectiveXVersion = COLLECTIVEX_VERSIONS.at(-1)!;

export function parseCollectiveXVersion(raw: string): CollectiveXVersion | null {
  const version = Number(raw);
  return (COLLECTIVEX_VERSIONS as readonly number[]).includes(version)
    ? (version as CollectiveXVersion)
    : null;
}

export type CollectiveXOperation = 'dispatch' | 'stage' | 'combine' | 'roundtrip';
export type CollectiveXPercentile = 'p50' | 'p90' | 'p95' | 'p99';
export type CollectiveXOutcome =
  | 'success'
  | 'unsupported'
  | 'failed'
  | 'invalid'
  | 'diagnostic'
  | 'pending';
export type CollectiveXTerminalStatus = Exclude<CollectiveXOutcome, 'success'> | 'measured';

export type CollectiveXPercentiles = Record<CollectiveXPercentile, number>;

export interface CollectiveXComponent {
  latency_us: CollectiveXPercentiles;
  activation_data_rate_gbps_at_latency_percentile: CollectiveXPercentiles | null;
  payload_data_rate_gbps_at_latency_percentile: CollectiveXPercentiles | null;
  payload_bytes: number | null;
}

export interface CollectiveXPoint {
  tokens_per_rank: number;
  global_tokens: number;
  components: Record<CollectiveXOperation, CollectiveXComponent | null>;
  roundtrip_token_rate_at_latency_percentile: CollectiveXPercentiles;
}

export interface CollectiveXTopology {
  ep_size: number;
  nodes: number;
  gpus_per_node: number;
  scale_up_domain: number;
  scale_up_transport: string;
  scale_out_transport: string | null;
  topology_class: string;
}

export interface CollectiveXSeries {
  series_id: string;
  phase: CollectiveXPhase;
  mode: CollectiveXMode;
  precision: CollectiveXPrecision;
  backend: string;
  system: CollectiveXTopology & {
    sku: string;
    vendor: 'nvidia' | 'amd';
  };
  points: CollectiveXPoint[];
}

export interface CollectiveXCoveragePoint {
  tokens_per_rank: number;
  global_tokens: number;
  terminal_status: CollectiveXTerminalStatus;
  reason: string | null;
}

export interface CollectiveXCoverage {
  case_id: string;
  label: string;
  disposition: 'runnable' | 'unsupported';
  sku: string;
  backend: string;
  phase: CollectiveXPhase;
  mode: CollectiveXMode;
  precision: CollectiveXPrecision;
  topology: CollectiveXTopology;
  points: CollectiveXCoveragePoint[];
  outcome: CollectiveXOutcome;
  reason: string | null;
  detail: string | null;
}

export interface CollectiveXKvLatency {
  p50: number;
  p95: number;
  min: number;
  max: number;
  n: number;
}

export interface CollectiveXKvRow {
  kind: 'paged' | 'bulk';
  isl: number;
  page_tokens: number | null;
  batch: number;
  op: 'pull' | 'push';
  descs: number;
  req_bytes: number;
  prep_ms: number;
  latency_ms: CollectiveXKvLatency;
  request_ms?: CollectiveXKvLatency;
  gbps_p50: number;
  gbps_p50_incl_prep?: number;
  verify_passed: boolean;
}

export interface CollectiveXKvCase {
  case_id: string;
  label: string;
  disposition: 'runnable' | 'unsupported';
  sku: string;
  vendor: 'nvidia' | 'amd' | null;
  backend: string;
  fabric: string;
  workload: string;
  precision: CollectiveXPrecision;
  topology: CollectiveXTopology;
  outcome: CollectiveXOutcome;
  reason: string | null;
  detail: string | null;
  rows: CollectiveXKvRow[];
}

export interface CollectiveXSwapPoint {
  direction: 'h2d' | 'd2h' | 'd2d';
  layout: 'contiguous' | 'random';
  block_bytes: number;
  num_blocks: number;
  payload_bytes: number;
  seed: number;
  host_memory: string;
  api: string;
  sample_count: number;
  latency_us: CollectiveXPercentiles;
  payload_gbps_at_latency_percentile: CollectiveXPercentiles;
}

export interface CollectiveXSwapResult {
  result_id: string;
  sku: string;
  runtime: {
    device: string;
    torch: string;
    vllm: string;
    cuda: string | null;
    hip: string | null;
    image: string;
    source_sha: string;
  };
  timing: string;
  warmup: number;
  iterations: number;
  max_payload_bytes: number | null;
  skipped_points: number;
  points: CollectiveXSwapPoint[];
}

export interface CollectiveXRun {
  run_id: string;
  run_attempt: number;
  generated_at: string;
  conclusion: string | null;
  source_sha: string;
  requested_cases: number;
  terminal_cases: number;
  measured_cases: number;
  unsupported_cases: number;
  failed_cases: number;
  requested_points: number;
  terminal_points: number;
  measured_points: number;
  covered_skus: string[];
  swap_requested_cases?: number;
  swap_measured_cases?: number;
  kv_requested_cases?: number;
  kv_measured_cases?: number;
}

export interface CollectiveXDataset {
  version: number;
  run: CollectiveXRun;
  coverage: CollectiveXCoverage[];
  series: CollectiveXSeries[];
  kv?: CollectiveXKvCase[];
  swap_blocks?: CollectiveXSwapResult[];
}

export interface CollectiveXRunSummary {
  run_id: string;
  run_attempt: number;
  generated_at: string;
  conclusion: string | null;
  covered_skus: string[];
  requested_cases: number;
  measured_cases: number;
  requested_points: number;
  terminal_points: number;
  terminal_counts: { measured: number; unsupported: number; failed: number };
  kv_cases?: { requested: number; measured: number };
  swap_cases?: { requested: number; measured: number };
}
