/**
 * @file utils.ts
 * @description Inference-specific utility functions for filtering chart data.
 * For Pareto front calculations, see @/lib/chart-utils
 */

import chartDefinitions from '@/components/inference/inference-chart-config.json';

import { ChartDefinition, InferenceData, YAxisMetricKey } from './types';

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
 * Filters data points based on latency limits defined in the chart definition.
 * Only applies filtering for latency-related metrics.
 *
 * @param {InferenceData[]} data - The data points to filter
 * @param {ChartDefinition} chartDefinition - The chart definition containing latency limits
 * @param {string} selectedYAxisMetric - The currently selected Y-axis metric
 * @returns {InferenceData[]} The filtered data points
 */
export const filterDataByLatencyLimit = (
  data: InferenceData[],
  chartDefinition: ChartDefinition,
): InferenceData[] => {
  // Only apply filtering for latency-related metrics
  const isLatencyMetric = chartDefinition.chartType === 'e2e';

  if (!isLatencyMetric || !chartDefinition.y_latency_limit) {
    return data;
  }

  return data.filter((point) => point.x <= chartDefinition.y_latency_limit!);
};

/**
 * Process overlay (unofficial run) data to match the same pipeline as official data.
 *
 * Applies: metric field filtering, x/y remapping (including x-axis overrides for
 * input metrics on the interactivity chart), and cost limit filtering.
 */
export function processOverlayChartData(
  data: InferenceData[],
  chartType: 'e2e' | 'interactivity',
  selectedYAxisMetric: string,
  selectedXAxisMetric: string | null,
): InferenceData[] {
  const chartDef = (chartDefinitions as ChartDefinition[]).find((d) => d.chartType === chartType);
  if (!chartDef) return [];

  const metricKey = selectedYAxisMetric.replace('y_', '') as YAxisMetricKey;

  // Resolve x-axis field (must match useChartData logic)
  const metricTitle =
    (chartDef[`${selectedYAxisMetric}_title` as keyof ChartDefinition] as string) || '';
  const isInputMetric = metricTitle.toLowerCase().includes('input');
  let xAxisField: string = chartDef.x;
  // selectedXAxisMetric is already the effective metric for this chart type
  // (interactivity uses selectedXAxisMetric, e2e uses selectedE2eXAxisMetric)
  const isTtftOverride =
    selectedXAxisMetric === 'p99_ttft' || selectedXAxisMetric === 'median_ttft';

  if (selectedXAxisMetric && chartDef.chartType === 'interactivity' && isInputMetric) {
    xAxisField = selectedXAxisMetric;
  } else if (chartDef.chartType === 'interactivity' && isInputMetric) {
    const xOverrideKey = `${selectedYAxisMetric}_x` as keyof ChartDefinition;
    xAxisField = (chartDef[xOverrideKey] as string) || chartDef.x;
  } else if (chartDef.chartType === 'e2e' && isTtftOverride) {
    xAxisField = selectedXAxisMetric!;
  }

  const processedData = data
    .filter((d) => metricKey in d)
    .map((d: InferenceData) => {
      const yValue = (d[metricKey] as { y: number })?.y ?? d.y;
      const xValue = (d as any)[xAxisField] ?? d.x;
      return { ...d, x: xValue, y: yValue };
    })
    .filter(
      (d) =>
        xAxisField === chartDef.x || !chartDef.y_latency_limit || d.x <= chartDef.y_latency_limit,
    );

  return filterDataByCostLimit(processedData, chartDef, selectedYAxisMetric);
}
