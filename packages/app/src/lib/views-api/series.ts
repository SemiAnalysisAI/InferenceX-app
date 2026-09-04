import { GPU_VENDORS, rowToSequence } from '@semianalysisai/inferencex-constants';

import chartDefinitions, {
  METRIC_REGISTRY,
  tokenMetricTypeForConfigKey,
  type MetricConfigKey,
  type MetricKey,
} from '@/components/inference/metric-registry';
import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import {
  applyAgenticPercentileToXLabel,
  applyScopeFilters,
  dedupeRowsToLatestPerConfig,
  flipRooflineDirection,
  supportsPointTokenMetric,
  type RooflineDirection,
} from '@/components/inference/hooks/chart-data-core';
import { resolveXAxisField } from '@/components/inference/utils/resolveXAxisField';
import { pointDeploymentMode, type QuickFilters } from '@/components/inference/utils/quickFilters';
import { bestSeriesPerSku } from '@/components/inference/utils/best-series-per-sku';
import type { BenchmarkRow } from '@/lib/api';
import { transformBenchmarkRows } from '@/lib/benchmark-transform';
import {
  isFrontierEligible,
  paretoFrontForDirection,
  remapInferencePoint,
  type ParetoDirection,
} from '@/lib/chart-utils';
import { GPU_ALIAS_TO_CANONICAL, getModelSortIndex, hardwareKeyMatchesBase } from '@/lib/constants';
import { hardwareLegendLabel } from '@/lib/views-api/legend';
import { Sequence } from '@/lib/data-mappings';
import { isKvOffloadEnabled } from '@/lib/kv-offload';

/**
 * Server-side equivalent of `useChartData`'s official-data path for the views
 * API: dedupe → transform → percentile remap → derived fields → quick filters →
 * GPU filter → pareto/best flags → group by hwKey. Every step reuses the same
 * pure functions the dashboard chart pipeline runs client-side.
 */

/** X-axis modes the API serves. `e2e-normalized-interactivity` is trace-derived
 * client-side and has no server-side data source, so it is not accepted here. */
export type SeriesXMode = 'interactivity' | 'ttft' | 'e2e';

export interface InferenceSeriesOptions {
  readonly sequence: Sequence;
  /** Latency percentile for agentic x fields (`p75` | `p90`). */
  readonly percentile: string;
  /** Resolved precisions (already defaulted by the route). */
  readonly precisions: readonly string[];
  readonly metricConfigKey: MetricConfigKey;
  readonly xmode: SeriesXMode;
  /** TTFT x metric override (e.g. `p90_ttft`); used by `ttft` mode and input metrics. */
  readonly xmetric: string;
  /** Explicit hwKey / bare-GPU selection; empty = all. */
  readonly gpus: readonly string[];
  readonly quickFilters: QuickFilters;
  /** Return only Pareto-frontier points. */
  readonly optimal: boolean;
  /** Return only the best series per GPU SKU. */
  readonly best: boolean;
}

export interface InferenceSeriesPoint {
  readonly x: number;
  readonly y: number;
  readonly concurrency: number;
  readonly tp: number;
  readonly date: string;
  readonly runId?: number;
  readonly frontier: boolean;
  readonly bestPerSku: boolean;
  readonly metrics: Readonly<Record<string, number>>;
}

export interface InferenceSeriesEntry {
  readonly hwKey: string;
  readonly gpu: string;
  readonly framework: string;
  readonly specMethod: string;
  readonly label: string;
  readonly vendor?: string;
  readonly deployment: string;
  readonly kvOffload: boolean;
  readonly bestPerSku: boolean;
  readonly points: readonly InferenceSeriesPoint[];
}

export interface InferenceSeriesMetricMeta {
  readonly key: MetricKey;
  readonly configKey: MetricConfigKey;
  readonly label: string;
  readonly labelZh: string;
  readonly unit: string | null;
  readonly polarity: 'higher' | 'lower' | null;
  readonly direction: ParetoDirection | null;
}

export interface InferenceSeriesResult {
  readonly series: readonly InferenceSeriesEntry[];
  readonly hardware: readonly { key: string; label: string; vendor?: string }[];
  readonly frontier: { direction: ParetoDirection | null; points: number };
  readonly metric: InferenceSeriesMetricMeta;
  readonly xAxis: { mode: SeriesXMode; field: string; label: string };
  readonly count: number;
}

/** Trailing parenthesized unit from a registry label, e.g. `(tok/s/gpu)`. */
function unitFromLabel(label: string): string | null {
  const match = /\((?<unit>[^()]+)\)\s*$/u.exec(label);
  return match?.groups?.unit ?? null;
}

