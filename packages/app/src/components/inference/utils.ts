/**
 * @file utils.ts
 * @description Inference-specific utility functions for filtering chart data.
 * For Pareto front calculations, see @/lib/chart-utils
 */

import chartDefinitions from '@/components/inference/inference-chart-config.json';
import { e2eFrontierWinners } from '@/components/inference/utils/e2eFrontier';
import { resolveXAxisField } from '@/components/inference/utils/resolveXAxisField';

import type { ChartDefinition, ClippedInferenceData, InferenceData, YAxisMetricKey } from './types';

export interface ProcessedChartData {
  data: InferenceData[];
  clippedData: ClippedInferenceData[];
}

/**
 * Filters data points based on cost limits defined in the chart definition.
 * Only applies filtering for cost-related metrics, and only filters based on
 * the currently selected cost metric (not all cost fields).
 *
 * @param {InferenceData[]} data - The data points to filter
 * @param {ChartDefinition} chartDefinition - The chart definition containing cost limits
 * @param {string} selectedYAxisMetric - The currently selected Y-axis metric
 * @returns {InferenceData[]} The filtered data points
 */
export const filterDataByCostLimit = (
  data: InferenceData[],
  chartDefinition: ChartDefinition,
  selectedYAxisMetric: string,
): InferenceData[] => {
  // Only apply filtering for built-in cost metrics, not custom user values
  const isCostMetric = selectedYAxisMetric.includes('cost') && selectedYAxisMetric !== 'y_costUser';

  if (!isCostMetric || !chartDefinition.y_cost_limit) {
    return data;
  }

  // Extract the metric key from selectedYAxisMetric (e.g., "y_costr" -> "costr")
  const metricKey = selectedYAxisMetric.replace('y_', '');

  // Map of metric keys to their corresponding data point fields
  const costFieldMap: Record<string, (point: InferenceData) => number | undefined> = {
    costh: (point) => point.costh?.y,
    costn: (point) => point.costn?.y,
    costr: (point) => point.costr?.y,
    costhOutput: (point) => point.costhOutput?.y,
    costnOutput: (point) => point.costnOutput?.y,
    costrOutput: (point) => point.costrOutput?.y,
    costhi: (point) => point.costhi?.y,
    costni: (point) => point.costni?.y,
    costri: (point) => point.costri?.y,
    costUser: (point) => point.costUser?.y,
  };

  const getCostValue = costFieldMap[metricKey];

  // If we don't recognize the metric, don't filter
  if (!getCostValue) {
    return data;
  }

  return data.filter((point) => {
    const costValue = getCostValue(point);
    // If the cost value doesn't exist, include the point (let other logic handle missing data)
    if (costValue === undefined) {
      return true;
    }
    return costValue <= chartDefinition.y_cost_limit!;
  });
};

/**
 * Partition already-remapped chart points without discarding the outliers.
 * The visible array preserves the existing chart behavior; clippedData gives
 * ScatterGraph enough context to draw and explain a boundary continuation.
 */
export function partitionChartDataByLimits(
  data: InferenceData[],
  chartDefinition: ChartDefinition,
  selectedYAxisMetric: string,
  options: { isTtftX: boolean; isAgentic: boolean },
): ProcessedChartData {
  const costLimitApplies =
    selectedYAxisMetric.includes('cost') &&
    selectedYAxisMetric !== 'y_costUser' &&
    chartDefinition.y_cost_limit !== undefined;
  const latencyLimitApplies =
    options.isTtftX && !options.isAgentic && chartDefinition.y_latency_limit !== undefined;

  const visible: InferenceData[] = [];
  const clippedData: ClippedInferenceData[] = [];

  for (const point of data) {
    const reasons: ClippedInferenceData['reasons'] = [];
    if (costLimitApplies && point.y > chartDefinition.y_cost_limit!) reasons.push('cost');
    if (latencyLimitApplies && point.x > chartDefinition.y_latency_limit!) {
      reasons.push('latency');
    }

    if (reasons.length > 0) clippedData.push({ point, reasons });
    else visible.push(point);
  }

  return { data: visible, clippedData };
}

