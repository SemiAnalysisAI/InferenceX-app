import type { InferenceData } from '@/components/inference/types';
import { resolveComparisonEntries } from '@/components/inference/utils/comparisonEntry';
import { applyQuickFilters, type QuickFilters } from '@/components/inference/utils/quickFilters';
import { dedupeRowsToLatestPerConfig as dedupeLatestBenchmarkSeries } from '@/lib/benchmarks/benchmark-run-selection';
import { GPU_ALIAS_TO_CANONICAL, hardwareKeyMatchesAnyBase } from '@/lib/catalog/constants';
import {
  overviewServingSeriesKey,
  type OverviewServingSeriesRow,
} from '@/lib/overview/overview-data';
import {
  supportsChartTokenMetric,
  type TokenMetricType,
} from '@/lib/benchmarks/supplemental-benchmarks';
export type XAxisMode = 'ttft' | 'e2e' | 'interactivity' | 'e2e-normalized-interactivity';

export const X_AXIS_MODES: readonly XAxisMode[] = [
  'ttft',
  'e2e',
  'interactivity',
  'e2e-normalized-interactivity',
];

export function isAgenticOnlyXAxisMode(mode: XAxisMode): boolean {
  return mode === 'e2e-normalized-interactivity';
}

export function buildComparisonDates(
  selectedGPUs: string[],
  selectedDates: string[],
  selectedDateRange: { startDate: string; endDate: string },
  selectedRunDate: string | undefined,
): string[] {
  if (selectedGPUs.length === 0) return [];
  return resolveComparisonEntries(selectedDates, selectedDateRange).filter(
    (entry) => entry !== selectedRunDate,
  );
}

export function filterByGPU<T extends { hwKey: unknown }>(
  data: T[],
  selectedGPUs: string[],
  aliasMap: Record<string, string>,
): T[] {
  if (selectedGPUs.length === 0) return data;
  return data.filter((dp) => {
    const hwKey = String(dp.hwKey);
    const canonical = aliasMap[hwKey];
    return (
      selectedGPUs.includes(hwKey) || (canonical !== undefined && selectedGPUs.includes(canonical))
    );
  });
}

export function filterOverviewHistoryRows<T extends OverviewServingSeriesRow>(
  rows: T[],
  configKey: string | undefined,
): T[] {
  return configKey === undefined
    ? rows
    : rows.filter((row) => overviewServingSeriesKey(row) === configKey);
}

export type RooflineDirection = 'upper_left' | 'upper_right' | 'lower_left' | 'lower_right';
export const FLIP_MAP: Record<RooflineDirection, RooflineDirection> = {
  upper_left: 'upper_right',
  upper_right: 'upper_left',
  lower_left: 'lower_right',
  lower_right: 'lower_left',
};

export function flipRooflineDirection(dir: RooflineDirection): RooflineDirection {
  return FLIP_MAP[dir];
}

export function derivedModeRoofline(
  configuredE2eCorner: RooflineDirection | undefined,
  higherXIsBetter: boolean,
): RooflineDirection | undefined {
  if (!configuredE2eCorner || !higherXIsBetter) return configuredE2eCorner;
  return flipRooflineDirection(configuredE2eCorner);
}

const X_LABEL_STAT_PREFIX_RE = /^(?:Median|Mean|P75|P90|P95|P99(?:\.9)?)\b\s*/iu;

export function applyAgenticPercentileToXLabel(label: string, pctlWord: string): string {
  return X_LABEL_STAT_PREFIX_RE.test(label)
    ? label.replace(X_LABEL_STAT_PREFIX_RE, `${pctlWord} `)
    : `${pctlWord} ${label}`;
}

interface DedupeRow {
  hardware: string;
  framework: string;
  spec_method: string;
  disagg: boolean;
  precision: string;
  offload_mode?: string | null;
  benchmark_type?: string;
  date: string;
  workflow_run_id?: number;
  run_started_at?: string | null;
}

export function dedupeRowsToLatestPerConfig<T extends DedupeRow>(rows: T[]): T[] {
  return dedupeLatestBenchmarkSeries(rows);
}

export function applyScopeFilters(
  points: InferenceData[],
  selectedGPUs: string[],
  quickFilters: QuickFilters,
  compareGpuPair?: readonly [string, string] | null,
): InferenceData[] {
  let scoped = filterByGPU(points, selectedGPUs, GPU_ALIAS_TO_CANONICAL);
  scoped = applyQuickFilters(scoped, quickFilters);
  if (compareGpuPair) {
    scoped = scoped.filter((d) => hardwareKeyMatchesAnyBase(String(d.hwKey), compareGpuPair));
  }
  return scoped;
}

export function supportsPointTokenMetric(
  point: Pick<InferenceData, 'hwKey' | 'date' | 'actualDate'>,
  tokenType: TokenMetricType,
): boolean {
  return supportsChartTokenMetric(String(point.hwKey), point.actualDate ?? point.date, tokenType);
}
