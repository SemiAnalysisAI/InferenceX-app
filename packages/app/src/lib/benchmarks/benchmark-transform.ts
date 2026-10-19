import { benchmarkCurveScope, DB_MODEL_TO_DISPLAY } from '@semianalysisai/inferencex-constants';

import chartDefinitions from '@/components/inference/metric-registry';
import type {
  AggDataEntry,
  ChartDefinition,
  HardwareConfig,
  InferenceData,
} from '@/components/inference/types';
import {
  buildDerivedChartFields,
  createChartDataPoint,
  deploymentChipCount,
  getHardwareKey,
  type DerivedChartFields,
} from '@/lib/charts/chart-utils';
import { DEFAULT_TCO_BASIS, type TcoBasis } from '@/lib/catalog/constants';
import { getInferenceHardwareConfig } from '@/lib/benchmarks/inference-labels';
import { isPersistedBenchmarkId } from '@/lib/benchmarks/benchmark-id';
import { resolvePowerTier } from '@/lib/power/power-tier';
import { modelSystemPower } from '@/lib/power/modeled-system-power';
import type { BenchmarkRow } from '@/lib/api/api';

const WHOLE_DEPLOYMENT_ENERGY_SCHEMA_VERSION = 2;

function applyAgenticMetricAliases(raw: Record<string, number>): Record<string, number> {
  const m: Record<string, number> = { ...raw };
  const hasFullResponseItl = ['mean', 'median', 'p75', 'p90', 'p95', 'p99', 'p99.9'].some(
    (suffix) => typeof raw[`${suffix}_full_response_itl`] === 'number',
  );
  for (const suffix of ['mean', 'median', 'p75', 'p90', 'p95', 'p99', 'p99.9']) {
    const fullResponseItl = raw[`${suffix}_full_response_itl`];
    const itl =
      typeof fullResponseItl === 'number' && fullResponseItl > 0
        ? fullResponseItl
        : hasFullResponseItl
          ? undefined
          : raw[`${suffix}_itl`];
    const ttlt = raw[`${suffix}_ttlt`];
    if (m[`${suffix}_e2el`] === undefined && ttlt !== undefined) m[`${suffix}_e2el`] = ttlt;
    if (typeof itl === 'number' && itl > 0) {
      m[`${suffix}_itl`] = itl;
      if (m[`${suffix}_tpot`] === undefined) m[`${suffix}_tpot`] = itl;
      m[`${suffix}_intvty`] = 1 / itl;
    } else {
      delete m[`${suffix}_itl`];
      delete m[`${suffix}_intvty`];
    }
  }
  if (typeof raw.std_full_response_itl === 'number') {
    m.std_itl = raw.std_full_response_itl;
  }
  if (typeof raw.std_full_response_intvty === 'number') {
    m.std_intvty = raw.std_full_response_intvty;
  }
  return m;
}

