import {
  parseComparisonEntry,
  resolveComparisonEntries,
} from '@/components/inference/utils/comparisonEntry';
import { applyQuickFilters, type QuickFilters } from '@/components/inference/utils/quickFilters';
import type { InferenceData } from '@/components/inference/types';
import { dedupeRowsToLatestPerConfig as dedupeLatestBenchmarkSeries } from '@/lib/benchmark-run-selection';
import { GPU_ALIAS_TO_CANONICAL, hardwareKeyMatchesAnyBase } from '@/lib/constants';
import { overviewServingSeriesKey, type OverviewServingSeriesRow } from '@/lib/overview-data';
import { supportsChartTokenMetric, type TokenMetricType } from '@/lib/supplemental-benchmarks';

/**
 * Pure chart-data helpers shared by the inference chart hook and the
 * server-side views API. This module must stay free of React and data-fetching
 * imports so route handlers can import it: `useChartData.ts` re-exports
 * everything here for existing client import sites.
 */

export type XAxisMode = 'ttft' | 'e2e' | 'interactivity' | 'e2e-normalized-interactivity';

export const X_AXIS_MODES: readonly XAxisMode[] = [
  'ttft',
  'e2e',
  'interactivity',
  'e2e-normalized-interactivity',
];

/**
 * Modes whose x metric is derived from persisted per-request traces —
 * these only exist for agentic scenarios (fixed-seq rows have no
 * trace_replay blob to derive them from).
 */
export function isAgenticOnlyXAxisMode(mode: XAxisMode): boolean {
  return mode === 'e2e-normalized-interactivity';
}

/** Build deduplicated comparison dates, excluding the main run date. */
export function buildComparisonDates(
  selectedGPUs: string[],
  selectedDates: string[],
  selectedDateRange: { startDate: string; endDate: string },
  selectedRunDate: string | undefined,
  selectedRunId?: string,
): string[] {
  if (selectedGPUs.length === 0) return [];
  // Range endpoints + individually-added dates/runs (redundant same-day range
  // endpoints dropped), minus the main date/run which the primary query covers.
  // Other run-qualified entries on the same day are distinct overlays and stay.
  return resolveComparisonEntries(selectedDates, selectedDateRange).filter((entry) => {
    if (entry === selectedRunDate) return false;
    const { runId } = parseComparisonEntry(entry);
    return runId === undefined || runId !== selectedRunId;
  });
}

/** Filter data by GPU key, resolving aliases to canonical keys. */
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

/** Restrict one snapshot to the exact serving envelope selected by Overview. */
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

/** Flip roofline direction when the x-axis is swapped. */
export function flipRooflineDirection(dir: RooflineDirection): RooflineDirection {
  return FLIP_MAP[dir];
}

/**
 * Roofline corner for a trace-derived x-axis mode. Derived modes render on the
 * e2e chart definition, whose corners assume lower-x-is-better; when the
 * derived metric is higher-is-better (E2E Normalized Interactivity) the corner mirrors
 * horizontally. This keeps the y-metric's own good direction — throughput and
 * tokens-per-dollar purchasing power land on an upper corner, while cost and
 * joules land on a lower one.
 */
export function derivedModeRoofline(
  configuredE2eCorner: RooflineDirection | undefined,
  higherXIsBetter: boolean,
): RooflineDirection | undefined {
  if (!configuredE2eCorner || !higherXIsBetter) return configuredE2eCorner;
  return flipRooflineDirection(configuredE2eCorner);
}

// Statistic words that may already prefix an x-axis label (from chart config
// or the TTFT override label). Trailing whitespace is consumed so a replace
// never doubles the separator space.
const X_LABEL_STAT_PREFIX_RE = /^(?:Median|Mean|P75|P90|P95|P99(?:\.9)?)\b\s*/iu;

/**
 * Agentic sequences plot percentile fields (e.g. `p90_intvty`, `p75_e2el`),
 * so the x-axis label must carry the selected percentile. Replaces an
 * existing leading statistic word (e.g. the TTFT override's "P90 Time To
 * First Token (s)") or prefixes the percentile when the configured label has
 * none (e.g. "Interactivity (tok/s/user)" → "P90 Interactivity (tok/s/user)").
 * Only call for agentic sequences — fixed-seq labels must stay untouched.
 */
export function applyAgenticPercentileToXLabel(label: string, pctlWord: string): string {
  return X_LABEL_STAT_PREFIX_RE.test(label)
    ? label.replace(X_LABEL_STAT_PREFIX_RE, `${pctlWord} `)
    : `${pctlWord} ${label}`;
}

/** The dedup key fields a chart series is identified by. */
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

// offload_mode normalized `?? 'off'` to match the SQL layer's getBenchmarksForRun
// lineKey — agentic offload=on and offload=off are distinct series.
/**
 * Keep only the newest workflow run for each chart series. Agentic series omit
 * point-level spec decoding from their curve identity; fixed-sequence series do not.
 */
export function dedupeRowsToLatestPerConfig<T extends DedupeRow>(rows: T[]): T[] {
  return dedupeLatestBenchmarkSeries(rows);
}

/**
 * Coarse filters that apply to every y-axis metric: the explicit GPU picks, the
 * vendor / deployment / spec quick-filter pills, and the two-GPU compare scope.
 * Deliberately excludes the y-metric coverage filter, so the result is the set
 * of configs the user could have selected regardless of which axis is drawn.
 */
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

/** Apply snapshot-scoped metric support using the source date, not its display date. */
export function supportsPointTokenMetric(
  point: Pick<InferenceData, 'hwKey' | 'date' | 'actualDate'>,
  tokenType: TokenMetricType,
): boolean {
  return supportsChartTokenMetric(String(point.hwKey), point.actualDate ?? point.date, tokenType);
}
