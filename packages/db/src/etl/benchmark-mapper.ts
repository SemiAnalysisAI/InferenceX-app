/**
 * Benchmark row mapper: raw JSON dict → typed `BenchmarkParams`.
 * Handles both v1 (single tp/ep) and v2 (separate prefill/decode fields).
 */

import type { ConfigParams } from './config-cache';
import type { SkipTracker } from './skip-tracker';
import { PRECISION_KEYS } from '@semianalysisai/inferencex-constants';
import {
  resolveModelKey,
  hwToGpuKey,
  normalizeFramework,
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
]);

/**
 * Raw metric keys seen in production. Any numeric field outside this set and
 * `NON_METRIC_KEYS` is auto-captured but triggers a one-time process warning
 * so new schema fields don't go unnoticed.
 */
const KNOWN_METRIC_RAW_KEYS = new Set([
  'tput_per_gpu',
  'output_tput_per_gpu',
  'input_tput_per_gpu',
  'median_ttft',
  'mean_ttft',
  'p99_ttft',
  'std_ttft',
  'median_tpot',
  'mean_tpot',
  'p99_tpot',
  'std_tpot',
  'median_itl',
  'mean_itl',
  'p99_itl',
  'std_itl',
  'median_e2el',
  'mean_e2el',
  'p99_e2el',
  'std_e2el',
  'median_intvty',
  'mean_intvty',
  'p99_intvty',
  'std_intvty',
]);

// Deduplicate warnings: each unexpected key only prints once per process.
const _warnedMetricKeys = new Set<string>();

export interface BenchmarkParams {
  config: ConfigParams;
  isl: number;
  osl: number;
  conc: number;
  image: string | null;
  metrics: Record<string, number>;
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
  const precision = String(row.precision ?? '').toLowerCase();
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
    prefillTp = decodeTp = tp;
    prefillEp = decodeEp = ep;
    prefillDpAttn = decodeDpAttn = dpAttn;
    prefillNumWorkers = decodeNumWorkers = 0;
    numPrefillGpu = numDecodeGpu = tp * ep;
  }

  // Auto-capture all numeric fields not reserved for config/routing dimensions.
  // Fields in METRIC_RENAMES are stored under their canonical name; all others
  // use the raw key. Any key outside KNOWN_METRIC_RAW_KEYS triggers a one-time
  // warning so new schema additions don't go silently unnoticed.
  const metrics: Record<string, number> = {};
  for (const [rawKey, val] of Object.entries(row)) {
    if (NON_METRIC_KEYS.has(rawKey)) continue;
    const n = parseNum(val);
    if (n === undefined) continue;
    const storedKey = METRIC_RENAMES[rawKey] ?? rawKey;
    metrics[storedKey] = n;
    if (!KNOWN_METRIC_RAW_KEYS.has(rawKey) && !_warnedMetricKeys.has(rawKey)) {
      _warnedMetricKeys.add(rawKey);
      console.warn(
        `  [WARN] auto-captured unexpected metric '${rawKey}' — add to KNOWN_METRIC_RAW_KEYS or NON_METRIC_KEYS in benchmark-mapper.ts`,
      );
    }
  }

  // Artifact names encode '/' as '#' to avoid path separators; restore the URI.
  const image = row.image ? String(row.image).replace(/#/g, '/') : null;

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
  };
}
