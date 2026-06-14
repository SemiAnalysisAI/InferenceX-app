/**
 * Benchmark row mapper: raw JSON dict → typed `BenchmarkParams`.
 * Handles both v1 (single tp/ep) and v2 (separate prefill/decode fields).
 */

import type { ConfigParams } from './config-cache';
import type { SkipTracker } from './skip-tracker';
import { METRIC_KEYS, PRECISION_KEYS } from '@semianalysisai/inferencex-constants';
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

/**
 * Raw artifact field names that are renamed when stored as metrics.
 * All other numeric fields not in `NON_METRIC_KEYS` are stored under their raw name.
 */
const METRIC_RENAMES: Record<string, string> = {};

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
  // per-worker measured-power array (not a numeric scalar). Surfaced as a
  // sibling of the metrics JSONB by mapBenchmarkRow so the metrics column
  // stays Record<string, number> for the index signature on BenchmarkRow.
  'workers',
]);

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
  isl: number;
  osl: number;
  conc: number;
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
 * Supports two artifact schemas:
 * - **v1** (pre-2025-12-19): single `tp`/`ep` for both prefill and decode.
 * - **v2** (2025-12-19+): separate `prefill_tp`/`decode_tp` etc. for disaggregated configs.
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

  const isl = parseInt2(row.isl) ?? islOslFallback?.isl;
  const osl = parseInt2(row.osl) ?? islOslFallback?.osl;
  const conc = parseInt2(row.conc);
  if (!isl || !osl || !conc) {
    tracker.skips.noIslOsl++;
    return null;
  }

  const { framework, disagg } = normalizeFramework(String(row.framework ?? ''), row.disagg);
  const isMultinode = parseBool(row.is_multinode);
  const precision = normalizePrecision(String(row.precision ?? ''));
  if (!PRECISION_KEYS.has(precision)) {
    tracker.unmappedPrecisions.add(precision);
  }
  const specMethod = normalizeSpecMethod(row.spec_decoding);

  let prefillTp: number, prefillEp: number, prefillDpAttn: boolean, prefillNumWorkers: number;
  let decodeTp: number, decodeEp: number, decodeDpAttn: boolean, decodeNumWorkers: number;
  let numPrefillGpu: number, numDecodeGpu: number;

  if ('prefill_tp' in row) {
    // v2 schema: full disagg parallelism fields
    prefillTp = parseInt2(row.prefill_tp) ?? 1;
    prefillEp = parseInt2(row.prefill_ep) ?? 1;
    prefillDpAttn = parseBool(row.prefill_dp_attention);
    prefillNumWorkers = parseInt2(row.prefill_num_workers) ?? 0;
    decodeTp = parseInt2(row.decode_tp) ?? 1;
    decodeEp = parseInt2(row.decode_ep) ?? 1;
    decodeDpAttn = parseBool(row.decode_dp_attention);
    decodeNumWorkers = parseInt2(row.decode_num_workers) ?? 0;
    numPrefillGpu = parseInt2(row.num_prefill_gpu) ?? prefillTp * prefillEp;
    numDecodeGpu = parseInt2(row.num_decode_gpu) ?? decodeTp * decodeEp;
  } else {
    // v1 schema: single tp/ep, prefill = decode
    const tp = parseInt2(row.tp) ?? 1;
    const ep = parseInt2(row.ep) ?? 1;
    const dpAttn = parseBool(row.dp_attention);
    prefillTp = tp;
    decodeTp = tp;
    prefillEp = ep;
    decodeEp = ep;
    prefillDpAttn = dpAttn;
    decodeDpAttn = dpAttn;
    prefillNumWorkers = 0;
    decodeNumWorkers = 0;
    numPrefillGpu = tp * ep;
    numDecodeGpu = tp * ep;
  }

  // Auto-capture all numeric fields not reserved for config/routing dimensions.
  // Fields in METRIC_RENAMES are stored under their canonical name; all others
  // use the raw key. Any key outside METRIC_KEYS triggers a one-time
  // warning so new schema additions don't go silently unnoticed.
  const metrics: Record<string, number> = {};
  for (const [rawKey, val] of Object.entries(row)) {
    if (NON_METRIC_KEYS.has(rawKey)) continue;
    const n = parseNum(val);
    if (n === undefined) continue;
    const storedKey = METRIC_RENAMES[rawKey] ?? rawKey;
    metrics[storedKey] = n;
    if (!METRIC_KEYS.has(rawKey) && !_warnedMetricKeys.has(rawKey)) {
      _warnedMetricKeys.add(rawKey);
      console.warn(
        `  [WARN] auto-captured unexpected metric '${rawKey}' — add to METRIC_KEYS in constants/src/metric-keys.ts or NON_METRIC_KEYS in benchmark-mapper.ts`,
      );
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
      prefillTp,
      prefillEp,
      prefillDpAttn,
      prefillNumWorkers,
      decodeTp,
      decodeEp,
      decodeDpAttn,
      decodeNumWorkers,
      numPrefillGpu,
      numDecodeGpu,
    },
    isl,
    osl,
    conc,
    image,
    metrics,
    workers,
  };
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