/** GitHub Actions run id parsed from a point's run_url, when present. */
function runIdFromUrl(runUrl: string | undefined): number | undefined {
  if (!runUrl) return undefined;
  const match = /\/runs\/(?<runId>\d+)/u.exec(runUrl);
  return match?.groups?.runId === undefined ? undefined : Number(match.groups.runId);
}

function extractMetricValue(point: InferenceData, metricKey: string): number | undefined {
  const value = point[metricKey as keyof InferenceData];
  if (value && typeof value === 'object' && 'y' in value) {
    return (value as { y: number }).y;
  }
  return undefined;
}

/** Raw metric values shipped with each point: the selected metric + throughput bases. */
function pointMetrics(point: InferenceData, metricKey: MetricKey): Record<string, number> {
  const keys = new Set<string>([metricKey, 'tpPerGpu', 'outputTputPerGpu', 'inputTputPerGpu']);
  const metrics: Record<string, number> = {};
  for (const key of keys) {
    const value = extractMetricValue(point, key);
    if (value !== undefined) metrics[key] = value;
  }
  return metrics;
}

/**
 * Resolve the x-axis label the dashboard would render for this selection.
 * Mirrors the display-label ladder in `useChartData.stableChartDefinitions`
 * (natural label, input-metric override label, TTFT override label, agentic
 * percentile prefix) without the chart-heading bookkeeping.
 */
function resolveXAxisLabel(
  chartDef: ChartDefinition,
  metricConfigKey: MetricConfigKey,
  branch: string,
  effectiveXMetric: string | null,
  isAgentic: boolean,
  percentile: string,
): string {
  let label = chartDef.x_label;
  if (branch === 'e2e-ttft-override') {
    const pctl = (effectiveXMetric ?? 'p90_ttft').replace(/_ttft$/u, '');
    const pctlWord = pctl === 'median' ? 'Median' : pctl.toUpperCase();
    label = `${pctlWord} Time To First Token (s)`;
  } else if (branch === 'user-input-override' || branch === 'config-input-override') {
    const override = chartDef[`${metricConfigKey}_x_label` as keyof ChartDefinition];
    label = typeof override === 'string' && override.length > 0 ? override : chartDef.x_label;
  }
  if (isAgentic) {
    label = applyAgenticPercentileToXLabel(label, percentile.toUpperCase());
  }
  return label;
}

