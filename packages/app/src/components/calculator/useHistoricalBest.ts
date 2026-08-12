'use client';

import { useMemo } from 'react';

import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import { useBenchmarkHistory } from '@/hooks/api/use-benchmark-history';
import { useStableValue } from '@/hooks/useStableValue';
import { Percentile, type Model, type Sequence } from '@/lib/data-mappings';

import {
  groupHistoryByHwKeyAndDate,
  selectBestFromGroups,
  type HistoricalBestOutcome,
} from './historical-best';
import { getTpPerMwForType } from './ThroughputBarChart';
import type { CalculatorMode, CostProvider, CostType } from './types';

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
  loading: boolean;
  error: string | null;
  /**
   * True when the selected scenario has no ISL/OSL to query history by. The
   * history endpoint is keyed on ISL/OSL, and agentic traces have neither.
   */
  unsupportedSequence: boolean;
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

  const islOsl = sequenceToIslOsl(sequence);
  const unsupportedSequence = islOsl === null;

  const {
    data: rows,
    isLoading,
    error,
  } = useBenchmarkHistory(model, islOsl?.isl ?? 0, islOsl?.osl ?? 0, {
    view: 'calculator',
    enabled: enabled && !unsupportedSequence,
  });

  // Stage one — the expensive half. Independent of the target, so moving the
  // interactivity slider does not rebuild every date's frontier.
  const groups = useMemo(() => {
    if (!rows) return null;
    return groupHistoryByHwKeyAndDate({ rows, sequence, precisions, percentile });
  }, [rows, sequence, precisions, percentile]);

  // Stage two — re-read the frontiers at the current operating point.
  const outcome = useMemo(() => {
    if (!groups) return EMPTY;
    return selectBestFromGroups(groups, {
      targetValue,
      mode,
      costProvider,
      // The cost matrix's own accessor decides the winner, so the ranking basis
      // always matches the selected token type.
      rank: (result) => getTpPerMwForType(result, costType),
    });
  }, [groups, targetValue, mode, costProvider, costType]);

  return {
    ...outcome,
    loading: enabled && !unsupportedSequence && (isLoading || !rows),
    error: error ? error.message : null,
    unsupportedSequence,
  };
}
