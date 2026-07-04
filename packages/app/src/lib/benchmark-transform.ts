/**
 * Transforms raw BenchmarkRow[] from the API into InferenceData[] for charts.
 */

import { DB_MODEL_TO_DISPLAY } from '@semianalysisai/inferencex-constants';

import chartDefinitions from '@/components/inference/inference-chart-config.json';
import type {
  AggDataEntry,
  ChartDefinition,
  HardwareConfig,
  InferenceData,
} from '@/components/inference/types';
import { createChartDataPoint, getHardwareKey } from '@/lib/chart-utils';
import { getHardwareConfig } from '@/lib/constants';
import { isPersistedBenchmarkId } from '@/lib/benchmark-id';
import type { BenchmarkRow } from '@/lib/api';

/**
 * Agentic trace-replay runs (`benchmark_type === 'agentic_traces'`) emit ttft/ttlt/itl
 * but not the intvty/e2el/tpot keys the chart pipeline expects. Bridge them here:
 *   e2el   ≡ ttlt   (time-to-last-token == end-to-end latency)
 *   tpot   ≡ itl    (time-per-output-token == inter-token-latency for single-output)
 *   intvty ≡ 1/itl  (tok/s from the user's perspective)
 *
 * e2el/tpot only fill gaps (existing fields win). `intvty` is ALWAYS 1/itl:
 * derived where itl is valid, overriding any artifact-supplied value, AND any
 * artifact `*_intvty` is DROPPED where itl is absent/zero/invalid rather than
 * passed through. The harness definition of `*_intvty` has drifted (some versions
 * emit `p(1/ITL)`, which inverts percentile order), so for a slow-tail selector
 * interactivity must be `1/p(ITL)`. This matches the ingest mapper for official
 * rows; doing it here keeps overlay / `?unofficialrun=` rows (transformed live
 * from raw artifacts, never through the DB) on the same single definition.
 */
function applyAgenticMetricAliases(raw: Record<string, number>): Record<string, number> {
  const m: Record<string, number> = { ...raw };
  for (const suffix of ['mean', 'median', 'p75', 'p90', 'p95', 'p99', 'p99.9']) {
    const itl = raw[`${suffix}_itl`];
    const ttlt = raw[`${suffix}_ttlt`];
    if (m[`${suffix}_e2el`] === undefined && ttlt !== undefined) m[`${suffix}_e2el`] = ttlt;
    if (m[`${suffix}_tpot`] === undefined && itl !== undefined) m[`${suffix}_tpot`] = itl;
    if (typeof itl === 'number' && itl > 0) m[`${suffix}_intvty`] = 1 / itl;
    else delete m[`${suffix}_intvty`];
  }
  return m;
}

