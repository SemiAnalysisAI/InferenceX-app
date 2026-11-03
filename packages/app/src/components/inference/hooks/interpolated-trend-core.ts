import {
  hermiteInterpolate,
  monotoneSlopes,
  paretoFrontUpperLeft,
  reciprocalMetricAt,
  recoverReciprocalNumerator,
} from '@/components/calculator/interpolation';
import { MeasuredTrendPoint } from '@/components/inference/hooks/trend-line-point';
import {
  DEFAULT_CHIP_BASIS,
  withChipBasis,
  type ChipBasis,
  type ChipBasisRow,
} from '@/lib/benchmarks/chip-basis';
import {
  isBenchmarkMetricKey,
  tokenMetricTypeForConfigKey,
} from '@/components/inference/metric-registry';
import {
  inputTokenShareForRevenue,
  NORMALIZED_TOKEN_REVENUE_PRICING,
  tokenMixSetsPrice,
  tokenRevenueFromRatesPerGpuHour,
  tokenRevenuePerGpuHour,
} from '@/components/inference/token-revenue';
import type {
  AggDataEntry,
  InferenceData,
  TokenRevenuePricing,
  TrendDataPoint,
  TrendSource,
  YAxisMetricKey,
} from '@/components/inference/types';
import type { BenchmarkRow } from '@/lib/api/api';
import {
  benchmarkCurveDate,
  dedupeAgenticHistoryRuns,
} from '@/lib/benchmarks/benchmark-run-selection';
import { benchmarkRowPhysicalChips, rowToAggDataEntry } from '@/lib/benchmarks/benchmark-transform';
import { pricingCacheHitRate } from '@/lib/calculator/cache-pricing';
import {
  chartMetric,
  derivedMetricRequest,
  getHardwareKey,
  requestsPowerChartFields,
  type DerivedMetricKey,
  type DerivedMetricRequest,
  type ThroughputChartInput,
  writeDerivedChartFields,
  writeThroughputChartFields,
} from '@/lib/charts/chart-utils';
import {
  DEFAULT_TCO_BASIS,
  getGpuSpecs,
  isKnownGpu,
  type GpuSpecs,
  type TcoBasis,
} from '@/lib/catalog/constants';
import {
  supportedTokenMetrics,
  supportsTokenMetric,
  type TokenMetricType,
} from '@/lib/benchmarks/supplemental-benchmarks';

/** Snapshot-scoped token metric support for raw historical rows. */
export function rowSupportsTrendMetric(row: BenchmarkRow, selectedYAxisMetric: string): boolean {
  return supportsTokenMetric(row, tokenMetricTypeForConfigKey(selectedYAxisMetric));
}

/** Resolved operating-point definition, not a user-selectable percentile. */
export function historicalInteractivityAxis(isAgentic: boolean) {
  return {
    statistic: isAgentic ? ('p90' as const) : ('median' as const),
    field: isAgentic ? ('p90_intvty' as const) : ('median_intvty' as const),
    unit: 'tok/s/user' as const,
  };
}

export interface TrendRow {
  readonly row: BenchmarkRow;
  readonly hwKey: string;
  readonly precisionGroupKey: string;
  readonly curveDate: string;
  readonly tokenMetrics: readonly TokenMetricType[] | undefined;
  readonly point: TrendPointBase;
  readonly derivedThroughput: ThroughputChartInput;
  derivedEntry: AggDataEntry | undefined;
}

type TrendPointBase = Pick<
  InferenceData,
  | 'x'
  | 'y'
  | 'hw'
  | 'hwKey'
  | 'precision'
  | 'tp'
  | 'physicalChips'
  | 'dp'
  | 'conc'
  | 'date'
  | 'trendSource'
  | 'tput_per_gpu'
  | 'input_tput_per_gpu'
  | 'output_tput_per_gpu'
  | 'disagg'
  | 'num_prefill_gpu'
  | 'num_decode_gpu'
  | 'prefill_num_workers'
  | 'decode_num_workers'
  | 'chip_basis'
  | 'isl'
  | 'osl'
  | 'total_prompt_tokens'
  | 'total_generation_tokens'
  | 'server_gpu_cache_hit_rate'
  | 'server_external_cache_hit_rate'
  | 'server_cpu_cache_hit_rate'
  | 'theoretical_cache_hit_rate'
