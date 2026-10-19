import {
  hermiteInterpolate,
  monotoneSlopes,
  paretoFrontUpperLeft,
  reciprocalMetricAt,
  recoverReciprocalNumerator,
} from '@/components/calculator/interpolation';
import {
  isBenchmarkMetricKey,
  tokenMetricTypeForConfigKey,
} from '@/components/inference/metric-registry';
import {
  applyTokenRevenuePricing,
  inputTokenShareForRevenue,
  NORMALIZED_TOKEN_REVENUE_PRICING,
  tokenRevenueFromRatesPerGpuHour,
} from '@/components/inference/token-revenue';
import type {
  InferenceData,
  TokenRevenuePricing,
  TrendDataPoint,
  YAxisMetricKey,
} from '@/components/inference/types';
import type { BenchmarkRow } from '@/lib/api/api';
import {
  benchmarkCurveDate,
  dedupeAgenticHistoryRuns,
} from '@/lib/benchmarks/benchmark-run-selection';
import { rowToAggDataEntry } from '@/lib/benchmarks/benchmark-transform';
import { pricingCacheHitRate } from '@/lib/calculator/cache-pricing';
import {
  buildDerivedChartFields,
  getHardwareKey,
  type DerivedMetricKey,
} from '@/lib/charts/chart-utils';
import { DEFAULT_TCO_BASIS, isKnownGpu, type TcoBasis } from '@/lib/catalog/constants';
import { supportsTokenMetric } from '@/lib/benchmarks/supplemental-benchmarks';

export function rowSupportsTrendMetric(row: BenchmarkRow, selectedYAxisMetric: string): boolean {
  return supportsTokenMetric(row, tokenMetricTypeForConfigKey(selectedYAxisMetric));
}

export function rowToLightweightPoint(
  row: BenchmarkRow,
  requestedMetrics: readonly DerivedMetricKey[],
  tokenRevenuePricing: TokenRevenuePricing | null = NORMALIZED_TOKEN_REVENUE_PRICING,
  tcoBasis: TcoBasis = DEFAULT_TCO_BASIS,
): InferenceData | null {
  const entry = rowToAggDataEntry(row);
  const hwKey = getHardwareKey(entry);
  const derivedEntry =
    row.metrics.output_tput_per_gpu === null || row.metrics.output_tput_per_gpu === undefined
      ? { ...entry, output_tput_per_gpu: entry.tput_per_gpu }
      : entry;
  if (!isKnownGpu(hwKey)) return null;

  const point = {
    x: row.metrics.median_intvty ?? 0,
    y: row.metrics.tput_per_gpu ?? 0,
    hw: row.hardware,
    hwKey,
    precision: row.precision,
    tp: row.decode_tp,
    physicalChips: entry.physicalChips,
    dp: entry.dp,
    conc: row.conc,
    date: benchmarkCurveDate(row),
    tput_per_gpu: entry.tput_per_gpu,
    input_tput_per_gpu: entry.input_tput_per_gpu,
    output_tput_per_gpu: entry.output_tput_per_gpu,
    isl: entry.isl,
    osl: entry.osl,
    total_prompt_tokens: entry.total_prompt_tokens,
    total_generation_tokens: entry.total_generation_tokens,
    server_gpu_cache_hit_rate: entry.server_gpu_cache_hit_rate,
    server_external_cache_hit_rate: entry.server_external_cache_hit_rate,
    server_cpu_cache_hit_rate: entry.server_cpu_cache_hit_rate,
    theoretical_cache_hit_rate: entry.theoretical_cache_hit_rate,
    ...buildDerivedChartFields(derivedEntry, hwKey, requestedMetrics, tcoBasis),
  } as InferenceData;

  return requestedMetrics.includes('tokenRevenuePerGpuHour')
    ? applyTokenRevenuePricing([point], tokenRevenuePricing)[0]!
    : point;
}

const RECIPROCAL_OF_THROUGHPUT: Partial<Record<YAxisMetricKey, YAxisMetricKey>> = {
  costh: 'tpPerGpu',
  costr: 'tpPerGpu',
  costhOutput: 'outputTputPerGpu',
  costrOutput: 'outputTputPerGpu',
  costhi: 'inputTputPerGpu',
  costri: 'inputTputPerGpu',
  jTotal: 'tpPerGpu',
  jOutput: 'outputTputPerGpu',
  jInput: 'inputTputPerGpu',
};

const PROPORTIONAL_TO_THROUGHPUT: Partial<Record<YAxisMetricKey, YAxisMetricKey>> = {
  tokenRevenuePerGpuHour: 'tpPerGpu',
  tokensPerDollarH: 'tpPerGpu',
  tokensPerDollarR: 'tpPerGpu',
  outputTokensPerDollarH: 'outputTputPerGpu',
  outputTokensPerDollarR: 'outputTputPerGpu',
  inputTokensPerDollarH: 'inputTputPerGpu',
  inputTokensPerDollarR: 'inputTputPerGpu',
};

