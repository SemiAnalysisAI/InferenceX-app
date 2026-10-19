import { GPU_VENDORS, rowToSequence } from '@semianalysisai/inferencex-constants';

import {
  applyAgenticPercentileToXLabel,
  applyScopeFilters,
  dedupeRowsToLatestPerConfig,
  flipRooflineDirection,
  supportsPointTokenMetric,
  type RooflineDirection,
} from '@/components/inference/hooks/chart-data-core';
import chartDefinitions, {
  isAllInMeasuredConfigKey,
  METRIC_REGISTRY,
  tokenMetricTypeForConfigKey,
  type MetricConfigKey,
  type MetricKey,
} from '@/components/inference/metric-registry';
import {
  applyTokenRevenuePricing,
  usesTokenSalePricing,
} from '@/components/inference/token-revenue';
import type {
  ChartDefinition,
  InferenceData,
  TokenRevenuePricing,
} from '@/components/inference/types';
import { partitionChartDataByLimits } from '@/components/inference/utils';
import {
  bestSeriesPerSku,
  withUnrankedSkus,
} from '@/components/inference/utils/best-series-per-sku';
import {
  allInMeasuredTableData,
  allInMeasuredUnavailableReason,
} from '@/components/inference/utils/inference-table-data';
import { isPowerCurveMetric, upperPowerEnvelope } from '@/components/inference/utils/powerCurves';
import { pointDeploymentMode, type QuickFilters } from '@/components/inference/utils/quickFilters';
import { pointTopologyKey } from '@/components/inference/utils/topology-filter';
import {
  resolveXAxisField,
  type FixedSequenceStatistic,
} from '@/components/inference/utils/resolveXAxisField';
import type { DerivedAgenticMetricMap } from '@/hooks/api/use-derived-agentic-metrics';
import type { BenchmarkRow } from '@/lib/api/api';
import { transformBenchmarkRows } from '@/lib/benchmarks/benchmark-transform';
import {
  isFrontierEligible,
  paretoFrontForDirection,
  paretoMaximizesX,
  remapInferencePoint,
  type ParetoDirection,
} from '@/lib/charts/chart-utils';
import {
  type TcoBasis,
  GPU_ALIAS_TO_CANONICAL,
  getModelSortIndex,
  hardwareKeyMatchesBase,
} from '@/lib/catalog/constants';

import { Sequence } from '@/lib/catalog/data-mappings';
import { isKvOffloadEnabled } from '@/lib/benchmarks/kv-offload';
import { calculateCostsForGpus, calculatePowerForGpus } from '@/lib/shared/utils';
import { hardwareLegendLabel, unitFromLabel } from '@/lib/views-api/legend';

export type SeriesXMode = 'interactivity' | 'ttft' | 'e2e' | 'e2e-normalized-interactivity';

export interface InferenceSeriesOptions {
  readonly sequence: Sequence;
  readonly percentile: string;
  readonly precisions: readonly string[];
  readonly metricConfigKey: MetricConfigKey;
  readonly xmode: SeriesXMode;
  readonly fixedSequenceStatistic?: FixedSequenceStatistic;
  readonly xmetric: string;
  readonly gpus: readonly string[];
  readonly quickFilters: QuickFilters;
  readonly optimal: boolean;
  readonly best: boolean;
  readonly tcoBasis?: TcoBasis;
  readonly allPoints?: boolean;
  readonly userCosts?: Record<string, number>;
  readonly userPowers?: Record<string, number>;
  readonly pricing?: TokenRevenuePricing;
  readonly derivedMetrics?: DerivedAgenticMetricMap;
}