>;

function withLegacyOutputThroughput(row: BenchmarkRow, entry: AggDataEntry): AggDataEntry {
  return row.metrics.output_tput_per_gpu === null || row.metrics.output_tput_per_gpu === undefined
    ? { ...entry, output_tput_per_gpu: entry.tput_per_gpu }
    : entry;
}

const RUN_URL_PATTERN =
  /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/(?<id>\d+)(?:\/attempts\/\d+)?\/?$/;

function createTrendRowPreparer(): (row: ChipBasisRow) => TrendRow | null {
  const canonical = new Map<string, string>();
  const intern = (value: string) => {
    const existing = canonical.get(value);
    if (existing !== undefined) return existing;
    canonical.set(value, value);
    return value;
  };
  let hardwareRow: BenchmarkRow | undefined;
  let hwKey = '';
  let knownGpu = false;
  let groupHwKey: string | undefined;
  let groupPrecision: string | undefined;
  let precisionGroupKey = '';
  let rawCurveDate: string | undefined;
  let curveDate = '';
  let runUrl: string | null | undefined;
  let runId: number | undefined;
  let lastSource: TrendSource | undefined;

  return (row) => {
    if (
      !hardwareRow ||
      row.hardware !== hardwareRow.hardware ||
      row.framework !== hardwareRow.framework ||
      row.spec_method !== hardwareRow.spec_method ||
      row.disagg !== hardwareRow.disagg ||
      row.benchmark_type !== hardwareRow.benchmark_type
    ) {
      hardwareRow = row;
      hwKey = intern(
        getHardwareKey({
          hw: row.hardware,
          framework: row.framework,
          disagg: row.disagg,
          benchmark_type: row.benchmark_type,
          spec_decoding: row.spec_method,
        }),
      );
      knownGpu = isKnownGpu(hwKey);
    }
    if (!knownGpu) return null;

    const isAgentic = row.benchmark_type === 'agentic_traces';
    const agenticEntry = isAgentic ? rowToAggDataEntry(row) : undefined;
    const interactivity = agenticEntry ? agenticEntry.p90_intvty : (row.metrics.median_intvty ?? 0);
    if (isAgentic && (!Number.isFinite(interactivity) || interactivity <= 0)) return null;

    if (row.run_url !== runUrl) {
      runUrl = row.run_url;
      const id = runUrl?.match(RUN_URL_PATTERN)?.groups?.id;
      runId = id === undefined ? undefined : Number(id);
    }
    const benchmarkType = isAgentic ? 'agentic_traces' : 'single_turn';
    let trendSource: TrendSource | undefined;
    if (runId !== undefined) {
      trendSource =
        lastSource &&
        lastSource.runUrl === row.run_url &&
        lastSource.date === row.date &&
        lastSource.model === row.model &&
        lastSource.precision === row.precision &&
        lastSource.hwKey === hwKey &&
        lastSource.benchmarkType === benchmarkType
          ? lastSource
          : {
              date: row.date,
              runId,
              runUrl: row.run_url!,
              model: row.model,
              precision: row.precision,
              hwKey,
              benchmarkType,
            };
      if (trendSource !== lastSource) {
        trendSourceKeys.set(trendSource, trendSourceKey(trendSource));
        lastSource = trendSource;
      }
    }

    if (hwKey !== groupHwKey || row.precision !== groupPrecision) {
      groupHwKey = hwKey;
      groupPrecision = row.precision;
      precisionGroupKey = intern(`${hwKey}__${row.precision}`);
    }
    const rowCurveDate = benchmarkCurveDate(row);
    if (rowCurveDate !== rawCurveDate) {
      rawCurveDate = rowCurveDate;
      curveDate = intern(rowCurveDate);
    }

    const metrics = row.metrics;
    const tputPerGpu = metrics.tput_per_gpu ?? 0;
    const inputTputPerGpu = metrics.input_tput_per_gpu ?? 0;
    return {
      row,
      hwKey,
      precisionGroupKey,
      curveDate,
      tokenMetrics: supportedTokenMetrics(row),
      point: {
        x: interactivity,
        y: tputPerGpu,
        hw: row.hardware,
        hwKey,
        precision: row.precision,
        tp: row.decode_tp,
        physicalChips: benchmarkRowPhysicalChips(row),
        dp: metrics.dp,
        conc: row.conc,
        date: curveDate,
        trendSource,
        tput_per_gpu: tputPerGpu,
        input_tput_per_gpu: inputTputPerGpu,
        output_tput_per_gpu: metrics.output_tput_per_gpu ?? 0,
        disagg: row.disagg,
        num_prefill_gpu: row.num_prefill_gpu,
        num_decode_gpu: row.num_decode_gpu,
        prefill_num_workers: row.prefill_num_workers,
        decode_num_workers: row.decode_num_workers,
        chip_basis: row.chip_basis,
        isl: row.isl,
        osl: row.osl,
        total_prompt_tokens: metrics.total_prompt_tokens,
        total_generation_tokens: metrics.total_generation_tokens,
        server_gpu_cache_hit_rate: metrics.server_gpu_cache_hit_rate,
        server_external_cache_hit_rate: metrics.server_external_cache_hit_rate,
        server_cpu_cache_hit_rate: metrics.server_cpu_cache_hit_rate,
        theoretical_cache_hit_rate: metrics.theoretical_cache_hit_rate,
      },
      derivedThroughput: {
        tput_per_gpu: tputPerGpu,
        output_tput_per_gpu: metrics.output_tput_per_gpu ?? tputPerGpu,
        input_tput_per_gpu: inputTputPerGpu,
      },
      derivedEntry: agenticEntry && withLegacyOutputThroughput(row, agenticEntry),
    };
  };
}

