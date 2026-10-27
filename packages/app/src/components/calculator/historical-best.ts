import type { BenchmarkRow } from '@/lib/api/api';
import { DEFAULT_TCO_BASIS, type TcoBasis } from '@/lib/catalog/constants';
import { Percentile, type Sequence } from '@/lib/catalog/data-mappings';

import { interpolateForGPU, paretoFrontUpperLeft } from './interpolation';
import { buildGpuGroups, type GroupMeta } from './throughput-data';
import type {
  CalculatorMode,
  CostProvider,
  CostType,
  GPUDataPoint,
  InterpolatedResult,
} from './types';

const KEY_SEP = '|';

interface DatedGroupMeta extends GroupMeta {
  date: string;
  precision: string;
}

/** Distinct dates across a hwKey's sweeps (one sweep per precision per date). */
function countDates(dated: readonly DatedSweep[]): number {
  return new Set(dated.map((sweep) => sweep.date)).size;
}

export interface HistoricalBestEntry {
  hwKey: string;
  date: string;
  /** Precision of the winning sweep. */
  precision: string;
  runUrls: string[];
  result: InterpolatedResult;
  rankValue: number;
  datesConsidered: number;
  datesMeasured: number;
  latestDate: string;
  supersededLatest: boolean;
  latestRankValue: number | null;
}

export interface HistoricalUnmeasured {
  hwKey: string;
  nearestBelow: number | null;
  nearestAbove: number | null;
  datesConsidered: number;
}

export interface HistoricalBestOutcome {
  best: HistoricalBestEntry[];
  unmeasured: HistoricalUnmeasured[];
  datesSeen: number;
}

export interface DatedSweep {
  date: string;
  /**
   * Precision of every point in the sweep. Each (hwKey, precision, date) is its
   * own sweep, so a config's FP4 and FP8 rows never merge into one frontier
   * that no single precision achieves.
   */
  precision: string;
  points: GPUDataPoint[];
  runUrls: string[];
}

export interface HistoryGroups {
  byHwKey: Map<string, DatedSweep[]>;
  datesSeen: number;
}

export interface GroupHistoryOptions {
  rows: BenchmarkRow[];
  sequence: Sequence;
  precisions: string[];
  percentile?: Percentile;
  tokenType?: CostType;
  tcoBasis?: TcoBasis;
  visibleHwKeys?: Set<string>;
}

export function groupHistoryByHwKeyAndDate(options: GroupHistoryOptions): HistoryGroups {
  const {
    rows,
    sequence,
    precisions,
    percentile = Percentile.P90,
    tokenType = 'total',
    tcoBasis = DEFAULT_TCO_BASIS,
    visibleHwKeys,
  } = options;
  if (rows.length === 0 || precisions.length === 0) {
    return { byHwKey: new Map(), datesSeen: 0 };
  }

  const runUrlsByGroup = new Map<string, Set<string>>();

  const { grouped, groupMeta } = buildGpuGroups<DatedGroupMeta>(rows, {
    sequence,
    precisions,
    percentile,
    tokenType,
    tcoBasis,
    classify: (hwKey, row) => {
      if (visibleHwKeys && !visibleHwKeys.has(hwKey)) return null;
      if (!row.date) return null;
      const key = `${hwKey}${KEY_SEP}${row.precision}${KEY_SEP}${row.date}`;
      if (row.run_url) {
        const urls = runUrlsByGroup.get(key) ?? new Set<string>();
        urls.add(row.run_url);
        runUrlsByGroup.set(key, urls);
      }
      return { key, meta: { hwKey, date: row.date, precision: row.precision } };
    },
  });

  const byHwKey = new Map<string, DatedSweep[]>();
  const allDates = new Set<string>();
  for (const [groupKey, points] of Object.entries(grouped)) {
    const meta = groupMeta[groupKey];
    if (!meta || points.length === 0) continue;
    allDates.add(meta.date);
    const list = byHwKey.get(meta.hwKey) ?? [];
    list.push({
      date: meta.date,
      precision: meta.precision,
      points,
      runUrls: [...(runUrlsByGroup.get(groupKey) ?? [])],
    });
    byHwKey.set(meta.hwKey, list);
  }

  return { byHwKey, datesSeen: allDates.size };
}

