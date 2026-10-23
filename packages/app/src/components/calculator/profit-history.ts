import { rowToSequence } from '@semianalysisai/inferencex-constants';

import {
  comparisonEntryDate,
  comparisonEntryLabel,
  comparisonEntrySortValue,
  parseComparisonEntry,
} from '@/components/inference/utils/comparisonEntry';
import { dataRunsForDate, type RunScope } from '@/components/inference/utils/runEnumeration';
import type { AvailabilityRow, BenchmarkRow, RunConfigRow } from '@/lib/api/api';
import { dedupeAgenticHistoryRuns } from '@/lib/benchmarks/benchmark-run-selection';
import { buildAvailabilityHwKey } from '@/lib/charts/chart-utils';
import { getHardwareConfig, getModelSortIndex, isKnownGpu } from '@/lib/catalog/constants';
import { type Percentile, Sequence } from '@/lib/catalog/data-mappings';
import { getDisplayLabel } from '@/lib/shared/utils';

import { interpolateProfitForGPU, type ProfitPowerBasis } from './profit-power';
import type { ProfitEstimatorRow } from './profit-estimator';
import { buildGpuGroups, type GroupMeta } from './throughput-data';
import type { CalculatorMode, CostProvider, InterpolatedResult } from './types';

export const PROFIT_HISTORY_MAX_GPUS = 4;

const HISTORY_KEY_SEP = '|';

export function historyResultKey(baseKey: string, entry: string): string {
  return `${baseKey}${HISTORY_KEY_SEP}${entry}`;
}

export function parseHistoryResultKey(resultKey: string): { baseKey: string; date?: string } {
  const at = resultKey.indexOf(HISTORY_KEY_SEP);
  if (at === -1) return { baseKey: resultKey };
  return { baseKey: resultKey.slice(0, at), date: resultKey.slice(at + 1) };
}

export function profitHistoryEntryLabel(entry: string, numbering?: Map<string, number>): string {
  return comparisonEntryLabel(entry, numbering);
}

export function profitHistoryEntryDate(entry: string): string {
  return comparisonEntryDate(entry);
}

interface HistoryGroupMeta extends GroupMeta {
  date: string;
}

const byModelOrder = (a: string, b: string) =>
  getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b);

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

export interface ProfitHistoryDateRows {
  date: string;
  rows: readonly BenchmarkRow[];
}

export function buildProfitHistoryResults(
  rowsByDate: readonly ProfitHistoryDateRows[],
  options: {
    selectedGPUs: readonly string[];
    precisions: string[];
    percentile: Percentile;
    targetValue: number;
    mode: CalculatorMode;
    costProvider: CostProvider;
    powerBasis?: ProfitPowerBasis;
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
    powerBasis = 'provisioned',
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
      const result = interpolateProfitForGPU(points, targetValue, mode, costProvider, powerBasis);
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

export const HISTORY_MAX_FADE = 0.55;

export function historyFadeShare(rank: number, count: number): number {
  if (count <= 1 || rank < 0) return 0;
  return HISTORY_MAX_FADE * (1 - rank / (count - 1));
}

const HISTORY_L_CEILING = { light: 0.86, dark: 0.92 } as const;

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
      if (runId !== undefined && currentRunIds[hwKey] === runId) continue;
      missing.push(`${chipLabel(hwKey)} • ${entry ? entryLabel(entry) : currentDateLabel}`);
    }
  }
  return missing;
}
