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
import { rowToAggDataEntry } from '@/lib/benchmarks/benchmark-transform';
import { pricingCacheHitRate } from '@/lib/calculator/cache-pricing';
import {
  buildDerivedChartFields,
  getHardwareKey,
  type DerivedMetricKey,
} from '@/lib/charts/chart-utils';
import {
  DEFAULT_TCO_BASIS,
  getGpuSpecs,
  isKnownGpu,
  type GpuSpecs,
  type TcoBasis,
} from '@/lib/catalog/constants';
import { supportsTokenMetric } from '@/lib/benchmarks/supplemental-benchmarks';

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

/** Metric-independent trend state for one raw row; prepared once per loaded row set. */
export interface TrendRow {
  readonly row: BenchmarkRow;
  readonly entry: AggDataEntry;
  readonly derivedEntry: AggDataEntry;
  readonly hwKey: string;
  /** Group key when several precisions are selected. */
  readonly precisionGroupKey: string;
  readonly x: number;
  readonly curveDate: string;
  readonly trendSource: TrendSource | undefined;
}

function prepareTrendRow(
  row: BenchmarkRow,
  intern: (value: string) => string = (value) => value,
): TrendRow | null {
  const entry = rowToAggDataEntry(row);
  const hwKey = intern(getHardwareKey(entry));
  // Historical rows predating explicit output-throughput telemetry used total
  // throughput as output throughput. Preserve that production fallback for
  // output cost, purchasing-power, and energy trend metrics.
  const derivedEntry =
    row.metrics.output_tput_per_gpu === null || row.metrics.output_tput_per_gpu === undefined
      ? { ...entry, output_tput_per_gpu: entry.tput_per_gpu }
      : entry;
  if (!isKnownGpu(hwKey)) return null;
  // workflow_run_id is a database ID, not a GitHub Actions ID. Preserve the
  // actual producer URL (including repository and attempt), never the snapshot ID.
  const runMatch = row.run_url?.match(
    /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/(?<id>\d+)(?:\/attempts\/\d+)?\/?$/,
  );

  // Reuse the main chart's normalization: AgentX slow-tail interactivity is
  // 1 / P90 full-response ITL (seconds), with legacy ITL support in the adapter.
  // Never use raw p90_intvty: older artifacts computed P90(1 / ITL) instead.
  const isAgentic = row.benchmark_type === 'agentic_traces';
  const interactivity = isAgentic ? entry.p90_intvty : (row.metrics.median_intvty ?? 0);
  if (isAgentic && (!Number.isFinite(interactivity) || interactivity <= 0)) return null;

  const trendSource: TrendSource | undefined = runMatch
    ? {
        date: row.date,
        runId: Number(runMatch.groups!.id),
        runUrl: row.run_url!,
        model: row.model,
        precision: row.precision,
        hwKey,
        benchmarkType: row.benchmark_type === 'agentic_traces' ? 'agentic_traces' : 'single_turn',
      }
    : undefined;
  if (trendSource) trendSourceKeys.set(trendSource, intern(trendSourceKey(trendSource)));

  return {
    row,
    entry,
    derivedEntry,
    hwKey,
    precisionGroupKey: intern(`${hwKey}__${row.precision}`),
    x: interactivity,
    curveDate: intern(benchmarkCurveDate(row)),
    trendSource,
  };
}

const trendSourceKey = (source: TrendSource) => `${source.date}:${source.runId}:${source.hwKey}`;
// Provenance dedupe keys, built once per prepared row instead of once per bucket and metric.
const trendSourceKeys = new WeakMap<TrendSource, string>();

/**
 * Dedupe agentic history runs and prepare every chartable row. The result does not depend
 * on the metric, precision or pricing, so the hook reuses it across those changes.
 */
export function prepareTrendRows(allRows: readonly BenchmarkRow[]): TrendRow[] {
  // One string object per distinct key, so later `===` and Map lookups compare identity.
  const canonical = new Map<string, string>();
  const intern = (value: string) => {
    const existing = canonical.get(value);
    if (existing !== undefined) return existing;
    canonical.set(value, value);
    return value;
  };
  const prepared: TrendRow[] = [];
  for (const row of dedupeAgenticHistoryRuns([...allRows])) {
    const trendRow = prepareTrendRow(row, intern);
    if (trendRow) prepared.push(trendRow);
  }
  return prepared;
}

/**
 * The derived metrics a trend point computes. Requested token revenue is re-priced by
 * `applyTokenRevenuePricing`, which drops the derived value, so it is not built at all.
 */
interface TrendPointMetrics {
  readonly derived: readonly DerivedMetricKey[];
  readonly priceRevenue: boolean;
}

function trendPointMetrics(requestedMetrics: readonly DerivedMetricKey[]): TrendPointMetrics {
  const priceRevenue = requestedMetrics.includes('tokenRevenuePerGpuHour');
  return {
    derived: priceRevenue
      ? requestedMetrics.filter((key) => key !== 'tokenRevenuePerGpuHour')
      : requestedMetrics,
    priceRevenue,
  };
}

