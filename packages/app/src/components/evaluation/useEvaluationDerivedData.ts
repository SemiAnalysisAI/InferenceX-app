'use client';

import { useMemo } from 'react';

import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';

import { normalizeEvalHardwareKey } from '@/lib/chart-utils';
import type { EvalRow } from '@/lib/api';

import {
  aggregateEvaluationChartRows,
  buildEvalChangelogEntries,
  buildEvaluationChartRows,
} from './chart-data';
import type { EvalChangelogEntry, EvaluationChartData } from './types';

/**
 * Pure derivations for the evaluation chart — available benchmarks/dates/
 * hardware/precisions plus the official + unofficial (overlay) chart data,
 * highlighted configs, changelog entries, and the hw-with-data set.
 *
 * Extracted verbatim from EvaluationProvider. Every memo keeps its original
 * dependency array. The provider still owns selection + toggle state and passes
 * it in; this hook contains no state of its own.
 */
export function useEvaluationDerivedData(params: {
  rawData: EvalRow[];
  unofficialRawData: EvalRow[];
  selectedModel: string | undefined;
  selectedBenchmark: string | undefined;
  selectedRunDate: string;
  effectivePrecisions: string[];
  effectiveEnabledHardware: Set<string>;
  globalAvailablePrecisions: string[];
}) {
  const {
    rawData,
    unofficialRawData,
    selectedModel,
    selectedBenchmark,
    selectedRunDate,
    effectivePrecisions,
    effectiveEnabledHardware,
    globalAvailablePrecisions,
  } = params;

  const availableBenchmarks = useMemo(() => {
    const tasks = new Set([
      ...rawData.map((item) => item.task),
      ...unofficialRawData.map((item) => item.task),
    ]);
    return [...tasks].toSorted();
  }, [rawData, unofficialRawData]);

  const availableDates = useMemo(() => {
    const dbModelKeys = new Set(DISPLAY_MODEL_TO_DB[selectedModel as string]);
    const dates = new Set(
      rawData.flatMap((item) => (dbModelKeys.has(item.model) && item.date ? [item.date] : [])),
    );
    return [...dates].toSorted();
  }, [rawData, selectedModel]);

  const availableHardware = useMemo(() => {
    const hwSet = new Set<string>();
    rawData.forEach((item) => {
      const hwKey = normalizeEvalHardwareKey(item.hardware, item.framework, item.spec_method);
      if (hwKey !== 'unknown') hwSet.add(hwKey);
    });
    return [...hwSet].toSorted();
  }, [rawData]);

  const availablePrecisions = useMemo(() => {
    const dbModelKeys = DISPLAY_MODEL_TO_DB[selectedModel as string];
    if (!dbModelKeys || dbModelKeys.length === 0) return globalAvailablePrecisions;
    const dbModelKeySet = new Set(dbModelKeys);
    const precs = [
      ...new Set(
        [...rawData, ...unofficialRawData].flatMap((r) =>
          dbModelKeySet.has(r.model) ? [r.precision] : [],
        ),
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

  return {
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
  };
}
