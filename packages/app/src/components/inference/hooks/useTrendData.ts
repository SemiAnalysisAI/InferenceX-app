import { useEffect, useMemo, useRef, useState } from 'react';

import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import {
  InferenceData,
  TrackedConfig,
  TrendDataPoint,
  YAxisMetricKey,
} from '@/components/inference/types';
import { useBenchmarkHistory } from '@/hooks/api/use-benchmark-history';
import { transformBenchmarkRows } from '@/lib/benchmark-transform';
import { Model, Sequence } from '@/lib/data-mappings';
import { computeInputCostFields, computeOutputCostFields } from '@/lib/utils';

function computeAllCostFields(data: InferenceData[]): InferenceData[] {
  return computeInputCostFields(computeOutputCostFields(data));
}

function buildMatchKey(config: TrackedConfig): string {
  let key = `${config.hwKey}|${config.precision}|${config.tp}|${config.conc}`;
  if (config.disagg) {
    key += `|disagg|${config.num_prefill_gpu ?? 0}|${config.num_decode_gpu ?? 0}`;
  }
  return key;
}

function buildPointMatchKey(point: InferenceData): string {
  let key = `${point.hwKey}|${point.precision}|${point.tp}|${point.conc}`;
  if (point.disagg) {
    key += `|disagg|${point.num_prefill_gpu ?? 0}|${point.num_decode_gpu ?? 0}`;
  }
  return key;
}

interface UseTrendDataResult {
  trendLines: Map<string, TrendDataPoint[]>;
  loading: boolean;
  progress: number;
}

/**
 * Hook that fetches historical data for tracked configs and extracts metric values over time.
 * Uses the /api/v1/benchmarks/history endpoint — one API call returns all dates.
 */
export function useTrendData(
  trackedConfigs: TrackedConfig[],
  selectedModel: Model,
  selectedSequence: Sequence,
  selectedYAxisMetric: string,
  xAxisFieldByChartType?: Record<string, string>,
): UseTrendDataResult {
  const seqIslOsl = useMemo(() => sequenceToIslOsl(selectedSequence), [selectedSequence]);

  const { data: allRows, isLoading } = useBenchmarkHistory(
    trackedConfigs.length > 0 ? selectedModel : '',
    seqIslOsl?.isl ?? 0,
    seqIslOsl?.osl ?? 0,
  );

  const trendLines = useMemo(() => {
    if (!allRows || allRows.length === 0 || trackedConfigs.length === 0) {
      return new Map<string, TrendDataPoint[]>();
    }

    const metricKey = selectedYAxisMetric.replace('y_', '') as YAxisMetricKey;

    // Determine which chart types the tracked configs need
    const chartTypes = new Set(trackedConfigs.map((c) => c.chartType));
    // Chart type to index: interactivity = 0, e2e = 1
    const chartTypeIndex: Record<string, number> = { interactivity: 0, e2e: 1 };

    // Group rows by date
    const rowsByDate = new Map<string, typeof allRows>();
    for (const row of allRows) {
      if (!rowsByDate.has(row.date)) rowsByDate.set(row.date, []);
      rowsByDate.get(row.date)!.push(row);
    }

    // Build match keys for configs
    const configMatchKeys = new Map<string, TrackedConfig>();
    for (const config of trackedConfigs) {
      configMatchKeys.set(buildMatchKey(config), config);
    }

    // Accumulate trend data per config per date
    const accumulator = new Map<string, Map<string, TrendDataPoint>>();

    for (const [date, dateRows] of rowsByDate) {
      const { chartData } = transformBenchmarkRows(dateRows);

      for (const chartType of chartTypes) {
        const idx = chartTypeIndex[chartType] ?? 0;
        const data = chartData[idx] ?? [];
        const processed = computeAllCostFields(data);

        // Build lookup by match key
        const pointsByKey = new Map<string, InferenceData>();
        for (const point of processed) {
          const key = buildPointMatchKey(point);
          if (!pointsByKey.has(key)) pointsByKey.set(key, point);
        }

        // Match tracked configs
        for (const config of trackedConfigs.filter((c) => c.chartType === chartType)) {
          const matchKey = buildMatchKey(config);
          const point = pointsByKey.get(matchKey);
          if (!point) continue;

          const metricObj = point[metricKey];
          if (!metricObj || typeof metricObj !== 'object' || !('y' in metricObj)) continue;

          // Use the dynamic x-axis field if provided (e.g. TTFT instead of E2EL)
          const xField = xAxisFieldByChartType?.[chartType];
          const xValue = xField ? ((point as any)[xField] ?? point.x) : point.x;

          if (!accumulator.has(config.id)) accumulator.set(config.id, new Map());
          accumulator.get(config.id)!.set(date, {
            date,
            value: (metricObj as { y: number }).y,
            x: xValue,
          });
        }
      }
    }

    // Build sorted trend lines
    const result = new Map<string, TrendDataPoint[]>();
    for (const [configId, dateMap] of accumulator) {
      const points = Array.from(dateMap.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      result.set(configId, points);
    }

    return result;
  }, [allRows, trackedConfigs, selectedYAxisMetric, xAxisFieldByChartType]);

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

  return { trendLines, loading: isLoading, progress };
}
