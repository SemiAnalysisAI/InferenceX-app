/**
 * All-time best operating point per hwKey — pure, no React.
 *
 * The calculator reads one run date: whatever the latest sweep measured is what
 * a chip is credited with. That understates hardware whose best config was
 * found earlier and has since been superseded by a sweep exploring a different
 * part of the space. Measured against production history, ~37% of configs have
 * their best read at the target on an earlier date, worth up to ~3.6× — so for
 * a fleet-lifecycle projection, where the question is "what can this chip do?"
 * rather than "what did last week's sweep do?", the all-time best is the honest
 * number.
 *
 * Two rules make that defensible rather than merely flattering:
 *
 * 1. **Clamped reads are discarded.** `interpolateForGPU` always returns a
 *    value, clamping the target into each frontier's measured range, which at a
 *    low target credits a sweep's peak throughput at an interactivity it never
 *    served. Searching every date multiplies the chances of picking up such an
 *    edge read — at target 20 tok/s/user, 63% of naive winners are clamped — so
 *    this module applies the no-extrapolation rule instead (the same rule
 *    `useInterpolatedTrendData` uses) and reports the hwKeys it thereby has no
 *    read for, rather than silently dropping them.
 * 2. **Provenance travels with the number.** Every winner carries its date and
 *    run URL, because the run date stamped above the calculator no longer
 *    describes it.
 *
 * Precisions are pooled into one frontier per hwKey: the question is what the
 * chip's best config achieves, and precision is part of the config.
 */

import type { BenchmarkRow } from '@/lib/api';
import { Percentile, type Sequence } from '@/lib/data-mappings';

import { interpolateForGPU, paretoFrontUpperLeft } from './interpolation';
import { buildGpuGroups, type GroupMeta } from './useThroughputData';
import type {
  CalculatorMode,
  CostProvider,
  CostType,
  GPUDataPoint,
  InterpolatedResult,
} from './types';

/** Separator for the `hwKey|date` group key. Dates never contain a pipe. */
const KEY_SEP = '|';

interface DatedGroupMeta extends GroupMeta {
  date: string;
}

export interface HistoricalBestEntry {
  hwKey: string;
  /** Run date the winning frontier was measured on. */
  date: string;
  /** Run URLs contributing to that date's frontier — usually one. */
  runUrls: string[];
  /** The winning read, unclamped by construction. */
  result: InterpolatedResult;
  /** Rank value the winner was chosen by, from the caller's `rank`. */
  rankValue: number;
  /** Dates with rows for this hwKey. */
  datesConsidered: number;
  /** Dates that produced an unclamped read at the target. */
  datesMeasured: number;
  /** Latest date with rows, whether or not it won. */
  latestDate: string;
  /** True when an earlier date beat the latest one — the feature doing its job. */
  supersededLatest: boolean;
  /** Rank value of the latest date's read, when it had an unclamped one. */
  latestRankValue: number | null;
}

export interface HistoricalUnmeasured {
  hwKey: string;
  /**
   * Nearest value on each side of the target that some date's Pareto frontier
   * actually reached, or null where nothing was measured on that side. Not a
   * range: no single sweep spans the target — that is why this hwKey is here —
   * so quoting one interval would claim coverage that does not exist.
   */
  nearestBelow: number | null;
  nearestAbove: number | null;
  datesConsidered: number;
}

export interface HistoricalBestOutcome {
  /** Winners, ranked best first. */
  best: HistoricalBestEntry[];
  /** hwKeys with data that was never measured at the target. Never silently dropped. */
  unmeasured: HistoricalUnmeasured[];
  /** Distinct run dates present in the input. */
  datesSeen: number;
}

/** One run date's sweep for one hwKey, ready to interpolate. */
export interface DatedSweep {
  date: string;
  points: GPUDataPoint[];
  /** Run URLs pooled into this date. */
  runUrls: string[];
}

/** History grouped per hwKey per date — the expensive half, independent of the target. */
export interface HistoryGroups {
  byHwKey: Map<string, DatedSweep[]>;
  datesSeen: number;
}

export interface GroupHistoryOptions {
  rows: BenchmarkRow[];
  sequence: Sequence;
  precisions: string[];
  /** Agentic percentile; ignored for fixed sequences. */
  percentile?: Percentile;
  tokenType?: CostType;
  /**
   * Restricts grouping. Callers driving a legend should leave this unset and
   * filter for display instead, so toggling a legend entry does not rebuild
   * every frontier.
   */
  visibleHwKeys?: Set<string>;
}

/**
 * Stage one: bucket raw history rows into one sweep per (hwKey, date).
 *
 * Split from selection so a caller can memoize this on the rows and re-run only
 * the read when the target interactivity moves.
 */