export function trendMetricDependencies(metricKey: YAxisMetricKey): DerivedMetricKey[] {
  const dependencies = new Set<DerivedMetricKey>(['tpPerGpu']);
  if (!isBenchmarkMetricKey(metricKey)) return [...dependencies];
  dependencies.add(metricKey);
  const throughputKey =
    RECIPROCAL_OF_THROUGHPUT[metricKey] ?? PROPORTIONAL_TO_THROUGHPUT[metricKey];
  if (throughputKey && isBenchmarkMetricKey(throughputKey)) dependencies.add(throughputKey);
  return [...dependencies];
}

function recoverProportionalMultiplier(
  values: readonly number[],
  throughputs: readonly number[],
): number | null {
  const RELATIVE_TOLERANCE = 1e-3;
  let multiplier: number | null = null;

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    const throughput = throughputs[i];
    if (value === undefined || throughput === undefined) continue;
    if (!(value > 0) || !(throughput > 0)) continue;

    const candidate = value / throughput;
    if (multiplier === null) {
      multiplier = candidate;
    } else if (Math.abs(candidate - multiplier) > Math.abs(multiplier) * RELATIVE_TOLERANCE) {
      return null;
    }
  }

  return multiplier;
}

export function interpolateMetricAtInteractivity(
  points: InferenceData[],
  targetInteractivity: number,
  metricKey: YAxisMetricKey,
  tokenRevenuePricing?: TokenRevenuePricing | null,
): number | null {
  if (points.length === 0) return null;

  const proportionalThroughputKey = PROPORTIONAL_TO_THROUGHPUT[metricKey];
  const frontierThroughputKey = proportionalThroughputKey ?? 'tpPerGpu';
  for (const point of points) {
    if (extractMetric(point, frontierThroughputKey) === null) return null;
  }

  const frontier = paretoFrontUpperLeft<InferenceData>(
    points,
    (p) => p.x,
    (p) => extractMetric(p, frontierThroughputKey)!,
  );
  if (frontier.length === 0) return null;

  const sorted = [...frontier].toSorted((a, b) => a.x - b.x);

  if (targetInteractivity < sorted[0].x || targetInteractivity > sorted.at(-1)!.x) {
    return null;
  }

  if (sorted.length === 1) {
    return Math.abs(targetInteractivity - sorted[0].x) < 1e-6
      ? extractMetric(sorted[0], metricKey)
      : null;
  }

  const xs = sorted.map((p) => p.x);
  const metricYs: number[] = [];
  for (const p of sorted) {
    const v = extractMetric(p, metricKey);
    if (v === null) return null;
    metricYs.push(v);
  }

  if (metricKey === 'tokenRevenuePerGpuHour' && tokenRevenuePricing) {
    const interpolateBounded = (ys: number[]) => {
      const slopes = monotoneSlopes(xs, ys);
      const raw = hermiteInterpolate(xs, ys, slopes, targetInteractivity);
      return Math.max(Math.min(...ys), Math.min(Math.max(...ys), raw));
    };
    const throughputYs = sorted.map((p) => extractMetric(p, 'tpPerGpu')!);
    const inputShares = sorted.map(inputTokenShareForRevenue);
    const cacheHitRates = sorted.map(pricingCacheHitRate);
    const inputShare = inputShares.every((share): share is number => share !== null)
      ? interpolateBounded(inputShares)
      : null;
    const cacheHitRate = cacheHitRates.every((hit): hit is number => hit !== null)
      ? interpolateBounded(cacheHitRates)
      : null;

    const throughput = interpolateBounded(throughputYs);
    return tokenRevenueFromRatesPerGpuHour(
      throughput,
      inputShare,
      cacheHitRate,
      tokenRevenuePricing,
    );
  }

  if (proportionalThroughputKey) {
    const tputYs = sorted.map((p) => extractMetric(p, proportionalThroughputKey)!);
    const multiplier = recoverProportionalMultiplier(metricYs, tputYs);
    if (multiplier !== null) {
      const tputSlopes = monotoneSlopes(xs, tputYs);
      const tput = hermiteInterpolate(xs, tputYs, tputSlopes, targetInteractivity);
      return Math.max(0, tput) * multiplier;
    }
  }

  const throughputKey = RECIPROCAL_OF_THROUGHPUT[metricKey];
  if (throughputKey) {
    const tputYs: number[] = [];
    for (const p of sorted) {
      const v = extractMetric(p, throughputKey);
      if (v === null) return null;
      tputYs.push(v);
    }
    const numerator = recoverReciprocalNumerator(metricYs, tputYs);
    if (numerator !== null) {
      const tputSlopes = monotoneSlopes(xs, tputYs);
      const tput = hermiteInterpolate(xs, tputYs, tputSlopes, targetInteractivity);
      return reciprocalMetricAt(numerator, Math.max(0, tput));
    }
  }

  const slopes = monotoneSlopes(xs, metricYs);
  const interpolated = hermiteInterpolate(xs, metricYs, slopes, targetInteractivity);

  return Math.max(0, interpolated);
}

