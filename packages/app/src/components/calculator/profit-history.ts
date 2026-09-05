/**
 * Compare-history support for the profit estimator — pure, no React.
 *
 * Mirrors the `/inference` "Compare history" panel: the reader picks up to four
 * chip configs, a date range, and any individual dates or runs from the Config
 * Changelog, and the estimator prices those configs on each comparison entry
 * alongside today's bar. Comparison entries are the same strings `/inference`
 * keeps in `i_dates` (a plain date, or `date~r<runId>` for one specific run,
 * see `comparisonEntry.ts`); `/inference` fetches each as its own benchmarks
 * query and stamps every row with the entry it was requested for
 * (`useChartData`). This module does the same grouping for the calculator's
 * interpolation path so a historical bar is built by the exact logic that
 * builds the current one.
 */

import { rowToSequence } from '@semianalysisai/inferencex-constants';

import {
  comparisonEntryDate,
  comparisonEntryLabel,
  comparisonEntrySortValue,
  parseComparisonEntry,
} from '@/components/inference/utils/comparisonEntry';
import { dataRunsForDate, type RunScope } from '@/components/inference/utils/runEnumeration';
import type { AvailabilityRow, BenchmarkRow, RunConfigRow } from '@/lib/api';
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
 * Separator between a result key and the comparison entry it was priced on.
 * `|` is URL-safe in a result key (never serialised) and appears in neither a
 * hwKey, a precision, nor a comparison entry (which uses `~` for its own run
 * suffix).
 */
const HISTORY_KEY_SEP = '|';

/**
 * Result key for a chip priced on a comparison entry:
 * `gb300_sglang|2026-06-14` or `gb300_sglang|2026-06-14~r27489075807`.
 */
export function historyResultKey(baseKey: string, entry: string): string {
  return `${baseKey}${HISTORY_KEY_SEP}${entry}`;
}

/** Split a history result key back into its base key and comparison entry. */
export function parseHistoryResultKey(resultKey: string): { baseKey: string; date?: string } {
  const at = resultKey.indexOf(HISTORY_KEY_SEP);
  if (at === -1) return { baseKey: resultKey };
  return { baseKey: resultKey.slice(0, at), date: resultKey.slice(at + 1) };
}

/**
 * Human label for a comparison entry, as the `/inference` legend shows it: the
 * plain date, or `date #n` for one of several same-day runs. `numbering` comes
 * from the changelog's run enumeration so both surfaces print the same #n.
 */
export function profitHistoryEntryLabel(entry: string, numbering?: Map<string, number>): string {
  return comparisonEntryLabel(entry, numbering);
}

