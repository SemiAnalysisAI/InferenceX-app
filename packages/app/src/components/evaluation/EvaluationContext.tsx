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

import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { track } from '@/lib/analytics';

import {
  useGlobalFilterActions,
  useGlobalFilterAvailability,
  useGlobalFilterRun,
  useGlobalFilterSelection,
} from '@/components/GlobalFilterContext';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import {
  resolveAvailableSelection,
  useChartUIState,
  useChartToggleSet,
  useUrlStateSync,
} from '@/hooks/useChartContext';
import { useEvaluations } from '@/hooks/api/use-evaluations';
import { useUrlState } from '@/hooks/useUrlState';
import type { Model } from '@/lib/data-mappings';
import type { EvalRow } from '@/lib/api';

import {
  aggregateEvaluationChartRows,
  buildEvalChangelogEntries,
  buildEvaluationChartRows,
} from './chart-data';
import type { EvalChangelogEntry, EvaluationChartContextType, EvaluationChartData } from './types';

import { resolveEvaluationDate } from './date-resolution';

// Re-exported for existing test/consumer imports; implementation lives in the
// pure module `./date-resolution` so server code (views API) can reuse it.
export { resolveEvaluationDate } from './date-resolution';

/** @internal Exported for test provider wrapping only. */
export const EvaluationContext = createContext<EvaluationChartContextType | undefined>(undefined);

