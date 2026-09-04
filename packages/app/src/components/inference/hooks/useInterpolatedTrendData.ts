import { useEffect, useMemo, useRef, useState } from 'react';

import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import type {
  TokenRevenuePricing,
  TrendDataPoint,
  YAxisMetricKey,
} from '@/components/inference/types';
import { NORMALIZED_TOKEN_REVENUE_PRICING } from '@/components/inference/token-revenue';
import { resolveMetricConfigKey } from '@/components/inference/metric-registry';
import {
  buildTrendLines,
  groupTrendRowsByDate,
  trendMetricDependencies,
} from '@/components/inference/hooks/interpolated-trend-core';
import { useBenchmarkHistory } from '@/hooks/api/use-benchmark-history';
import { Sequence, type Model } from '@/lib/data-mappings';

// Pure trend math and grouping live in interpolated-trend-core.ts so the views
// API can reuse them server-side. Re-exported here to keep existing imports
// (tests, HistoricalTrendsDisplay) stable.
export {
  interpolateMetricAtInteractivity,
  rowSupportsTrendMetric,
  rowToLightweightPoint,
  trendMetricDependencies,
} from '@/components/inference/hooks/interpolated-trend-core';

interface UseInterpolatedTrendDataParams {
  selectedModel: Model;
  selectedSequence: Sequence;
  selectedPrecisions: string[];
  selectedYAxisMetric: string;
  targetInteractivity: number;
  availableDates: string[];
  tokenRevenuePricing?: TokenRevenuePricing | null;
  enabled: boolean;
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

  // Build lightweight InferenceData points grouped by date and hwKey.
  const dateGroupedData = useMemo(
    () =>
      groupTrendRowsByDate(allRows ?? [], {
        selectedPrecisions,
        selectedYAxisMetric,
        requestedMetrics,
        tokenRevenuePricing,
      }),
    [allRows, selectedPrecisions, requestedMetrics, selectedYAxisMetric, tokenRevenuePricing],
  );

  // Interpolation memo — instant when slider moves or metric changes.
  // Lines are extended to today with their last known value.
  const { trendLines, hwKeysWithData } = useMemo(
    () =>
      buildTrendLines(dateGroupedData, {
        targetInteractivity,
        trendMetricKey,
        extendToDate: new Date().toISOString().split('T')[0],
        tokenRevenuePricing,
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