export function groupHistoryByHwKeyAndDate(options: GroupHistoryOptions): HistoryGroups {
  const {
    rows,
    sequence,
    precisions,
    percentile = Percentile.P90,
    tokenType = 'total',
    visibleHwKeys,
  } = options;
  if (rows.length === 0 || precisions.length === 0) {
    return { byHwKey: new Map(), datesSeen: 0 };
  }

  // Collected during classification so it covers exactly the rows that survive
  // buildGpuGroups' sequence/precision/hardware filters.
  const runUrlsByGroup = new Map<string, Set<string>>();

  const { grouped, groupMeta } = buildGpuGroups<DatedGroupMeta>(rows, {
    sequence,
    precisions,
    percentile,
    tokenType,
    classify: (hwKey, row) => {
      if (visibleHwKeys && !visibleHwKeys.has(hwKey)) return null;
      if (!row.date) return null;
      const key = `${hwKey}${KEY_SEP}${row.date}`;
      if (row.run_url) {
        const urls = runUrlsByGroup.get(key) ?? new Set<string>();
        urls.add(row.run_url);
        runUrlsByGroup.set(key, urls);
      }
      return { key, meta: { hwKey, date: row.date } };
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
  /**
   * Ranks candidate reads. Callers pass the cost-matrix accessor for the
   * selected token type — `(r) => getTpPerMwForType(r, costType)` — so the
   * winner is chosen on the same basis the fleet is sized by.
   */
  rank: (result: InterpolatedResult) => number;
}

/**
 * Stage two: read every date's frontier at the target and keep each hwKey's
 * best unclamped result.
 */
export function selectBestFromGroups(
  groups: HistoryGroups,
  options: SelectBestOptions,
): HistoricalBestOutcome {
  const { targetValue, mode, costProvider, rank } = options;
  const { byHwKey, datesSeen } = groups;

  const getInputValue = (p: GPUDataPoint) =>
    mode === 'interactivity_to_throughput' ? p.interactivity : p.throughput;
  // The frontier's other axis. Only the unmeasured disclosure below needs it,
  // to rebuild the same Pareto front `interpolateForGPU` read from.
  const getOutputValue = (p: GPUDataPoint) =>
    mode === 'interactivity_to_throughput' ? p.throughput : p.interactivity;

  const best: HistoricalBestEntry[] = [];
  const unmeasured: HistoricalUnmeasured[] = [];

  for (const [hwKey, dated] of byHwKey) {
    const latestDate = dated.reduce((a, b) => (b.date > a ? b.date : a), dated[0]!.date);

    let winner: { sweep: DatedSweep; result: InterpolatedResult; rankValue: number } | null = null;
    let latestRankValue: number | null = null;
    let datesMeasured = 0;

    for (const sweep of dated) {
      const result = interpolateForGPU(sweep.points, targetValue, mode, costProvider);
      // The no-extrapolation rule: a clamped read is the frontier's nearest
      // edge, not a measurement at the target, and must not win.
      if (!result || result.clamped || !(result.value > 0)) continue;

      datesMeasured += 1;
      const rankValue = rank(result);
      if (!Number.isFinite(rankValue)) continue;
      if (sweep.date === latestDate) latestRankValue = rankValue;
      if (!winner || rankValue > winner.rankValue) winner = { sweep, result, rankValue };
    }

    if (!winner) {
      // What rejected this hwKey was per-date and per-frontier: no single sweep's
      // Pareto front spans the target. So the disclosure has to be per-date and
      // per-frontier too. Taking the union of every raw point across every date
      // — which this did — yields an interval no sweep ever covered, and one that
      // can contain the very target the chip was just excluded at: a reader sees
      // "measured 6.7-18.5" next to a target of 8 and concludes the exclusion is
      // broken. Two dates bracketing a gap is enough to produce that, and so is a
      // frontier narrower than its own raw points.
      //
      // Reported instead: the nearest frontier value on each side of the target.
      // That is the honest shape of the miss — how far the target sits from
      // anything measured — and it cannot imply coverage, because a frontier
      // value on both sides of the target within one date would have made the
      // read succeed.
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
        datesConsidered: dated.length,
      });
      continue;
    }

    best.push({
      hwKey,
      date: winner.sweep.date,
      runUrls: winner.sweep.runUrls,
      // The result's own resultKey is the dated group key; the caller keys on
      // hwKey, so restate it here.
      result: { ...winner.result, hwKey, resultKey: hwKey },
      rankValue: winner.rankValue,
      datesConsidered: dated.length,
      datesMeasured,
      latestDate,
      supersededLatest: winner.sweep.date !== latestDate,
      latestRankValue,
    });
  }

  best.sort((a, b) => b.rankValue - a.rankValue || a.hwKey.localeCompare(b.hwKey));
  unmeasured.sort((a, b) => a.hwKey.localeCompare(b.hwKey));

  return { best, unmeasured, datesSeen };
}

/** Convenience composition of both stages, for callers with no memoization needs. */
export function selectHistoricalBest(
  options: GroupHistoryOptions & SelectBestOptions,
): HistoricalBestOutcome {
  return selectBestFromGroups(groupHistoryByHwKeyAndDate(options), options);
}

/** One rung of a chip's best-so-far progression. */
export interface ProgressionStep {
  /** Run date this config was measured on. */
  date: string;
  /** Run URLs pooled into that date. */
  runUrls: string[];
  /** The read at this date — the new best-so-far. */
  result: InterpolatedResult;
  /** Rank value of this read. Strictly greater than the previous rung's. */
  rankValue: number;
  /** rankValue ÷ the first rung's, i.e. gain over the opening config. */
  factorOverFirst: number;
}

export interface HistoricalProgression {
  hwKey: string;
  /** Chronological, strictly improving. First rung is the opening measurement. */
  steps: ProgressionStep[];
  /** Dates that produced an unclamped read, improving or not. */
  datesMeasured: number;
  datesConsidered: number;
}

/**
 * Each hwKey's best-so-far progression at the target, in calendar order.
 *
 * `selectBestFromGroups` answers "what is the best this chip has ever done?".
 * This answers "how did it get there?" — the running maximum over run dates,
 * keeping only the dates that improved on everything before them. That staircase
 * is what a fixed fleet's revenue actually followed: the chips never changed,
 * the software serving them did.
 *
 * Same two rules as the best-of selection: clamped reads never count, and every
 * rung keeps its date and run URLs so the step can be traced to the sweep that
 * produced it.
 */
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
    let datesMeasured = 0;

    for (const sweep of chronological) {
      const result = interpolateForGPU(sweep.points, targetValue, mode, costProvider);
      if (!result || result.clamped || !(result.value > 0)) continue;
      const rankValue = rank(result);
      if (!Number.isFinite(rankValue) || rankValue <= 0) continue;

      datesMeasured += 1;
      // Only rungs: a sweep that failed to beat the incumbent leaves the fleet
      // serving the config it already had, so it is not a step in the line.
      if (rankValue <= best) continue;
      best = rankValue;
      steps.push({
        date: sweep.date,
        runUrls: sweep.runUrls,
        result: { ...result, hwKey, resultKey: hwKey },
        rankValue,
        // Filled in below, once the opening rung is known.
        factorOverFirst: 1,
      });
    }

    if (steps.length === 0) continue;
    const firstRank = steps[0]!.rankValue;
    for (const step of steps) step.factorOverFirst = step.rankValue / firstRank;

    progressions.push({
      hwKey,
      steps,
      datesMeasured,
      datesConsidered: dated.length,
    });
  }

  progressions.sort(
    (a, b) =>
      (b.steps.at(-1)?.rankValue ?? 0) - (a.steps.at(-1)?.rankValue ?? 0) ||
      a.hwKey.localeCompare(b.hwKey),
  );
  return progressions;
}