/** Calendar date behind a comparison entry (drops any `~r<runId>` suffix). */
export function profitHistoryEntryDate(entry: string): string {
  return comparisonEntryDate(entry);
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

/** Rows fetched for one comparison entry (a date, or one run on a date). */
export interface ProfitHistoryDateRows {
  /** The comparison entry the rows were requested for. */
  date: string;
  rows: readonly BenchmarkRow[];
}

/**
 * Interpolate the selected chips at the target on each comparison entry. One
 * agentic run per config per entry is kept (the same rule the `/inference`
 * comparison applies), rows are grouped by `hwKey[__precision]|entry`, and each
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
    /**
     * Per chip, the run its current bar is built from
     * (`profitHistoryCurrentRunIds`); a pinned run entry for that same run is
     * skipped for that chip, since the bar is already on the chart.
     */
    currentRunIds?: Readonly<Record<string, string>>;
  },
): (InterpolatedResult & { date: string })[] {
  const {
    selectedGPUs,
    precisions,
    percentile,
    targetValue,
    mode,
    costProvider,
    currentRunIds = {},
  } = options;
  if (selectedGPUs.length === 0) return [];
  const multiPrecision = precisions.length > 1;
  const results: (InterpolatedResult & { date: string })[] = [];
  for (const { date, rows } of rowsByDate) {
    const { runId } = parseComparisonEntry(date);
    const { grouped, groupMeta } = buildGpuGroups<HistoryGroupMeta>(
      dedupeAgenticHistoryRuns([...rows]),
      {
        sequence: Sequence.AgenticTraces,
        precisions,
        percentile,
        tokenType: 'total',
        classify: (hwKey, row) => {
          if (!selectedGPUs.includes(hwKey)) return null;
          if (runId !== undefined && currentRunIds[hwKey] === runId) return null;
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

const entryOrder = (a: string, b: string): number => {
  const [ad, ar] = comparisonEntrySortValue(a);
  const [bd, br] = comparisonEntrySortValue(b);
  return ad - bd || ar - br;
};

/**
 * Order bars for the comparison view: chips in the order they already hold
 * (revenue descending, from `estimateProfitRows`), and within a chip its
 * entries oldest → newest (same-day runs in run order, as `/inference` sorts
 * them) so the current bar sits at the right of its group. Rows with no entry
 * are today's and sort last within their chip.
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
    return entryOrder(a.date, b.date);
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
  dated.sort(entryOrder);
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

/**
 * Per compared chip, the run its current bar is built from: the estimator's
 * main query is an as-of-date fetch with no run id, and `dedupeAgenticHistoryRuns`
 * keeps each config's latest run of the day, so two chips can sit on different
 * runs. Read back from the changelog's enumeration of the current date, the
 * same ordering the dedupe applies. Chips with no run that day are absent.
 */
export function profitHistoryCurrentRunIds(
  changelogs: readonly { date: string; runConfigs: RunConfigRow[] }[],
  selectedRunDate: string | undefined,
  scope: RunScope,
): Record<string, string> {
  const today = changelogs.find((c) => c.date === selectedRunDate);
  if (!today) return {};
  const ids: Record<string, string> = {};
  for (const hwKey of scope.selectedGPUs) {
    const runs = dataRunsForDate(today.runConfigs, { ...scope, selectedGPUs: [hwKey] });
    const latest = runs.at(-1);
    if (latest) ids[hwKey] = latest.runId;
  }
  return ids;
}

/**
 * Drop pinned run entries that would only redraw current bars: a run is
 * skipped when every compared chip either shows that run today already or
 * has no run that day at all. `/inference` covers its single main run by
 * handing `buildComparisonDates` a `selectedRunId`; the estimator has one per
 * chip, so the check is per entry here and per chip in
 * `buildProfitHistoryResults`. Nothing is dropped until the current date's
 * changelog has loaded.
 */
export function dropCurrentRunEntries(
  entries: readonly string[],
  selectedGPUs: readonly string[],
  currentRunIds: Readonly<Record<string, string>>,
): string[] {
  if (Object.keys(currentRunIds).length === 0) return [...entries];
  return entries.filter((entry) => {
    const { runId } = parseComparisonEntry(entry);
    if (runId === undefined) return true;
    return selectedGPUs.some((hwKey) => {
      const current = currentRunIds[hwKey];
      return current !== undefined && current !== runId;
    });
  });
}

/**
 * Chips the legend lists: today's chips that priced, plus, while a
 * comparison is active, any compared chip that only priced on an earlier
 * entry (it still owns bars, so it is appended in registry order rather than
 * dropped with them).
 */
export function profitHistoryLegendKeys(
  availableHwKeys: readonly string[],
  pricedRows: readonly Pick<ProfitEstimatorRow, 'hwKey'>[],
  historyActive: boolean,
): string[] {
  const priced = new Set(pricedRows.map((row) => row.hwKey));
  const keys = availableHwKeys.filter((key) => priced.has(key));
  if (!historyActive) return keys;
  const seen = new Set(keys);
  const historyOnly = [...priced]
    .filter((key) => !seen.has(key))
    .toSorted((a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b));
  return [...keys, ...historyOnly];
}

/**
 * Compared chips with no bar on a comparison entry, or on the current date
 * (`''`) when the chip only priced earlier, as `chip • when` captions so a
 * missing bar reads as "no run that day", not as a zero. A pinned run that a
 * chip already shows as its current bar is not missing for that chip.
 */
export function profitHistoryMissing(
  pricedRows: readonly Pick<ProfitEstimatorRow, 'hwKey' | 'date'>[],
  comparisonDates: readonly string[],
  selectedGPUs: readonly string[],
  chipLabel: (hwKey: string) => string,
  entryLabel: (entry: string) => string,
  currentDateLabel: string,
  currentRunIds: Readonly<Record<string, string>> = {},
): string[] {
  const priced = new Set(pricedRows.map((row) => `${row.hwKey}~${row.date ?? ''}`));
  const missing: string[] = [];
  for (const entry of [...comparisonDates, '']) {
    const { runId } = parseComparisonEntry(entry);
    for (const hwKey of selectedGPUs) {
      if (priced.has(`${hwKey}~${entry}`)) continue;
      // A pinned run that is this chip's current run is on the chart as
      // today's bar (`buildProfitHistoryResults` skips it), not missing.
      if (runId !== undefined && currentRunIds[hwKey] === runId) continue;
      missing.push(`${chipLabel(hwKey)} • ${entry ? entryLabel(entry) : currentDateLabel}`);
    }
  }
  return missing;
}