export interface SelectBestOptions {
  targetValue: number;
  mode: CalculatorMode;
  costProvider: CostProvider;
  rank: (result: InterpolatedResult) => number;
}

export function selectBestFromGroups(
  groups: HistoryGroups,
  options: SelectBestOptions,
): HistoricalBestOutcome {
  const { targetValue, mode, costProvider, rank } = options;
  const { byHwKey, datesSeen } = groups;

  const getInputValue = (p: GPUDataPoint) =>
    mode === 'interactivity_to_throughput' ? p.interactivity : p.throughput;
  const getOutputValue = (p: GPUDataPoint) =>
    mode === 'interactivity_to_throughput' ? p.throughput : p.interactivity;

  const best: HistoricalBestEntry[] = [];
  const unmeasured: HistoricalUnmeasured[] = [];

  for (const [hwKey, dated] of byHwKey) {
    const latestDate = dated.reduce((a, b) => (b.date > a ? b.date : a), dated[0]!.date);

    let winner: { sweep: DatedSweep; result: InterpolatedResult; rankValue: number } | null = null;
    let latestRankValue: number | null = null;
    const measuredDates = new Set<string>();

    for (const sweep of dated) {
      const result = interpolateForGPU(sweep.points, targetValue, mode, costProvider);
      if (!result || result.clamped || !(result.value > 0)) continue;

      measuredDates.add(sweep.date);
      const rankValue = rank(result);
      if (!Number.isFinite(rankValue)) continue;
      if (sweep.date === latestDate) {
        latestRankValue =
          latestRankValue === null ? rankValue : Math.max(latestRankValue, rankValue);
      }
      if (!winner || rankValue > winner.rankValue) winner = { sweep, result, rankValue };
    }

    if (!winner) {
      let nearestBelow: number | null = null;
      let nearestAbove: number | null = null;
      for (const { points } of dated) {
        const front = paretoFrontUpperLeft([...points], getInputValue, getOutputValue);
        for (const p of front) {
          const v = getInputValue(p);
          if (!Number.isFinite(v)) continue;
          if (v <= targetValue && (nearestBelow === null || v > nearestBelow)) nearestBelow = v;
          if (v >= targetValue && (nearestAbove === null || v < nearestAbove)) nearestAbove = v;
        }
      }
      unmeasured.push({
        hwKey,
        nearestBelow,
        nearestAbove,
        datesConsidered: countDates(dated),
      });
      continue;
    }

    best.push({
      hwKey,
      date: winner.sweep.date,
      runUrls: winner.sweep.runUrls,
      result: { ...winner.result, hwKey, resultKey: hwKey },
      precision: winner.sweep.precision,
      rankValue: winner.rankValue,
      datesConsidered: countDates(dated),
      datesMeasured: measuredDates.size,
      latestDate,
      supersededLatest: winner.sweep.date !== latestDate,
      latestRankValue,
    });
  }

  best.sort((a, b) => b.rankValue - a.rankValue || a.hwKey.localeCompare(b.hwKey));
  unmeasured.sort((a, b) => a.hwKey.localeCompare(b.hwKey));

  return { best, unmeasured, datesSeen };
}

export function selectHistoricalBest(
  options: GroupHistoryOptions & SelectBestOptions,
): HistoricalBestOutcome {
  return selectBestFromGroups(groupHistoryByHwKeyAndDate(options), options);
}

export interface ProgressionStep {
  date: string;
  /** Precision of the sweep that set this step. */
  precision: string;
  runUrls: string[];
  result: InterpolatedResult;
  rankValue: number;
  factorOverFirst: number;
}

export interface HistoricalProgression {
  hwKey: string;
  steps: ProgressionStep[];
  datesMeasured: number;
  datesConsidered: number;
}

