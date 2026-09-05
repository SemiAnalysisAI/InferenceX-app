/**
 * Compare-history support for the profit estimator — pure, no React.
 *
 * Mirrors the `/inference` "Compare history" panel: the reader picks up to four
 * chip configs and a date range, and the estimator prices those configs at the
 * range's start and end dates alongside today's bar. `/inference` fetches each
 * comparison date as its own exact-date benchmarks query and stamps every row
 * with the date it was requested for (`useChartData`); this module does the
 * same grouping for the calculator's interpolation path so a historical bar is
 * built by the exact logic that builds the current one.
 */

import { rowToSequence } from '@semianalysisai/inferencex-constants';

import type { AvailabilityRow, BenchmarkRow } from '@/lib/api';
import { dedupeAgenticHistoryRuns } from '@/lib/benchmark-run-selection';
import { buildAvailabilityHwKey } from '@/lib/chart-utils';
import { getHardwareConfig, getModelSortIndex, isKnownGpu } from '@/lib/constants';
import { type Percentile, Sequence } from '@/lib/data-mappings';
import { getDisplayLabel } from '@/lib/utils';

import { interpolateForGPU } from './interpolation';
import type { ProfitEstimatorRow } from './profit-estimator';
import type { CalculatorMode, CostProvider, InterpolatedResult } from './types';
import { buildGpuGroups, type GroupMeta } from './useThroughputData';

/** Most chip configs the panel compares at once; the same cap `/inference` applies. */
export const PROFIT_HISTORY_MAX_GPUS = 4;

/**
 * Separator between a result key and the date it was priced on. `~` matches
 * the `/inference` comparison entries, is URL-safe, and never appears in a
 * hwKey, a precision, or an ISO date.
 */
const HISTORY_KEY_SEP = '~';

/** Result key for a chip priced on a comparison date: `gb300_sglang~2026-06-14`. */
export function historyResultKey(baseKey: string, date: string): string {
  return `${baseKey}${HISTORY_KEY_SEP}${date}`;
}

/** Split a history result key back into its base key and date. */
export function parseHistoryResultKey(resultKey: string): { baseKey: string; date?: string } {
  const at = resultKey.lastIndexOf(HISTORY_KEY_SEP);
  if (at === -1) return { baseKey: resultKey };
  return { baseKey: resultKey.slice(0, at), date: resultKey.slice(at + 1) };
}

interface HistoryGroupMeta extends GroupMeta {
  date: string;
}

const byModelOrder = (a: string, b: string) =>
  getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b);

/**
 * Chip configs the panel offers: every known config with an agentic-traces
 * availability row for the model at one of the selected precisions. Same
 * derivation as `availableGPUs` in `InferenceContext`, pinned to the agentic
 * workload the estimator prices.
 */
export function profitHistoryChipOptions(
  availabilityRows: readonly AvailabilityRow[] | undefined,
  dbModelKeys: readonly string[],
  precisions: readonly string[],
  displayModel?: string,
): { value: string; label: string }[] {
  if (!availabilityRows) return [];
  const hwKeys = new Set<string>();
  for (const r of availabilityRows) {
    if (!dbModelKeys.includes(r.model)) continue;
    if (rowToSequence(r) !== Sequence.AgenticTraces) continue;
    if (!precisions.includes(r.precision)) continue;
    if (!r.hardware) continue;
    const hwKey = buildAvailabilityHwKey(
      r.hardware,
      r.framework,
      r.spec_method,
      r.disagg,
      r.benchmark_type,
    );
    if (isKnownGpu(hwKey)) hwKeys.add(hwKey);
  }
  return [...hwKeys].toSorted(byModelOrder).map((hw) => ({
    value: hw,
    label: getDisplayLabel(getHardwareConfig(hw, displayModel)),
  }));
}

/**
 * Dates the range picker can offer: every run date on which one of the
 * selected configs has an agentic row for the model. Same derivation as
 * `dateRangeAvailableDates` in `InferenceContext`.
 */
export function profitHistoryAvailableDates(
  availabilityRows: readonly AvailabilityRow[] | undefined,
  dbModelKeys: readonly string[],
  precisions: readonly string[],
  selectedGPUs: readonly string[],
): string[] {
  if (!availabilityRows || selectedGPUs.length === 0) return [];
  const dates = new Set<string>();
  for (const r of availabilityRows) {
    if (!dbModelKeys.includes(r.model)) continue;
    if (rowToSequence(r) !== Sequence.AgenticTraces) continue;
    if (!precisions.includes(r.precision)) continue;
    if (!r.hardware) continue;
    const hwKey = buildAvailabilityHwKey(
      r.hardware,
      r.framework,
      r.spec_method,
      r.disagg,
      r.benchmark_type,
    );
    if (selectedGPUs.includes(hwKey)) dates.add(r.date);
  }
  return [...dates].toSorted();
}

/**
 * The dates to fetch for a comparison: the range endpoints, minus the run date
 * the main query already covers. Nothing to fetch until both a chip and a
 * complete range are chosen. (`/inference` does the same in
 * `buildComparisonDates`, plus individually pinned runs the estimator has no
 * UI for.)
 */
export function profitHistoryComparisonDates(
  selectedGPUs: readonly string[],
  range: { startDate: string; endDate: string },
  currentRunDate: string | undefined,
): string[] {
  if (selectedGPUs.length === 0 || !range.startDate || !range.endDate) return [];
  return [...new Set([range.startDate, range.endDate])].filter((d) => d !== currentRunDate);
}

/** Rows fetched for one comparison date. */
export interface ProfitHistoryDateRows {
  date: string;
  rows: readonly BenchmarkRow[];
}