/**
 * Process overlay (unofficial run) data to match the same pipeline as official data.
 *
 * Applies: metric field filtering, x/y remapping (via the resolveXAxisField
 * resolver shared with `useChartData`, so the overlay of a run lands on the
 * identical x column as that run's official points), the e2e-Pareto frontier
 * stamping for agentic non-e2e x-modes, and cost limit filtering.
 *
 * `options.restrictToE2eFrontier` is the caller-computed official gate
 * (`isAgentic && selectedXAxisMode !== 'e2e'`) — passed in rather than
 * re-derived from chartType so the overlay can't drift from `useChartData`'s
 * stamping condition.
 */
export function processOverlayChartData(
  data: InferenceData[],
  chartType: 'e2e' | 'interactivity',
  selectedYAxisMetric: string,
  selectedXAxisMetric: string | null,
  options?: {
    isAgentic?: boolean;
    selectedPercentile?: string;
    restrictToE2eFrontier?: boolean;
  },
): InferenceData[] {
  return processOverlayChartDataWithClipping(
    data,
    chartType,
    selectedYAxisMetric,
    selectedXAxisMetric,
    options,
  ).data;
}

/**
 * Overlay processor variant that retains intentionally clipped points for the
 * dashed boundary-continuation layer.
 */
export function processOverlayChartDataWithClipping(
  data: InferenceData[],
  chartType: 'e2e' | 'interactivity',
  selectedYAxisMetric: string,
  selectedXAxisMetric: string | null,
  options?: {
    isAgentic?: boolean;
    selectedPercentile?: string;
    restrictToE2eFrontier?: boolean;
  },
): ProcessedChartData {
  const chartDef = (chartDefinitions as ChartDefinition[]).find((d) => d.chartType === chartType);
  if (!chartDef) return { data: [], clippedData: [] };

  const metricKey = selectedYAxisMetric.replace('y_', '') as YAxisMetricKey;
  const isAgentic = options?.isAgentic === true;
  const selectedPercentile = options?.selectedPercentile ?? 'median';

  // selectedXAxisMetric is already the effective metric for this chart type
  // (interactivity uses selectedXAxisMetric, e2e uses selectedE2eXAxisMetric).
  const { xAxisField } = resolveXAxisField(chartDef, selectedYAxisMetric, selectedXAxisMetric, {
    isAgentic,
    percentile: selectedPercentile,
  });

  // The latency limit targets overload outliers on the TTFT axis only; skip it
  // for the natural axis and for agentic (long TTFTs are normal there).
  const isTtftX = xAxisField.endsWith('_ttft');

  const processedData = data
    .filter((d) => metricKey in d)
    .map((d: InferenceData) => {
      const yValue = (d[metricKey] as { y: number })?.y ?? d.y;
      const xValue = (d as any)[xAxisField] ?? d.x;
      return { ...d, x: xValue, y: yValue };
    });

  // Anti-benchmark-hacking parity: on agentic charts whose x-axis is NOT the
  // natural e2e latency, the official roofline is restricted to configs that
  // ALSO win on end-to-end latency (useChartData stamps `isOnE2eFrontier`,
  // ScatterGraph's rooflines honor it via e2eRestrictedSeed). Stamp the same
  // flag on overlay points, seeded per run (matching overlayRooflines' per-run
  // grouping) so points from one unofficial run can't dominate another's.
  // A null winner set means the y-metric declares no e2e roofline direction —
  // no restriction applies, so the flag stays unset (matching the official
  // path, which draws those rooflines unrestricted).
  if (options?.restrictToE2eFrontier) {
    const byRun = new Map<string, InferenceData[]>();
    for (const p of processedData) {
      const runKey = p.run_url ?? '';
      let bucket = byRun.get(runKey);
      if (!bucket) {
        bucket = [];
        byRun.set(runKey, bucket);
      }
      bucket.push(p);
    }
    for (const runPoints of byRun.values()) {
      const winners = e2eFrontierWinners(runPoints, selectedYAxisMetric, selectedPercentile);
      // Direction-less metrics resolve null for every run — stop entirely.
      if (winners === null) break;
      for (const p of runPoints) p.isOnE2eFrontier = winners.has(p);
    }
  }

  return partitionChartDataByLimits(processedData, chartDef, selectedYAxisMetric, {
    isTtftX,
    isAgentic,
  });
}
