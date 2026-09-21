import { useEffect, useMemo, useRef, useState } from 'react';

import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import { resolveMetricConfigKey } from '@/components/inference/metric-registry';
import { NORMALIZED_TOKEN_REVENUE_PRICING } from '@/components/inference/token-revenue';
import type {
  TokenRevenuePricing,
  TrendDataPoint,
  YAxisMetricKey,
} from '@/components/inference/types';
import { useBenchmarkHistory } from '@/hooks/api/use-benchmark-history';
import { DEFAULT_TCO_BASIS, type TcoBasis } from '@/lib/constants';
import { Sequence, type Model } from '@/lib/data-mappings';

import {
  buildTrendLines,
  groupTrendRowsByDate,
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
}

interface UseInterpolatedTrendDataResult {
  trendLines: Map<string, TrendDataPoint[]>;
  hwKeysWithData: string[];
  loading: boolean;
  progress: number;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

/**
 * Hook that loads historical benchmark data, groups by GPU per date, and interpolates
 * the selected metric at a user-specified interactivity level for each date.
 *
 * Uses the /api/v1/benchmarks/history endpoint which returns all dates in one query.
 * The interpolation memo re-computes instantly when targetInteractivity or metric changes.
 */
export function useInterpolatedTrendData({
  selectedModel,
  selectedSequence,
  selectedPrecisions,
  selectedYAxisMetric,
  targetInteractivity,
  tokenRevenuePricing = NORMALIZED_TOKEN_REVENUE_PRICING,
  enabled,
  tcoBasis = DEFAULT_TCO_BASIS,
}: UseInterpolatedTrendDataParams): UseInterpolatedTrendDataResult {
  const seqIslOsl = useMemo(() => sequenceToIslOsl(selectedSequence), [selectedSequence]);

  const {
    data: allRows,
    isLoading,
    error,
    refetch,
  } = useBenchmarkHistory(
    enabled ? selectedModel : '',
    seqIslOsl?.isl ?? 0,
    seqIslOsl?.osl ?? 0,
    selectedSequence === Sequence.AgenticTraces ? { benchmarkType: 'agentic_traces' } : undefined,
  );
  const trendMetricKey = resolveMetricConfigKey(selectedYAxisMetric).slice(2) as YAxisMetricKey;
  const requestedMetrics = useMemo(() => trendMetricDependencies(trendMetricKey), [trendMetricKey]);

  const dateGroupedData = useMemo(
    () =>
      groupTrendRowsByDate(allRows ?? [], {
        selectedPrecisions,
        selectedYAxisMetric,
        requestedMetrics,
        tokenRevenuePricing,
        tcoBasis,
      }),
    [
      allRows,
      selectedPrecisions,
      selectedYAxisMetric,
      requestedMetrics,
      tokenRevenuePricing,
      tcoBasis,
    ],
  );

  const { trendLines, hwKeysWithData } = useMemo(
    () =>
      buildTrendLines(dateGroupedData, {
        targetInteractivity,
        trendMetricKey,
        tokenRevenuePricing,
        extendToDate: new Date().toISOString().slice(0, 10),
      }),
    [dateGroupedData, targetInteractivity, trendMetricKey, tokenRevenuePricing],
  );

  // Artificial progress that ramps up while the API call is in flight
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
