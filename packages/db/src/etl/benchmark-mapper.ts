/**
 * Benchmark row mapper: raw JSON dict → typed `BenchmarkParams`.
 * Handles v1 (single tp/ep), v2 (separate prefill/decode fields), and v3
 * (nested agentic containers, flattened via {@link flattenAgenticAggRow}).
 */

import type { ConfigParams } from './config-cache';
import type { SkipTracker } from './skip-tracker';
import { METRIC_KEYS, PRECISION_KEYS } from '@semianalysisai/inferencex-constants';
import { flattenAgenticAggRow } from './agentic-v3-flatten';
import {
  resolveModelKey,
  hwToGpuKey,
  normalizeFramework,
  normalizePrecision,
  normalizeSpecMethod,
  parseBool,
  parseNum,
  parseInt2,
} from './normalizers';
import { extractRuntimeMetadata } from './runtime-metadata';

export { flattenAgenticAggRow };

/**
 * Raw artifact fields that are config/routing dimensions, not metrics.
 * These are excluded from the metrics JSONB column entirely.
 */
const NON_METRIC_KEYS = new Set([
  // identity
  'hw',
  'model',
  'framework',
  'precision',
  'infmax_model_prefix',
  // routing
  'isl',
  'osl',
  'conc',
  'image',
  'disagg',
  'is_multinode',
  'spec_decoding',
  // v1 parallelism
  'tp',
  'ep',
  'dp_attention',
  // v2 parallelism
  'prefill_tp',
  'prefill_ep',
  'prefill_dp_attention',
  'prefill_num_workers',
  'decode_tp',
  'decode_ep',
  'decode_dp_attention',
  'decode_num_workers',
  'num_prefill_gpu',
  'num_decode_gpu',
  // agentic scenario
  'scenario_type',
  'users',
  'offload_mode',
  'num_requests_total',
  'num_requests_successful',
  // v3 agentic KV-offload descriptors ('none'|'dram'|… + backend name). Mapped
  // to offloadMode / stringified metrics explicitly in mapBenchmarkRow.
  'kv_offloading',
  'kv_offload_backend',
  'kv_p2p_transfer',
  'router',
  // v3 agentic nested containers — flattened by flattenAgenticAggRow before
  // the auto-capture loop runs; the raw objects themselves are not metrics.
  'request_metrics',
  'server_metrics',
  // Public-dataset provenance emitted by aiperf. The ingest runner uses this
  // object to populate run_datasets; it is not a benchmark metric.
  'dataset',
  // per-worker measured-power array (not a numeric scalar). Surfaced as a
  // sibling of the metrics JSONB by mapBenchmarkRow so the metrics column
  // stays Record<string, number> for the index signature on BenchmarkRow.
  'workers',
]);

/**
 * `benchmark_type` values understood by the ingest.
 * - `single_turn`    — fixed sequence-length runs (isl/osl set).
 * - `agentic_traces` — trace-replay agentic runs (isl/osl null, `users` → conc).
 */
export type BenchmarkType = 'single_turn' | 'agentic_traces';

/** Reduce an offload descriptor ('none'|'dram'|…) to the binary on/off. */
function descriptorToOnOff(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? (v === 'none' ? 'off' : 'on') : null;
}

/**
 * METRIC_KEYS from constants is the canonical set of known metric keys.
 * Any numeric field outside this set and `NON_METRIC_KEYS` is auto-captured
 * but triggers a one-time process warning so new schema fields don't go unnoticed.
 */

// Deduplicate warnings: each unexpected key only prints once per process.
const _warnedMetricKeys = new Set<string>();

/**
 * One per-worker entry from aggregate_power.py's `workers` array.
 * Fields after `avg_power_w` are optional because the perfmon CSVs may not
 * include the corresponding sample columns on every run.
 */
export interface WorkerPower {
  role: string;
  worker_idx: number;
  hosts?: string[];
  num_gpus: number;
  avg_power_w: number;
  avg_temp_c?: number;
  peak_temp_c?: number;
  avg_util_pct?: number;
  avg_mem_used_mb?: number;
}

export interface BenchmarkParams {
  config: ConfigParams;
  benchmarkType: BenchmarkType;
  // Null for agentic_traces; present for single_turn.
  isl: number | null;
  osl: number | null;
  conc: number;
  /** 'on' | 'off' — KV cache offload to CPU. Defaults to 'off'. */
  offloadMode: string;
  image: string | null;
  metrics: Record<string, number>;
  /**
   * Per-worker measured-power breakdown emitted by the runner's
   * aggregate_power.py on multinode / disagg runs. Stored on
   * benchmark_results in a dedicated JSONB column (added in migration 006)
   * rather than inside `metrics` so the metrics index signature can stay
   * `Record<string, number>`. Undefined for single-node runs and any run
   * predating the multinode patch.
   */
  workers?: WorkerPower[];
}