export function bestSoFarProgression(
  groups: HistoryGroups,
  options: SelectBestOptions,
): HistoricalProgression[] {
  const { targetValue, mode, costProvider, rank } = options;
  const progressions: HistoricalProgression[] = [];

  for (const [hwKey, dated] of groups.byHwKey) {
    const chronological = [...dated].toSorted((a, b) => a.date.localeCompare(b.date));
    const steps: ProgressionStep[] = [];
    let best = -Infinity;
    const measuredDates = new Set<string>();

    for (const sweep of chronological) {
      const result = interpolateForGPU(sweep.points, targetValue, mode, costProvider);
      if (!result || result.clamped || !(result.value > 0)) continue;
      const rankValue = rank(result);
      if (!Number.isFinite(rankValue) || rankValue <= 0) continue;

      measuredDates.add(sweep.date);
      if (rankValue <= best) continue;
      best = rankValue;
      // Same-date sweeps at another precision replace that date's step instead
      // of adding a second one, so the staircase stays one step per date.
      if (steps.at(-1)?.date === sweep.date) steps.pop();
      steps.push({
        date: sweep.date,
        precision: sweep.precision,
        runUrls: sweep.runUrls,
        result: { ...result, hwKey, resultKey: hwKey },
        rankValue,
        factorOverFirst: 1,
      });
    }

    if (steps.length === 0) continue;
    const firstRank = steps[0]!.rankValue;
    for (const step of steps) step.factorOverFirst = step.rankValue / firstRank;

    progressions.push({
      hwKey,
      steps,
      datesMeasured: measuredDates.size,
      datesConsidered: countDates(dated),
    });
  }

  progressions.sort(
    (a, b) =>
      (b.steps.at(-1)?.rankValue ?? 0) - (a.steps.at(-1)?.rankValue ?? 0) ||
      a.hwKey.localeCompare(b.hwKey),
  );
  return progressions;
}

function resultIsDisagg(result: InterpolatedResult): boolean {
  return result.nearestPoints.some((p) => p.disagg);
}

export interface ChipProgression {
  key: string;
  baseGpu: string;
  disagg: boolean;
  steps: ProgressionStep[];
  hwKeysUsed: string[];
}

export function mergeProgressionsByChip(
  progressions: readonly HistoricalProgression[],
): ChipProgression[] {
  const byChip = new Map<string, { baseGpu: string; steps: ProgressionStep[] }>();

  for (const progression of progressions) {
    const baseGpu = progression.hwKey.split('_')[0] ?? progression.hwKey;
    const entry = byChip.get(baseGpu) ?? { baseGpu, steps: [] };
    entry.steps.push(...progression.steps);
    byChip.set(baseGpu, entry);
  }

  const chips: ChipProgression[] = [];
  for (const [key, { baseGpu, steps: pooled }] of byChip) {
    const candidates = [...pooled].toSorted(
      (a, b) => a.date.localeCompare(b.date) || b.rankValue - a.rankValue,
    );

    const steps: ProgressionStep[] = [];
    const hwKeysUsed: string[] = [];
    let best = -Infinity;
    for (const candidate of candidates) {
      if (candidate.rankValue <= best) continue;
      best = candidate.rankValue;
      steps.push(candidate);
      const hwKey = candidate.result.hwKey;
      if (hwKey && hwKeysUsed.at(-1) !== hwKey) hwKeysUsed.push(hwKey);
    }

    if (steps.length === 0) continue;
    const firstRank = steps[0]!.rankValue;
    chips.push({
      key,
      baseGpu,
      disagg: steps.some((s) => resultIsDisagg(s.result)),
      steps: steps.map((s) => ({ ...s, factorOverFirst: s.rankValue / firstRank })),
      hwKeysUsed,
    });
  }

  chips.sort(
    (a, b) =>
      (b.steps.at(-1)?.rankValue ?? 0) - (a.steps.at(-1)?.rankValue ?? 0) ||
      a.key.localeCompare(b.key),
  );
  return chips;
}
