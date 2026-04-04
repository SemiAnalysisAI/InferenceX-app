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

import { HardwareConfig, InferenceData } from '@/components/inference/types';
import { UnofficialBanner } from '@/components/ui/unofficial-banner';
import { DB_MODEL_TO_DISPLAY, islOslToSequence } from '@semianalysisai/inferencex-constants';
import { computeToggle } from '@/hooks/useTogglableSet';
import type { BenchmarkRow, EvalRow } from '@/lib/api';
import { normalizeEvalHardwareKey } from '@/lib/chart-utils';

import chartDefinitions from '@/components/inference/inference-chart-config.json';
import type { ChartDefinition } from '@/components/inference/types';
import { transformBenchmarkRows } from '@/lib/benchmark-transform';
import { Model, Sequence } from '@/lib/data-mappings';

interface UnofficialRunInfo {
  id: number;
  name: string;
  branch: string;
  sha: string;
  createdAt: string;
  url: string;
  conclusion: string;
  status: string;
  isNonMainBranch: boolean;
}

interface UnofficialChartData {
  [key: string]: {
    e2e: { data: InferenceData[]; gpus: HardwareConfig };
    interactivity: { data: InferenceData[]; gpus: HardwareConfig };
  };
}

const UNOFFICIAL_RUN_PARAM_RE = /^unofficialruns?$/i;

interface AvailableModelSequence {
  model: Model;
  sequence: Sequence;
}

export interface UnofficialRunContextType {
  isUnofficialRun: boolean;
  unofficialRunInfo: UnofficialRunInfo | null;
  unofficialChartData: UnofficialChartData | null;
  unofficialEvalRows: EvalRow[] | null;
  loading: boolean;
  error: string | null;
  clearUnofficialRun: () => void;
  availableModelsAndSequences: AvailableModelSequence[];
  getOverlayData: (
    model: Model,
    sequence: Sequence,
    chartType: 'e2e' | 'interactivity',
  ) => {
    data: InferenceData[];
    hardwareConfig: HardwareConfig;
  } | null;
  // Shared overlay toggle state — both charts read/write the same sets
  activeOverlayHwTypes: Set<string>;
  setActiveOverlayHwTypes: (v: Set<string>) => void;
  allOverlayHwTypes: Set<string>;
  toggleOverlayHwType: (key: string) => void;
  resetOverlayHwTypes: () => void;
  localOfficialOverride: Set<string> | null;
  setLocalOfficialOverride: (v: Set<string> | null) => void;
}

/** @internal Exported for test provider wrapping only. */
export const UnofficialRunContext = createContext<UnofficialRunContextType | undefined>(undefined);

export function useUnofficialRun() {
  const context = useContext(UnofficialRunContext);
  if (!context) {
    throw new Error('useUnofficialRun must be used within an UnofficialRunProvider');
  }
  return context;
}