export function EvaluationProvider({ children }: { children: ReactNode }) {
  const { selectedModel, effectivePrecisions } = useGlobalFilterSelection();
  const {
    setSelectedModel,
    setSelectedRunDate: setGlobalRunDate,
    setSelectedPrecisions,
  } = useGlobalFilterActions();
  const { selectedRunDate: globalRunDate, selectedRunDateRev } = useGlobalFilterRun();
  const {
    availableModels,
    availableDates: inferenceAvailableDates,
    availablePrecisions: globalAvailablePrecisions,
    availabilityError,
  } = useGlobalFilterAvailability();
  const { getUrlParam } = useUrlState();
  const {
    data: rawRows,
    isLoading: loading,
    isSuccess: evaluationsSettled,
    error: queryError,
  } = useEvaluations();
  const { unofficialEvalRows, localOfficialOverride } = useUnofficialRun();

  const error = availabilityError || (queryError ? queryError.message : null);
  const rawData: EvalRow[] = rawRows ?? [];
  const unofficialRawData: EvalRow[] = unofficialEvalRows ?? [];

  const [dateIntent, setDateIntent] = useState(() => ({
    date: getUrlParam('e_rundate') || '',
    globalRevision: selectedRunDateRev,
  }));

  const [requestedBenchmark, setRequestedBenchmark] = useState<string | undefined>(
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
  // Consumed once when hardware availability settles.
  const [pendingActiveHardware, setPendingActiveHardware] = useState<Set<string> | null>(() => {
    const value = getUrlParam('e_active');
    if (!value) return null;
    const set = new Set(value.split(',').filter(Boolean));
    return set.size > 0 ? set : null;
  });

  const availableBenchmarks = useMemo(() => {
    const tasks = new Set([
      ...rawData.map((item) => item.task),
      ...unofficialRawData.map((item) => item.task),
    ]);
    return [...tasks].toSorted();
  }, [rawData, unofficialRawData]);

  const availableDates = useMemo(() => {
    const dbModelKeys = DISPLAY_MODEL_TO_DB[selectedModel] ?? [];
    const dates = new Set(
      rawData
        .filter((item) => dbModelKeys.includes(item.model))
        .map((item) => item.date)
        .filter(Boolean),
    );
    return [...dates].toSorted();
  }, [rawData, selectedModel]);

  const selectedBenchmark =
    requestedBenchmark && availableBenchmarks.includes(requestedBenchmark)
      ? requestedBenchmark
      : availableBenchmarks[0];

  const preferredRunDate =
    selectedRunDateRev > dateIntent.globalRevision
      ? globalRunDate
      : dateIntent.date || globalRunDate;
  const selectedRunDate = resolveEvaluationDate(preferredRunDate, availableDates);

  const handleSetSelectedRunDate = useCallback(
    (date: string) => {
      const updatesGlobal =
        inferenceAvailableDates.length === 0 || inferenceAvailableDates.includes(date);
      setDateIntent({
        date,
        globalRevision: selectedRunDateRev + (updatesGlobal ? 1 : 0),
      });
      if (updatesGlobal) setGlobalRunDate(date);
    },
    [inferenceAvailableDates, selectedRunDateRev, setGlobalRunDate],
  );

  const availablePrecisions = useMemo(() => {
    const dbModelKeys = DISPLAY_MODEL_TO_DB[selectedModel];
    if (!dbModelKeys || dbModelKeys.length === 0) return globalAvailablePrecisions;
    const precs = [
      ...new Set(
        [...rawData, ...unofficialRawData]
          .filter((r) => dbModelKeys.includes(r.model))
          .map((r) => r.precision),
      ),
    ].toSorted();
    return precs.length > 0 ? precs : globalAvailablePrecisions;
  }, [rawData, unofficialRawData, selectedModel, globalAvailablePrecisions]);

  const unfilteredChartData: EvaluationChartData[] = useMemo(
    () =>
      buildEvaluationChartRows(
        rawData,
        selectedBenchmark,
        selectedModel,
        effectivePrecisions,
        selectedRunDate,
      ),
    [rawData, selectedBenchmark, selectedModel, selectedRunDate, effectivePrecisions],
  );

  const unfilteredUnofficialChartData: EvaluationChartData[] = useMemo(
    () =>
      buildEvaluationChartRows(
        unofficialRawData,
        selectedBenchmark,
        selectedModel,
        effectivePrecisions,
      ),
    [unofficialRawData, selectedBenchmark, selectedModel, effectivePrecisions],
  );

  const effectiveEnabledHardware = localOfficialOverride ?? enabledHardware;

  const chartData = useMemo(
    () => aggregateEvaluationChartRows(unfilteredChartData, effectiveEnabledHardware),
    [unfilteredChartData, effectiveEnabledHardware],
  );

  const unofficialHardwareWithData = useMemo(
    () => new Set(unfilteredUnofficialChartData.map((data) => String(data.hwKey))),
    [unfilteredUnofficialChartData],
  );

  const unofficialChartData = useMemo(
    () => aggregateEvaluationChartRows(unfilteredUnofficialChartData, unofficialHardwareWithData),
    [unfilteredUnofficialChartData, unofficialHardwareWithData],
  );

  const highlightedConfigs = useMemo(() => {
    const highlighted = new Set<string>();
    unfilteredChartData.forEach((data) => {
      if (data.date === selectedRunDate) highlighted.add(data.configLabel);
    });
    return highlighted;
  }, [unfilteredChartData, selectedRunDate]);

  const changelogEntries: EvalChangelogEntry[] = useMemo(
    () => buildEvalChangelogEntries(rawData, selectedRunDate, selectedModel, effectivePrecisions),
    [rawData, selectedRunDate, selectedModel, effectivePrecisions],
  );

  const modelHasEvalData = useMemo(() => {
    if (!selectedModel) return false;
    const dbModelKeys = DISPLAY_MODEL_TO_DB[selectedModel] ?? [];
    return [...rawData, ...unofficialRawData].some((item) => dbModelKeys.includes(item.model));
  }, [rawData, unofficialRawData, selectedModel]);

  const hwTypesWithData = useMemo(
    () => new Set(unfilteredChartData.map((data) => String(data.hwKey))),
    [unfilteredChartData],
  );

  const hardwareScopeKey = `${selectedModel}|${selectedBenchmark ?? ''}|${selectedRunDate}|${effectivePrecisions.join(',')}`;
  const lastHardwareScopeRef = useRef('');
  useEffect(() => {
    const scopeChanged = lastHardwareScopeRef.current !== hardwareScopeKey;
    const resolution = resolveAvailableSelection({
      active: enabledHardware,
      available: hwTypesWithData,
      pending: pendingActiveHardware,
      scopeChanged,
      settled: evaluationsSettled,
    });
    if (!evaluationsSettled) return;
    lastHardwareScopeRef.current = hardwareScopeKey;
    if (resolution.selection !== enabledHardware) setEnabledHardware(resolution.selection);
    if (resolution.consumedPending) setPendingActiveHardware(null);
  }, [
    enabledHardware,
    evaluationsSettled,
    hardwareScopeKey,
    hwTypesWithData,
    pendingActiveHardware,
    setEnabledHardware,
  ]);

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
      setSelectedBenchmark: setRequestedBenchmark,
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
  const context = useContext(EvaluationContext);
  if (context === undefined) {
    throw new Error('useEvaluation must be used within an EvaluationProvider');
  }
  return context;
}
