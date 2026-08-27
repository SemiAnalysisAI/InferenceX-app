import type { InferenceData, TrendDataPoint, YAxisMetricKey } from '@/components/inference/types';
import {
  isBenchmarkMetricKey,
  tokenMetricTypeForConfigKey,
} from '@/components/inference/metric-registry';
import {
  hermiteInterpolate,
  monotoneSlopes,
  paretoFrontUpperLeft,
  recoverReciprocalNumerator,
  reciprocalMetricAt,
} from '@/components/calculator/interpolation';
import { buildDerivedChartFields, getHardwareKey, type DerivedMetricKey } from '@/lib/chart-utils';
import { isKnownGpu } from '@/lib/constants';
import { rowToAggDataEntry } from '@/lib/benchmark-transform';
import type { BenchmarkRow } from '@/lib/api';
import { benchmarkCurveDate, dedupeAgenticHistoryRuns } from '@/lib/benchmark-run-selection';
import { supportsTokenMetric } from '@/lib/supplemental-benchmarks';

/**
 * Pure historical-trend assembly shared by `useInterpolatedTrendData` (client)
 * and the views API's `/api/v1/views/historical` route (server). All math and
 * grouping lives here; the hook stays a thin React wrapper.
 */

/** Snapshot-scoped token metric support for raw historical rows. */
export function rowSupportsTrendMetric(row: BenchmarkRow, selectedYAxisMetric: string): boolean {
  return supportsTokenMetric(row, tokenMetricTypeForConfigKey(selectedYAxisMetric));
}

/**
 * Build a lightweight InferenceData-compatible point from a raw BenchmarkRow.
 * This deliberately skips full chart transformation and derives only the
 * selected trend metric plus its frontier/interpolation dependencies.
 */
export function rowToLightweightPoint(
  row: BenchmarkRow,
  requestedMetrics: readonly DerivedMetricKey[],
): InferenceData | null {
  const entry = rowToAggDataEntry(row);
  const hwKey = getHardwareKey(entry);
  // Historical rows predating explicit output-throughput telemetry used total
  // throughput as output throughput. Preserve that production fallback for
  // output cost, purchasing-power, and energy trend metrics.
  const derivedEntry =
    row.metrics.output_tput_per_gpu === null || row.metrics.output_tput_per_gpu === undefined
      ? { ...entry, output_tput_per_gpu: entry.tput_per_gpu }
      : entry;
  if (!isKnownGpu(hwKey)) return null;

  return {
    x: row.metrics.median_intvty ?? 0,
    y: row.metrics.tput_per_gpu ?? 0,
    hwKey,
    precision: row.precision,
    tp: row.decode_tp,
    conc: row.conc,
    date: benchmarkCurveDate(row),
    ...buildDerivedChartFields(derivedEntry, hwKey, requestedMetrics),
  } as InferenceData;
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
  costn: 'tpPerGpu',
  costr: 'tpPerGpu',
  costhOutput: 'outputTputPerGpu',
  costnOutput: 'outputTputPerGpu',
  costrOutput: 'outputTputPerGpu',
  costhi: 'inputTputPerGpu',
  costni: 'inputTputPerGpu',
  costri: 'inputTputPerGpu',
  // J/token = W / (tok/s)
  jTotal: 'tpPerGpu',
  jOutput: 'outputTputPerGpu',
  jInput: 'inputTputPerGpu',
};

/**
 * Purchasing-power metrics mapped to the throughput they scale. Their Pareto
 * knots must come from this throughput too: choosing the total-throughput
 * frontier for output/input tokens can select a different serving envelope
 * from the corresponding tokens-per-dollar chart.
 */