const trendSourceKey = (source: TrendSource) => `${source.date}:${source.runId}:${source.hwKey}`;
const trendSourceKeys = new WeakMap<TrendSource, string>();

export function prepareTrendRows(
  allRows: readonly BenchmarkRow[],
  chipBasis: ChipBasis = DEFAULT_CHIP_BASIS,
): TrendRow[] {
  const prepareTrendRow = createTrendRowPreparer();
  const prepared: TrendRow[] = [];
  for (const row of dedupeAgenticHistoryRuns([...allRows])) {
    const trendRow = prepareTrendRow(withChipBasis(row, chipBasis));
    if (trendRow) prepared.push(trendRow);
  }
  return prepared;
}

interface TrendPointMetrics {
  readonly request: DerivedMetricRequest;
  readonly priceRevenue: boolean;
  readonly derivesFromEntry: boolean;
}

function trendPointMetrics(requestedMetrics: readonly DerivedMetricKey[]): TrendPointMetrics {
  const priceRevenue = requestedMetrics.includes('tokenRevenuePerGpuHour');
  const derived = priceRevenue
    ? requestedMetrics.filter((key) => key !== 'tokenRevenuePerGpuHour')
    : requestedMetrics;
  return {
    request: derivedMetricRequest(derived),
    priceRevenue,
    derivesFromEntry: requestsPowerChartFields(derived),
  };
}

function trendPoint(
  trendRow: TrendRow,
  { request, priceRevenue, derivesFromEntry }: TrendPointMetrics,
  tokenRevenuePricing: TokenRevenuePricing | null = NORMALIZED_TOKEN_REVENUE_PRICING,
  tcoBasis: TcoBasis = DEFAULT_TCO_BASIS,
  specs: GpuSpecs = getGpuSpecs(trendRow.hwKey, tcoBasis),
): InferenceData {
  const point = { ...trendRow.point } as InferenceData;
  if (derivesFromEntry) {
    trendRow.derivedEntry ??= withLegacyOutputThroughput(
      trendRow.row,
      rowToAggDataEntry(trendRow.row),
    );
    writeDerivedChartFields(point, trendRow.derivedEntry, request, specs);
  } else {
    writeThroughputChartFields(point, trendRow.derivedThroughput, request, specs);
  }
  if (priceRevenue && tokenRevenuePricing) {
    const revenue = tokenRevenuePerGpuHour(point, tokenRevenuePricing);
    if (revenue !== null) point.tokenRevenuePerGpuHour = chartMetric(revenue);
  }
  return point;
}

