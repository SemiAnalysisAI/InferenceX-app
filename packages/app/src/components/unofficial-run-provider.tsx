'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';

import type { ChartDefinition, HardwareConfig, InferenceData } from '@/components/inference/types';
import { UnofficialBanner } from '@/components/ui/unofficial-banner';
import { DB_MODEL_TO_DISPLAY, rowToSequence } from '@semianalysisai/inferencex-constants';
import type { BenchmarkRow, EvalRow } from '@/lib/api';
import { transformBenchmarkRows } from '@/lib/benchmark-transform';
import { normalizeEvalHardwareKey } from '@/lib/chart-utils';
import { notifyClientSearchChange } from '@/lib/client-navigation';
import { useClientSearch } from '@/hooks/useClientSearch';
import { Model, Sequence } from '@/lib/data-mappings';

import chartDefinitions from '@/components/inference/metric-registry';

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

interface UnofficialRunResponse {
  runInfos: UnofficialRunInfo[];
  benchmarks: BenchmarkRow[];
  evaluations: EvalRow[];
}

const UNOFFICIAL_RUN_PARAM_RE = /^unofficialruns?$/iu;
function deleteUnofficialRunParams(searchParams: URLSearchParams): void {
  const keysToDelete: string[] = [];
  for (const key of searchParams.keys()) {
    if (UNOFFICIAL_RUN_PARAM_RE.test(key)) keysToDelete.push(key);
  }
  for (const key of keysToDelete) searchParams.delete(key);
}

export interface AvailableModelSequence {
  model: Model;
  sequence: Sequence;
  precisions: string[];
}

export interface OverlayScopeInput {
  scopeKey: string;
  officialHwTypes: Set<string>;
  overlayHwTypes: Set<string>;
  bestOfficialHwTypes: Set<string>;
  bestOverlayHwTypes: Set<string>;
  bestPerSku: boolean;
  ready: boolean;
}

export interface UnofficialRunContextType {
  isUnofficialRun: boolean;
  unofficialRunInfo: UnofficialRunInfo | null;
  unofficialRunInfos: UnofficialRunInfo[];
  runIndexByUrl: Record<string, number>;
  unofficialChartData: UnofficialChartData | null;
  unofficialBenchmarkRows: BenchmarkRow[] | null;
  unofficialEvalRows: EvalRow[] | null;
  loading: boolean;
  error: string | null;
  clearUnofficialRun: () => void;
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
  activeOverlayHwTypes: Set<string>;
  allOverlayHwTypes: Set<string>;
  localOfficialOverride: Set<string> | null;
  reconcileOverlayScope: (scope: OverlayScopeInput) => void;
  setUnifiedOverlaySelection: (official: Set<string>, overlay: Set<string>) => void;
  resetOverlaySelection: () => void;
}

export const UnofficialRunContext = createContext<UnofficialRunContextType | undefined>(undefined);

export function useUnofficialRun() {
  const context = useContext(UnofficialRunContext);
  if (!context) {
    throw new Error('useUnofficialRun must be used within an UnofficialRunProvider');
  }
  return context;
}
/** Registers derived chart availability; the provider reducer owns reconciliation. */
export function useOverlayScopeReconciliation(input: OverlayScopeInput | null): void {
  const { reconcileOverlayScope } = useUnofficialRun();
  useEffect(() => {
    if (input) reconcileOverlayScope(input);
  }, [input, reconcileOverlayScope]);
}