/**
 * Interpolate the selected chips at the target on each comparison date. One
 * agentic run per config per date is kept (the same rule the `/inference`
 * comparison applies), rows are grouped by `hwKey[__precision]~date`, and each
 * group is read at the target by `interpolateForGPU`, so a historical bar is
 * priced by the exact logic that prices today's.
 */
export function buildProfitHistoryResults(
  rowsByDate: readonly ProfitHistoryDateRows[],
  options: {
    selectedGPUs: readonly string[];
    precisions: string[];
    percentile: Percentile;
    targetValue: number;
    mode: CalculatorMode;
    costProvider: CostProvider;
  },
): (InterpolatedResult & { date: string })[] {
  const { selectedGPUs, precisions, percentile, targetValue, mode, costProvider } = options;
  if (selectedGPUs.length === 0) return [];
  const multiPrecision = precisions.length > 1;
  const results: (InterpolatedResult & { date: string })[] = [];
  for (const { date, rows } of rowsByDate) {
    const { grouped, groupMeta } = buildGpuGroups<HistoryGroupMeta>(
      dedupeAgenticHistoryRuns([...rows]),
      {
        sequence: Sequence.AgenticTraces,
        precisions,
        percentile,
        tokenType: 'total',
        classify: (hwKey, row) => {
          if (!selectedGPUs.includes(hwKey)) return null;
          const baseKey = multiPrecision ? `${hwKey}__${row.precision}` : hwKey;
          return {
            key: historyResultKey(baseKey, date),
            meta: { hwKey, precision: multiPrecision ? row.precision : undefined, date },
          };
        },
      },
    );
    for (const [groupKey, points] of Object.entries(grouped)) {
      const meta = groupMeta[groupKey];
      if (!meta) continue;
      const result = interpolateForGPU(points, targetValue, mode, costProvider);
      if (!result || !(result.value > 0)) continue;
      results.push({
        ...result,
        hwKey: meta.hwKey,
        resultKey: groupKey,
        precision: meta.precision,
        date: meta.date,
      });
    }
  }
  return results;
}

/**
 * Order bars for the comparison view: chips in the order they already hold
 * (revenue descending, from `estimateProfitRows`), and within a chip its dates
 * oldest → newest so the current bar sits at the right of its group. Rows with
 * no date are today's and sort last within their chip.
 */
export function orderProfitRowsForHistory<T extends Pick<ProfitEstimatorRow, 'hwKey' | 'date'>>(
  rows: readonly T[],
): T[] {
  const chipOrder: string[] = [];
  for (const row of rows) if (!chipOrder.includes(row.hwKey)) chipOrder.push(row.hwKey);
  return rows.toSorted((a, b) => {
    const chip = chipOrder.indexOf(a.hwKey) - chipOrder.indexOf(b.hwKey);
    if (chip !== 0) return chip;
    if (a.date === b.date) return 0;
    if (a.date === undefined) return 1;
    if (b.date === undefined) return -1;
    return a.date < b.date ? -1 : 1;
  });
}

/**
 * Rank of each date among the dates on the chart, oldest first, with the
 * current (undated) bar last. Drives the shade ramp: `/inference` separates a
 * config's dates by lightness (lighter = older) rather than by hue, and the
 * bars do the same.
 */
export function profitHistoryDateRanks(rows: readonly Pick<ProfitEstimatorRow, 'date'>[]): {
  rank: (date: string | undefined) => number;
  count: number;
} {
  const dated = [...new Set(rows.map((r) => r.date).filter((d): d is string => Boolean(d)))];
  dated.sort();
  const hasCurrent = rows.some((r) => r.date === undefined);
  const count = dated.length + (hasCurrent ? 1 : 0);
  return {
    count,
    rank: (date) => (date === undefined ? count - 1 : dated.indexOf(date)),
  };
}

/** Deepest fade an older bar gets toward the page background, as a mix share. */
export const HISTORY_MAX_FADE = 0.55;

/**
 * Mix share toward the background for a bar at `rank` of `count` dates: the
 * newest is the solid chip colour, the oldest fades by `HISTORY_MAX_FADE`, and
 * anything between sits on a straight ramp. A single date never fades.
 */
export function historyFadeShare(rank: number, count: number): number {
  if (count <= 1 || rank < 0) return 0;
  return HISTORY_MAX_FADE * (1 - rank / (count - 1));
}

/**
 * Lightness ceiling an older bar fades toward. Below the page background in
 * each theme so the oldest bar still reads against it.
 */
const HISTORY_L_CEILING = { light: 0.86, dark: 0.92 } as const;

/**
 * Shade a vendor colour for an older comparison date. Chip colours arrive as
 * `oklch(L C H)` strings from `useThemeColors`; the hue is kept (it names the
 * chip) and lightness moves toward the theme ceiling by `fade`, with chroma
 * eased off so the older bar reads as a washed version of today's. Anything
 * that is not an oklch string is returned unchanged.
 */
export function shadeHistoryColor(color: string, fade: number, theme: 'light' | 'dark'): string {
  if (fade <= 0) return color;
  const match = /^oklch\(\s*(?<l>[\d.]+)\s+(?<c>[\d.]+)\s+(?<h>[\d.]+)\s*\)$/u.exec(color);
  if (!match?.groups) return color;
  const l = Number(match.groups.l);
  const c = Number(match.groups.c);
  const h = match.groups.h;
  const ceiling = HISTORY_L_CEILING[theme];
  const nextL = l + (ceiling - l) * fade;
  const nextC = c * (1 - fade * 0.5);
  return `oklch(${nextL.toFixed(3)} ${nextC.toFixed(3)} ${h})`;
}
