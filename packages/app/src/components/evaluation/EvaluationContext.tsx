'use client';

import {
  type ReactNode,
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { track } from '@/lib/analytics';

import { useGlobalFilters } from '@/components/GlobalFilterContext';
import { useUnofficialRun } from '@/components/unofficial-run-context';
import {
  useChartUIState,
  useChartToggleSet,
  useAutoInitializeToggleSet,
  useUrlStateSync,
} from '@/hooks/useChartContext';
import { useEvaluations } from '@/hooks/api/use-evaluations';
import { useUrlState } from '@/hooks/useUrlState';
import type { Model } from '@/lib/data-mappings';
import type { EvalRow } from '@/lib/api';

import { useEvaluationDerivedData } from './useEvaluationDerivedData';
import type { EvaluationChartContextType } from './types';

/** @internal Exported for test provider wrapping only. */
export const EvaluationContext = createContext<EvaluationChartContextType | undefined>(undefined);

export function EvaluationProvider({ children }: { children: ReactNode }) {
  const {
    selectedModel,
    setSelectedModel,
    selectedRunDate: globalRunDate,
    selectedRunDateRev,
    setSelectedRunDate: setGlobalRunDate,
    availableModels,
    availableDates: inferenceAvailableDates,
    effectivePrecisions,
    setSelectedPrecisions,
    availablePrecisions: globalAvailablePrecisions,
  } = useGlobalFilters();
  const { getUrlParam } = useUrlState();
  const { data: rawRows, isLoading: loading, error: queryError } = useEvaluations();
  const { unofficialEvalRows, localOfficialOverride } = useUnofficialRun();

  const error = queryError ? queryError.message : null;
  const rawData: EvalRow[] = rawRows ?? [];
  const unofficialRawData: EvalRow[] = unofficialEvalRows ?? [];

  const [selectedRunDate, setSelectedRunDate] = useState<string>(
    () => getUrlParam('e_rundate') || globalRunDate || '',
  );

  const handleSetSelectedRunDate = useCallback(
    (date: string) => {
      setSelectedRunDate(date);
      if (inferenceAvailableDates.length === 0 || inferenceAvailableDates.includes(date)) {
        setGlobalRunDate(date);
      }
    },
    [inferenceAvailableDates, setGlobalRunDate],
  );

  const [selectedBenchmark, setSelectedBenchmark] = useState<string | undefined>(
    () => getUrlParam('e_bench') || undefined,
  );

  const { highContrast, setHighContrast, isLegendExpanded, setIsLegendExpanded } = useChartUIState({
    urlPrefix: 'e_',
  });

  const [showLabels, setShowLabels] = useState<boolean>(() => getUrlParam('e_labels') === '1');

  const {
    activeSet: enabledHardware,
    setActiveSet: setEnabledHardware,
    toggle: toggleHwRaw,
    selectAll: selectAllHwRaw,
    remove: removeHwRaw,
  } = useChartToggleSet();

  // Pending legend-active selection restored from `e_active` URL param.
  // Consumed once when hwTypesWithData first populates.
  const [pendingActiveHardware, setPendingActiveHardware] = useState<Set<string> | null>(() => {
    const v = getUrlParam('e_active');
    if (!v) return null;
    const set = new Set(v.split(',').filter(Boolean));
    return set.size > 0 ? set : null;
  });

  const effectiveEnabledHardware = localOfficialOverride ?? enabledHardware;

  const {
    availableBenchmarks,
    availableDates,
    availableHardware,
    availablePrecisions,
    unfilteredChartData,
    chartData,
    unofficialChartData,
    highlightedConfigs,
    changelogEntries,
    modelHasEvalData,
    hwTypesWithData,
  } = useEvaluationDerivedData({
    rawData,
    unofficialRawData,
    selectedModel,
    selectedBenchmark,
    selectedRunDate,
    effectivePrecisions,
    effectiveEnabledHardware,
    globalAvailablePrecisions,
  });

  const prevAvailableDatesRef = useRef<string[]>([]);

  useEffect(() => {
    if (availableBenchmarks.length > 0 && !selectedBenchmark) {
      setSelectedBenchmark(availableBenchmarks[0]);
    }
    if (availableModels.length > 0 && !selectedModel) {
      setSelectedModel(availableModels[0]);
    }
  }, [availableBenchmarks, availableModels, selectedBenchmark, setSelectedModel]);

  useEffect(() => {
    if (availableDates.length === 0) return;
    const latestDate = availableDates.at(-1);
    const prevAvailableDates = prevAvailableDatesRef.current;
    const wasOnLatest =
      prevAvailableDates.length > 0 && selectedRunDate === prevAvailableDates.at(-1);
    if (!selectedRunDate || wasOnLatest || !availableDates.includes(selectedRunDate)) {
      setSelectedRunDate(latestDate!);
      // If no global date yet (evals loaded first), set it so inference syncs to us.
      if (!globalRunDate) setGlobalRunDate(latestDate!);
    }
    prevAvailableDatesRef.current = availableDates;
  }, [availableDates, selectedRunDate, setSelectedRunDate, globalRunDate, setGlobalRunDate]);

  useEffect(() => {
    if (!globalRunDate) return;
    if (availableDates.length === 0) {
      setSelectedRunDate(globalRunDate);
      return;
    }
    if (availableDates.includes(globalRunDate)) {
      setSelectedRunDate(globalRunDate);
      return;
    }
    // Snap to the nearest valid date
    const target = new Date(globalRunDate).getTime();
    let closest = availableDates[0];
    let minDiff = Math.abs(new Date(closest).getTime() - target);
    for (const d of availableDates) {
      const diff = Math.abs(new Date(d).getTime() - target);
      if (diff < minDiff) {
        minDiff = diff;
        closest = d;
      }
    }
    setSelectedRunDate(closest);
  }, [globalRunDate, availableDates, selectedRunDateRev]);

  useAutoInitializeToggleSet(availableHardware, enabledHardware, setEnabledHardware);

  useEffect(() => {
    if (hwTypesWithData.size === 0) return;
    if (pendingActiveHardware) {
      const restored = new Set([...pendingActiveHardware].filter((k) => hwTypesWithData.has(k)));
      setEnabledHardware(restored.size > 0 ? restored : hwTypesWithData);
      setPendingActiveHardware(null);
      return;
    }
    setEnabledHardware(hwTypesWithData);
  }, [selectedModel, hwTypesWithData]);

  const selectAllHwTypes = useCallback(
    () => selectAllHwRaw(hwTypesWithData),
    [selectAllHwRaw, hwTypesWithData],
  );

  const toggleHardware = useCallback(
    (hwKey: string) => toggleHwRaw(hwKey, hwTypesWithData),
    [toggleHwRaw, hwTypesWithData],
  );
  const removeHardware = useCallback((hwKey: string) => removeHwRaw(hwKey), [removeHwRaw]);

  const handleSetSelectedModel = useCallback(
    (model: string | undefined) => {
      if (model) setSelectedModel(model as Model);
    },
    [setSelectedModel],
  );

  // ── Debounced hardware selection tracking ────────────────────────────────
  const evalTrackMounted = useRef(false);
  useEffect(() => {
    if (!evalTrackMounted.current) {
      evalTrackMounted.current = true;
      return;
    }
    if (enabledHardware.size === 0) return;
    const timer = setTimeout(() => {
      const gpus = [...enabledHardware].toSorted();
      track('evaluation_hw_selection_settled', {
        gpus,
        gpu_count: gpus.length,
        model: selectedModel,
        benchmark: selectedBenchmark,
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [enabledHardware]);

  // Serialize the legend-active set, omitting when it equals all hwTypesWithData.
  const eActiveStr = useMemo(() => {
    if (enabledHardware.size === 0) return '';
    if (enabledHardware.size === hwTypesWithData.size) {
      let same = true;
      for (const k of enabledHardware) {
        if (!hwTypesWithData.has(k)) {
          same = false;
          break;
        }
      }
      if (same) return '';
    }
    return [...enabledHardware].toSorted().join(',');
  }, [enabledHardware, hwTypesWithData]);

  useUrlStateSync(
    {
      e_rundate: selectedRunDate === globalRunDate ? '' : selectedRunDate,
      e_bench: selectedBenchmark || '',
      e_hc: highContrast ? '1' : '',
      e_labels: showLabels ? '1' : '',
      e_legend: isLegendExpanded ? '' : '0',
      e_active: eActiveStr,
    },
    [
      selectedRunDate,
      globalRunDate,
      selectedBenchmark,
      highContrast,
      showLabels,
      isLegendExpanded,
      eActiveStr,
    ],
  );

  const value: EvaluationChartContextType = useMemo(
    () => ({
      loading,
      error,
      selectedBenchmark,
      setSelectedBenchmark,
      selectedModel,
      setSelectedModel: handleSetSelectedModel,
      selectedRunDate,
      setSelectedRunDate: handleSetSelectedRunDate,
      availableBenchmarks,
      availableModels,
      availableDates,
      chartData,
      unofficialChartData,
      unfilteredChartData,
      enabledHardware,
      toggleHardware,
      removeHardware,
      highContrast,
      setHighContrast,
      showLabels,
      setShowLabels,
      isLegendExpanded,
      setIsLegendExpanded,
      hwTypesWithData,
      selectAllHwTypes,
      highlightedConfigs,
      changelogEntries,
      modelHasEvalData,
      selectedPrecisions: effectivePrecisions,
      setSelectedPrecisions,
      availablePrecisions,
    }),
    [
      loading,
      error,
      selectedBenchmark,
      selectedModel,
      handleSetSelectedModel,
      selectedRunDate,
      handleSetSelectedRunDate,
      availableBenchmarks,
      availableModels,
      availableDates,
      chartData,
      unofficialChartData,
      unfilteredChartData,
      enabledHardware,
      toggleHardware,
      removeHardware,
      highContrast,
      showLabels,
      isLegendExpanded,
      hwTypesWithData,
      selectAllHwTypes,
      highlightedConfigs,
      changelogEntries,
      modelHasEvalData,
      effectivePrecisions,
      setSelectedPrecisions,
      availablePrecisions,
    ],
  );

  return <EvaluationContext.Provider value={value}>{children}</EvaluationContext.Provider>;
}

export function useEvaluation(): EvaluationChartContextType {
  const context = use(EvaluationContext);
  if (context === undefined) {
    throw new Error('useEvaluation must be used within an EvaluationProvider');
  }
  return context;
}
