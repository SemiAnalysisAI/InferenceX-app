import { rowToSequence } from '@semianalysisai/inferencex-constants';

import type { AggDataEntry, HardwareConfig } from '@/components/inference/types';
import type { BenchmarkRow } from '@/lib/api/api';
import { rowToAggDataEntry } from '@/lib/benchmarks/benchmark-transform';
import { pricingCacheHitRate } from '@/lib/calculator/cache-pricing';
import { getHardwareKey } from '@/lib/charts/chart-utils';
import {
  DEFAULT_TCO_BASIS,
  getGpuSpecs,
  getHardwareConfig,
  type TcoBasis,
} from '@/lib/catalog/constants';
import { Percentile, Sequence } from '@/lib/catalog/data-mappings';
import { supportsTokenMetric } from '@/lib/benchmarks/supplemental-benchmarks';

import {
  getCostField,
  hermiteInterpolate,
  interpolateForGPU,
  maxInteractivityAtCost,
  monotoneSlopes,
  paretoFrontUpperLeft,
  reciprocalMetricAt,
  recoverReciprocalNumerator,
  sign,
} from './interpolation';
import type { CostType, GPUDataPoint } from './types';

export {
  getCostField,
  hermiteInterpolate,
  interpolateForGPU,
  maxInteractivityAtCost,
  monotoneSlopes,
  paretoFrontUpperLeft,
  reciprocalMetricAt,
  recoverReciprocalNumerator,
  sign,
};

import {
  countCurvesByPrecision,
  resolveEffectivePrecisions,
} from '@/lib/benchmarks/default-precisions';
const computeGpuCost = (costPerHour: number, tps: number) =>
  costPerHour && tps > 0 ? costPerHour / ((tps * 3600) / 1_000_000) : 0;

export interface GroupMeta {
  hwKey: string;
  precision?: string;
}

export interface OverlayGroupMeta extends GroupMeta {
  runIndex: number;
}

function getAgenticMetric(
  entry: AggDataEntry,
  percentile: Percentile,
  suffix: 'intvty' | 'e2el' | 'ttft',
): number {
  const value = entry[`${percentile}_${suffix}` as keyof AggDataEntry];
  return typeof value === 'number' ? value : 0;
}

