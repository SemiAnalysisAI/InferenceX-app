/**
 * @file utils.ts
 * @description Inference-specific utility functions for filtering chart data.
 * For Pareto front calculations, see @/lib/chart-utils
 */

import chartDefinitions from '@/components/inference/inference-chart-config.json';
import { withPercentile } from '@/lib/benchmark-transform';
import { e2eFrontierWinners } from '@/components/inference/utils/e2eFrontier';

import type { ChartDefinition, InferenceData, YAxisMetricKey } from './types';

/**
 * Select the matching unofficial-run overlay for a chart mode. Normalized E2E
 * is intentionally excluded: unofficial benchmark rows do not include the
 * persisted per-request trace needed to normalize before taking percentiles.
 */
export function selectUnofficialOverlayForMode<T>(
  xAxisMode: string,
  chartType: 'e2e' | 'interactivity',
  overlays: { e2e: T | null; interactivity: T | null },
): T | null {
  if (xAxisMode === 'normalized-e2e') return null;
  return overlays[chartType];
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
 * Process overlay (unofficial run) data to match the same pipeline as official data.
 *
 * Applies: metric field filtering, x/y remapping (including x-axis overrides for
 * input metrics on the interactivity chart, and percentile selection for agentic
 * runs), and cost limit filtering.
 *
 * The percentile handling MUST mirror `useChartData`'s `stableChartDefinitions`
 * exactly. Both the official run and its `?unofficialrun=` overlay draw from the
 * same transform, so the overlay of a run must land on the identical x column as
 * that run's official points. Agentic charts plot the natural latency metric at
 * the user-selected percentile (e.g. `median_intvty` → `p90_intvty`); skipping
 * that here plotted overlays against `median_intvty` while the official points sat
 * on `p90_intvty`, shifting an overlay of the *same* run to the right on the "P90
 * Interactivity" chart. Fixed-seq rows carry no p90_/p99_ columns, so non-agentic
 * is forced to `median` (the percentile selector is hidden for them).
 */
export function processOverlayChartData(
  data: InferenceData[],
  chartType: 'e2e' | 'interactivity',
  selectedYAxisMetric: string,
  selectedXAxisMetric: string | null,
  options?: { isAgentic?: boolean; selectedPercentile?: string },
): InferenceData[] {
  const chartDef = (chartDefinitions as ChartDefinition[]).find((d) => d.chartType === chartType);
  if (!chartDef) return [];

  const metricKey = selectedYAxisMetric.replace('y_', '') as YAxisMetricKey;
  const isAgentic = options?.isAgentic === true;
  const selectedPercentile = options?.selectedPercentile ?? 'median';

  // Resolve x-axis field (must match useChartData logic). Default = the chart's
  // natural latency metric, percentile-adjusted for agentic (median forced for
  // fixed-seq, whose p90_/p99_ columns don't exist).
  const metricTitle =
    (chartDef[`${selectedYAxisMetric}_title` as keyof ChartDefinition] as string) || '';
  const isInputMetric = metricTitle.toLowerCase().includes('input');
  let xAxisField: string = withPercentile(chartDef.x, isAgentic ? selectedPercentile : 'median');
  // selectedXAxisMetric is already the effective metric for this chart type
  // (interactivity uses selectedXAxisMetric, e2e uses selectedE2eXAxisMetric).
  // Match any *_ttft metric — the x-axis-mode picker can now select any
  // percentile (median/p75/p90/p99) depending on sequence kind.
  const isTtftOverride =
    typeof selectedXAxisMetric === 'string' && selectedXAxisMetric.endsWith('_ttft');

  if (
    selectedXAxisMetric &&
    chartDef.chartType === 'interactivity' &&
    isInputMetric &&
    !isAgentic
  ) {
    xAxisField = selectedXAxisMetric;
  } else if (chartDef.chartType === 'interactivity' && isInputMetric) {
    const xOverrideKey = `${selectedYAxisMetric}_x` as keyof ChartDefinition;
    xAxisField = (chartDef[xOverrideKey] as string) || chartDef.x;
  } else if (chartDef.chartType === 'e2e' && isTtftOverride) {
    xAxisField = selectedXAxisMetric!;
  }

  // Agentic: rewrite the resolved x metric to the chosen percentile (mirrors the
  // final agentic block in useChartData). Idempotent for overrides that already
  // carry the percentile (e.g. p90_ttft), and applies it to the config-default
  // input override (median_ttft → p90_ttft) and the natural intvty/e2el field.
  if (isAgentic) {
    xAxisField = withPercentile(xAxisField, selectedPercentile);
  }

  // The latency limit targets overload outliers on the TTFT axis only; skip it
  // for the natural axis and for agentic (long TTFTs are normal there).
  const isTtftX = xAxisField.endsWith('_ttft');

  const processedData = data
    .filter((d) => metricKey in d)
    .map((d: InferenceData) => {
      const yValue = (d[metricKey] as { y: number })?.y ?? d.y;
      const xValue = (d as any)[xAxisField] ?? d.x;
      return { ...d, x: xValue, y: yValue };
    })
    .filter(
      (d) => !isTtftX || isAgentic || !chartDef.y_latency_limit || d.x <= chartDef.y_latency_limit,
    );

  const costFiltered = filterDataByCostLimit(processedData, chartDef, selectedYAxisMetric);

  // Anti-benchmark-hacking parity: on agentic charts whose x-axis is NOT the
  // natural e2e latency, the official roofline is restricted to configs that
  // ALSO win on end-to-end latency (useChartData stamps `isOnE2eFrontier` for
  // every non-e2e x-mode, ScatterGraph's roofline honors it). Stamp the same
  // flag on overlay points so overlayRooflines can apply the identical
  // restriction — otherwise the overlay draws a fresh frontier on the swapped
  // axis that rides above the official e2e-restricted line. This covers the
  // interactivity chartType (only displayed in non-e2e modes) AND the e2e
  // chartType when its x is overridden to TTFT (the 'ttft' mode). Seed per run
  // (matching overlayRooflines' per-run grouping) so points from one unofficial
  // run can't dominate another's. The e2e chart on its natural axis needs no
  // restriction (it IS the e2e frontier), and fixed-seq has no separate
  // session-time notion, so both leave the flag unset.
  if (isAgentic && (chartType === 'interactivity' || isTtftX)) {
    const byRun = new Map<string, InferenceData[]>();
    for (const p of costFiltered) {
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
      for (const p of runPoints) p.isOnE2eFrontier = winners.has(p);
    }
  }

  return costFiltered;
}
