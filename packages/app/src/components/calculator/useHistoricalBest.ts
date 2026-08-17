'use client';

import { useMemo } from 'react';

import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import { useBenchmarkHistory } from '@/hooks/api/use-benchmark-history';
import { useStableValue } from '@/hooks/useStableValue';
import { Percentile, type Model, type Sequence } from '@/lib/data-mappings';

import {
  bestSoFarProgression,
  groupHistoryByHwKeyAndDate,
  selectBestFromGroups,
  type HistoricalBestOutcome,
  type HistoricalProgression,
  type HistoryGroups,
} from './historical-best';
import { getTpPerMwForType } from './ThroughputBarChart';
import type { CalculatorMode, CostProvider, CostType, InterpolatedResult } from './types';

const EMPTY: HistoricalBestOutcome = { best: [], unmeasured: [], datesSeen: 0 };

export interface UseHistoricalBestOptions {
  model: Model;
  sequence: Sequence;
  precisions: string[];
  targetValue: number;
  mode: CalculatorMode;
  costProvider: CostProvider;
  costType: CostType;
  percentile?: Percentile;
  /**
   * Gates the fetch. This response is several MB, so it must stay false until
   * the section is actually being used.
   */
  enabled: boolean;
}

export interface UseHistoricalBestResult extends HistoricalBestOutcome {
  /** Each chip's best-so-far staircase over run dates, for the lifecycle chart. */
  progressions: HistoricalProgression[];
  /**
   * Stage one's output — sweeps bucketed per (hwKey, date), independent of the
   * target. Exposed so a consumer that needs the same history at *many* targets
   * (the interactivity surface) can re-read these frontiers rather than pay for
   * the grouping again; it is the expensive half.
   */
  groups: HistoryGroups | null;
  loading: boolean;
  error: string | null;
}

/**
 * Each hwKey's all-time best operating point at the target, from the full run
 * history rather than the latest run date.
 *
 * Deliberately computes every hwKey, not just the visible ones: legend
 * filtering is applied by the consumer for display, so toggling a series never
 * rebuilds a frontier.
 */
export function useHistoricalBest(options: UseHistoricalBestOptions): UseHistoricalBestResult {
  const {
    model,
    sequence,
    targetValue,
    mode,
    costProvider,
    costType,
    percentile = Percentile.P90,
    enabled,
  } = options;

  // Callers commonly derive this array inline, so a fresh identity every render
  // would rebuild every frontier on every render.
  const precisions = useStableValue(
    options.precisions,
    (prev, next) => prev.length === next.length && prev.every((p, i) => p === next[i]),
  );

  // Agentic traces have no ISL/OSL to key history by; the endpoint takes a
  // `benchmarkType` instead and drops the sequence filter server-side. The
  // `view` trim is a no-op there for the same reason — no sequence to key the
  // metric allowlist on — so those rows come back whole, which is affordable
  // because the agentic payload is a fraction of a fixed-sequence one.
  const islOsl = sequenceToIslOsl(sequence);

  const {
    data: rows,
    isLoading,
    error,
  } = useBenchmarkHistory(model, islOsl?.isl ?? 0, islOsl?.osl ?? 0, {
    ...(islOsl === null ? { benchmarkType: 'agentic_traces' as const } : {}),
    view: 'calculator',
    enabled,
  });

  // Stage one — the expensive half. Independent of the target, so moving the
  // interactivity slider does not rebuild every date's frontier.
  const groups = useMemo(() => {
    if (!rows) return null;
    return groupHistoryByHwKeyAndDate({ rows, sequence, precisions, percentile });
  }, [rows, sequence, precisions, percentile]);

  // Stage two — re-read the frontiers at the current operating point. Both the
  // all-time best and the progression share one selection basis, so the table's
  // headline figure is always the last rung of the plotted staircase.
  const selection = useMemo(() => {
    if (!groups) return { outcome: EMPTY, progressions: [] as HistoricalProgression[] };
    const selectOptions = {
      targetValue,
      mode,
      costProvider,
      // The cost matrix's own accessor decides the winner, so the ranking basis
      // always matches the selected token type.
      rank: (result: InterpolatedResult) => getTpPerMwForType(result, costType),
    };
    return {
      outcome: selectBestFromGroups(groups, selectOptions),
      progressions: bestSoFarProgression(groups, selectOptions),
    };
  }, [groups, targetValue, mode, costProvider, costType]);

  return {
    ...selection.outcome,
    progressions: selection.progressions,
    groups: groups ?? null,
    loading: enabled && (isLoading || !rows),
    error: error ? error.message : null,
  };
}