export interface InferenceSeriesPoint {
  readonly id: number | null;
  readonly precision: string;
  readonly x: number;
  readonly y: number;
  readonly concurrency: number;
  readonly topologyKey: string;
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

export interface InferenceTableRow extends Omit<InferenceSeriesPoint, 'x' | 'y'> {
  readonly hwKey: string;
  readonly gpu: string;
  readonly framework: string;
  readonly specMethod: string;
  readonly label: string;
  readonly vendor?: string;
  readonly deployment: string;
  readonly kvOffload: boolean;
  readonly x: number | null;
  readonly y: number | null;
  readonly measuredGpuWatts: number;
  readonly status: 'available' | 'unavailable';
  readonly unavailableReason: ReturnType<typeof allInMeasuredUnavailableReason>;
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
  readonly tableRows?: readonly InferenceTableRow[];
  readonly hardware: readonly { key: string; label: string; vendor?: string }[];
  readonly frontier: { direction: ParetoDirection | null; points: number };
  readonly metric: InferenceSeriesMetricMeta;
  readonly xAxis: { mode: SeriesXMode; field: string; label: string; statistic: string };
  readonly observedPoints: readonly InferenceData[];
  readonly count: number;
}

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

function pointMetrics(point: InferenceData, metricKey: MetricKey): Record<string, number> {
  const keys = new Set<string>([metricKey, 'tpPerGpu', 'outputTputPerGpu', 'inputTputPerGpu']);
  const metrics: Record<string, number> = {};
  for (const key of keys) {
    const value = extractMetricValue(point, key);
    if (value !== undefined) metrics[key] = value;
  }
  return metrics;
}

function resolveXAxisLabel(
  chartDef: ChartDefinition,
  branch: string,
  effectiveXMetric: string | null,
  isAgentic: boolean,
  percentile: string,
  xAxisField: string,
): string {
  let label = chartDef.x_label;
  if (branch === 'e2e-ttft-override') {
    const pctl = (effectiveXMetric ?? 'p90_ttft').replace(/_ttft$/u, '');
    const pctlWord = pctl === 'median' ? 'Median' : pctl.toUpperCase();
    label = `${pctlWord} Time To First Token (s)`;
  }
  label = applyAgenticPercentileToXLabel(
    label,
    isAgentic ? percentile.toUpperCase() : xAxisField.startsWith('mean_') ? 'Mean' : 'Median',
  );
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

  const seqRows = rows.filter((row) => rowToSequence(row) === sequence);
  const deduped = dedupeRowsToLatestPerConfig([...seqRows]);

  const { chartData } = transformBenchmarkRows(deduped, percentile, options.tcoBasis);

  const chartIndex = xmode === 'interactivity' || xmode === 'e2e-normalized-interactivity' ? 0 : 1;
  const chartDef = chartDefinitions[chartIndex] as ChartDefinition;
  const effectiveXMetric = xmode === 'e2e' ? null : xmetric;
  const resolved = resolveXAxisField(chartDef, metricConfigKey, effectiveXMetric, {
    isAgentic,
    percentile,
    xAxisMode: xmode,
    fixedSequenceStatistic: options.fixedSequenceStatistic,
  });

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
  const expandedGpus =
    gpus.length === 0 ? [] : matchedHwKeys.length > 0 ? matchedHwKeys : [...gpus];
  let scoped = applyScopeFilters(precisionScoped, expandedGpus, quickFilters);
  if (options.userCosts && (metricKey === 'costUser' || metricKey === 'tokensPerDollarUser'))
    scoped = calculateCostsForGpus(scoped, options.userCosts);
  if (options.userPowers && metricKey === 'powerUser')
    scoped = calculatePowerForGpus(scoped, options.userPowers);
  if (usesTokenSalePricing(metricConfigKey))
    scoped = applyTokenRevenuePricing(scoped, options.pricing ?? null);

  const tokenType = tokenMetricTypeForConfigKey(metricConfigKey);
  const remapped = scoped
    .filter((point) => metricKey in point && supportsPointTokenMetric(point, tokenType))
    .map((point) => remapInferencePoint(point, metricKey, resolved.xAxisField));
  const partition = partitionChartDataByLimits(
    remapped,
    { ...chartDef, x_scale_field: resolved.xAxisField },
    metricConfigKey,
    {
      isTtftX: resolved.xAxisField.endsWith('_ttft'),
      isAgentic,
    },
  );
  let mapped = options.allPoints ? remapped : partition.data;
  if (xmode === 'e2e-normalized-interactivity')
    mapped = mapped.flatMap((point) => {
      const derived = point.id === undefined ? undefined : options.derivedMetrics?.[point.id];
      const x = percentile === 'p75' ? derived?.p75_e2e_norm_intvty : derived?.p90_e2e_norm_intvty;
      return typeof x === 'number' && Number.isFinite(x) && x > 0 ? [{ ...point, x }] : [];
    });

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

  const isMeasuredPower = isPowerCurveMetric(metricConfigKey);
  const maximizePowerX = direction !== null && paretoMaximizesX(direction);
  const frontierDirection = isMeasuredPower
    ? maximizePowerX
      ? 'upper_right'
      : 'upper_left'
    : direction;
  const frontierPoints = new Set<InferenceData>();
  if (direction) {
    const frontierFn = paretoFrontForDirection(direction);
    const byHwDate = new Map<string, InferenceData[]>();
    for (const point of mapped) {
      const key = `${point.hwKey}|${point.precision}|${point.date}`;
      const bucket = byHwDate.get(key);
      if (bucket) bucket.push(point);
      else byHwDate.set(key, [point]);
    }
    for (const bucket of byHwDate.values()) {
      const frontier = isMeasuredPower
        ? upperPowerEnvelope(bucket, direction)
        : frontierFn(bucket.filter(isFrontierEligible));
      for (const point of frontier) {
        frontierPoints.add(point);
      }
    }
  }

  const bestHwKeys = direction ? bestSeriesPerSku(mapped, direction) : new Set<string>();

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
          id: point.id ?? null,
          precision: point.precision,
          x: point.x,
          y: point.y,
          concurrency: point.conc ?? 0,
          topologyKey: pointTopologyKey(point),
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
  const frontierMetrics = new Set([...frontierPoints].map((point) => point[metricKey]));
  const allInRows = isAllInMeasuredConfigKey(metricConfigKey)
    ? allInMeasuredTableData(scoped, metricKey, resolved.xAxisField)
    : undefined;
  const tableHwKeys =
    allInRows && best && bestHwKeys.size > 0
      ? withUnrankedSkus(bestHwKeys, mapped, allInRows)
      : undefined;
  const tableRows = allInRows
    ? allInRows
        .filter((point) => !tableHwKeys || tableHwKeys.has(point.hwKey))
        .map((point): InferenceTableRow => {
          const derived = point.id === undefined ? undefined : options.derivedMetrics?.[point.id];
          const x =
            xmode === 'e2e-normalized-interactivity'
              ? percentile === 'p75'
                ? derived?.p75_e2e_norm_intvty
                : derived?.p90_e2e_norm_intvty
              : point.x;
          const unavailableReason = allInMeasuredUnavailableReason(point, metricKey);
          return {
            id: point.id ?? null,
            precision: point.precision,
            hwKey: point.hwKey,
            gpu: point.hwKey.split('_')[0],
            framework: point.framework ?? '',
            specMethod: point.spec_decoding ?? 'none',
            label: hardwareLegendLabel(point.hwKey, point.model),
            vendor: GPU_VENDORS[point.hwKey.split('_')[0]],
            deployment: pointDeploymentMode(point),
            kvOffload: isKvOffloadEnabled(point),
            x:
              typeof x === 'number' &&
              Number.isFinite(x) &&
              (xmode !== 'e2e-normalized-interactivity' || x > 0)
                ? x
                : null,
            y: Number.isFinite(point.y) ? point.y : null,
            concurrency: point.conc ?? 0,
            topologyKey: pointTopologyKey(point),
            tp: point.tp ?? 0,
            date: point.date ?? '',
            ...(runIdFromUrl(point.run_url) === undefined
              ? {}
              : { runId: runIdFromUrl(point.run_url) }),
            frontier: unavailableReason === null && frontierMetrics.has(point[metricKey]),
            bestPerSku: bestHwKeys.has(point.hwKey),
            metrics: pointMetrics(point, metricKey),
            measuredGpuWatts: point.measuredAvgPower!.y,
            status: unavailableReason === null ? 'available' : 'unavailable',
            unavailableReason,
          };
        })
    : undefined;

  return {
    series,
    ...(tableRows === undefined ? {} : { tableRows }),
    hardware: series.map((entry) => ({
      key: entry.hwKey,
      label: entry.label,
      ...(entry.vendor ? { vendor: entry.vendor } : {}),
    })),
    frontier: { direction: frontierDirection, points: frontierPoints.size },
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
      statistic: isAgentic ? percentile : (options.fixedSequenceStatistic ?? 'median'),
      field:
        xmode === 'e2e-normalized-interactivity'
          ? `${percentile}_e2e_norm_intvty`
          : String(resolved.xAxisField),
      label:
        xmode === 'e2e-normalized-interactivity'
          ? `${percentile.toUpperCase()} E2E Normalized Interactivity (tok/s/user)`
          : resolveXAxisLabel(
              chartDef,
              resolved.branch,
              effectiveXMetric,
              isAgentic,
              percentile,
              String(resolved.xAxisField),
            ),
    },
    observedPoints: mapped,
    count,
  };
}