function firstTokenSeconds(
  entry: AggDataEntry,
  sequence: Sequence,
  percentile: Percentile,
): number | undefined {
  const value =
    sequence === Sequence.AgenticTraces
      ? getAgenticMetric(entry, percentile, 'ttft')
      : entry.median_ttft;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function inputTokenShare(row: BenchmarkRow, inputTput: number, outputTput: number): number | null {
  const tput = row.metrics.tput_per_gpu ?? 0;
  const sum = inputTput + outputTput;
  if (tput > 0 && sum > 0 && Math.abs(sum / tput - 1) <= 0.01) return inputTput / sum;

  const { isl, osl } = row;
  if (typeof isl === 'number' && typeof osl === 'number' && isl + osl > 0) {
    return isl / (isl + osl);
  }
  const prompt = row.metrics.total_prompt_tokens;
  const generated = row.metrics.total_generation_tokens;
  if (typeof prompt === 'number' && typeof generated === 'number' && prompt + generated > 0) {
    return prompt / (prompt + generated);
  }
  return null;
}

export function buildGpuGroups<M extends GroupMeta>(
  rows: BenchmarkRow[],
  options: {
    sequence: Sequence;
    precisions: string[];
    percentile?: Percentile;
    tokenType?: CostType;
    tcoBasis?: TcoBasis;
    classify: (hwKey: string, row: BenchmarkRow) => { key: string; meta: M } | null;
  },
): {
  grouped: Record<string, GPUDataPoint[]>;
  groupMeta: Record<string, M>;
  hwConfigMap: HardwareConfig;
} {
  const {
    sequence,
    precisions,
    percentile = Percentile.P90,
    tokenType = 'total',
    tcoBasis = DEFAULT_TCO_BASIS,
    classify,
  } = options;
  const grouped: Record<string, GPUDataPoint[]> = {};
  const groupMeta: Record<string, M> = {};
  const hwConfigMap: HardwareConfig = {};

  for (const row of rows) {
    if (rowToSequence(row) !== sequence) continue;
    if (!precisions.includes(row.precision)) continue;
    if (!supportsTokenMetric(row, tokenType)) continue;

    const entry = rowToAggDataEntry(row);
    const hwKey = getHardwareKey(entry);
    const hwConfig = getHardwareConfig(hwKey, entry.model);
    if (!hwConfig) continue;

    const classified = classify(hwKey, row);
    if (!classified) continue;
    const { key: groupKey, meta } = classified;

    if (!hwConfigMap[hwKey]) hwConfigMap[hwKey] = { ...hwConfig, name: hwKey };

    const m = row.metrics;
    const tput = m.tput_per_gpu ?? 0;
    const outputTput = m.output_tput_per_gpu ?? tput;
    const inputTput = m.input_tput_per_gpu ?? 0;
    const cacheHitRate = pricingCacheHitRate({ ...m, hw: row.hardware });
    const theoreticalRate =
      typeof m.theoretical_cache_hit_rate === 'number' &&
      Number.isFinite(m.theoretical_cache_hit_rate)
        ? Math.max(0, Math.min(1, m.theoretical_cache_hit_rate))
        : null;
    const tokenShare = inputTokenShare(row, inputTput, outputTput);
    const specs = getGpuSpecs(hwKey, tcoBasis);
    const power = specs.power;

    if (!grouped[groupKey]) grouped[groupKey] = [];
    groupMeta[groupKey] = meta;

    const ttft = firstTokenSeconds(entry, sequence, percentile);

    grouped[groupKey].push({
      sourceRow: row,
      hwKey,
      interactivity:
        sequence === Sequence.AgenticTraces
          ? getAgenticMetric(entry, percentile, 'intvty')
          : entry.median_intvty,
      ...(ttft === undefined ? {} : { ttft }),
      ...(sequence === Sequence.AgenticTraces
        ? {
            e2eLatency: getAgenticMetric(entry, percentile, 'e2el'),
            date: row.date,
          }
        : {}),
      throughput: tput,
      outputThroughput: outputTput,
      inputThroughput: inputTput,
      ...(cacheHitRate === null ? {} : { cacheHitRate }),
      ...(theoreticalRate === null ? {} : { theoreticalCacheHitRate: theoreticalRate }),
      ...(tokenShare === null ? {} : { inputTokenShare: tokenShare }),
      concurrency: row.conc,
      tp: row.decode_tp,
      dp: entry.dp,
      precision: row.precision,
      ep: row.decode_ep,
      dp_attention: row.decode_dp_attention,
      disagg: row.disagg,
      costh: computeGpuCost(specs.costh, tput),
      costr: computeGpuCost(specs.costr, tput),
      costhi: computeGpuCost(specs.costh, inputTput),
      costri: computeGpuCost(specs.costr, inputTput),
      costhOutput: computeGpuCost(specs.costh, outputTput),
      costrOutput: computeGpuCost(specs.costr, outputTput),
      tpPerMw: power && power > 0 ? (tput * 1000) / power : 0,
      inputTpPerMw: power && power > 0 ? (inputTput * 1000) / power : 0,
      outputTpPerMw: power && power > 0 ? (outputTput * 1000) / power : 0,
    });
  }

  return { grouped, groupMeta, hwConfigMap };
}

export function resolveRowPrecisions(
  rows: BenchmarkRow[],
  sequence: Sequence,
  requested: readonly string[],
  overlayRows: BenchmarkRow[] = [],
): string[] {
  const forSequence = rows.filter((row) => rowToSequence(row) === sequence);
  const unofficialPrecisions = overlayRows
    .filter((row) => rowToSequence(row) === sequence)
    .map((row) => row.precision);
  const available = [
    ...new Set([...forSequence.map((row) => row.precision), ...unofficialPrecisions]),
  ].toSorted();
  return resolveEffectivePrecisions({
    selectedPrecisions: [...requested],
    availablePrecisions: available.length > 0 ? available : ['fp4'],
    curveCounts: countCurvesByPrecision(forSequence),
    unofficialPrecisions,
    explicit: requested.length > 0,
  });
}