/** Build chart data from raw benchmark rows returned by the unofficial-run API. */
export function buildChartData(benchmarks: BenchmarkRow[]): UnofficialChartData {
  // Group benchmarks by display model name + Sequence enum value
  // (keys must match getOverlayData which looks up `${Model}_${Sequence}`)
  const groups = new Map<string, BenchmarkRow[]>();
  for (const row of benchmarks) {
    const displayModel = DB_MODEL_TO_DISPLAY[row.model] ?? row.model;
    const sequence = islOslToSequence(row.isl, row.osl);
    if (!sequence) continue;
    const key = `${displayModel}_${sequence}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const result: UnofficialChartData = {};
  for (const [key, rows] of groups) {
    const { chartData, hardwareConfig } = transformBenchmarkRows(rows);
    // chartData indices match chartDefinitions order — look up by chartType
    const e2eIdx = (chartDefinitions as ChartDefinition[]).findIndex((d) => d.chartType === 'e2e');
    const interactivityIdx = (chartDefinitions as ChartDefinition[]).findIndex(
      (d) => d.chartType === 'interactivity',
    );
    result[key] = {
      e2e: { data: chartData[e2eIdx] ?? [], gpus: hardwareConfig },
      interactivity: { data: chartData[interactivityIdx] ?? [], gpus: hardwareConfig },
    };
  }

  return result;
}

export function parseAvailableModelsAndSequences(
  chartData: UnofficialChartData | null,
): AvailableModelSequence[] {
  if (!chartData) return [];

  const result: AvailableModelSequence[] = [];
  const allModels = Object.values(Model);
  const allSequences = Object.values(Sequence);

  for (const key of Object.keys(chartData)) {
    const lastUnderscoreIndex = key.lastIndexOf('_');
    if (lastUnderscoreIndex === -1) continue;
    const modelPart = key.substring(0, lastUnderscoreIndex);
    const sequencePart = key.substring(lastUnderscoreIndex + 1);
    const model = allModels.find((m) => m === modelPart);
    const sequence = allSequences.find((s) => s === sequencePart);
    if (model && sequence && !result.some((r) => r.model === model && r.sequence === sequence)) {
      result.push({ model, sequence });
    }
  }

  return result;
}

export function UnofficialRunProvider({ children }: { children: ReactNode }) {
  const [unofficialRunInfo, setUnofficialRunInfo] = useState<UnofficialRunInfo | null>(null);
  const [unofficialChartData, setUnofficialChartData] = useState<UnofficialChartData | null>(null);
  const [unofficialEvalRows, setUnofficialEvalRows] = useState<EvalRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModelsAndSequences, setAvailableModelsAndSequences] = useState<
    AvailableModelSequence[]
  >([]);

  // --- Shared overlay toggle state (unified across both charts) ---
  const [activeOverlayHwTypes, setActiveOverlayHwTypes] = useState<Set<string>>(new Set());
  const [localOfficialOverride, setLocalOfficialOverrideRaw] = useState<Set<string> | null>(null);

  // Derive all overlay hw types from chart data
  const allOverlayHwTypes = useMemo(() => {
    const hwTypes = new Set<string>();
    if (unofficialChartData) {
      for (const group of Object.values(unofficialChartData)) {
        for (const chartType of [group.e2e, group.interactivity]) {
          chartType.data.forEach((p) => {
            if (p.hwKey) hwTypes.add(p.hwKey as string);
          });
        }
      }
    }
    if (unofficialEvalRows) {
      unofficialEvalRows.forEach((row) => {
        const hwKey = normalizeEvalHardwareKey(row.hardware, row.framework, row.spec_method);
        if (hwKey !== 'unknown') hwTypes.add(hwKey);
      });
    }
    return hwTypes;
  }, [unofficialChartData, unofficialEvalRows]);

  // Reset overlay state when chart data changes
  useEffect(() => {
    setActiveOverlayHwTypes(allOverlayHwTypes);
    setLocalOfficialOverrideRaw(null);
  }, [allOverlayHwTypes]);

  const toggleOverlayHwType = useCallback(
    (key: string) => {
      setActiveOverlayHwTypes((prev) => computeToggle(prev, key, allOverlayHwTypes));
    },
    [allOverlayHwTypes],
  );

  const resetOverlayHwTypes = useCallback(() => {
    setActiveOverlayHwTypes(allOverlayHwTypes);
  }, [allOverlayHwTypes]);

  const setLocalOfficialOverride = useCallback(
    (v: Set<string> | null) => setLocalOfficialOverrideRaw(v),
    [],
  );

  const setActiveOverlayHwTypesStable = useCallback(
    (v: Set<string>) => setActiveOverlayHwTypes(v),
    [],
  );

  const clearUnofficialRun = useCallback(() => {
    setUnofficialRunInfo(null);
    setUnofficialChartData(null);
    setUnofficialEvalRows(null);
    setError(null);
    setAvailableModelsAndSequences([]);
    const url = new URL(window.location.href);
    for (const key of url.searchParams.keys()) {
      if (UNOFFICIAL_RUN_PARAM_RE.test(key)) url.searchParams.delete(key);
    }
    window.history.pushState({}, '', url);
  }, []);

  const getOverlayData = useCallback(
    (model: Model, sequence: Sequence, chartType: 'e2e' | 'interactivity') => {
      if (!unofficialChartData) return null;
      const dataKey = `${model}_${sequence}`;
      const chartGroup = unofficialChartData[dataKey];
      if (!chartGroup) return null;
      const dataForChart = chartType === 'e2e' ? chartGroup.e2e : chartGroup.interactivity;
      return { data: dataForChart.data, hardwareConfig: dataForChart.gpus };
    },
    [unofficialChartData],
  );

  useEffect(() => {
    const load = () => {
      const params = new URLSearchParams(window.location.search);
      let unofficialRunId: string | undefined;
      for (const [key, value] of params) {
        if (UNOFFICIAL_RUN_PARAM_RE.test(key) && value) {
          unofficialRunId = value;
          break;
        }
      }
      if (!unofficialRunId) {
        setUnofficialRunInfo(null);
        setUnofficialChartData(null);
        setUnofficialEvalRows(null);
        setError(null);
        setAvailableModelsAndSequences([]);
        return;
      }

      setLoading(true);
      setError(null);

      fetch(`/api/unofficial-run?runId=${unofficialRunId}`)
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to fetch unofficial run');

          setUnofficialRunInfo(data.runInfo);
          const chartData = buildChartData(data.benchmarks ?? []);
          setUnofficialChartData(chartData);
          setUnofficialEvalRows(data.evaluations ?? []);
          setAvailableModelsAndSequences(parseAvailableModelsAndSequences(chartData));
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : 'Unknown error');
          setUnofficialRunInfo(null);
          setUnofficialChartData(null);
          setUnofficialEvalRows(null);
          setAvailableModelsAndSequences([]);
        })
        .finally(() => setLoading(false));
    };

    load();
    window.addEventListener('popstate', load);
    return () => window.removeEventListener('popstate', load);
  }, []);

  return (
    <UnofficialRunContext.Provider
      value={{
        isUnofficialRun: !!unofficialRunInfo,
        unofficialRunInfo,
        unofficialChartData,
        unofficialEvalRows,
        loading,
        error,
        clearUnofficialRun,
        availableModelsAndSequences,
        getOverlayData,
        activeOverlayHwTypes,
        setActiveOverlayHwTypes: setActiveOverlayHwTypesStable,
        allOverlayHwTypes,
        toggleOverlayHwType,
        resetOverlayHwTypes,
        localOfficialOverride,
        setLocalOfficialOverride,
      }}
    >
      {unofficialRunInfo && (
        <UnofficialBanner runInfo={unofficialRunInfo} onDismiss={clearUnofficialRun} />
      )}
      {children}
    </UnofficialRunContext.Provider>
  );
}