export function rowToLightweightPoint(
  row: BenchmarkRow,
  requestedMetrics: readonly DerivedMetricKey[],
  tokenRevenuePricing?: TokenRevenuePricing | null,
  tcoBasis?: TcoBasis,
  chipBasis: ChipBasis = DEFAULT_CHIP_BASIS,
): InferenceData | null {
  const trendRow = createTrendRowPreparer()(withChipBasis(row, chipBasis));
  return (
    trendRow &&
    trendPoint(trendRow, trendPointMetrics(requestedMetrics), tokenRevenuePricing, tcoBasis)
  );
}

/**
 * Metrics defined as a per-chip constant divided by a throughput, mapped to the
 * throughput metric they divide. These are interpolated by splining that
 * throughput and re-deriving, never by splining the metric independently, so
 * the interpolated pair preserves `metric x throughput = constant`. See
 * `recoverReciprocalNumerator` and docs/tco-calculator.md.
 *
 * The `measured*` energy keys are deliberately absent: their numerator is
 * measured per point rather than a constant, so the identity does not hold and
 * splining them directly remains correct.
 */
const RECIPROCAL_OF_THROUGHPUT: Partial<Record<YAxisMetricKey, YAxisMetricKey>> = {
  // $/M tok = $/GPU-hr x 1e6 / (tok/s x 3600)
  costh: 'tpPerGpu',
  costr: 'tpPerGpu',
  costhOutput: 'outputTputPerGpu',
  costrOutput: 'outputTputPerGpu',
  costhi: 'inputTputPerGpu',
  costri: 'inputTputPerGpu',
  // J/token = W / (tok/s)
  jTotal: 'tpPerGpu',
  jOutput: 'outputTputPerGpu',
  jInput: 'inputTputPerGpu',
};

/**
 * Business metrics mapped to the throughput they scale. When the multiplier is
 * constant, interpolation preserves that identity. OpenRouter revenue can use
 * a point-specific input/output mix; in that case multiplier recovery fails
 * safely and the metric itself is splined on the total-throughput frontier.
 */
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

/**
 * Target-independent interpolation state for one GPU's points: the throughput
 * frontier plus everything the spline needs, so moving the target only
 * evaluates `at` instead of rebuilding the frontier and slopes.
 */
interface InterpolationCurve {
  readonly frontier: InferenceData[];
  readonly at: (targetInteractivity: number) => number | null;
}