export function buildInferenceSeries(
  rows: readonly BenchmarkRow[],
  options: InferenceSeriesOptions,
): InferenceSeriesResult {
  const {
    sequence,
    percentile,
    precisions,
    metricConfigKey,
    xmode,
    xmetric,
    gpus,
    quickFilters,
    optimal,
    best,
  } = options;

  const metricKey = metricConfigKey.slice(2) as MetricKey;
  const registryEntry = METRIC_REGISTRY[metricKey];
  const isAgentic = sequence === Sequence.AgenticTraces;

  // 1. Scope rows to the sequence and keep only each series' newest run.
  const seqRows = rows.filter((row) => rowToSequence(row) === sequence);
  const deduped = dedupeRowsToLatestPerConfig([...seqRows]);

  // 2. Full chart transform at the selected percentile (same as the dashboard).
  const { chartData } = transformBenchmarkRows(deduped, percentile);

  // 3. Pick the chart definition for the x mode (index order matches
  //    `chartDefinitions`: [interactivity, e2e]).
  const chartIndex = xmode === 'interactivity' ? 0 : 1;
  const chartDef = chartDefinitions[chartIndex] as ChartDefinition;
  const effectiveXMetric = xmode === 'e2e' ? null : xmetric;
  const resolved = resolveXAxisField(chartDef, metricConfigKey, effectiveXMetric, {
    isAgentic,
    percentile,
  });

  // 4. Precision + scope filters (GPU picks and vendor/framework/deployment/spec pills).
  //    The dashboard's GPU selector passes full hardware keys (`b200_trt`), but
  //    API callers may pass base registry keys (`b200`), so expand base keys to
  //    every matching hardware key before reusing the dashboard scope filter.
  const precisionSet = new Set(precisions);
  const precisionScoped = (chartData[chartIndex] ?? []).filter((point) =>
    precisionSet.has(point.precision),
  );
  const matchedHwKeys = [
    ...new Set(
      precisionScoped
        .map((point) => String(point.hwKey))
        .filter((hwKey) =>
          gpus.some(
            (g) => hwKey === g || hardwareKeyMatchesBase(GPU_ALIAS_TO_CANONICAL[hwKey] ?? hwKey, g),
          ),
        ),
    ),
  ];
  // An empty expansion must stay a filter (match nothing), not become "all":
  // fall back to the raw keys, which exact-match nothing by construction.
  const expandedGpus =
    gpus.length === 0 ? [] : matchedHwKeys.length > 0 ? matchedHwKeys : [...gpus];
  const scoped = applyScopeFilters(precisionScoped, expandedGpus, quickFilters);

  // 5. Metric coverage filter, then remap x/y to the selected metric and x field.
  const tokenType = tokenMetricTypeForConfigKey(metricConfigKey);
  const mapped = scoped
    .filter((point) => metricKey in point && supportsPointTokenMetric(point, tokenType))
    .map((point) => remapInferencePoint(point, metricKey, resolved.xAxisField));

  // 6. Pareto direction: the chart's configured corner, flipped when the x-axis
  //    good-direction reverses (same rule as useChartData).
  const configuredDirection = chartDef[`${metricConfigKey}_roofline` as keyof ChartDefinition] as
    | RooflineDirection
    | undefined;
  const xAxisFlipped =
    resolved.xAxisField !== resolved.naturalX &&
    !(chartDef.chartType === 'e2e' && resolved.isTtftOverride);
  const direction =
    configuredDirection && xAxisFlipped
      ? flipRooflineDirection(configuredDirection)
      : (configuredDirection ?? null);

  // 7. Frontier flags, scoped per (hwKey, date) exactly like ScatterGraph.
  const frontierPoints = new Set<InferenceData>();
  if (direction) {
    const frontierFn = paretoFrontForDirection(direction);
    const byHwDate = new Map<string, InferenceData[]>();
    for (const point of mapped) {
      const key = `${point.hwKey}|${point.date}`;
      const bucket = byHwDate.get(key);
      if (bucket) bucket.push(point);
      else byHwDate.set(key, [point]);
    }
    for (const bucket of byHwDate.values()) {
      for (const point of frontierFn(bucket.filter(isFrontierEligible))) {
        frontierPoints.add(point);
      }
    }
  }

  // 8. Best series per SKU over the full mapped point set.
  const bestHwKeys = direction ? bestSeriesPerSku(mapped, direction) : new Set<string>();

  // 9. Group into series by hwKey.
  const byHwKey = new Map<string, InferenceData[]>();
  for (const point of mapped) {
    const bucket = byHwKey.get(point.hwKey);
    if (bucket) bucket.push(point);
    else byHwKey.set(point.hwKey, [point]);
  }

  const hwKeys = [...byHwKey.keys()].toSorted(
    (a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b),
  );

  const series: InferenceSeriesEntry[] = [];
  for (const hwKey of hwKeys) {
    const seriesIsBest = bestHwKeys.has(hwKey);
    if (best && bestHwKeys.size > 0 && !seriesIsBest) continue;

    const allPoints = byHwKey.get(hwKey)!;
    const kept = optimal ? allPoints.filter((point) => frontierPoints.has(point)) : allPoints;
    if (kept.length === 0) continue;

    const sample = kept[0];
    const deployments = new Set(kept.map((point) => pointDeploymentMode(point)));

    series.push({
      hwKey,
      gpu: hwKey.split('_')[0],
      framework: sample.framework ?? '',
      specMethod: sample.spec_decoding ?? 'none',
      label: hardwareLegendLabel(hwKey, sample.model),
      vendor: GPU_VENDORS[hwKey.split('_')[0]],
      deployment: deployments.size === 1 ? [...deployments][0] : 'mixed',
      kvOffload: kept.some((point) =>
        isKvOffloadEnabled({
          kv_offloading: point.kv_offloading,
          offload_mode: point.offload_mode,
        }),
      ),
      bestPerSku: seriesIsBest,
      points: kept
        .toSorted((a, b) => a.x - b.x)
        .map((point) => ({
          x: point.x,
          y: point.y,
          concurrency: point.conc ?? 0,
          tp: point.tp ?? 0,
          date: point.date ?? '',
          ...(runIdFromUrl(point.run_url) === undefined
            ? {}
            : { runId: runIdFromUrl(point.run_url) }),
          frontier: frontierPoints.has(point),
          bestPerSku: seriesIsBest,
          metrics: pointMetrics(point, metricKey),
        })),
    });
  }

  const count = series.reduce((total, entry) => total + entry.points.length, 0);

  return {
    series,
    hardware: series.map((entry) => ({
      key: entry.hwKey,
      label: entry.label,
      ...(entry.vendor ? { vendor: entry.vendor } : {}),
    })),
    frontier: { direction, points: frontierPoints.size },
    metric: {
      key: metricKey,
      configKey: metricConfigKey,
      label: registryEntry.label,
      labelZh: registryEntry.labelZh,
      unit: unitFromLabel(registryEntry.label),
      polarity: 'polarity' in registryEntry ? registryEntry.polarity : null,
      direction,
    },
    xAxis: {
      mode: xmode,
      field: String(resolved.xAxisField),
      label: resolveXAxisLabel(
        chartDef,
        metricConfigKey,
        resolved.branch,
        effectiveXMetric,
        isAgentic,
        percentile,
      ),
    },
    count,
  };
}