/**
 * Map a raw benchmark result dict to typed `BenchmarkParams`.
 *
 * Supports three artifact schemas:
 * - **v1** (pre-2025-12-19): single `tp`/`ep` for both prefill and decode.
 * - **v2** (2025-12-19+): separate `prefill_tp`/`decode_tp` etc. for disaggregated configs.
 * - **v3** (2026-07-02+, agentic only): nested `request_metrics`/`server_metrics`
 *   containers, flattened to the v2 flat schema up front by `flattenAgenticAggRow`.
 *
 * When mapping fails (unknown model, unknown hardware, or missing ISL/OSL/conc),
 * the appropriate skip counter on `tracker` is incremented and `null` is returned.
 *
 * @param row - Raw benchmark dict from the artifact JSON.
 * @param tracker - Shared skip tracker; counters are mutated in place on failure.
 * @param islOslFallback - Optional ISL/OSL to use when the row itself omits them
 *   (e.g. old-format ZIPs where sequence lengths are encoded in the filename).
 * @returns A fully typed `BenchmarkParams` object, or `null` if the row cannot be mapped.
 */
export function mapBenchmarkRow(
  row: Record<string, any>,
  tracker: SkipTracker,
  islOslFallback?: { isl: number; osl: number } | null,
): BenchmarkParams | null {
  // v3 agentic rows nest their metrics; flatten to the canonical flat schema
  // first so the rest of the mapper (auto-capture, intvty invariant, guards)
  // is version-agnostic. No-op for v1/v2 rows.
  row = flattenAgenticAggRow(row);

  const modelKey = resolveModelKey(row);
  if (!modelKey) {
    tracker.skips.unmappedModel++;
    const raw = String(row.infmax_model_prefix ?? row.model ?? '');
    if (raw) tracker.unmappedModels.add(raw);
    return null;
  }

  const gpuKey = hwToGpuKey(String(row.hw ?? ''));
  if (!gpuKey) {
    tracker.skips.unmappedHw++;
    const raw = String(row.hw ?? '');
    if (raw) tracker.unmappedHws.add(raw);
    return null;
  }

  // Agentic-trace runs emit `scenario_type: 'agentic-coding'` (and variants),
  // no isl/osl, and `users` instead of `conc`. Everything else stays as-is.
  const isAgentic = String(row.scenario_type ?? '').startsWith('agentic');
  const benchmarkType: BenchmarkType = isAgentic ? 'agentic_traces' : 'single_turn';

  const isl = isAgentic ? null : (parseInt2(row.isl) ?? islOslFallback?.isl ?? null);
  const osl = isAgentic ? null : (parseInt2(row.osl) ?? islOslFallback?.osl ?? null);
  // Agentic artifacts encode concurrency as `users` in older schemas and `conc` in newer ones.
  const conc = isAgentic ? (parseInt2(row.users) ?? parseInt2(row.conc)) : parseInt2(row.conc);
  if (!conc || (!isAgentic && (!isl || !osl))) {
    tracker.skips.noIslOsl++;
    return null;
  }

  // Failed-run guard: aggregated artifacts (`results_bmk`) merge rows from
  // every runner, including failed ones with 0 successful requests and null
  // metrics — both the "issued requests but none succeeded" case (total > 0)
  // and the "server never came up" case (total === 0). Without this skip the
  // empty row lands as a dataless point, or overwrites a good row via
  // ON CONFLICT DO UPDATE when both share the same (config, conc, offload).
  if (
    typeof row.num_requests_successful === 'number' &&
    row.num_requests_successful === 0 &&
    typeof row.num_requests_total === 'number'
  ) {
    tracker.skips.failedRun++;
    return null;
  }

  // Agentic offload signal: prefer `offload_mode` ('on'|'off'), then the v3
  // `kv_offloading` descriptor ('none'|'dram'|…), then legacy `offloading`.
  // Descriptors reduce to the binary on/off used for row identity ('none' →
  // 'off', anything else → 'on') so v3 offload points keep colliding-key parity
  // with their v2 predecessors instead of forking a third offload_mode value.
  const offloadModeRaw =
    typeof row.offload_mode === 'string' && row.offload_mode.length > 0
      ? row.offload_mode
      : (descriptorToOnOff(row.kv_offloading) ?? descriptorToOnOff(row.offloading) ?? 'off');

  const { framework, disagg } = normalizeFramework(String(row.framework ?? ''), row.disagg);
  const isMultinode = parseBool(row.is_multinode);
  const precision = normalizePrecision(String(row.precision ?? ''));
  if (!PRECISION_KEYS.has(precision)) {
    tracker.unmappedPrecisions.add(precision);
  }
  const specMethod = normalizeSpecMethod(row.spec_decoding);

  const parallelism = resolveParallelism(row);
  const metrics = captureNumericMetrics(row);

  // Agentic rows emit `offload_mode: "on" | "off"` (or older `offloading: "none"|...`)
  // — preserve as a stringified metric for legacy readers. Runtime cache
  // descriptors are kept for every benchmark type so fixed-sequence multinode
  // rows can expose their P2P transfer engine alongside agentic offload details.
  if (isAgentic) {
    (metrics as Record<string, unknown>).offload_mode = offloadModeRaw;
  }
  Object.assign(metrics, extractRuntimeMetadata(row));

  // Slow-tail interactivity invariant. Agentic artifacts ship `*_intvty`, but the
  // definition has drifted across harness versions: some emit `1/p(ITL)`
  // (slow-tail), others `p(1/ITL)` — which inverts percentile order, so p90 comes
  // out as ~1/p10(ITL) instead. The inference chart's interactivity selector and
  // the detail time-series both treat interactivity as the reciprocal of the ITL
  // percentile, so we derive it from `*_itl` here rather than trust the artifact,
  // keeping every agentic row on one definition. `std` is excluded — the
  // reciprocal of a standard deviation is meaningless. Mirrored in the frontend
  // overlay path (agenticAliases).
  //
  // When `*_itl` is absent/zero/invalid we must DELETE any artifact-supplied
  // `*_intvty` rather than let it survive: keeping it would mix the harness's
  // (possibly `p(1/ITL)`) definition into a column that's meant to be `1/p(ITL)`
  // everywhere else. Downstream reads a missing key as "not recorded"
  // (rowToAggDataEntry coerces `?? 0`; the legend table renders a dash).
  if (isAgentic) {
    for (const k of ['mean', 'median', 'p75', 'p90', 'p95', 'p99', 'p99.9']) {
      const itl = metrics[`${k}_itl`];
      if (typeof itl === 'number' && itl > 0) {
        metrics[`${k}_intvty`] = 1 / itl;
      } else {
        delete metrics[`${k}_intvty`];
      }
    }
  }

  // Artifact names encode '/' as '#' to avoid path separators; restore the URI.
  const image = row.image ? String(row.image).replaceAll('#', '/') : null;

  // Per-worker measured-power breakdown. The runner emits this as an array
  // of objects sibling to the scalar metrics; we surface it on a dedicated
  // BenchmarkParams.workers field so downstream consumers can treat it as
  // structured data without polluting the flat metrics record. Defensive
  // narrowing — anything other than a non-empty array of objects is dropped.
  const workers = extractWorkers(row.workers);

  return {
    config: {
      hardware: gpuKey,
      framework,
      model: modelKey,
      precision,
      specMethod,
      disagg,
      isMultinode,
      ...parallelism,
    },
    benchmarkType,
    isl,
    osl,
    conc,
    offloadMode: offloadModeRaw,
    image,
    metrics,
    workers,
  };
}