function buildInterpolationCurve(
  points: InferenceData[],
  metricKey: YAxisMetricKey,
  tokenRevenuePricing?: TokenRevenuePricing | null,
): InterpolationCurve | null {
  if (points.length === 0) return null;

  // Proportional business metrics use the corresponding total/output/input
  // throughput frontier so their knots exactly match the serving envelope.
  const proportionalThroughputKey = PROPORTIONAL_TO_THROUGHPUT[metricKey];
  const frontierThroughputKey = proportionalThroughputKey ?? 'tpPerGpu';
  for (const point of points) {
    if (extractMetric(point, frontierThroughputKey) === null) return null;
  }

  // Build Pareto front on interactivity(x) vs the applicable throughput(y).
  const frontier = paretoFrontUpperLeft<InferenceData>(
    points,
    (p) => p.x,
    (p) => extractMetric(p, frontierThroughputKey)!,
  );
  if (frontier.length === 0) return null;

  const ascending = frontier.every((p, i) => i === 0 || frontier[i - 1].x < p.x);
  const sorted = ascending ? frontier : [...frontier].toSorted((a, b) => a.x - b.x);
  const minX = sorted[0].x;
  const maxX = sorted.at(-1)!.x;
  // No extrapolation — target must be within frontier range
  const curve = (valueAt: (target: number) => number | null): InterpolationCurve => ({
    frontier,
    at: (target) => (target < minX || target > maxX ? null : valueAt(target)),
  });

  // Single point — only return if target matches exactly
  if (sorted.length === 1) {
    const value = extractMetric(sorted[0], metricKey);
    return curve((target) => (Math.abs(target - minX) < 1e-6 ? value : null));
  }

  // Extract metric values from frontier points. If ANY point is missing the
  // metric (e.g. measured-power keys on a row that predates aggregate_power.py),
  // bail out — silently coercing nulls to zero would render a flat-zero trend
  // line that looks like real data.
  const xs = sorted.map((p) => p.x);
  const metricYs = sorted.map((p) => extractMetric(p, metricKey));
  if (!metricYs.every((v): v is number => v !== null)) return null;

  // Fleet Lifecycle interpolates the physical throughput, measured cache hit
  // fraction, and compatible input-token share independently, then prices that
  // operating point. Do the same for Historical Trends instead of splining
  // already-multiplied dollar values. A partly measured cache frontier opts out
  // of the discount as a whole rather than inventing a zero-hit knot.
  if (metricKey === 'tokenRevenuePerGpuHour' && tokenRevenuePricing) {
    const interpolateBounded = (ys: number[]) => {
      const slopes = monotoneSlopes(xs, ys);
      const min = Math.min(...ys);
      const max = Math.max(...ys);
      return (target: number) =>
        Math.max(min, Math.min(max, hermiteInterpolate(xs, ys, slopes, target)));
    };
    const throughputAt = interpolateBounded(sorted.map((p) => extractMetric(p, 'tpPerGpu')!));
    const cacheHitRates = sorted.map(pricingCacheHitRate);
    const cacheHitRateAt = cacheHitRates.every((hit): hit is number => hit !== null)
      ? interpolateBounded(cacheHitRates)
      : null;
    const inputShares = tokenMixSetsPrice(tokenRevenuePricing, cacheHitRateAt !== null)
      ? sorted.map(inputTokenShareForRevenue)
      : null;
    const inputShareAt =
      inputShares !== null && inputShares.every((share): share is number => share !== null)
        ? interpolateBounded(inputShares)
        : null;

    return curve((target) =>
      tokenRevenueFromRatesPerGpuHour(
        throughputAt(target),
        inputShareAt ? inputShareAt(target) : null,
        cacheHitRateAt ? cacheHitRateAt(target) : null,
        tokenRevenuePricing,
      ),
    );
  }

  // When a business metric is a fixed multiple of throughput, spline the
  // matching throughput and apply that multiplier so the derived curve cannot
  // drift from its throughput/interactivity Pareto curve. Metrics whose ratio
  // varies across the frontier fall through to a direct metric spline.
  if (proportionalThroughputKey) {
    const tputYs = sorted.map((p) => extractMetric(p, proportionalThroughputKey)!);
    const multiplier = recoverProportionalMultiplier(metricYs, tputYs);
    if (multiplier !== null) {
      const tputSlopes = monotoneSlopes(xs, tputYs);
      return curve(
        (target) => Math.max(0, hermiteInterpolate(xs, tputYs, tputSlopes, target)) * multiplier,
      );
    }
  }

  // Cost and energy per token are `constant / throughput`. Spline that
  // throughput and re-derive rather than splining the metric, preserving the identity.
  const throughputKey = RECIPROCAL_OF_THROUGHPUT[metricKey];
  if (throughputKey) {
    const tputYs = sorted.map((p) => extractMetric(p, throughputKey));
    if (!tputYs.every((v): v is number => v !== null)) return null;
    const numerator = recoverReciprocalNumerator(metricYs, tputYs);
    // null means these points do not obey the identity — fall through and spline
    // the metric directly rather than rewrite it from one point's ratio.
    if (numerator !== null) {
      const tputSlopes = monotoneSlopes(xs, tputYs);
      return curve((target) =>
        reciprocalMetricAt(
          numerator,
          Math.max(0, hermiteInterpolate(xs, tputYs, tputSlopes, target)),
        ),
      );
    }
  }

  const slopes = monotoneSlopes(xs, metricYs);
  return curve((target) => Math.max(0, hermiteInterpolate(xs, metricYs, slopes, target)));
}

export function interpolateMetricAtInteractivity(
  points: InferenceData[],
  targetInteractivity: number,
  metricKey: YAxisMetricKey,
  tokenRevenuePricing?: TokenRevenuePricing | null,
): number | null {
  const curve = buildInterpolationCurve(points, metricKey, tokenRevenuePricing);
  return curve === null ? null : curve.at(targetInteractivity);
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
  /**
   * Pricing applied when `tokenRevenuePerGpuHour` is requested. Defaults to
   * the normalized (per-model) OpenRouter pricing the dashboard uses.
   */
  readonly tokenRevenuePricing?: TokenRevenuePricing | null;
}

