'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';
import { track } from '@/lib/analytics';

import { useGlobalFilters } from '@/components/GlobalFilterContext';
import {
  useChartUIState,
  useChartToggleSet,
  useAutoInitializeToggleSet,
  useUrlStateSync,
} from '@/hooks/useChartContext';
import { useEvaluations } from '@/hooks/api/use-evaluations';
import { useUrlState } from '@/hooks/useUrlState';
import { normalizeEvalHardwareKey } from '@/lib/chart-utils';
import { getModelSortIndex, HARDWARE_CONFIG } from '@/lib/constants';
import { Model } from '@/lib/data-mappings';
import { getFrameworkLabel } from '@/lib/utils';
import type { EvalRow } from '@/lib/api';

import { EvalChangelogEntry, EvaluationChartContextType, EvaluationChartData } from './types';

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

  const error = queryError ? queryError.message : null;
  const rawData: EvalRow[] = rawRows ?? [];

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

  const availableBenchmarks = useMemo(() => {
    const tasks = new Set(rawData.map((item) => item.task));
    return Array.from(tasks).sort();
  }, [rawData]);

  const availableDates = useMemo(() => {
    const dbModelKey = DISPLAY_MODEL_TO_DB[selectedModel];
    const dates = new Set(
      rawData
        .filter((item) => item.model === dbModelKey)
        .map((item) => item.date)
        .filter(Boolean),
    );
    return Array.from(dates).sort();
  }, [rawData, selectedModel]);

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
    const latestDate = availableDates[availableDates.length - 1];
    const prevAvailableDates = prevAvailableDatesRef.current;
    const wasOnLatest =
      prevAvailableDates.length > 0 &&
      selectedRunDate === prevAvailableDates[prevAvailableDates.length - 1];
    if (!selectedRunDate || wasOnLatest || !availableDates.includes(selectedRunDate)) {
      setSelectedRunDate(latestDate);
    }
    prevAvailableDatesRef.current = availableDates;
  }, [availableDates, selectedRunDate, setSelectedRunDate]);

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

  const availableHardware = useMemo(() => {
    const hwSet = new Set<string>();
    rawData.forEach((item) => {
      const hwKey = normalizeEvalHardwareKey(item.hardware, item.framework, item.spec_method);
      if (hwKey !== 'unknown') hwSet.add(hwKey);
    });
    return Array.from(hwSet).sort();
  }, [rawData]);

  useAutoInitializeToggleSet(availableHardware, enabledHardware, setEnabledHardware);

  /** Build a display label for a config row. */
  function buildConfigLabel(
    hwLabel: string,
    framework: string,
    specMethod: string,
    precision: string,
    conc: number | null,
    tp?: number,
  ): string {
    const headerSuffixes: string[] = [];
    if (framework && framework !== '1k8k') headerSuffixes.push(getFrameworkLabel(framework));
    if (specMethod && specMethod !== 'none') headerSuffixes.push(getFrameworkLabel(specMethod));

    const detailSuffixes: string[] = [];
    if (precision && effectivePrecisions.length > 1) detailSuffixes.push(precision.toUpperCase());
    if (conc) detailSuffixes.push(`C${conc}`);
    if (tp !== undefined) detailSuffixes.push(`TP${tp}`);

    const line1 = headerSuffixes.length > 0 ? `${hwLabel} (${headerSuffixes.join(', ')})` : hwLabel;
    return detailSuffixes.length > 0 ? `${line1}\n${detailSuffixes.join(', ')}` : line1;
  }

  const availablePrecisions = useMemo(() => {
    const dbModelKey = DISPLAY_MODEL_TO_DB[selectedModel];
    if (!dbModelKey) return globalAvailablePrecisions;
    const precs = [
      ...new Set(rawData.filter((r) => r.model === dbModelKey).map((r) => r.precision)),
    ].sort();
    return precs.length > 0 ? precs : globalAvailablePrecisions;
  }, [rawData, selectedModel, globalAvailablePrecisions]);

  const unfilteredChartData: EvaluationChartData[] = useMemo(() => {
    if (!selectedBenchmark || !selectedModel || !selectedRunDate) return [];

    const dbModelKey = DISPLAY_MODEL_TO_DB[selectedModel];
    if (!dbModelKey) return [];

    const filteredData = rawData
      .filter((item) => {
        const itemDate = item.date;
        return (
          item.task === selectedBenchmark &&
          item.model === dbModelKey &&
          itemDate <= selectedRunDate &&
          effectivePrecisions.includes(item.precision)
        );
      })
      .map((item): EvaluationChartData | null => {
        const score = item.metrics.em_strict ?? item.metrics.score ?? 0;
        if (score === 0) return null;

        const hwKey = normalizeEvalHardwareKey(
          item.hardware,
          item.framework,
          item.spec_method,
        ) as keyof typeof HARDWARE_CONFIG;
        if (hwKey === 'unknown') return null;

        const itemDate = item.date;
        const itemDateTime = item.timestamp ?? '';

        return {
          configId: item.config_id,
          hwKey,
          configLabel: '',
          score,
          scoreError: item.metrics.em_strict_se ?? item.metrics.score_se ?? 0,
          model: item.model,
          benchmark: item.task,
          specDecode: item.spec_method,
          date: itemDate,
          datetime: itemDateTime,
          precision: item.precision,
          framework: item.framework,
          tp: item.decode_tp,
          ep: item.decode_ep,
          dp_attention: item.decode_dp_attention,
          conc: item.conc ?? 0,
        };
      })
      .filter((item): item is EvaluationChartData => item !== null);

    // Group by config_id and keep most recent per TP+conc combination
    const groupMap = new Map<number, EvaluationChartData[]>();
    filteredData.forEach((item) => {
      if (!groupMap.has(item.configId)) groupMap.set(item.configId, []);
      groupMap.get(item.configId)!.push(item);
    });

    const result: EvaluationChartData[] = [];
    groupMap.forEach((groupItems) => {
      // Dedup by TP+conc, keeping most recent date for each combination
      const dedupMap = new Map<string, EvaluationChartData>();
      groupItems.forEach((item) => {
        const key = `${item.tp}_${item.conc}`;
        const existing = dedupMap.get(key);
        if (!existing || item.date > existing.date) dedupMap.set(key, item);
      });

      dedupMap.forEach((item) => {
        const hwConfig = HARDWARE_CONFIG[item.hwKey];
        const hwLabel = String(hwConfig?.label || item.hwKey);
        result.push({
          ...item,
          configLabel: buildConfigLabel(
            hwLabel,
            item.framework,
            item.specDecode,
            item.precision,
            item.conc,
            item.tp,
          ),
        });
      });
    });

    return result.sort((a, b) => a.configLabel.localeCompare(b.configLabel));
  }, [rawData, selectedBenchmark, selectedModel, selectedRunDate, effectivePrecisions]);

  const chartData = useMemo(() => {
    const filtered = unfilteredChartData.filter((data) => {
      return enabledHardware.has(String(data.hwKey));
    });

    const grouped = new Map<string, EvaluationChartData[]>();
    filtered.forEach((data) => {
      if (!grouped.has(data.configLabel)) grouped.set(data.configLabel, []);
      grouped.get(data.configLabel)!.push(data);
    });

    return Array.from(grouped.entries())
      .map(([_, dataPoints]) => {
        let sum = 0,
          rawMin = Infinity,
          rawMax = -Infinity,
          errMin = Infinity,
          errMax = -Infinity;
        for (const d of dataPoints) {
          sum += d.score;
          if (d.score < rawMin) rawMin = d.score;
          if (d.score > rawMax) rawMax = d.score;
          const lo = Math.max(0, d.score - (d.scoreError || 0));
          const hi = Math.min(1, d.score + (d.scoreError || 0));
          if (lo < errMin) errMin = lo;
          if (hi > errMax) errMax = hi;
        }
        const meanScore = sum / dataPoints.length;

        return {
          ...dataPoints[0],
          score: meanScore,
          scoreError: (errMax - errMin) / 2,
          minScore: rawMin,
          maxScore: rawMax,
          errorMin: errMin,
          errorMax: errMax,
        };
      })
      .sort(
        (a, b) =>
          getModelSortIndex(String(a.hwKey)) - getModelSortIndex(String(b.hwKey)) ||
          String(a.hwKey).localeCompare(String(b.hwKey)),
      );
  }, [unfilteredChartData, enabledHardware]);

  const highlightedConfigs = useMemo(() => {
    const highlighted = new Set<string>();
    unfilteredChartData.forEach((data) => {
      if (data.date === selectedRunDate) highlighted.add(data.configLabel);
    });
    return highlighted;
  }, [unfilteredChartData, selectedRunDate]);

  const changelogEntries: EvalChangelogEntry[] = useMemo(() => {
    if (!selectedRunDate || !selectedModel) return [];

    const dbModelKey = DISPLAY_MODEL_TO_DB[selectedModel];
    if (!dbModelKey) return [];

    const entriesOnDate = rawData.filter((item) => {
      const itemDate = item.date;
      const score = item.metrics.em_strict ?? item.metrics.score ?? 0;
      return itemDate === selectedRunDate && item.model === dbModelKey && score !== 0;
    });

    const byBenchmark = new Map<string, Set<string>>();
    entriesOnDate.forEach((item) => {
      const hwKey = normalizeEvalHardwareKey(item.hardware, item.framework, item.spec_method);
      const hwConfig = HARDWARE_CONFIG[hwKey as keyof typeof HARDWARE_CONFIG];
      const hwLabel = String(hwConfig?.label || hwKey);
      const configLabel = buildConfigLabel(
        hwLabel,
        item.framework,
        item.spec_method,
        item.precision,
        item.conc,
      );

      if (!byBenchmark.has(item.task)) byBenchmark.set(item.task, new Set());
      byBenchmark.get(item.task)!.add(configLabel);
    });

    return Array.from(byBenchmark.entries())
      .map(([benchmark, configs]) => ({ benchmark, configs: Array.from(configs).sort() }))
      .sort((a, b) => a.benchmark.localeCompare(b.benchmark));
  }, [rawData, selectedRunDate, selectedModel]);

  const modelHasEvalData = useMemo(() => {
    if (!selectedModel) return false;
    const dbModelKey = DISPLAY_MODEL_TO_DB[selectedModel];
    return rawData.some((item) => item.model === dbModelKey);
  }, [rawData, selectedModel]);

  const hwTypesWithData = useMemo(
    () => new Set(unfilteredChartData.map((data) => String(data.hwKey))),
    [unfilteredChartData],
  );

  useEffect(() => {
    if (hwTypesWithData.size > 0) setEnabledHardware(hwTypesWithData);
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
      const gpus = [...enabledHardware].sort();
      track('evaluation_hw_selection_settled', {
        gpus,
        gpu_count: gpus.length,
        model: selectedModel,
        benchmark: selectedBenchmark,
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [enabledHardware]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only re-fire on hw set changes

  useUrlStateSync(
    {
      e_rundate: selectedRunDate !== globalRunDate ? selectedRunDate : '',
      e_bench: selectedBenchmark || '',
      e_hc: highContrast ? '1' : '',
      e_labels: showLabels ? '1' : '',
      e_legend: isLegendExpanded ? '' : '0',
    },
    [selectedRunDate, globalRunDate, selectedBenchmark, highContrast, showLabels, isLegendExpanded],
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
