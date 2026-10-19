import { withPercentile } from '@/lib/benchmarks/benchmark-transform';

import type { AggDataEntry, ChartDefinition } from '../types';
import type { XAxisMode } from '../hooks/useChartData';

export type FixedSequenceStatistic = 'mean' | 'median';

export type XAxisBranch =
  | 'natural'
  | 'user-input-override'
  | 'config-input-override'
  | 'e2e-ttft-override';

export interface ResolvedXAxis {
  xAxisField: keyof AggDataEntry;
  naturalX: keyof AggDataEntry;
  isInputMetric: boolean;
  isTtftOverride: boolean;
  branch: XAxisBranch;
}

export function resolveServiceField(
  field: string,
  opts: { isAgentic: boolean; percentile: string; fixedSequenceStatistic?: FixedSequenceStatistic },
): keyof AggDataEntry {
  const { isAgentic, percentile, fixedSequenceStatistic = 'median' } = opts;
  const resolved = withPercentile(field, isAgentic ? percentile : fixedSequenceStatistic);
  return (
    !isAgentic && resolved === 'mean_intvty' ? 'mean_tpot_intvty' : resolved
  ) as keyof AggDataEntry;
}

export function resolveXAxisField(
  chartDef: ChartDefinition,
  selectedYAxisMetric: string,
  effectiveXMetric: string | null,
  opts: {
    isAgentic: boolean;
    percentile: string;
    xAxisMode?: XAxisMode;
    fixedSequenceStatistic?: FixedSequenceStatistic;
  },
): ResolvedXAxis {
  const { isAgentic, percentile, xAxisMode } = opts;
  const serviceField = (field: string) => resolveServiceField(field, opts);
  const naturalX = serviceField(chartDef.x);

  const metricTitle =
    (chartDef[`${selectedYAxisMetric}_title` as keyof ChartDefinition] as string) || '';
  const isInputMetric = metricTitle.toLowerCase().includes('input');
  const hasTtftOverride =
    typeof effectiveXMetric === 'string' && effectiveXMetric.endsWith('_ttft');

  let xAxisField: keyof AggDataEntry = naturalX;
  let branch: XAxisBranch = 'natural';
  if (xAxisMode !== undefined) {
    if (xAxisMode === 'ttft' && chartDef.chartType === 'e2e') {
      xAxisField = serviceField('median_ttft');
      branch = 'e2e-ttft-override';
    }
  } else if (
    effectiveXMetric &&
    chartDef.chartType === 'interactivity' &&
    isInputMetric &&
    !isAgentic
  ) {
    xAxisField = effectiveXMetric as keyof AggDataEntry;
    branch = 'user-input-override';
  } else if (chartDef.chartType === 'interactivity' && isInputMetric) {
    const xOverrideKey = `${selectedYAxisMetric}_x` as keyof ChartDefinition;
    xAxisField = ((chartDef[xOverrideKey] as string) || chartDef.x) as keyof AggDataEntry;
    branch = 'config-input-override';
  } else if (chartDef.chartType === 'e2e' && hasTtftOverride) {
    xAxisField = effectiveXMetric as keyof AggDataEntry;
    branch = 'e2e-ttft-override';
  }

  if (isAgentic) {
    xAxisField = withPercentile(xAxisField, percentile) as keyof AggDataEntry;
  }

  return {
    xAxisField,
    naturalX,
    isInputMetric,
    isTtftOverride: xAxisField.endsWith('_ttft'),
    branch,
  };
}