/**
 * Build lightweight InferenceData points grouped by snapshot date and group key
 * (hwKey, or `hwKey__precision` when multiple precisions are selected). Skips
 * the full transformBenchmarkRows pipeline (~100x faster for ~100 dates).
 */
export function groupTrendRowsByDate(
  allRows: readonly BenchmarkRow[],
  options: GroupTrendRowsOptions & { readonly chipBasis?: ChipBasis },
): Map<string, Map<string, InferenceData[]>> {
  return groupTrendRows(prepareTrendRows(allRows, options.chipBasis), options);
}

const NO_POINTS: readonly InferenceData[] = [];
const NO_LINE_POINTS: readonly TrendDataPoint[] = [];
const NO_SOURCES: readonly TrendSource[] = [];

export function groupTrendRows(
  trendRows: readonly TrendRow[],
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

  const multiPrecision = selectedPrecisions.length > 1;
  const tokenType = tokenMetricTypeForConfigKey(selectedYAxisMetric);
  const tcoBasis = options.tcoBasis === undefined ? DEFAULT_TCO_BASIS : options.tcoBasis;
  const specsByHwKey = new Map<string, GpuSpecs>();
  const pointMetrics = trendPointMetrics(requestedMetrics);
  let lastDate: string | undefined;
  let dateMap: Map<string, InferenceData[]> | undefined;
  let lastGroupKey: string | undefined;
  let groupPoints: InferenceData[] | undefined;
  let lastHwKey: string | undefined;
  let specs: GpuSpecs | undefined;
  for (const trendRow of trendRows) {
    const { row, curveDate, hwKey, precisionGroupKey, tokenMetrics } = trendRow;
    if (!selectedPrecisions.includes(row.precision)) continue;
    if (tokenMetrics && !tokenMetrics.includes(tokenType)) continue;
    if (rowFilter && !rowFilter(row)) continue;

    if (hwKey !== lastHwKey || !specs) {
      lastHwKey = hwKey;
      specs = specsByHwKey.get(hwKey);
      if (!specs) {
        specs = getGpuSpecs(hwKey, tcoBasis);
        specsByHwKey.set(hwKey, specs);
      }
    }
    const point = trendPoint(trendRow, pointMetrics, tokenRevenuePricing, tcoBasis, specs);

    if (curveDate !== lastDate || !dateMap) {
      lastDate = curveDate;
      lastGroupKey = undefined;
      dateMap = result.get(curveDate);
      if (!dateMap) {
        dateMap = new Map();
        result.set(curveDate, dateMap);
      }
    }

    const groupKey = multiPrecision ? precisionGroupKey : hwKey;
    if (groupKey !== lastGroupKey || !groupPoints) {
      lastGroupKey = groupKey;
      groupPoints = dateMap.get(groupKey);
      if (!groupPoints) {
        groupPoints = [...NO_POINTS];
        dateMap.set(groupKey, groupPoints);
      }
    }
    groupPoints.push(point);
  }

  return result;
}

export interface BuildTrendCurvesOptions {
  readonly trendMetricKey: YAxisMetricKey;
  readonly tokenRevenuePricing?: TokenRevenuePricing | null;
}

export interface EvaluateTrendCurvesOptions {
  readonly targetInteractivity: number;
  /**
   * Extend each line to this date with a synthetic copy of its last value when
   * the line ends earlier. The hook passes wall-clock today; the views API
   * passes the latest data date so responses stay cache-stable.
   */
  readonly extendToDate?: string;
}

export interface BuildTrendLinesOptions
  extends BuildTrendCurvesOptions, EvaluateTrendCurvesOptions {}

export interface TrendLinesResult {
  readonly trendLines: Map<string, TrendDataPoint[]>;
  readonly hwKeysWithData: string[];
}

class TrendBucket {
  readonly index: number;
  readonly date: string;
  readonly time: number;
  readonly at: InterpolationCurve['at'];
  readonly sources: readonly TrendSource[];
  readonly waterfallEligible: boolean;

