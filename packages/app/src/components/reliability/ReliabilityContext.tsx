'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  resolveAvailableSelection,
  useChartUIState,
  useChartToggleSet,
  useUrlStateSync,
} from '@/hooks/useChartContext';
import { useReliability } from '@/hooks/api/use-reliability';
import { useUrlState } from '@/hooks/useUrlState';
import { getHardwareConfig, getModelSortIndex } from '@/lib/constants';
import type { ReliabilityRow } from '@/lib/api';

import type {
  DateRangeSuccessRateData,
  ModelSuccessRateData,
  ReliabilityChartContextType,
} from './types';

/** @internal Exported for test provider wrapping only. */
export const ReliabilityContext = createContext<ReliabilityChartContextType | undefined>(undefined);

/** @internal Aggregate raw reliability rows into date-range buckets. */
export function aggregateByDateRange(rows: ReliabilityRow[]): DateRangeSuccessRateData {
  const now = Date.now();
  const ranges = [
    ['last-3-days', now - 3 * 86400000],
    ['last-7-days', now - 7 * 86400000],
    ['last-month', now - 30 * 86400000],
    ['last-3-months', now - 90 * 86400000],
    ['all-time', null],
  ] as const;
  const aggregates = Object.fromEntries(
    ranges.map(([range]) => [range, {} as Record<string, { n_success: number; total: number }>]),
  ) as Record<(typeof ranges)[number][0], Record<string, { n_success: number; total: number }>>;

  for (const row of rows) {
    const rowTime = new Date(row.date).getTime();
    for (const [range, cutoff] of ranges) {
      if (cutoff !== null && rowTime < cutoff) continue;
      aggregates[range][row.hardware] ??= { n_success: 0, total: 0 };
      const stats = aggregates[range][row.hardware];
      stats.n_success += row.n_success;
      stats.total += row.total;
    }
  }

  const result: DateRangeSuccessRateData = {};
  for (const [range] of ranges) {
    result[range] = {};
    for (const [hardware, stats] of Object.entries(aggregates[range])) {
      if (stats.total === 0) continue;
      result[range][hardware] = {
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
  const {
    data: rawRows,
    isLoading: loading,
    isSuccess: reliabilitySettled,
    error: queryError,
  } = useReliability();

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

  // Pending legend-active selection restored from `r_active` URL param.
  // Consumed once when modelsWithData first populates.
  const [pendingActiveModels, setPendingActiveModels] = useState<Set<string> | null>(() => {
    const v = getUrlParam('r_active');
    if (!v) return null;
    const set = new Set(v.split(',').filter(Boolean));
    return set.size > 0 ? set : null;
  });

  const dateRangeSuccessRateData = useMemo(
    () => (rawRows ? aggregateByDateRange(rawRows) : {}),
    [rawRows],
  );

  const availableModels = useMemo(() => {
    const rangeData = dateRangeSuccessRateData[dateRange] ?? dateRangeSuccessRateData['all-time'];
    return rangeData ? Object.keys(rangeData) : [];
  }, [dateRangeSuccessRateData, dateRange]);

  const filteredReliabilityData = useMemo(() => {
    const selectedRangeData = dateRangeSuccessRateData[dateRange];
    if (!selectedRangeData) return [];
    return Object.entries(selectedRangeData).map(([model, stats]): ModelSuccessRateData => ({
      model,
      successRate: stats.rate,
      total: stats.total,
      n_success: stats.n_success,
    }));
  }, [dateRangeSuccessRateData, dateRange]);

  const chartData = useMemo(
    () =>
      [...filteredReliabilityData]
        .filter((item) => enabledModels.has(item.model))
        .toSorted(
          (a, b) =>
            getModelSortIndex(a.model) - getModelSortIndex(b.model) ||
            a.model.localeCompare(b.model),
        )
        .map((item) => ({
          ...item,
          modelLabel: getHardwareConfig(item.model).label,
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

  const lastModelScopeRef = useRef('');
  useEffect(() => {
    const scopeChanged = lastModelScopeRef.current !== dateRange;
    const resolution = resolveAvailableSelection({
      active: enabledModels,
      available: modelsWithData,
      pending: pendingActiveModels,
      scopeChanged,
      settled: reliabilitySettled,
    });
    if (!reliabilitySettled) return;
    lastModelScopeRef.current = dateRange;
    if (resolution.selection !== enabledModels) setEnabledModels(resolution.selection);
    if (resolution.consumedPending) setPendingActiveModels(null);
  }, [
    dateRange,
    enabledModels,
    modelsWithData,
    pendingActiveModels,
    reliabilitySettled,
    setEnabledModels,
  ]);

  const selectAllModels = useCallback(
    () => selectAllModelsRaw(modelsWithData),
    [selectAllModelsRaw, modelsWithData],
  );

  // Serialize the legend-active set, omitting when it equals all modelsWithData.
  const rActiveStr = useMemo(() => {
    if (enabledModels.size === 0) return '';
    if (enabledModels.size === modelsWithData.size) {
      let same = true;
      for (const k of enabledModels) {
        if (!modelsWithData.has(k)) {
          same = false;
          break;
        }
      }
      if (same) return '';
    }
    return [...enabledModels].toSorted().join(',');
  }, [enabledModels, modelsWithData]);

  useUrlStateSync(
    {
      r_range: dateRange,
      r_pct: showPercentagesOnBars ? '1' : '',
      r_hc: highContrast ? '1' : '',
      r_legend: isLegendExpanded ? '' : '0',
      r_active: rActiveStr,
    },
    [dateRange, showPercentagesOnBars, highContrast, isLegendExpanded, rActiveStr],
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