/** Convert a DB benchmark row to an AggDataEntry. */
export function rowToAggDataEntry(row: BenchmarkRow): AggDataEntry {
  const isAgentic = row.benchmark_type === 'agentic_traces';
  const m = isAgentic ? applyAgenticMetricAliases(row.metrics) : row.metrics;
  // Prefer the dedicated column (added in migration 004); fall back to the
  // legacy stash inside `metrics` for any rows ingested before that column
  // existed.
  const rawMetrics = row.metrics as Record<string, unknown>;
  const offloadMode =
    row.offload_mode ??
    (typeof rawMetrics.offload_mode === 'string' ? rawMetrics.offload_mode : undefined);
  // Postgres bigint comes through the SQL client as a string; coerce it. Overlay
  // rows (transformed live from raw artifacts) carry no id, so `Number(undefined)`
  // is NaN — collapse any non-persisted value to undefined so downstream link /
  // fetch sites (guarded by isPersistedBenchmarkId) skip it cleanly rather than
  // emitting `?ids=NaN` or an `/inference/agentic/NaN` link.
  const numericId = typeof row.id === 'number' ? row.id : Number(row.id);
  return {
    id: isPersistedBenchmarkId(numericId) ? numericId : undefined,
    hw: row.hardware,
    framework: row.framework,
    model: DB_MODEL_TO_DISPLAY[row.model] ?? row.model,
    precision: row.precision,
    hwKey: '',
    tp: row.decode_tp,
    conc: row.conc,
    tput_per_gpu: m.tput_per_gpu ?? 0,
    output_tput_per_gpu: m.output_tput_per_gpu ?? 0,
    input_tput_per_gpu: m.input_tput_per_gpu ?? 0,
    mean_ttft: m.mean_ttft ?? 0,
    median_ttft: m.median_ttft ?? 0,
    std_ttft: m.std_ttft ?? 0,
    p75_ttft: m.p75_ttft ?? 0,
    p90_ttft: m.p90_ttft ?? 0,
    p95_ttft: m.p95_ttft ?? 0,
    p99_ttft: m.p99_ttft ?? 0,
    'p99.9_ttft': m['p99.9_ttft'] ?? 0,
    mean_tpot: m.mean_tpot ?? 0,
    median_tpot: m.median_tpot ?? 0,
    std_tpot: m.std_tpot ?? 0,
    p75_tpot: m.p75_tpot ?? 0,
    p90_tpot: m.p90_tpot ?? 0,
    p95_tpot: m.p95_tpot ?? 0,
    p99_tpot: m.p99_tpot ?? 0,
    'p99.9_tpot': m['p99.9_tpot'] ?? 0,
    mean_intvty: m.mean_intvty ?? 0,
    median_intvty: m.median_intvty ?? 0,
    std_intvty: m.std_intvty ?? 0,
    p75_intvty: m.p75_intvty ?? 0,
    p90_intvty: m.p90_intvty ?? 0,
    p95_intvty: m.p95_intvty ?? 0,
    p99_intvty: m.p99_intvty ?? 0,
    'p99.9_intvty': m['p99.9_intvty'] ?? 0,
    mean_itl: m.mean_itl ?? 0,
    median_itl: m.median_itl ?? 0,
    std_itl: m.std_itl ?? 0,
    p75_itl: m.p75_itl ?? 0,
    p90_itl: m.p90_itl ?? 0,
    p95_itl: m.p95_itl ?? 0,
    p99_itl: m.p99_itl ?? 0,
    'p99.9_itl': m['p99.9_itl'] ?? 0,
    mean_e2el: m.mean_e2el ?? 0,
    median_e2el: m.median_e2el ?? 0,
    std_e2el: m.std_e2el ?? 0,
    p75_e2el: m.p75_e2el ?? 0,
    p90_e2el: m.p90_e2el ?? 0,
    p95_e2el: m.p95_e2el ?? 0,
    p99_e2el: m.p99_e2el ?? 0,
    'p99.9_e2el': m['p99.9_e2el'] ?? 0,
    // Measured GPU telemetry (runner's aggregate_power.py). Left undefined for
    // rows predating the field so downstream chart code can distinguish
    // "no measurement" from "0 W" via createChartDataPoint's typeof guard.
    avg_power_w: m.avg_power_w,
    joules_per_output_token: m.joules_per_output_token,
    joules_per_total_token: m.joules_per_total_token,
    // Multinode / disagg-only role splits — same undefined-for-legacy pattern.
    // (disagg's decode-only J/output is carried by joules_per_output_token above,
    // which the runner overrides to the per-stage value — no separate _decode key.)
    prefill_avg_power_w: m.prefill_avg_power_w,
    decode_avg_power_w: m.decode_avg_power_w,
    joules_per_input_token: m.joules_per_input_token,
    // Cluster-wide GPU telemetry beyond power. Emitted when the perfmon CSVs
    // include the corresponding sample columns; left undefined otherwise so
    // the chart layer can distinguish "no measurement" from a real zero.
    avg_temp_c: m.avg_temp_c,
    peak_temp_c: m.peak_temp_c,
    avg_util_pct: m.avg_util_pct,
    avg_mem_used_mb: m.avg_mem_used_mb,
    // Per-worker measured power. Surfaced on BenchmarkRow as a sibling of the
    // scalar `metrics` dict (see api.ts). Narrow defensively so a malformed
    // payload can't poison downstream consumers.
    workers: Array.isArray(row.workers) ? row.workers : undefined,
    disagg: row.disagg,
    num_prefill_gpu: row.num_prefill_gpu,
    num_decode_gpu: row.num_decode_gpu,
    spec_decoding: row.spec_method,
    ep: row.decode_ep,
    dp_attention: row.decode_dp_attention,
    is_multinode: row.is_multinode,
    prefill_tp: row.prefill_tp,
    prefill_ep: row.prefill_ep,
    prefill_dp_attention: row.prefill_dp_attention,
    prefill_num_workers: row.prefill_num_workers,
    decode_tp: row.decode_tp,
    decode_ep: row.decode_ep,
    decode_dp_attention: row.decode_dp_attention,
    decode_num_workers: row.decode_num_workers,
    image: row.image ?? undefined,
    date: row.date,
    actualDate: (row as any).actualDate ?? row.date,
    run_url: row.run_url ?? undefined,
    benchmark_type: row.benchmark_type,
    isl: row.isl,
    osl: row.osl,
    offload_mode: offloadMode,
    server_gpu_cache_hit_rate: m.server_gpu_cache_hit_rate,
    server_cpu_cache_hit_rate: m.server_cpu_cache_hit_rate,
    theoretical_cache_hit_rate: m.theoretical_cache_hit_rate,
    num_requests_total: m.num_requests_total,
    num_requests_successful: m.num_requests_successful,
    total_prompt_tokens: m.total_prompt_tokens,
    total_generation_tokens: m.total_generation_tokens,
  };
}