export function rowToAggDataEntry(row: BenchmarkRow): AggDataEntry {
  const isAgentic = row.benchmark_type === 'agentic_traces';
  const m = isAgentic ? applyAgenticMetricAliases(row.metrics) : row.metrics;
  const aggregateUsesPrefill =
    !row.disagg &&
    (row.decode_tp <= 0 ||
      row.decode_ep <= 0 ||
      (row.decode_num_workers <= 0 &&
        row.num_decode_gpu <= 0 &&
        (row.prefill_num_workers > 0 || row.num_prefill_gpu > 0)));
  const aggregateTp = aggregateUsesPrefill ? row.prefill_tp : row.decode_tp;
  const aggregateEp = aggregateUsesPrefill ? row.prefill_ep : row.decode_ep;
  const aggregatePp =
    !row.disagg && (m.prefill_pp !== undefined || m.decode_pp !== undefined)
      ? Math.max(m.prefill_pp ?? 1, m.decode_pp ?? 1)
      : aggregateUsesPrefill
        ? m.prefill_pp
        : m.decode_pp;
  const aggregateDpAttention = aggregateUsesPrefill
    ? row.prefill_dp_attention
    : row.decode_dp_attention;
  const measuredPowerValid = m.power_valid !== 0;
  const hasWholeDeploymentEnergySemantics =
    !row.disagg || m.power_metric_schema_version === WHOLE_DEPLOYMENT_ENERGY_SCHEMA_VERSION;
  const avgPowerW = measuredPowerValid ? m.avg_power_w : undefined;
  const p75PowerW =
    m.power_valid === 1 && m.power_metric_schema_version === 2 ? m.p75_power_w : undefined;
  const p90PowerW =
    m.power_valid === 1 && m.power_metric_schema_version === 2 ? m.p90_power_w : undefined;
  const prefillAvgPowerW = measuredPowerValid ? m.prefill_avg_power_w : undefined;
  const decodeAvgPowerW = measuredPowerValid ? m.decode_avg_power_w : undefined;
  const joulesPerSuccessfulQuery =
    measuredPowerValid && hasWholeDeploymentEnergySemantics
      ? m.joules_per_successful_query
      : undefined;
  const joulesPerOutputToken =
    measuredPowerValid && hasWholeDeploymentEnergySemantics ? m.joules_per_output_token : undefined;
  const joulesPerTotalToken =
    measuredPowerValid && hasWholeDeploymentEnergySemantics ? m.joules_per_total_token : undefined;
  const joulesPerInputToken =
    measuredPowerValid && hasWholeDeploymentEnergySemantics ? m.joules_per_input_token : undefined;
  const hasMeasuredTelemetry = [
    avgPowerW,
    p75PowerW,
    p90PowerW,
    prefillAvgPowerW,
    decodeAvgPowerW,
    joulesPerSuccessfulQuery,
    joulesPerOutputToken,
    joulesPerTotalToken,
    joulesPerInputToken,
  ].some((value) => typeof value === 'number');
  const rawMetrics = row.metrics as Record<string, unknown>;
  const offloadMode =
    row.offload_mode ??
    (typeof rawMetrics.offload_mode === 'string' ? rawMetrics.offload_mode : undefined);
  const stringMetric = (key: string): string | undefined => {
    const value = rawMetrics[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  };
  const numericId = typeof row.id === 'number' ? row.id : Number(row.id);
  return {
    rawMetricKeys: Object.keys(m),
    id: isPersistedBenchmarkId(numericId) ? numericId : undefined,
    recipe_fingerprint: row.recipe_fingerprint ?? undefined,
    hw: row.hardware,
    framework: row.framework,
    model: DB_MODEL_TO_DISPLAY[row.model] ?? row.model,
    precision: row.precision,
    hwKey: '',
    tp: aggregateTp,
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
    ...(typeof m.mean_tpot === 'number' && Number.isFinite(m.mean_tpot) && m.mean_tpot > 0
      ? { mean_tpot_intvty: 1 / m.mean_tpot }
      : {}),
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
    power_valid: m.power_valid,
    power_audit: row.power_audit ?? undefined,
    power_invalid_reasons:
      Array.isArray(row.power_invalid_reasons) && row.power_invalid_reasons.length > 0
        ? row.power_invalid_reasons
        : undefined,
    power_metric_schema_version: m.power_metric_schema_version,
    modeledSystemPower: modelSystemPower(row),
    power_tier: resolvePowerTier({
      powerValid: m.power_valid,
      wholeDeploymentSemantics: hasWholeDeploymentEnergySemantics,
      hasMeasuredTelemetry,
    }),
    avg_power_w: avgPowerW,
    p75_power_w: p75PowerW,
    p90_power_w: p90PowerW,
    joules_per_successful_query: joulesPerSuccessfulQuery,
    joules_per_output_token: joulesPerOutputToken,
    joules_per_total_token: joulesPerTotalToken,
    prefill_avg_power_w: prefillAvgPowerW,
    decode_avg_power_w: decodeAvgPowerW,
    joules_per_input_token: joulesPerInputToken,
    prefill_joules_per_input_token: measuredPowerValid
      ? m.prefill_joules_per_input_token
      : undefined,
    decode_joules_per_output_token: measuredPowerValid
      ? m.decode_joules_per_output_token
      : undefined,
    avg_temp_c: measuredPowerValid ? m.avg_temp_c : undefined,
    peak_temp_c: measuredPowerValid ? m.peak_temp_c : undefined,
    avg_util_pct: measuredPowerValid ? m.avg_util_pct : undefined,
    avg_mem_used_mb: measuredPowerValid ? m.avg_mem_used_mb : undefined,
    workers: measuredPowerValid && Array.isArray(row.workers) ? row.workers : undefined,
    physicalChips: deploymentChipCount(
      {
        disagg: row.disagg,
        num_prefill_gpu: row.num_prefill_gpu,
        num_decode_gpu: row.num_decode_gpu,
        tp: aggregateTp,
        pp: aggregatePp,
      },
      row.hardware,
    ),
    disagg: row.disagg,
    num_prefill_gpu: row.num_prefill_gpu,
    num_decode_gpu: row.num_decode_gpu,
    spec_decoding: row.spec_method,
    ep: aggregateEp,
    pp: aggregatePp,
    dp_attention: aggregateDpAttention,
    dp: m.dp,
    is_multinode: row.is_multinode,
    prefill_tp: row.disagg ? row.prefill_tp : aggregateTp,
    prefill_ep: row.disagg ? row.prefill_ep : aggregateEp,
    prefill_pp: row.disagg ? m.prefill_pp : aggregatePp,
    prefill_dp_attention: row.disagg ? row.prefill_dp_attention : aggregateDpAttention,
    prefill_num_workers: row.prefill_num_workers,
    decode_tp: row.disagg ? row.decode_tp : aggregateTp,
    decode_ep: row.disagg ? row.decode_ep : aggregateEp,
    decode_pp: row.disagg ? m.decode_pp : aggregatePp,
    prefill_dcp_size: m.prefill_dcp_size ?? m.dcp_size,
    decode_dcp_size: m.decode_dcp_size ?? m.dcp_size,
    prefill_pcp_size: m.prefill_pcp_size ?? m.pcp_size,
    prefill_dwdp_size: m.prefill_dwdp_size,
    decode_pcp_size: m.decode_pcp_size ?? m.pcp_size,
    decode_dp_attention: row.disagg ? row.decode_dp_attention : aggregateDpAttention,
    decode_num_workers: row.decode_num_workers,
    image: row.image ?? undefined,
    date: row.date,
    actualDate: (row as any).actualDate ?? row.date,
    run_url: row.run_url ?? undefined,
    curve_date: row.curve_date,
    curve_workflow_run_id: row.curve_workflow_run_id,
    benchmark_type: row.benchmark_type,
    isl: row.isl,
    osl: row.osl,
    offload_mode: offloadMode,
    kv_offloading: stringMetric('kv_offloading'),
    kv_offload_backend: stringMetric('kv_offload_backend'),
    kv_offload_backend_version: stringMetric('kv_offload_backend_version'),
    kv_p2p_transfer: stringMetric('kv_p2p_transfer'),
    router_name: stringMetric('router_name'),
    router_version: stringMetric('router_version'),
    server_gpu_cache_hit_rate: m.server_gpu_cache_hit_rate,
    server_external_cache_hit_rate: m.server_external_cache_hit_rate,
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
  derivedFields: DerivedChartFields;
}

export function withPercentile(key: string, percentile: string): string {
  return key.replace(/^(?:mean|median|p75|p90|p95|p99|p99\.9)_/u, `${percentile}_`);
}

const runScopeKey = (r: BenchmarkRow): string =>
  JSON.stringify([
    r.model,
    r.precision,
    r.hardware,
    r.framework,
    r.spec_method,
    r.disagg,
    r.is_multinode,
    r.prefill_tp,
    r.prefill_ep,
    r.prefill_dp_attention,
    r.prefill_num_workers,
    r.decode_tp,
    r.decode_ep,
    r.decode_dp_attention,
    r.decode_num_workers,
    r.benchmark_type,
    r.isl,
    r.osl,
    r.offload_mode ?? 'off',
    r.recipe_fingerprint ?? null,
    r.num_prefill_gpu,
    r.num_decode_gpu,
    r.metrics.dp ?? null,
  ]);

export function mergeRunScopedRows(
  runRows: BenchmarkRow[],
  baseRows: BenchmarkRow[],
): BenchmarkRow[] {
  if (runRows.length === 0) return baseRows;
  const key = (row: BenchmarkRow) =>
    row.benchmark_type === 'agentic_traces' ? benchmarkCurveScope(row) : runScopeKey(row);
  const claimed = new Set(runRows.map(key));
  return [...runRows, ...baseRows.filter((row) => !claimed.has(key(row)))];
}

export function transformBenchmarkRows(
  rows: BenchmarkRow[],
  percentile = 'median',
  tcoBasis: TcoBasis = DEFAULT_TCO_BASIS,
): {
  chartData: InferenceData[][];
  hardwareConfig: HardwareConfig;
} {
  const gpuConfig: HardwareConfig = {};

  const entriesByHw = new Map<string, AggDataEntry[]>();
  const prepared: PreparedEntry[] = Array.from({ length: rows.length });
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const entry = rowToAggDataEntry(row);
    const hwKey = getHardwareKey(entry);
    entry.hwKey = hwKey;

    const entries = entriesByHw.get(hwKey) ?? [];
    entries.push(entry);
    entriesByHw.set(hwKey, entries);

    prepared[i] = {
      entry,
      hwKey,
      date: row.date,
      derivedFields: buildDerivedChartFields(entry, hwKey, undefined, tcoBasis),
    };
  }

  for (const [hwKey, entries] of entriesByHw) {
    gpuConfig[hwKey] = {
      ...getInferenceHardwareConfig(hwKey, entries[0].model, entries),
      name: hwKey,
    };
  }

  const chartData = (chartDefinitions as ChartDefinition[]).map((chartDef) => {
    const xKey = withPercentile(chartDef.x, percentile);
    const groupedByHw: Record<string, InferenceData[]> = {};

    for (const { entry, hwKey, date, derivedFields } of prepared) {
      const dataPoint = createChartDataPoint(
        date,
        entry,
        xKey as keyof AggDataEntry,
        chartDef.y as keyof AggDataEntry,
        hwKey,
        derivedFields,
      );

      if (!groupedByHw[hwKey]) groupedByHw[hwKey] = [];
      groupedByHw[hwKey].push(dataPoint);
    }

    return Object.values(groupedByHw).flat();
  });

  return { chartData, hardwareConfig: gpuConfig };
}