function trendPoint(
  { row, entry, derivedEntry, hwKey, x, curveDate, trendSource }: TrendRow,
  { derived, priceRevenue }: TrendPointMetrics,
  tokenRevenuePricing: TokenRevenuePricing | null = NORMALIZED_TOKEN_REVENUE_PRICING,
  tcoBasis: TcoBasis = DEFAULT_TCO_BASIS,
  specs?: GpuSpecs,
): InferenceData {
  const point = {
    x,
    y: row.metrics.tput_per_gpu ?? 0,
    hw: row.hardware,
    hwKey,
    precision: row.precision,
    tp: row.decode_tp,
    physicalChips: entry.physicalChips,
    dp: entry.dp,
    conc: row.conc,
    date: curveDate,
    trendSource,
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
    ...buildDerivedChartFields(derivedEntry, hwKey, derived, tcoBasis, specs),
  } as InferenceData;

  return priceRevenue ? applyTokenRevenuePricing([point], tokenRevenuePricing)[0]! : point;
}

/**
 * Build a lightweight InferenceData-compatible point from a raw BenchmarkRow.
 * This deliberately skips full chart transformation and derives only the
 * selected trend metric plus its frontier/interpolation dependencies.
 */
export function rowToLightweightPoint(
  row: BenchmarkRow,
  requestedMetrics: readonly DerivedMetricKey[],
  tokenRevenuePricing?: TokenRevenuePricing | null,
  tcoBasis?: TcoBasis,
): InferenceData | null {
  const trendRow = prepareTrendRow(row);
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

/** Returns null when the value is null at every target. */
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

  // Sort frontier by interactivity ascending. The front is built in ascending x, so the sort
  // is an identity unless an x is NaN.
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
  const metricYs: number[] = [];
  for (const p of sorted) {
    const v = extractMetric(p, metricKey);
    if (v === null) return null;
    metricYs.push(v);
  }

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
    const inputShares = sorted.map(inputTokenShareForRevenue);
    const cacheHitRates = sorted.map(pricingCacheHitRate);
    const inputShareAt = inputShares.every((share): share is number => share !== null)
      ? interpolateBounded(inputShares)
      : null;
    const cacheHitRateAt = cacheHitRates.every((hit): hit is number => hit !== null)
      ? interpolateBounded(cacheHitRates)
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
    const tputYs: number[] = [];
    for (const p of sorted) {
      const v = extractMetric(p, throughputKey);
      if (v === null) return null;
      tputYs.push(v);
    }
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

  // Monotone cubic Hermite spline interpolation, clamped to prevent negative
  // values from cubic spline overshoots
  const slopes = monotoneSlopes(xs, metricYs);
  return curve((target) => Math.max(0, hermiteInterpolate(xs, metricYs, slopes, target)));
}

/**
 * Interpolate a selected metric at a target interactivity for a set of InferenceData points
 * from a single GPU. Uses a throughput-based Pareto front + monotone cubic Hermite spline.
 *
 * Exported for unit testing.
 */
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
  /**
   * Extra row-level filter (e.g. the views API's gpu/vendor/date scoping). Must be pure:
   * it only sees rows that can chart.
   */
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
  options: GroupTrendRowsOptions,
): Map<string, Map<string, InferenceData[]>> {
  return groupTrendRows(prepareTrendRows(allRows), options);
}

/** `groupTrendRowsByDate` over rows already prepared by `prepareTrendRows`. */
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
  // Specs depend only on (hwKey, basis); a few hardware keys cover every row of one call.
  const tcoBasis = options.tcoBasis === undefined ? DEFAULT_TCO_BASIS : options.tcoBasis;
  const specsByHwKey = new Map<string, GpuSpecs>();
  const pointMetrics = trendPointMetrics(requestedMetrics);
  // Rows of one date and group usually arrive together; reuse the last lookups.
  let lastDate: string | undefined;
  let dateMap: Map<string, InferenceData[]> | undefined;
  let lastGroupKey: string | undefined;
  let groupPoints: InferenceData[] | undefined;
  let lastHwKey: string | undefined;
  let specs: GpuSpecs | undefined;
  for (const trendRow of trendRows) {
    const { row, curveDate, hwKey, precisionGroupKey } = trendRow;
    if (!selectedPrecisions.includes(row.precision)) continue;
    if (!supportsTokenMetric(row, tokenType)) continue;
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
        groupPoints = [];
        dateMap.set(groupKey, groupPoints);
      }
    }
    groupPoints.push(point);
  }

  return result;
}

