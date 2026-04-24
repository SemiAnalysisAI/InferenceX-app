'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { ChartDefinition, HardwareConfig, InferenceData } from '@/components/inference/types';
import { UnofficialBanner } from '@/components/ui/unofficial-banner';
import { DB_MODEL_TO_DISPLAY, islOslToSequence } from '@semianalysisai/inferencex-constants';
import { computeToggle } from '@/hooks/useTogglableSet';
import type { BenchmarkRow, EvalRow } from '@/lib/api';
import { normalizeEvalHardwareKey } from '@/lib/chart-utils';

import chartDefinitions from '@/components/inference/inference-chart-config.json';
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

type UnofficialChartData = Record<
  string,
  {
    e2e: { data: InferenceData[]; gpus: HardwareConfig };
    interactivity: { data: InferenceData[]; gpus: HardwareConfig };
  }
>;

const UNOFFICIAL_RUN_PARAM_RE = /^unofficialruns?$/i;

interface AvailableModelSequence {
  model: Model;
  sequence: Sequence;
  precisions: string[];
}

export interface UnofficialRunContextType {
  isUnofficialRun: boolean;
  /** First run in the loaded set — kept as a convenience alias for overlay labels. */
  unofficialRunInfo: UnofficialRunInfo | null;
  /** All runs loaded from the `unofficialrun(s)` URL param (comma-separated). */
  unofficialRunInfos: UnofficialRunInfo[];
  /**
   * Position of each run in the loaded set, keyed by both `run.url` and the
   * numeric id as a string. Used to derive a distinct hue shift per run for
   * overlay points so multiple runs are visually separable.
   */
  runIndexByUrl: Record<string, number>;
  unofficialChartData: UnofficialChartData | null;
  unofficialEvalRows: EvalRow[] | null;
  loading: boolean;
  error: string | null;
  /** Clear every unofficial run. Wipes state + URL. */
  clearUnofficialRun: () => void;
  /**
   * Drop a single run ID. Rewrites the URL to the remaining IDs and filters
   * local state (chart data + eval rows + run infos) by `run_url` without
   * refetching the others.
   */
  dismissRun: (runId: string) => void;
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
    const modelPart = key.slice(0, lastUnderscoreIndex);
    const sequencePart = key.slice(lastUnderscoreIndex + 1);
    const model = allModels.find((m) => m === modelPart);
    const sequence = allSequences.find((s) => s === sequencePart);
    if (!model || !sequence) continue;
    const group = chartData[key];
    const precisions = [
      ...new Set(
        [...(group?.e2e.data ?? []), ...(group?.interactivity.data ?? [])].map((d) => d.precision),
      ),
    ];
    if (!result.some((r) => r.model === model && r.sequence === sequence)) {
      result.push({ model, sequence, precisions });
    }
  }

  return result;
}