function extractMetric(point: InferenceData, metricKey: YAxisMetricKey): number | null {
  const metricObj = point[metricKey];
  if (metricObj && typeof metricObj === 'object' && 'y' in metricObj) {
    return (metricObj as { y: number }).y;
  }
  return null;
}

export interface GroupTrendRowsOptions {
  readonly tcoBasis?: TcoBasis;
  readonly selectedPrecisions: readonly string[];
  readonly selectedYAxisMetric: string;
  readonly requestedMetrics: readonly DerivedMetricKey[];
  readonly rowFilter?: (row: BenchmarkRow) => boolean;
  readonly tokenRevenuePricing?: TokenRevenuePricing | null;
}

export function groupTrendRowsByDate(
  allRows: readonly BenchmarkRow[],
  options: GroupTrendRowsOptions,
): Map<string, Map<string, InferenceData[]>> {
  const {
    selectedPrecisions,
    selectedYAxisMetric,
    requestedMetrics,
    rowFilter,
    tokenRevenuePricing = NORMALIZED_TOKEN_REVENUE_PRICING,
  } = options;
  const result = new Map<string, Map<string, InferenceData[]>>();
  if (allRows.length === 0) return result;

  const multiPrecision = selectedPrecisions.length > 1;
  for (const row of dedupeAgenticHistoryRuns([...allRows])) {
    if (!selectedPrecisions.includes(row.precision)) continue;
    if (!rowSupportsTrendMetric(row, selectedYAxisMetric)) continue;
    if (rowFilter && !rowFilter(row)) continue;

    const point = rowToLightweightPoint(
      row,
      requestedMetrics,
      tokenRevenuePricing,
      options.tcoBasis,
    );
    if (!point) continue;

    const curveDate = benchmarkCurveDate(row);
    let dateMap = result.get(curveDate);
    if (!dateMap) {
      dateMap = new Map();
      result.set(curveDate, dateMap);
    }

    const hwKey = point.hwKey as string;
    const groupKey = multiPrecision ? `${hwKey}__${row.precision}` : hwKey;
    let groupPoints = dateMap.get(groupKey);
    if (!groupPoints) {
      groupPoints = [];
      dateMap.set(groupKey, groupPoints);
    }
    groupPoints.push(point);
  }

  return result;
}

export interface BuildTrendLinesOptions {
  readonly targetInteractivity: number;
  readonly trendMetricKey: YAxisMetricKey;
  readonly extendToDate?: string;
  readonly tokenRevenuePricing?: TokenRevenuePricing | null;
}

export interface TrendLinesResult {
  readonly trendLines: Map<string, TrendDataPoint[]>;
  readonly hwKeysWithData: string[];
}

export function buildTrendLines(
  dateGroupedData: ReadonlyMap<string, ReadonlyMap<string, InferenceData[]>>,
  options: BuildTrendLinesOptions,
): TrendLinesResult {
  const {
    targetInteractivity,
    trendMetricKey,
    extendToDate,
    tokenRevenuePricing = NORMALIZED_TOKEN_REVENUE_PRICING,
  } = options;
  const resultMap = new Map<string, Map<string, TrendDataPoint>>();

  for (const [date, byGroupKey] of dateGroupedData) {
    for (const [groupKey, points] of byGroupKey) {
      const interpolated = interpolateMetricAtInteractivity(
        points,
        targetInteractivity,
        trendMetricKey,
        tokenRevenuePricing,
      );
      if (interpolated === null) continue;
      if (!resultMap.has(groupKey)) resultMap.set(groupKey, new Map());
      resultMap.get(groupKey)!.set(date, {
        date,
        value: interpolated,
        x: targetInteractivity,
      });
    }
  }

  const lines = new Map<string, TrendDataPoint[]>();
  const keysWithData: string[] = [];

  for (const [groupKey, dateMap] of resultMap) {
    const points = [...dateMap.values()].toSorted(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    if (points.length > 0) {
      const last = points.at(-1)!;
      if (extendToDate !== undefined && last.date < extendToDate) {
        points.push({
          date: extendToDate,
          value: last.value,
          x: last.x,
          synthetic: true,
        });
      }
      lines.set(groupKey, points);
      const baseHwKey = groupKey.includes('__') ? groupKey.split('__')[0] : groupKey;
      if (!keysWithData.includes(baseHwKey)) {
        keysWithData.push(baseHwKey);
      }
    }
  }

  return { trendLines: lines, hwKeysWithData: keysWithData };
}
