'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useChartUIState,
  useChartToggleSet,
  useAutoInitializeToggleSet,
  useUrlStateSync,
} from '@/hooks/useChartContext';
import { useReliability } from '@/hooks/api/use-reliability';
import { useUrlState } from '@/hooks/useUrlState';
import { HARDWARE_CONFIG, getModelSortIndex } from '@/lib/constants';
import type { ReliabilityRow } from '@/lib/api';

import {
  DateRangeSuccessRateData,
  ModelSuccessRateData,
  ReliabilityChartContextType,
} from './types';

/** @internal Exported for test provider wrapping only. */
export const ReliabilityContext = createContext<ReliabilityChartContextType | undefined>(undefined);

/** Aggregate raw reliability rows into date-range buckets. */
function aggregateByDateRange(rows: ReliabilityRow[]): DateRangeSuccessRateData {
  const now = new Date();
  const cutoffs: Record<string, Date | null> = {
    'last-3-days': new Date(now.getTime() - 3 * 86400000),
    'last-7-days': new Date(now.getTime() - 7 * 86400000),
    'last-month': new Date(now.getTime() - 30 * 86400000),
    'last-3-months': new Date(now.getTime() - 90 * 86400000),
    'all-time': null,
  };

  const result: DateRangeSuccessRateData = {};

  for (const [range, cutoff] of Object.entries(cutoffs)) {
    const agg: Record<string, { n_success: number; total: number }> = {};
    for (const row of rows) {
      if (cutoff && new Date(row.date) < cutoff) continue;
      if (!agg[row.hardware]) agg[row.hardware] = { n_success: 0, total: 0 };
      agg[row.hardware].n_success += row.n_success;
      agg[row.hardware].total += row.total;
    }
    result[range] = {};
    for (const [hw, stats] of Object.entries(agg)) {
      if (stats.total === 0) continue;
      result[range][hw] = {
        rate: Math.round((stats.n_success / stats.total) * 10000) / 100,
        total: stats.total,
        n_success: stats.n_success,
      };
    }
  }

  return result;
}

export function ReliabilityProvider({ children }: { children: ReactNode }) {
  const { getUrlParam } = useUrlState();
  const { data: rawRows, isLoading: loading, error: queryError } = useReliability();

  const error = queryError ? queryError.message : null;

  const [dateRange, setDateRange] = useState<string>(
    () => getUrlParam('r_range') || 'last-3-months',
  );

  const { highContrast, setHighContrast, isLegendExpanded, setIsLegendExpanded } = useChartUIState({
    urlPrefix: 'r_',
  });

  const [showPercentagesOnBars, setShowPercentagesOnBars] = useState<boolean>(
    () => getUrlParam('r_pct') === '1',
  );

  const {
    activeSet: enabledModels,
    setActiveSet: setEnabledModels,
    toggle: toggleModelRaw,
    selectAll: selectAllModelsRaw,
    remove: removeModelRaw,
  } = useChartToggleSet();

  const dateRangeSuccessRateData = useMemo(
    () => (rawRows ? aggregateByDateRange(rawRows) : {}),
    [rawRows],
  );

  const availableModels = useMemo(() => {
    const rangeData = dateRangeSuccessRateData[dateRange] ?? dateRangeSuccessRateData['all-time'];
    return rangeData ? Object.keys(rangeData) : [];
  }, [dateRangeSuccessRateData, dateRange]);

  useAutoInitializeToggleSet(availableModels, enabledModels, setEnabledModels);

  const filteredReliabilityData = useMemo(() => {
    const selectedRangeData = dateRangeSuccessRateData[dateRange];
    if (!selectedRangeData) return [];
    return Object.entries(selectedRangeData).map(
      ([model, stats]): ModelSuccessRateData => ({
        model,
        successRate: stats.rate,
        total: stats.total,
        n_success: stats.n_success,
      }),
    );
  }, [dateRangeSuccessRateData, dateRange]);

  const chartData = useMemo(
    () =>
      [...filteredReliabilityData]
        .filter((item) => enabledModels.has(item.model))
        .sort(
          (a, b) =>
            getModelSortIndex(a.model) - getModelSortIndex(b.model) ||
            a.model.localeCompare(b.model),
        )
        .map((item) => ({
          ...item,
          modelLabel:
            HARDWARE_CONFIG[item.model as keyof typeof HARDWARE_CONFIG]?.label || item.model,
        })),
    [filteredReliabilityData, enabledModels],
  );

  const modelsWithData = useMemo(
    () => new Set(filteredReliabilityData.map((d) => d.model)),
    [filteredReliabilityData],
  );

  const toggleModel = useCallback(
    (model: string) => toggleModelRaw(model, modelsWithData),
    [toggleModelRaw, modelsWithData],
  );
  const removeModel = useCallback((model: string) => removeModelRaw(model), [removeModelRaw]);

  useEffect(() => {
    if (modelsWithData.size > 0) setEnabledModels(modelsWithData);
  }, [dateRange, modelsWithData]);

  const selectAllModels = useCallback(
    () => selectAllModelsRaw(modelsWithData),
    [selectAllModelsRaw, modelsWithData],
  );

  useUrlStateSync(
    {
      r_range: dateRange,
      r_pct: showPercentagesOnBars ? '1' : '',
      r_hc: highContrast ? '1' : '',
      r_legend: isLegendExpanded ? '' : '0',
    },
    [dateRange, showPercentagesOnBars, highContrast, isLegendExpanded],
  );

  const value = useMemo(
    () => ({
      loading,
      error,
      dateRangeSuccessRateData,
      filteredReliabilityData,
      chartData,
      availableModels,
      dateRange,
      setDateRange,
      showPercentagesOnBars,
      setShowPercentagesOnBars,
      highContrast,
      setHighContrast,
      enabledModels,
      toggleModel,
      removeModel,
      isLegendExpanded,
      setIsLegendExpanded,
      modelsWithData,
      selectAllModels,
    }),
    [
      loading,
      error,
      dateRangeSuccessRateData,
      filteredReliabilityData,
      chartData,
      availableModels,
      dateRange,
      showPercentagesOnBars,
      highContrast,
      enabledModels,
      toggleModel,
      removeModel,
      isLegendExpanded,
      modelsWithData,
      selectAllModels,
    ],
  );

  return <ReliabilityContext.Provider value={value}>{children}</ReliabilityContext.Provider>;
}

export function useReliabilityContext() {
  const context = useContext(ReliabilityContext);
  if (context === undefined) {
    throw new Error('useReliabilityContext must be used within a ReliabilityProvider');
  }
  return context;
}
