import { useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_CHIP_BASIS, type ChipBasis } from '@/lib/benchmarks/chip-basis';
import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import { resolveMetricConfigKey } from '@/components/inference/metric-registry';
import { NORMALIZED_TOKEN_REVENUE_PRICING } from '@/components/inference/token-revenue';
import type {
  TokenRevenuePricing,
  TrendDataPoint,
  YAxisMetricKey,
} from '@/components/inference/types';
import { useBenchmarkHistory } from '@/hooks/api/use-benchmark-history';
import { DEFAULT_TCO_BASIS, type TcoBasis } from '@/lib/catalog/constants';
import { Sequence, type Model } from '@/lib/catalog/data-mappings';

import {
  buildTrendCurves,
  evaluateTrendCurves,
  groupTrendRows,
  prepareTrendRows,
  trendMetricDependencies,
} from './interpolated-trend-core';
export {
  interpolateMetricAtInteractivity,
  rowSupportsTrendMetric,
  rowToLightweightPoint,
  trendMetricDependencies,
} from './interpolated-trend-core';

interface UseInterpolatedTrendDataParams {
  selectedModel: Model;
  selectedSequence: Sequence;
  selectedPrecisions: string[];
  selectedYAxisMetric: string;
  targetInteractivity: number;
  availableDates: string[];
  tokenRevenuePricing?: TokenRevenuePricing | null;
  enabled: boolean;
  tcoBasis?: TcoBasis;
  chipBasis?: ChipBasis;
}

interface UseInterpolatedTrendDataResult {
  trendLines: Map<string, TrendDataPoint[]>;
  hwKeysWithData: string[];
  loading: boolean;
  progress: number;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export function useInterpolatedTrendData({
  selectedModel,
  selectedSequence,
  selectedPrecisions,
  selectedYAxisMetric,
  targetInteractivity,
  tokenRevenuePricing = NORMALIZED_TOKEN_REVENUE_PRICING,
  enabled,
  tcoBasis = DEFAULT_TCO_BASIS,
  chipBasis = DEFAULT_CHIP_BASIS,
}: UseInterpolatedTrendDataParams): UseInterpolatedTrendDataResult {
  const seqIslOsl = useMemo(() => sequenceToIslOsl(selectedSequence), [selectedSequence]);

  const {
    data: allRows,
    isLoading,
    error,
    refetch,
  } = useBenchmarkHistory(enabled ? selectedModel : '', seqIslOsl?.isl ?? 0, seqIslOsl?.osl ?? 0, {
    ...(selectedSequence === Sequence.AgenticTraces
      ? { benchmarkType: 'agentic_traces' as const }
      : {}),
    view: 'trends',
  });
  const trendMetricKey = resolveMetricConfigKey(selectedYAxisMetric).slice(2) as YAxisMetricKey;
  const requestedMetrics = useMemo(() => trendMetricDependencies(trendMetricKey), [trendMetricKey]);

  const trendRows = useMemo(() => prepareTrendRows(allRows ?? [], chipBasis), [allRows, chipBasis]);

  const dateGroupedData = useMemo(
    () =>
      groupTrendRows(trendRows, {
        selectedPrecisions,
        selectedYAxisMetric,
        requestedMetrics,
        tokenRevenuePricing,
        tcoBasis,
      }),
    [
      trendRows,
      selectedPrecisions,
      selectedYAxisMetric,
      requestedMetrics,
      tokenRevenuePricing,
      tcoBasis,
    ],
  );

  const trendCurves = useMemo(
    () => buildTrendCurves(dateGroupedData, { trendMetricKey, tokenRevenuePricing }),
    [dateGroupedData, trendMetricKey, tokenRevenuePricing],
  );

  const { trendLines, hwKeysWithData } = useMemo(
    () =>
      evaluateTrendCurves(trendCurves, {
        targetInteractivity,
        extendToDate: new Date().toISOString().slice(0, 10),
      }),
    [trendCurves, targetInteractivity],
  );

  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  useEffect(() => {
    if (isLoading) {
      setProgress(0);
      intervalRef.current = setInterval(() => {
        setProgress((p) => Math.min(p + 0.08 + Math.random() * 0.12, 0.95));
      }, 100);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setProgress(1);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isLoading]);

  if (!enabled) {
    return {
      trendLines: new Map(),
      hwKeysWithData: [],
      loading: false,
      progress: 0,
      error: null,
      refetch,
    };
  }

  return { trendLines, hwKeysWithData, loading: isLoading, progress, error, refetch };
}