/** True when a read came from disaggregated points, whose fleet math differs. */
function resultIsDisagg(result: InterpolatedResult): boolean {
  return result.nearestPoints.some((p) => p.disagg);
}

export interface ChipProgression {
  /** Group key: the base GPU. Stable across steps. */
  key: string;
  /** Base GPU registry key, e.g. `b200` — the silicon the fleet is built from. */
  baseGpu: string;
  /** True when any rung came from a disaggregated run. */
  disagg: boolean;
  /**
   * The pooled running maximum. Each rung carries its own `result`, so the hwKey
   * serving the fleet can differ from one rung to the next.
   */
  steps: ProgressionStep[];
  /** Every hwKey that contributed a rung, in the order they took over. */
  hwKeysUsed: string[];
}

/**
 * Collapse per-hwKey progressions into one per chip — the best way to run that
 * silicon at any given time.
 *
 * A single piece of hardware appears in the history under many hwKeys, because
 * hwKey encodes the software: `b200_trtllm`, `b200_sglang`, `b200_sglang_mtp`
 * and so on are all one B200. Drawing a line each says a fleet operator ran
 * seven fleets, when they ran one and kept re-deploying it onto whichever config
 * was ahead. So the fleet's line is the upper envelope over that chip's hwKeys,
 * and a rung's winning config is part of what the rung reports.
 *
 * Because each input progression is already a running maximum, the pointwise
 * maximum over them is the running maximum of their union — so this merges by
 * walking the rungs in date order and keeping the ones that beat the incumbent.
 *
 * **Disagg competes alongside aggregated configs.** Disaggregated runs report
 * throughput per decode or per prefill chip rather than per total chip, so a rung
 * won by a disagg config is not sized on quite the same basis as one won by an
 * aggregated config. They are pooled anyway — the operator's question is what the
 * silicon can be made to do — and the caveat travels with the rung that carries
 * it: `disagg` flags a chip whose progression involves any, and the config named
 * on each step says which kind won it.
 */
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
    // Date order, and within a date the stronger read first so it is the one
    // that becomes the rung.
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
    // factorOverFirst is relative to the merged opening rung, which is not
    // necessarily the opening rung of the hwKey that rung came from.
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