/** The parallelism slice of `ConfigParams`, resolved from either artifact schema. */
type ParallelismParams = Pick<
  ConfigParams,
  | 'prefillTp'
  | 'prefillEp'
  | 'prefillDpAttn'
  | 'prefillNumWorkers'
  | 'decodeTp'
  | 'decodeEp'
  | 'decodeDpAttn'
  | 'decodeNumWorkers'
  | 'numPrefillGpu'
  | 'numDecodeGpu'
>;

/**
 * Resolve prefill/decode parallelism from a raw row. v2 rows (2025-12-19+)
 * carry full disagg fields keyed by the presence of `prefill_tp`; v1 rows have
 * a single `tp`/`ep` that applies to both phases.
 */
function resolveParallelism(row: Record<string, any>): ParallelismParams {
  if ('prefill_tp' in row) {
    // v2 schema: full disagg parallelism fields
    const prefillTp = parseInt2(row.prefill_tp) ?? 1;
    const prefillEp = parseInt2(row.prefill_ep) ?? 1;
    const decodeTp = parseInt2(row.decode_tp) ?? 1;
    const decodeEp = parseInt2(row.decode_ep) ?? 1;
    return {
      prefillTp,
      prefillEp,
      prefillDpAttn: parseBool(row.prefill_dp_attention),
      prefillNumWorkers: parseInt2(row.prefill_num_workers) ?? 0,
      decodeTp,
      decodeEp,
      decodeDpAttn: parseBool(row.decode_dp_attention),
      decodeNumWorkers: parseInt2(row.decode_num_workers) ?? 0,
      numPrefillGpu: parseInt2(row.num_prefill_gpu) ?? prefillTp * prefillEp,
      numDecodeGpu: parseInt2(row.num_decode_gpu) ?? decodeTp * decodeEp,
    };
  }
  // v1 schema: single tp/ep, prefill = decode
  const tp = parseInt2(row.tp) ?? 1;
  const ep = parseInt2(row.ep) ?? 1;
  const dpAttn = parseBool(row.dp_attention);
  return {
    prefillTp: tp,
    prefillEp: ep,
    prefillDpAttn: dpAttn,
    prefillNumWorkers: 0,
    decodeTp: tp,
    decodeEp: ep,
    decodeDpAttn: dpAttn,
    decodeNumWorkers: 0,
    numPrefillGpu: tp * ep,
    numDecodeGpu: tp * ep,
  };
}

