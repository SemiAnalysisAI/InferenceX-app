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
  useState,
} from 'react';

import type { HardwareConfig, InferenceData } from '@/components/inference/types';
import { UnofficialBanner } from '@/components/ui/unofficial-banner';
import type { BenchmarkRow, EvalRow } from '@/lib/api/api';
import type { TokenBasis } from '@/lib/benchmarks/benchmark-transform';
import { DEFAULT_CHIP_BASIS, type ChipBasis } from '@/lib/benchmarks/chip-basis';
import { normalizeEvalHardwareKey } from '@/lib/charts/chart-utils';
import { notifyClientSearchChange } from '@/lib/routing/client-navigation';
import { setProfitRouteUnofficialRuns } from '@/lib/routing/profit-estimator-routes';
import { useClientRouteSearch } from '@/hooks/useClientSearch';
import { type Model, Sequence } from '@/lib/catalog/data-mappings';
import { ApiRequestError } from '@/lib/api/api-request-error';

import type * as UnofficialChartDataModule from './unofficial-chart-data';
import type { UnofficialChartData } from './unofficial-chart-data';

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

interface UnofficialRunResponse {
  runInfos: UnofficialRunInfo[];
  benchmarks: BenchmarkRow[];
  evaluations: EvalRow[];
}

const EMPTY_UNOFFICIAL_RUN_INFOS: UnofficialRunInfo[] = [];

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
    tokenBasis?: TokenBasis,
    chipBasis?: ChipBasis,
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
export function useOverlayScopeReconciliation(input: OverlayScopeInput | null): void {
  const { reconcileOverlayScope } = useUnofficialRun();
  useEffect(() => {
    if (input) reconcileOverlayScope(input);
  }, [input, reconcileOverlayScope]);
}

export function parseAvailableModelsAndSequences(
  chartData: UnofficialChartData | null,
): AvailableModelSequence[] {
  if (!chartData) return [];

  const result: AvailableModelSequence[] = [];
  const allSequences = Object.values(Sequence);
  for (const key of Object.keys(chartData)) {
    const lastUnderscoreIndex = key.lastIndexOf('_');
    if (lastUnderscoreIndex === -1) continue;
    // An unregistered model keeps its raw prefix as its identity, see isRegisteredModel.
    const model = key.slice(0, lastUnderscoreIndex) as Model;
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
  const url = `/api/unofficial-run?runId=${encodeURIComponent(ids.join(','))}`;
  // Default cache mode: the route's Cache-Control already keeps in-progress
  // runs fresh, and `no-store` would make every load bypass the CDN copy.
  const response = await fetch(url, { signal });
  const data = (await response.json()) as Partial<UnofficialRunResponse> & {
    error?: string;
  };
  if (!response.ok) {
    throw new ApiRequestError(data.error || 'Failed to fetch unofficial run', response.status, url);
  }
  return selectUnofficialRunResponse(
    {
      runInfos: Array.isArray(data.runInfos) ? data.runInfos : [],
      benchmarks: Array.isArray(data.benchmarks) ? data.benchmarks : [],
      evaluations: Array.isArray(data.evaluations) ? data.evaluations : [],
    },
    ids,
  );
}

export function UnofficialRunProvider({
  children,
  showBanner = true,
}: {
  children: ReactNode;
  showBanner?: boolean;
}) {
  const queryClient = useQueryClient();
  const search = useClientRouteSearch();
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

  const [chartDataModule, setChartDataModule] = useState<typeof UnofficialChartDataModule | null>(
    null,
  );
  const hasRunIds = runIds.length > 0;
  useEffect(() => {
    if (hasRunIds && !chartDataModule)
      void import('./unofficial-chart-data').then(setChartDataModule);
  }, [hasRunIds, chartDataModule]);
  const runData = chartDataModule ? query.data : undefined;

  const unofficialRunInfos = runData?.runInfos ?? EMPTY_UNOFFICIAL_RUN_INFOS;
  const unofficialRunInfo = unofficialRunInfos[0] ?? null;
  const unofficialBenchmarkRows = runData?.benchmarks ?? null;
  const unofficialEvalRows = runData?.evaluations ?? null;
  const unofficialChartData = useMemo(
    () =>
      unofficialBenchmarkRows && chartDataModule
        ? chartDataModule.buildChartData(unofficialBenchmarkRows)
        : null,
    [unofficialBenchmarkRows, chartDataModule],
  );
  // Non-default token and chip bases are built on first request and kept per row set.
  const overlayVariantCache = useMemo(
    () => new Map<string, UnofficialChartData>(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unofficialBenchmarkRows],
  );
  const unofficialUncachedChartData = useMemo(
    () =>
      unofficialBenchmarkRows && chartDataModule
        ? chartDataModule.buildChartData(unofficialBenchmarkRows, 'uncached')
        : null,
    [unofficialBenchmarkRows, chartDataModule],
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
    setProfitRouteUnofficialRuns(url, []);
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
      setProfitRouteUnofficialRuns(url, remainingIds);
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
    (
      model: Model,
      sequence: Sequence,
      chartType: 'e2e' | 'interactivity',
      tokenBasis: TokenBasis = 'total',
      chipBasis: ChipBasis = DEFAULT_CHIP_BASIS,
    ) => {
      let source = tokenBasis === 'uncached' ? unofficialUncachedChartData : unofficialChartData;
      if (chipBasis !== DEFAULT_CHIP_BASIS && unofficialBenchmarkRows && chartDataModule) {
        const key = `${tokenBasis}:${chipBasis}`;
        source = overlayVariantCache.get(key) ?? null;
        if (!source) {
          source = chartDataModule.buildChartData(unofficialBenchmarkRows, tokenBasis, chipBasis);
          overlayVariantCache.set(key, source);
        }
      }
      const chartGroup = source?.[`${model}_${sequence}`];
      if (!chartGroup) return null;
      const dataForChart = chartType === 'e2e' ? chartGroup.e2e : chartGroup.interactivity;
      return { data: dataForChart.data, hardwareConfig: dataForChart.gpus };
    },
    [
      unofficialChartData,
      unofficialUncachedChartData,
      unofficialBenchmarkRows,
      chartDataModule,
      overlayVariantCache,
    ],
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

  const loading = hasRunIds && (query.isFetching || !chartDataModule);
  const error = query.error instanceof Error ? query.error.message : null;

  const contextValue = useMemo<UnofficialRunContextType>(
    () => ({
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
    }),
    [
      unofficialRunInfos,
      unofficialRunInfo,
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
      selection.activeOverlayHwTypes,
      allOverlayHwTypes,
      selection.localOfficialOverride,
      reconcileOverlayScope,
      setUnifiedOverlaySelection,
      resetOverlaySelection,
    ],
  );

  return (
    <UnofficialRunContext.Provider value={contextValue}>
      {showBanner && <UnofficialRunBanner />}
      {children}
    </UnofficialRunContext.Provider>
  );
}

export function UnofficialRunBanner({ attached = false }: { attached?: boolean }) {
  const { unofficialRunInfos, dismissRun, clearUnofficialRun } = useUnofficialRun();
  return (
    <UnofficialBanner
      runs={unofficialRunInfos}
      attached={attached}
      onDismissRun={dismissRun}
      onDismissAll={clearUnofficialRun}
    />
  );
}