export function buildChartData(benchmarks: BenchmarkRow[]): UnofficialChartData {
  const groups = new Map<string, BenchmarkRow[]>();
  for (const row of benchmarks) {
    const displayModel = DB_MODEL_TO_DISPLAY[row.model] ?? row.model;
    const sequence = rowToSequence(row);
    if (!sequence) continue;
    const key = `${displayModel}_${sequence}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const result: UnofficialChartData = {};
  for (const [key, rows] of groups) {
    const { chartData, hardwareConfig } = transformBenchmarkRows(rows);
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
    const model = allModels.find((candidate) => candidate === key.slice(0, lastUnderscoreIndex));
    const sequence = allSequences.find(
      (candidate) => candidate === key.slice(lastUnderscoreIndex + 1),
    );
    if (!model || !sequence) continue;
    const group = chartData[key];
    const precisions = [
      ...new Set(
        [...(group?.e2e.data ?? []), ...(group?.interactivity.data ?? [])].map(
          (point) => point.precision,
        ),
      ),
    ];
    if (!result.some((entry) => entry.model === model && entry.sequence === sequence)) {
      result.push({ model, sequence, precisions });
    }
  }
  return result;
}

/** Canonicalize the first unofficial-run URL value without changing server validation policy. */
export function parseUnofficialRunIds(search: string): string[] {
  const params = new URLSearchParams(search);
  for (const [key, value] of params) {
    if (!UNOFFICIAL_RUN_PARAM_RE.test(key) || !value) continue;
    return [
      ...new Set(
        value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
          .map((id) => (/^\d+$/u.test(id) ? id.replace(/^0+(?=\d)/u, '') : id)),
      ),
    ];
  }
  return [];
}

export interface OverlaySelectionState {
  availabilityKey: string;
  activeOverlayHwTypes: Set<string>;
  availableOverlayHwTypes: Set<string>;
  localOfficialOverride: Set<string> | null;
  scopeKey: string | null;
  scopeOverlayHwTypes: Set<string>;
  scopeReady: boolean;
  bestSelectionKey: string;
  bestPerSku: boolean;
}

export type OverlaySelectionAction =
  | { type: 'availability'; key: string; allOverlayHwTypes: Set<string> }
  | { type: 'scope'; input: OverlayScopeInput }
  | { type: 'selection'; official: Set<string>; overlay: Set<string> }
  | { type: 'reset' };

const EMPTY_SELECTION_STATE: OverlaySelectionState = {
  availabilityKey: '',
  activeOverlayHwTypes: new Set(),
  availableOverlayHwTypes: new Set(),
  localOfficialOverride: null,
  scopeKey: null,
  scopeOverlayHwTypes: new Set(),
  scopeReady: false,
  bestSelectionKey: '',
  bestPerSku: false,
};

function sortedSetKey(values: Set<string>): string {
  return [...values].toSorted().join(',');
}

export function overlaySelectionReducer(
  state: OverlaySelectionState,
  action: OverlaySelectionAction,
): OverlaySelectionState {
  if (action.type === 'availability') {
    if (action.key !== state.availabilityKey) {
      return {
        ...EMPTY_SELECTION_STATE,
        availabilityKey: action.key,
        availableOverlayHwTypes: new Set(action.allOverlayHwTypes),
        activeOverlayHwTypes: new Set(action.allOverlayHwTypes),
      };
    }
    if (sortedSetKey(action.allOverlayHwTypes) === sortedSetKey(state.availableOverlayHwTypes)) {
      return state;
    }
    const activeOverlayHwTypes = new Set(state.activeOverlayHwTypes);
    for (const key of state.availableOverlayHwTypes) {
      if (!action.allOverlayHwTypes.has(key)) activeOverlayHwTypes.delete(key);
    }
    for (const key of action.allOverlayHwTypes) {
      if (!state.availableOverlayHwTypes.has(key)) activeOverlayHwTypes.add(key);
    }
    return {
      ...state,
      availableOverlayHwTypes: new Set(action.allOverlayHwTypes),
      activeOverlayHwTypes,
    };
  }
  if (action.type === 'selection') {
    return {
      ...state,
      bestPerSku: false,
      bestSelectionKey: '',
      localOfficialOverride: new Set(action.official),
      activeOverlayHwTypes: new Set(action.overlay),
    };
  }
  if (action.type === 'reset') {
    return {
      ...state,
      activeOverlayHwTypes: new Set(state.availableOverlayHwTypes),
      localOfficialOverride: null,
      bestPerSku: false,
      bestSelectionKey: '',
    };
  }

  const { input } = action;
  const desiredOfficial = input.bestPerSku
    ? input.bestOfficialHwTypes.size > 0
      ? input.bestOfficialHwTypes
      : input.officialHwTypes
    : input.officialHwTypes;
  const desiredOverlay = input.bestPerSku
    ? input.bestOverlayHwTypes.size > 0
      ? input.bestOverlayHwTypes
      : input.overlayHwTypes
    : input.overlayHwTypes;
  const bestSelectionKey = input.bestPerSku
    ? `${sortedSetKey(desiredOfficial)}|${sortedSetKey(desiredOverlay)}`
    : '';
  const scopeChanged = state.scopeKey !== input.scopeKey;
  const bestSelectionChanged =
    state.bestPerSku !== input.bestPerSku ||
    (input.bestPerSku && state.bestSelectionKey !== bestSelectionKey);
  const becameReady = input.ready && !state.scopeReady;
  if (!scopeChanged && !bestSelectionChanged && !becameReady) return state;

  let activeOverlayHwTypes = state.activeOverlayHwTypes;
  if (scopeChanged || bestSelectionChanged) {
    activeOverlayHwTypes = new Set(state.activeOverlayHwTypes);
    state.scopeOverlayHwTypes.forEach((key) => activeOverlayHwTypes.delete(key));
    input.overlayHwTypes.forEach((key) => activeOverlayHwTypes.delete(key));
    desiredOverlay.forEach((key) => activeOverlayHwTypes.add(key));
  }
  return {
    ...state,
    activeOverlayHwTypes,
    localOfficialOverride:
      input.ready && (scopeChanged || bestSelectionChanged || becameReady)
        ? new Set(desiredOfficial)
        : scopeChanged
          ? null
          : state.localOfficialOverride,
    scopeKey: input.scopeKey,
    scopeOverlayHwTypes: new Set(input.overlayHwTypes),
    scopeReady: input.ready,
    bestSelectionKey,
    bestPerSku: input.bestPerSku,
  };
}

function selectUnofficialRunResponse(
  response: UnofficialRunResponse,
  runIds: readonly string[],
): UnofficialRunResponse {
  const selectedIds = new Set(runIds);
  const runInfos = response.runInfos.filter((info) => selectedIds.has(String(info.id)));
  const selectedUrls = new Set(runInfos.map((info) => info.url).filter(Boolean));
  const belongsToSelectedRun = (runUrl?: string | null) => {
    if (!runUrl) return runIds.length === 1;
    if (selectedUrls.has(runUrl)) return true;
    const runId = runUrl.match(/\/runs\/(?<runId>\d+)/u)?.groups?.runId;
    return Boolean(runId && selectedIds.has(runId));
  };
  return {
    runInfos,
    benchmarks: response.benchmarks.filter((row) => belongsToSelectedRun(row.run_url)),
    evaluations: response.evaluations.filter((row) => belongsToSelectedRun(row.run_url)),
  };
}

async function fetchUnofficialRuns(
  ids: string[],
  signal: AbortSignal,
): Promise<UnofficialRunResponse> {
  const response = await fetch(`/api/unofficial-run?runId=${encodeURIComponent(ids.join(','))}`, {
    cache: 'no-store',
    signal,
  });
  const data = (await response.json()) as Partial<UnofficialRunResponse> & { error?: string };
  if (!response.ok) throw new Error(data.error || 'Failed to fetch unofficial run');
  return selectUnofficialRunResponse(
    {
      runInfos: Array.isArray(data.runInfos) ? data.runInfos : [],
      benchmarks: Array.isArray(data.benchmarks) ? data.benchmarks : [],
      evaluations: Array.isArray(data.evaluations) ? data.evaluations : [],
    },
    ids,
  );
}

export function UnofficialRunProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const search = useClientSearch();
  const runIds = useMemo(() => parseUnofficialRunIds(search), [search]);
  const runIdsKey = runIds.join(',');
  const query = useQuery({
    queryKey: ['unofficial-runs', runIdsKey] as const,
    queryFn: ({ signal }) => fetchUnofficialRuns(runIds, signal),
    enabled: runIds.length > 0,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
  });

  const unofficialRunInfos = query.data?.runInfos ?? [];
  const unofficialRunInfo = unofficialRunInfos[0] ?? null;
  const unofficialBenchmarkRows = query.data?.benchmarks ?? null;
  const unofficialEvalRows = query.data?.evaluations ?? null;
  const unofficialChartData = useMemo(
    () => (unofficialBenchmarkRows ? buildChartData(unofficialBenchmarkRows) : null),
    [unofficialBenchmarkRows],
  );
  const availableModelsAndSequences = useMemo(
    () => parseAvailableModelsAndSequences(unofficialChartData),
    [unofficialChartData],
  );
  const allOverlayHwTypes = useMemo(() => {
    const hwTypes = new Set<string>();
    for (const group of Object.values(unofficialChartData ?? {})) {
      for (const chartType of [group.e2e, group.interactivity]) {
        chartType.data.forEach((point) => {
          if (point.hwKey) hwTypes.add(String(point.hwKey));
        });
      }
    }
    for (const row of unofficialEvalRows ?? []) {
      const hwKey = normalizeEvalHardwareKey(row.hardware, row.framework, row.spec_method);
      if (hwKey !== 'unknown') hwTypes.add(hwKey);
    }
    return hwTypes;
  }, [unofficialChartData, unofficialEvalRows]);

  const [selection, dispatchSelection] = useReducer(overlaySelectionReducer, EMPTY_SELECTION_STATE);
  useEffect(() => {
    dispatchSelection({
      type: 'availability',
      key: runIdsKey,
      allOverlayHwTypes,
    });
  }, [runIdsKey, allOverlayHwTypes]);

  const clearUnofficialRun = useCallback(() => {
    const url = new URL(window.location.href);
    deleteUnofficialRunParams(url.searchParams);
    window.history.pushState({}, '', url);
    notifyClientSearchChange(url.href);
  }, []);

  const dismissRun = useCallback(
    (runId: string) => {
      const target = unofficialRunInfos.find((run) => String(run.id) === runId);
      if (!target) return;
      const remainingIds = runIds.filter((id) => id !== runId);
      if (remainingIds.length > 0 && query.data) {
        queryClient.setQueryData<UnofficialRunResponse>(
          ['unofficial-runs', remainingIds.join(',')],
          selectUnofficialRunResponse(query.data, remainingIds),
        );
      }
      const url = new URL(window.location.href);
      deleteUnofficialRunParams(url.searchParams);
      if (remainingIds.length > 0) url.searchParams.set('unofficialruns', remainingIds.join(','));
      window.history.pushState({}, '', url);
      notifyClientSearchChange(url.href);
    },
    [runIds, unofficialRunInfos, query.data, queryClient],
  );

  const runIndexByUrl = useMemo(() => {
    const map: Record<string, number> = {};
    unofficialRunInfos.forEach((info, index) => {
      if (info.url) map[info.url] = index;
      map[String(info.id)] = index;
    });
    return map;
  }, [unofficialRunInfos]);

  const getOverlayData = useCallback(
    (model: Model, sequence: Sequence, chartType: 'e2e' | 'interactivity') => {
      const chartGroup = unofficialChartData?.[`${model}_${sequence}`];
      if (!chartGroup) return null;
      const dataForChart = chartType === 'e2e' ? chartGroup.e2e : chartGroup.interactivity;
      return { data: dataForChart.data, hardwareConfig: dataForChart.gpus };
    },
    [unofficialChartData],
  );

  const resetOverlaySelection = useCallback(() => {
    dispatchSelection({ type: 'reset' });
  }, []);
  const reconcileOverlayScope = useCallback((input: OverlayScopeInput) => {
    dispatchSelection({ type: 'scope', input });
  }, []);
  const setUnifiedOverlaySelection = useCallback((official: Set<string>, overlay: Set<string>) => {
    dispatchSelection({ type: 'selection', official, overlay });
  }, []);

  const loading = runIds.length > 0 && query.isFetching;
  const error = query.error instanceof Error ? query.error.message : null;

  return (
    <UnofficialRunContext.Provider
      value={{
        isUnofficialRun: unofficialRunInfos.length > 0,
        unofficialRunInfo,
        unofficialRunInfos,
        runIndexByUrl,
        unofficialChartData,
        unofficialBenchmarkRows,
        unofficialEvalRows,
        loading,
        error,
        clearUnofficialRun,
        dismissRun,
        availableModelsAndSequences,
        getOverlayData,
        activeOverlayHwTypes: selection.activeOverlayHwTypes,
        allOverlayHwTypes,
        localOfficialOverride: selection.localOfficialOverride,
        reconcileOverlayScope,
        setUnifiedOverlaySelection,
        resetOverlaySelection,
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