export interface BuildTrendCurvesOptions {
  readonly trendMetricKey: YAxisMetricKey;
  /** Pricing used when interpolating `tokenRevenuePerGpuHour`. */
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

interface TrendBucket {
  readonly index: number;
  readonly date: string;
  readonly time: number;
  readonly groupKey: string;
  readonly curve: InterpolationCurve;
  readonly sources: readonly TrendSource[];
  readonly waterfallEligible: boolean;
}

/** Target-independent trend state: one interpolation curve per (date, group) bucket. */
export interface TrendCurves {
  /** Date-major, in the input's date and group order. */
  readonly buckets: readonly TrendBucket[];
  /** Each group's buckets, date-sorted when every date parses (`timeSorted`). */
  readonly byGroup: ReadonlyMap<string, readonly TrendBucket[]>;
  readonly timeSorted: boolean;
}

/** Build every (date, group) bucket's frontier, spline and provenance once per metric. */
export function buildTrendCurves(
  dateGroupedData: ReadonlyMap<string, ReadonlyMap<string, InferenceData[]>>,
  options: BuildTrendCurvesOptions,
): TrendCurves {
  const { trendMetricKey, tokenRevenuePricing = NORMALIZED_TOKEN_REVENUE_PRICING } = options;
  const outputMetric = trendMetricKey.toLowerCase().includes('output');
  const buckets: TrendBucket[] = [];
  const byGroup = new Map<string, TrendBucket[]>();
  let timeSorted = true;

  for (const [date, byGroupKey] of dateGroupedData) {
    const time = new Date(date).getTime();
    if (Number.isNaN(time)) timeSorted = false;
    for (const [groupKey, points] of byGroupKey) {
      const curve = buildInterpolationCurve(points, trendMetricKey, tokenRevenuePricing);
      if (curve === null) continue;
      // Preserve the source curve's provenance, including reused points from older runs.
      // A repeated key keeps its first position and its last source, as `new Map(entries)`
      // does; frontiers hold a few points, so a linear scan beats a Map.
      const keys: string[] = [];
      const sources: TrendSource[] = [];
      for (const { trendSource: source } of curve.frontier) {
        if (!source) continue;
        const key = trendSourceKeys.get(source) ?? trendSourceKey(source);
        const at = keys.indexOf(key);
        if (at === -1) {
          keys.push(key);
          sources.push(source);
        } else sources[at] = source;
      }
      const bucket: TrendBucket = {
        index: buckets.length,
        date,
        time,
        groupKey,
        curve,
        sources,
        waterfallEligible:
          !outputMetric ||
          curve.frontier.every(
            (point) =>
              typeof point.output_tput_per_gpu === 'number' &&
              Number.isFinite(point.output_tput_per_gpu) &&
              point.output_tput_per_gpu > 0,
          ),
      };
      buckets.push(bucket);
      const group = byGroup.get(groupKey);
      if (group) group.push(bucket);
      else byGroup.set(groupKey, [bucket]);
    }
  }

  // A stable sort of the whole group, filtered later, equals a stable sort of the
  // filtered subset, but only for a consistent comparator: NaN times keep the late sort.
  if (timeSorted) for (const group of byGroup.values()) group.sort((a, b) => a.time - b.time);

  return { buckets, byGroup, timeSorted };
}

/** Evaluate every bucket at the target and assemble date-sorted trend lines per group key. */
export function evaluateTrendCurves(
  curves: TrendCurves,
  options: EvaluateTrendCurvesOptions,
): TrendLinesResult {
  const { targetInteractivity, extendToDate } = options;
  const { buckets, byGroup, timeSorted } = curves;
  const values = buckets.map((bucket) => bucket.curve.at(targetInteractivity));
  const lines = new Map<string, TrendDataPoint[]>();
  const keysWithData: string[] = [];

  // Lines keep the order in which each group first has a value, scanning date-major.
  for (let i = 0; i < buckets.length; i++) {
    const { groupKey } = buckets[i];
    if (values[i] === null || lines.has(groupKey)) continue;

    const points: TrendDataPoint[] = [];
    for (const { index, date, sources, waterfallEligible } of byGroup.get(groupKey)!) {
      const value = values[index];
      if (value === null) continue;
      points.push({
        date,
        value,
        x: targetInteractivity,
        sources: [...sources],
        waterfallEligible,
      });
    }
    if (!timeSorted) points.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Extend line to the requested date if the last point is earlier
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
    // Return base hwKey for legend filtering
    const baseHwKey = groupKey.includes('__') ? groupKey.split('__')[0] : groupKey;
    if (!keysWithData.includes(baseHwKey)) {
      keysWithData.push(baseHwKey);
    }
  }

  return { trendLines: lines, hwKeysWithData: keysWithData };
}

/**
 * Interpolate the selected metric at the target interactivity for every
 * (date, group) bucket and assemble date-sorted trend lines per group key.
 */
export function buildTrendLines(
  dateGroupedData: ReadonlyMap<string, ReadonlyMap<string, InferenceData[]>>,
  options: BuildTrendLinesOptions,
): TrendLinesResult {
  return evaluateTrendCurves(buildTrendCurves(dateGroupedData, options), options);
}