const PROPORTIONAL_TO_THROUGHPUT: Partial<Record<YAxisMetricKey, YAxisMetricKey>> = {
  tokensPerDollarH: 'tpPerGpu',
  tokensPerDollarN: 'tpPerGpu',
  tokensPerDollarR: 'tpPerGpu',
  outputTokensPerDollarH: 'outputTputPerGpu',
  outputTokensPerDollarN: 'outputTputPerGpu',
  outputTokensPerDollarR: 'outputTputPerGpu',
  inputTokensPerDollarH: 'inputTputPerGpu',
  inputTokensPerDollarN: 'inputTputPerGpu',
  inputTokensPerDollarR: 'inputTputPerGpu',
  tokensPerRmbH: 'tpPerGpu',
  tokensPerRmbN: 'tpPerGpu',
  tokensPerRmbR: 'tpPerGpu',
  outputTokensPerRmbH: 'outputTputPerGpu',
  outputTokensPerRmbN: 'outputTputPerGpu',
  outputTokensPerRmbR: 'outputTputPerGpu',
  inputTokensPerRmbH: 'inputTputPerGpu',
  inputTokensPerRmbN: 'inputTputPerGpu',
  inputTokensPerRmbR: 'inputTputPerGpu',
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
 * Interpolate a selected metric at a target interactivity for a set of InferenceData points
 * from a single GPU. Uses a throughput-based Pareto front + monotone cubic Hermite spline.
 *
 * Exported for unit testing.
 */
export function interpolateMetricAtInteractivity(
  points: InferenceData[],
  targetInteractivity: number,
  metricKey: YAxisMetricKey,
): number | null {
  if (points.length === 0) return null;

  // Tokens/$ uses the corresponding total/output/input throughput frontier so
  // its knots exactly match the throughput/interactivity serving envelope.
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

  // Sort frontier by interactivity ascending
  const sorted = [...frontier].toSorted((a, b) => a.x - b.x);

  // No extrapolation — target must be within frontier range
  if (targetInteractivity < sorted[0].x || targetInteractivity > sorted.at(-1)!.x) {
    return null;
  }

  // Single point — only return if target matches exactly
  if (sorted.length === 1) {
    return Math.abs(targetInteractivity - sorted[0].x) < 1e-6
      ? extractMetric(sorted[0], metricKey)
      : null;
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

  // Tokens/$ is `throughput * 3600 / hourlyCost`. Spline the matching
  // throughput and apply that constant multiplier so the purchasing-power
  // curve cannot drift from its throughput/interactivity Pareto curve.
  if (proportionalThroughputKey) {
    const tputYs = sorted.map((p) => extractMetric(p, proportionalThroughputKey)!);
    const multiplier = recoverProportionalMultiplier(metricYs, tputYs);
    if (multiplier !== null) {
      const tputSlopes = monotoneSlopes(xs, tputYs);
      const tput = hermiteInterpolate(xs, tputYs, tputSlopes, targetInteractivity);
      return Math.max(0, tput) * multiplier;
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
      const tput = hermiteInterpolate(xs, tputYs, tputSlopes, targetInteractivity);
      return reciprocalMetricAt(numerator, Math.max(0, tput));
    }
  }

  // Monotone cubic Hermite spline interpolation
  const slopes = monotoneSlopes(xs, metricYs);
  const interpolated = hermiteInterpolate(xs, metricYs, slopes, targetInteractivity);

  // Clamp to prevent negative values from cubic spline overshoots
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
  readonly selectedPrecisions: readonly string[];
  readonly selectedYAxisMetric: string;
  readonly requestedMetrics: readonly DerivedMetricKey[];
  /** Extra row-level filter (e.g. the views API's gpu/vendor/date scoping). */
  readonly rowFilter?: (row: BenchmarkRow) => boolean;
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
  const { selectedPrecisions, selectedYAxisMetric, requestedMetrics, rowFilter } = options;
  const result = new Map<string, Map<string, InferenceData[]>>();
  if (allRows.length === 0) return result;

  const multiPrecision = selectedPrecisions.length > 1;
  for (const row of dedupeAgenticHistoryRuns([...allRows])) {
    if (!selectedPrecisions.includes(row.precision)) continue;
    if (!rowSupportsTrendMetric(row, selectedYAxisMetric)) continue;
    if (rowFilter && !rowFilter(row)) continue;

    const point = rowToLightweightPoint(row, requestedMetrics);
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
  /**
   * Extend each line to this date with a synthetic copy of its last value when
   * the line ends earlier. The hook passes wall-clock today; the views API
   * passes the latest data date so responses stay cache-stable.
   */
  readonly extendToDate?: string;
}

export interface TrendLinesResult {
  readonly trendLines: Map<string, TrendDataPoint[]>;
  readonly hwKeysWithData: string[];
}

/**
 * Interpolate the selected metric at the target interactivity for every
 * (date, group) bucket and assemble date-sorted trend lines per group key.
 */
export function buildTrendLines(
  dateGroupedData: ReadonlyMap<string, ReadonlyMap<string, InferenceData[]>>,
  options: BuildTrendLinesOptions,
): TrendLinesResult {
  const { targetInteractivity, trendMetricKey, extendToDate } = options;
  const resultMap = new Map<string, Map<string, TrendDataPoint>>();

  for (const [date, byGroupKey] of dateGroupedData) {
    for (const [groupKey, points] of byGroupKey) {
      const interpolated = interpolateMetricAtInteractivity(
        points,
        targetInteractivity,
        trendMetricKey,
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
  }

  return { trendLines: lines, hwKeysWithData: keysWithData };
}