  constructor(
    index: number,
    date: string,
    time: number,
    at: InterpolationCurve['at'],
    sources: readonly TrendSource[],
    waterfallEligible: boolean,
  ) {
    this.index = index;
    this.date = date;
    this.time = time;
    this.at = at;
    this.sources = sources;
    this.waterfallEligible = waterfallEligible;
  }
}

export interface TrendCurves {
  readonly byGroup: ReadonlyMap<string, readonly TrendBucket[]>;
  readonly timeSorted: boolean;
}

export function buildTrendCurves(
  dateGroupedData: ReadonlyMap<string, ReadonlyMap<string, InferenceData[]>>,
  options: BuildTrendCurvesOptions,
): TrendCurves {
  const { trendMetricKey, tokenRevenuePricing = NORMALIZED_TOKEN_REVENUE_PRICING } = options;
  const outputMetric = trendMetricKey.toLowerCase().includes('output');
  let bucketCount = 0;
  const byGroup = new Map<string, TrendBucket[]>();
  let timeSorted = true;

  for (const [date, byGroupKey] of dateGroupedData) {
    const time = new Date(date).getTime();
    if (Number.isNaN(time)) timeSorted = false;
    for (const [groupKey, points] of byGroupKey) {
      const curve = buildInterpolationCurve(points, trendMetricKey, tokenRevenuePricing);
      if (curve === null) continue;
      // Preserve the source curve's provenance, including reused points from older runs.
      const keys: string[] = [];
      const sources = [...NO_SOURCES];
      for (const { trendSource: source } of curve.frontier) {
        if (!source || sources.includes(source)) continue;
        const key = trendSourceKeys.get(source) ?? trendSourceKey(source);
        const at = keys.indexOf(key);
        if (at === -1) {
          keys.push(key);
          sources.push(source);
        } else sources[at] = source;
      }
      const bucket = new TrendBucket(
        bucketCount++,
        date,
        time,
        curve.at,
        sources,
        !outputMetric ||
          curve.frontier.every(
            (point) =>
              typeof point.output_tput_per_gpu === 'number' &&
              Number.isFinite(point.output_tput_per_gpu) &&
              point.output_tput_per_gpu > 0,
          ),
      );
      const group = byGroup.get(groupKey);
      if (group) group.push(bucket);
      else byGroup.set(groupKey, Array.of(bucket));
    }
  }

  if (timeSorted) for (const group of byGroup.values()) group.sort((a, b) => a.time - b.time);

  return { byGroup, timeSorted };
}

export function evaluateTrendCurves(
  curves: TrendCurves,
  options: EvaluateTrendCurvesOptions,
): TrendLinesResult {
  const { targetInteractivity, extendToDate } = options;
  const { byGroup, timeSorted } = curves;
  const pointsByGroup = new Map<string, TrendDataPoint[]>();
  const lineKeys: string[] = [];
  const lineStarts: number[] = [];
  for (const [groupKey, group] of byGroup) {
    const points = [...NO_LINE_POINTS];
    let start = -1;
    for (const { index, date, at, sources, waterfallEligible } of group) {
      const value = at(targetInteractivity);
      if (value === null) continue;
      if (start === -1 || index < start) start = index;
      points.push(
        new MeasuredTrendPoint(date, value, targetInteractivity, sources, waterfallEligible),
      );
    }
    if (start === -1) continue;
    pointsByGroup.set(groupKey, points);
    let slot = lineStarts.length;
    while (slot > 0 && lineStarts[slot - 1] > start) slot--;
    lineKeys.splice(slot, 0, groupKey);
    lineStarts.splice(slot, 0, start);
  }

  const lines = new Map<string, TrendDataPoint[]>();
  const keysWithData: string[] = [];
  for (const groupKey of lineKeys) {
    const points = pointsByGroup.get(groupKey)!;
    if (!timeSorted) points.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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

  return { trendLines: lines, hwKeysWithData: keysWithData };
}

export function buildTrendLines(
  dateGroupedData: ReadonlyMap<string, ReadonlyMap<string, InferenceData[]>>,
  options: BuildTrendLinesOptions,
): TrendLinesResult {
  return evaluateTrendCurves(buildTrendCurves(dateGroupedData, options), options);
}
