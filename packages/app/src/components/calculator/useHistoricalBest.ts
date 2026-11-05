'use client';

import { useMemo } from 'react';

import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import { useBenchmarkHistory } from '@/hooks/api/use-benchmark-history';
import { DEFAULT_TCO_BASIS, type TcoBasis } from '@/lib/catalog/constants';
import { useStableValue } from '@/hooks/useStableValue';
import { Percentile, type Model, type Sequence } from '@/lib/catalog/data-mappings';

import {
  bestSoFarProgression,
  groupHistoryByHwKeyAndDate,
  selectBestFromGroups,
  type HistoricalBestOutcome,
  type HistoricalProgression,
} from './historical-best';
import { getComparableTpPerMwForType } from './ThroughputBarChart';
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
  tcoBasis?: TcoBasis;
  enabled: boolean;
}

export interface UseHistoricalBestResult extends HistoricalBestOutcome {
  progressions: HistoricalProgression[];
  loading: boolean;
  error: string | null;
}

export function useHistoricalBest(options: UseHistoricalBestOptions): UseHistoricalBestResult {
  const {
    model,
    sequence,
    targetValue,
    mode,
    costProvider,
    costType,
    percentile = Percentile.P90,
    tcoBasis = DEFAULT_TCO_BASIS,
    enabled,
  } = options;

  const precisions = useStableValue(
    options.precisions,
    (prev, next) => prev.length === next.length && prev.every((p, i) => p === next[i]),
  );

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

  const groups = useMemo(() => {
    if (!rows) return null;
    return groupHistoryByHwKeyAndDate({
      rows,
      sequence,
      precisions,
      percentile,
      tokenType: costType,
      tcoBasis,
    });
  }, [rows, sequence, precisions, percentile, costType, tcoBasis]);

  const selection = useMemo(() => {
    if (!groups) return { outcome: EMPTY, progressions: [] as HistoricalProgression[] };
    const selectOptions = {
      targetValue,
      mode,
      costProvider,
      rank: (result: InterpolatedResult) => getComparableTpPerMwForType(result, costType),
    };
    return {
      outcome: selectBestFromGroups(groups, selectOptions),
      progressions: bestSoFarProgression(groups, selectOptions),
    };
  }, [groups, targetValue, mode, costProvider, costType]);

  return {
    ...selection.outcome,
    progressions: selection.progressions,
    loading: enabled && (isLoading || !rows),
    error: error ? error.message : null,
  };
}