export function UnofficialRunProvider({ children }: { children: ReactNode }) {
  const [unofficialRunInfos, setUnofficialRunInfos] = useState<UnofficialRunInfo[]>([]);
  const unofficialRunInfo = unofficialRunInfos[0] ?? null;
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
    setUnofficialRunInfos([]);
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

  /**
   * Drop a single run from the URL + state. Since benchmark rows are tagged
   * with `run_url` and eval rows have their own `run_url`, we can filter local
   * state by the dismissed run's URL/id without refetching the remaining runs.
   */
  const dismissRun = useCallback(
    (runId: string) => {
      const target = unofficialRunInfos.find((r) => String(r.id) === runId);
      if (!target) return;

      const remaining = unofficialRunInfos.filter((r) => String(r.id) !== runId);

      // Rewrite URL to the remaining IDs (or drop param if none left).
      const url = new URL(window.location.href);
      const existingKeys: string[] = [];
      for (const key of url.searchParams.keys()) {
        if (UNOFFICIAL_RUN_PARAM_RE.test(key)) existingKeys.push(key);
      }
      for (const key of existingKeys) url.searchParams.delete(key);
      if (remaining.length > 0) {
        url.searchParams.set('unofficialrun', remaining.map((r) => r.id).join(','));
      }
      window.history.pushState({}, '', url);

      if (remaining.length === 0) {
        setUnofficialRunInfos([]);
        setUnofficialChartData(null);
        setUnofficialEvalRows(null);
        setError(null);
        setAvailableModelsAndSequences([]);
        return;
      }

      setUnofficialRunInfos(remaining);

      // Filter chart data by stamped `run_url`. A row belongs to the dismissed
      // run if its URL matches exactly OR the numeric id parses to the same.
      const belongsToDismissed = (rowUrl?: string | null) => {
        if (!rowUrl) return false;
        if (rowUrl === target.url) return true;
        const m = rowUrl.match(/\/runs\/(\d+)/);
        return m !== null && m[1] === runId;
      };

      // Compute the filtered chart data BEFORE any setState so we can pass the
      // same value to setUnofficialChartData and parseAvailableModelsAndSequences.
      // Writing to an outer variable from inside a setState updater and then
      // reading it synchronously is unsafe: React 18 invokes updaters during
      // render, not at the call site, so the read would see the initial null.
      const nextChartData: UnofficialChartData | null = unofficialChartData
        ? (() => {
            const next: UnofficialChartData = {};
            for (const [key, group] of Object.entries(unofficialChartData)) {
              const e2eData = group.e2e.data.filter((d) => !belongsToDismissed(d.run_url));
              const intvData = group.interactivity.data.filter(
                (d) => !belongsToDismissed(d.run_url),
              );
              if (e2eData.length === 0 && intvData.length === 0) continue;
              next[key] = {
                e2e: { data: e2eData, gpus: group.e2e.gpus },
                interactivity: { data: intvData, gpus: group.interactivity.gpus },
              };
            }
            return next;
          })()
        : null;
      setUnofficialChartData(nextChartData);
      // Re-derive available (model, sequence) pairs from surviving runs so the
      // model/sequence picker doesn't still offer combos that only existed in
      // the dismissed run.
      setAvailableModelsAndSequences(parseAvailableModelsAndSequences(nextChartData));

      setUnofficialEvalRows((prev) =>
        prev ? prev.filter((row) => !belongsToDismissed(row.run_url)) : prev,
      );
    },
    [unofficialRunInfos, unofficialChartData],
  );

  // Build a url → index lookup. Keyed by the full run.url AND by the numeric id
  // as a string, since `updateRepoUrl` can rewrite hosts/orgs between the
  // overlay rendering path and the run metadata.
  const runIndexByUrl = useMemo(() => {
    const map: Record<string, number> = {};
    unofficialRunInfos.forEach((info, idx) => {
      if (info.url) map[info.url] = idx;
      if (info.id !== undefined && info.id !== null) map[String(info.id)] = idx;
    });
    return map;
  }, [unofficialRunInfos]);

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
      let unofficialRunIdParam: string | undefined;
      for (const [key, value] of params) {
        if (UNOFFICIAL_RUN_PARAM_RE.test(key) && value) {
          unofficialRunIdParam = value;
          break;
        }
      }
      if (!unofficialRunIdParam) {
        setUnofficialRunInfos([]);
        setUnofficialChartData(null);
        setUnofficialEvalRows(null);
        setError(null);
        setAvailableModelsAndSequences([]);
        return;
      }

      setLoading(true);
      setError(null);

      // Pass the raw param value through — it may be a single id or a comma-separated list.
      // encodeURIComponent preserves commas while escaping any accidental whitespace/symbols.
      fetch(`/api/unofficial-run?runId=${encodeURIComponent(unofficialRunIdParam)}`)
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to fetch unofficial run');

          setUnofficialRunInfos(Array.isArray(data.runInfos) ? data.runInfos : []);
          const chartData = buildChartData(data.benchmarks ?? []);
          setUnofficialChartData(chartData);
          setUnofficialEvalRows(data.evaluations ?? []);
          setAvailableModelsAndSequences(parseAvailableModelsAndSequences(chartData));
        })
        .catch((caughtError) => {
          setError(caughtError instanceof Error ? caughtError.message : 'Unknown error');
          setUnofficialRunInfos([]);
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
        isUnofficialRun: unofficialRunInfos.length > 0,
        unofficialRunInfo,
        unofficialRunInfos,
        runIndexByUrl,
        unofficialChartData,
        unofficialEvalRows,
        loading,
        error,
        clearUnofficialRun,
        dismissRun,
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
      {unofficialRunInfos.length > 0 && (
        <UnofficialBanner
          runs={unofficialRunInfos}
          onDismissRun={dismissRun}
          onDismissAll={clearUnofficialRun}
        />
      )}
      {children}
    </UnofficialRunContext.Provider>
  );
}
