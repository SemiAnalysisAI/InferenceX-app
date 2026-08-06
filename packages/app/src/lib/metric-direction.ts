/**
 * Single source of truth for whether a chart Y-axis metric is "higher is
 * better" or "lower is better".
 *
 * The chart config (inference-chart-config.json) already declares this per
 * metric via the roofline direction field (`y_<metric>_roofline`):
 *   - 'upper_right' / 'upper_left'  → higher-is-better
 *   - 'lower_right' / 'lower_left'  → lower-is-better
 *
 * This module exposes a helper for non-chart consumers (tables, AUC, etc)
 * that need the same direction info without re-reading the JSON.
 */

import type { ChartDefinition } from '@/components/inference/types';

import type { ParetoDirection } from './pareto';

export type RooflineDirection = 'upper_right' | 'upper_left' | 'lower_left' | 'lower_right';

export function rooflineDirectionToPareto(dir: RooflineDirection | undefined): ParetoDirection {
  if (dir === 'lower_left' || dir === 'lower_right') return 'lower';
  return 'higher';
}

export function isHigherBetter(dir: RooflineDirection | undefined): boolean {
  return rooflineDirectionToPareto(dir) === 'higher';
}

/**
 * Look up the roofline direction for a given Y-axis metric on a given chart
 * definition. Returns the configured direction or undefined when the chart
 * has no mapping for that metric.
 */
export function getMetricRooflineDirection(
  chartDef: ChartDefinition,
  yAxisMetric: string,
): RooflineDirection | undefined {
  const key = `${yAxisMetric}_roofline` as keyof ChartDefinition;
  const val = chartDef[key];
  if (
    val === 'upper_right' ||
    val === 'upper_left' ||
    val === 'lower_left' ||
    val === 'lower_right'
  ) {
    return val;
  }
  return undefined;
}

/**
 * Convenience: pareto direction for a metric on a chart definition.
 * Defaults to 'higher' when unknown.
 */
export function getMetricParetoDirection(
  chartDef: ChartDefinition,
  yAxisMetric: string,
): ParetoDirection {
  return rooflineDirectionToPareto(getMetricRooflineDirection(chartDef, yAxisMetric));
}
