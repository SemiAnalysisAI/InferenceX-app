import { useMemo } from 'react';

import type { ChipBasis } from '@/lib/benchmarks/chip-basis';
import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

import { trendMetricDependencies } from '@/components/inference/hooks/interpolated-trend-core';
import { resolveMetricConfigKey } from '@/components/inference/metric-registry';
import type { TokenRevenuePricing, YAxisMetricKey } from '@/components/inference/types';
import { useBenchmarkHistory } from '@/hooks/api/use-benchmark-history';
import type { TcoBasis } from '@/lib/catalog/constants';
import { Sequence, type Model } from '@/lib/catalog/data-mappings';

import {
  buildFrontierHistory,
  vendorsAtOtherPrecisions,
  type BuildFrontierHistoryOptions,
  type FrontierGroupBy,
  type FrontierHistory,
} from './frontier-history-core';

interface UseFrontierHistoryParams {
  selectedModel: Model;
  selectedSequence: Sequence;
  selectedPrecisions: string[];
  selectedYAxisMetric: string;
  higherIsBetter: boolean;
  tokenRevenuePricing?: TokenRevenuePricing | null;
  tcoBasis?: TcoBasis;
  chipBasis?: ChipBasis;
  /** Hardware keys shown in the legend; other series are left out of the frontier. */
  activeHwKeys: ReadonlySet<string>;
  groupBy: FrontierGroupBy;
  enabled: boolean;
}

/** Frontier history for the dashboard's current selection; shares the history query cache. */
export function useFrontierHistory({
  selectedModel,
  selectedSequence,
  selectedPrecisions,
  selectedYAxisMetric,
  higherIsBetter,
  tokenRevenuePricing,
  tcoBasis,
  chipBasis,
  activeHwKeys,
  groupBy,
  enabled,
}: UseFrontierHistoryParams): {
  history: FrontierHistory | null;
  /** Vendors with data only at unselected precisions. */
  hiddenVendors: ReturnType<typeof vendorsAtOtherPrecisions>;
  loading: boolean;
  error: Error | null;
} {
  const islOsl = useMemo(() => sequenceToIslOsl(selectedSequence), [selectedSequence]);
  const { data, isLoading, error } = useBenchmarkHistory(
    enabled ? selectedModel : '',
    islOsl?.isl ?? 0,
    islOsl?.osl ?? 0,
    selectedSequence === Sequence.AgenticTraces ? { benchmarkType: 'agentic_traces' } : undefined,
  );
  const metricKey = resolveMetricConfigKey(selectedYAxisMetric).slice(2) as YAxisMetricKey;

  const options = useMemo(
    (): BuildFrontierHistoryOptions => ({
      selectedPrecisions,
      selectedYAxisMetric,
      metricKey,
      requestedMetrics: trendMetricDependencies(metricKey),
      higherIsBetter,
      tcoBasis,
      chipBasis,
      tokenRevenuePricing,
      hwKeyFilter: (hwKey) => activeHwKeys.has(hwKey),
      groupBy,
    }),
    [
      enabled,
      data,
      selectedPrecisions,
      selectedYAxisMetric,
      metricKey,
      higherIsBetter,
      tcoBasis,
      chipBasis,
      tokenRevenuePricing,
      activeHwKeys,
      groupBy,
    ],
  );
  const history = useMemo(
    () => (enabled && data ? buildFrontierHistory(data, options) : null),
    [enabled, data, options],
  );
  const hiddenVendors = useMemo(
    () => (enabled && data ? vendorsAtOtherPrecisions(data, options) : []),
    [enabled, data, options],
  );

  return {
    history,
    hiddenVendors,
    loading: enabled && isLoading,
    error: enabled ? error : null,
  };
}