/**
 * Auto-capture all numeric fields not reserved for config/routing dimensions,
 * stored under their raw key. Any key outside METRIC_KEYS triggers a one-time
 * warning so new schema additions don't go silently unnoticed.
 */
function captureNumericMetrics(row: Record<string, any>): Record<string, number> {
  const metrics: Record<string, number> = {};
  for (const [rawKey, val] of Object.entries(row)) {
    if (NON_METRIC_KEYS.has(rawKey)) continue;
    const n = parseNum(val);
    if (n === undefined) continue;
    metrics[rawKey] = n;
    if (!METRIC_KEYS.has(rawKey) && !_warnedMetricKeys.has(rawKey)) {
      _warnedMetricKeys.add(rawKey);
      console.warn(
        `  [WARN] auto-captured unexpected metric '${rawKey}' — add to METRIC_KEYS in constants/src/metric-keys.ts or NON_METRIC_KEYS in benchmark-mapper.ts`,
      );
    }
  }
  return metrics;
}

/**
 * Narrow a raw `workers` value from the artifact JSON to `WorkerPower[]` or
 * undefined. Each entry must have a string `role`, a numeric `worker_idx`,
 * `num_gpus`, and `avg_power_w` to be kept; anything else is dropped. Optional
 * telemetry scalars (`avg_temp_c`, `peak_temp_c`, `avg_util_pct`,
 * `avg_mem_used_mb`) and the `hosts[]` list are preserved when present and
 * well-typed, ignored otherwise. Returns undefined for any non-array input or
 * an empty array so the eventual JSONB column stores null rather than `[]`.
 */
export function extractWorkers(raw: unknown): WorkerPower[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: WorkerPower[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const role = typeof e.role === 'string' ? e.role : null;
    const worker_idx = parseInt2(e.worker_idx);
    const num_gpus = parseInt2(e.num_gpus);
    const avg_power_w = parseNum(e.avg_power_w);
    if (
      role === null ||
      worker_idx === undefined ||
      num_gpus === undefined ||
      avg_power_w === undefined
    )
      continue;

    const w: WorkerPower = { role, worker_idx, num_gpus, avg_power_w };
    if (Array.isArray(e.hosts) && e.hosts.every((h) => typeof h === 'string')) {
      w.hosts = e.hosts as string[];
    }
    const avg_temp_c = parseNum(e.avg_temp_c);
    if (avg_temp_c !== undefined) w.avg_temp_c = avg_temp_c;
    const peak_temp_c = parseNum(e.peak_temp_c);
    if (peak_temp_c !== undefined) w.peak_temp_c = peak_temp_c;
    const avg_util_pct = parseNum(e.avg_util_pct);
    if (avg_util_pct !== undefined) w.avg_util_pct = avg_util_pct;
    const avg_mem_used_mb = parseNum(e.avg_mem_used_mb);
    if (avg_mem_used_mb !== undefined) w.avg_mem_used_mb = avg_mem_used_mb;
    out.push(w);
  }
  return out.length > 0 ? out : undefined;
}
