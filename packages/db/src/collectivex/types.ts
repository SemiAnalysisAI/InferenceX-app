/**
 * CollectiveX neutral contract — the version-tagged shape shared by the sweep
 * artifacts' reader, the ingest script, and the dashboard frontend.
 *
 * This module is pure TypeScript (no Node/DB imports) so it is safe to import
 * from client components. UI-only types (chart points, axis modes, display
 * label helpers) live in `packages/app/src/components/collectivex/types.ts`.
 */

export type CollectiveXPhase = 'decode' | 'prefill';
export type CollectiveXPrecision = 'bf16' | 'fp8';
/** Kernel mode: throughput-oriented `normal`, or decode-only `low-latency`. */
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
  /**
   * Per-GPU bandwidth over the FULL logical payload (activation bytes plus any
   * FP8 scale bytes), i.e. `total_logical_bytes / ep_size / latency`. Distinct
   * from `activation_data_rate_gbps_at_latency_percentile`, which is aggregate
   * and excludes scale bytes. Null when the component carries no byte
   * provenance (e.g. an unavailable component).
   */
  payload_data_rate_gbps_at_latency_percentile: CollectiveXPercentiles | null;
  /**
   * Aggregate total logical payload bytes for this component at this point
   * (the numerator behind `payload_data_rate_*`). Carried raw so a consumer can
   * fit latency vs bytes across the ladder (bandwidth-vs-overhead decomposition)
   * without reconstructing bytes from a rate. Null when no byte provenance.
   */
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

/** kv-transfer latency percentiles (the suite reports ms, not us). */
export interface CollectiveXKvLatency {
  p50: number;
  p95: number;
  min: number;
  max: number;
  n: number;
}

/** One measured kv-transfer grid point (a burst of `batch` requests). */
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
  gbps_p50: number;
  verify_passed: boolean;
}

/**
 * One kv-transfer matrix case (2 nodes x 1 GPU: the per-worker prefill/decode
 * pair). Fabric is the case's declared lane (`rdma` | `mnnvl`); rows are empty
 * unless a successful shard measured the case.
 */
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
  /** kv-transfer case counts; absent on datasets read before the kv suite. */
  kv_requested_cases?: number;
  kv_measured_cases?: number;
}

export interface CollectiveXDataset {
  version: number;
  run: CollectiveXRun;
  coverage: CollectiveXCoverage[];
  series: CollectiveXSeries[];
  /** kv-transfer cases; absent on datasets captured before the kv suite. */
  kv?: CollectiveXKvCase[];
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
  /** kv-transfer case counts; absent on summaries stored before the kv suite. */
  kv_cases?: { requested: number; measured: number };
}