interface PreparedEntry {
  entry: AggDataEntry;
  hwKey: string;
  date: string;
}

/**
 * Rewrite a chart x-axis key to use a different latency percentile prefix
 * (`median_` → `p99_` etc). Only touches keys that start with a known
 * percentile prefix; leaves everything else alone.
 */
export function withPercentile(key: string, percentile: string): string {
  return key.replace(/^(?:mean|median|p75|p90|p95|p99|p99\.9)_/u, `${percentile}_`);
}

// Replacement granularity for single-run scoping: the changelog config_key
// tuple (model-precision-hardware-framework) plus benchmark_type AND offload_mode.
// benchmark_type keeps an agentic-only run from hiding the same config's
// fixed-seq carry-forward; offload_mode keeps a run that produced only one
// offload variant (e.g. offload=on) from claiming — and thereby suppressing —
// the other variant's (offload=off) base rows, which are a distinct series.
const runScopeKey = (r: BenchmarkRow): string =>
  `${r.model}|${r.precision}|${r.hardware}|${r.framework}|${r.benchmark_type}|${r.offload_mode ?? 'off'}`;

/**
 * Merge run-scoped benchmark rows with the normal latest-per-config rows.
 *
 * When the user picks a specific workflow run (to disambiguate two same-day
 * sweeps of the same config), only the configs that run actually produced
 * should be pinned to it — every other config must keep its normal
 * carry-forward rows. Scoping the whole chart to the run (the old behavior)
 * silently hid complementary configs that happened to land on the same date,
 * e.g. selecting one of two same-day vLLM runs made the day's SGLang curve
 * vanish because it lived in a different workflow run.
 *
 * Run rows win for every (model, precision, hardware, framework,
 * benchmark_type) group they cover; base rows fill in the rest.
 */
export function mergeRunScopedRows(
  runRows: BenchmarkRow[],
  baseRows: BenchmarkRow[],
): BenchmarkRow[] {
  if (runRows.length === 0) return baseRows;
  const claimed = new Set(runRows.map(runScopeKey));
  return [...runRows, ...baseRows.filter((r) => !claimed.has(runScopeKey(r)))];
}

/**
 * Transform raw BenchmarkRow[] into chart-ready InferenceData[][] and HardwareConfig.
 * Returns one InferenceData[] per chart definition (e2e, interactivity).
 *
 * Converts rows to AggDataEntry once, then reuses for each chart definition.
 *
 * @param percentile Optional latency percentile for the chart x-axis
 *   (default 'median'). Swaps `median_intvty`/`median_e2el` in the chart
 *   definition for the chosen percentile — only agentic rows carry the
 *   full set (median/p90/p99/p99.9) so this mainly affects that scenario.
 */
export function transformBenchmarkRows(
  rows: BenchmarkRow[],
  percentile = 'median',
): {
  chartData: InferenceData[][];
  hardwareConfig: HardwareConfig;
} {
  const gpuConfig: HardwareConfig = {};

  // Phase 1: Convert rows once + resolve hardware keys (cache config lookups)
  const hwConfigCache = new Map<string, ReturnType<typeof getHardwareConfig>>();
  const prepared: PreparedEntry[] = Array.from({ length: rows.length });
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const entry = rowToAggDataEntry(row);
    const hwKey = getHardwareKey(entry);
    entry.hwKey = hwKey;

    if (!hwConfigCache.has(hwKey)) {
      const hwConfig = getHardwareConfig(hwKey, entry.model);
      hwConfigCache.set(hwKey, hwConfig);
      if (hwConfig) gpuConfig[hwKey] = { ...hwConfig, name: hwKey };
    }

    prepared[i] = { entry, hwKey, date: row.date };
  }

  // Phase 2: Build chart data per chart definition (reusing prepared entries)
  const chartData = (chartDefinitions as ChartDefinition[]).map((chartDef) => {
    const xKey = withPercentile(chartDef.x, percentile);
    const groupedByHw: Record<string, InferenceData[]> = {};

    for (const { entry, hwKey, date } of prepared) {
      const dataPoint = createChartDataPoint(
        date,
        entry,
        xKey as keyof AggDataEntry,
        chartDef.y as keyof AggDataEntry,
        hwKey,
      );

      if (!groupedByHw[hwKey]) groupedByHw[hwKey] = [];
      groupedByHw[hwKey].push(dataPoint);
    }

    return Object.values(groupedByHw).flat();
  });

  return { chartData, hardwareConfig: gpuConfig };
}
