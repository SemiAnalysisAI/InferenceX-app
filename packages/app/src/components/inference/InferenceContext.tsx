'use client';

import {
  type ReactNode,
  type SetStateAction,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { DISPLAY_MODEL_TO_DB, rowToSequence } from '@semianalysisai/inferencex-constants';
import type { BenchmarkRow } from '@/lib/api';
import { track } from '@/lib/analytics';
import {
  FAVORITE_PRESETS,
  type FavoritePreset,
  matchesPresetHwFilter,
} from '@/components/favorites/favorite-presets';

import {
  useGlobalFilterActions,
  useGlobalFilterAvailability,
  useGlobalFilterRun,
  useGlobalFilterSelection,
  useGlobalFilterWorkflow,
} from '@/components/GlobalFilterContext';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import type {
  InferenceActionsContextType,
  InferenceData,
  InferenceDataContextType,
  InferenceDisplayContextType,
  InferenceFiltersContextType,
} from '@/components/inference/types';
import { resolveMetricConfigKey } from '@/components/inference/metric-registry';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useChartUIState,
  useChartToggleSet,
  useChartDataFilter,
  useUrlStateSync,
} from '@/hooks/useChartContext';
import { useUrlState } from '@/hooks/useUrlState';
import { DEFAULT_Y_AXIS_METRIC } from '@/lib/url-state';
import { computeToggle } from '@/hooks/useTogglableSet';
import { buildAvailabilityHwKey } from '@/lib/chart-utils';
import { getHardwareConfig, getModelSortIndex, isKnownGpu } from '@/lib/constants';
import { MODEL_PREFIX_MAPPING, Sequence, sequenceKind } from '@/lib/data-mappings';
import {
  EngineComparisonConflictToast,
  type EngineComparisonConflictDetail,
} from '@/components/engine-comparison-conflict-toast';
import {
  effectiveLegendItems,
  exclusionResolutionFamilies,
  resolveExclusionGroups,
  resolveExclusionToggle,
  type ExclusionConflictPolicy,
} from '@/lib/exclusion';
import { filterRunsByModel, getDisplayLabel } from '@/lib/utils';
import {
  isAgenticOnlyXAxisMode,
  useChartData,
  X_AXIS_MODES,
  type XAxisMode,
} from './hooks/useChartData';
import { buildActiveComparisonIds, resolveComparisonEntries } from './utils/comparisonEntry';
import {
  comparisonDefaultGroup,
  comparisonExclusionPolicy,
  comparisonExclusion as resolveComparisonExclusion,
} from './utils/comparison-exclusion';
import { resolveLabelState, serializeLabelState } from './utils/label-defaults';
import { bestSeriesPerSku } from './utils/best-series-per-sku';
import {
  EMPTY_QUICK_FILTERS,
  parseDeploymentModes,
  type DeploymentMode,
  type QuickFilters,
  type SpecMode,
} from './utils/quickFilters';

const InferenceDataContext = createContext<InferenceDataContextType | undefined>(undefined);
const InferenceFiltersContext = createContext<InferenceFiltersContextType | undefined>(undefined);
const InferenceDisplayContext = createContext<InferenceDisplayContextType | undefined>(undefined);
const InferenceActionsContext = createContext<InferenceActionsContextType | undefined>(undefined);

function useStableInferenceActions(
  actions: InferenceActionsContextType,
): InferenceActionsContextType {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  return useMemo(() => {
    const stableActions = {} as InferenceActionsContextType;
    const writableActions = stableActions as unknown as Record<
      keyof InferenceActionsContextType,
      (...args: never[]) => unknown
    >;
    for (const key of Object.keys(actions) as (keyof InferenceActionsContextType)[]) {
      writableActions[key] = (...args: never[]) => {
        const currentAction = actionsRef.current[key] as (...currentArgs: never[]) => unknown;
        return currentAction(...args);
      };
    }
    return stableActions;
  }, []);
}

/** @internal Shared by the route provider and focused context-isolation tests. */
export function InferenceContextsProvider({
  children,
  data,
  filters,
  display,
  actions,
}: {
  children: ReactNode;
  data: InferenceDataContextType;
  filters: InferenceFiltersContextType;
  display: InferenceDisplayContextType;
  actions: InferenceActionsContextType;
}) {
  const stableActions = useStableInferenceActions(actions);
  return (
    <InferenceActionsContext.Provider value={stableActions}>
      <InferenceDataContext.Provider value={data}>
        <InferenceFiltersContext.Provider value={filters}>
          <InferenceDisplayContext.Provider value={display}>
            {children}
          </InferenceDisplayContext.Provider>
        </InferenceFiltersContext.Provider>
      </InferenceDataContext.Provider>
    </InferenceActionsContext.Provider>
  );
}

export function resolveEffectiveXAxisMode(
  requestedMode: XAxisMode,
  sequence: Parameters<typeof sequenceKind>[0],
  sequenceResolved: boolean,
): XAxisMode {
  if (!sequenceResolved) return requestedMode;
  return sequenceKind(sequence) === 'fixed-seq' && isAgenticOnlyXAxisMode(requestedMode)
    ? 'interactivity'
    : requestedMode;
}

export function resolveE2eXAxisMetric(
  requestedMetric: string | null,
  mode: XAxisMode,
  sequence: Parameters<typeof sequenceKind>[0],
  percentile: string,
): string | null {
  if (mode === 'ttft') {
    return sequenceKind(sequence) === 'agentic' ? `${percentile}_ttft` : 'median_ttft';
  }
  if (mode === 'e2e') return null;
  return requestedMetric;
}

export function InferenceProvider({
  children,
  activeTab,
  initialActiveHwTypes,
  compareGpuPair,
  benchmarkQueryScope,
  initialBenchmarkModel,
  initialBenchmarkRows,
  initialYAxisMetric,
}: {
  children: ReactNode;
  activeTab: string;
  /**
   * Initial legend filter (activeHwTypes) when the URL has no `i_active` param.
   * Used by `/compare/[a]-vs-[b]` pages to focus the chart on the two GPUs from
   * the slug. Series for other GPUs are omitted — only matching hw keys remain.
   */
  initialActiveHwTypes?: string[];
  /**
   * When set (canonical `/compare` pages), benchmark data is filtered to these two
   * registry GPU base keys so other hardware never appears on the legend or plots.
   */
  compareGpuPair?: readonly [string, string];
  /** Isolates pair-filtered compare hydration from canonical dashboard queries. */
  benchmarkQueryScope?: string;
  initialBenchmarkModel?: string;
  initialBenchmarkRows?: BenchmarkRow[];
  /**
   * Initial y-axis metric key when the URL has no `?i_metric=` param. Used by
   * `/compare-per-dollar/[slug]` to default the chart to
   * `y_costh` (Cost per Million Total Tokens — Owning Hyperscaler) instead of
   * the dashboard's default `y_tokensPerDollarH`. URL param still wins so existing
   * shared links are unaffected.
   */
  initialYAxisMetric?: string;
}) {
  const isActive =
    activeTab === 'inference' || activeTab === 'historical' || activeTab === 'compare';

  const { selectedModel, effectiveSequence, sequenceResolved, effectivePrecisions } =
    useGlobalFilterSelection();
  const {
    setSelectedModel,
    setSelectedSequence,
    setSelectedPrecisions,
    setSelectedRunDate,
    setSelectedRunId,
  } = useGlobalFilterActions();
  const { selectedRunDate, selectedRunId, effectiveRunDate } = useGlobalFilterRun();
  const {
    availableModels,
    availableSequences,
    availablePrecisions,
    availableDates,
    availabilityRows,
    availabilitySettled,
    availabilityError,
  } = useGlobalFilterAvailability();
  const { availableRuns, workflowError } = useGlobalFilterWorkflow();
  const { isUnofficialRun } = useUnofficialRun();

  const { getUrlParam, setUrlParams } = useUrlState();

  const [overviewHistoryPair, setOverviewHistoryPair] = useState(() => {
    const currentConfigKey = getUrlParam('i_overview_current');
    const baselineConfigKey = getUrlParam('i_overview_baseline');
    return currentConfigKey && baselineConfigKey
      ? { currentConfigKey, baselineConfigKey }
      : undefined;
  });
  const clearOverviewHistoryPair = useCallback(() => {
    setOverviewHistoryPair(undefined);
    setUrlParams({ i_overview_current: '', i_overview_baseline: '' });
  }, [setUrlParams]);

  const exclusion = useMemo(
    () =>
      resolveComparisonExclusion(
        selectedModel,
        effectiveSequence,
        isUnofficialRun,
        overviewHistoryPair !== undefined,
      ),
    [selectedModel, effectiveSequence, isUnofficialRun, overviewHistoryPair],
  );
  const defaultExclusionGroup = useMemo(
    () => comparisonDefaultGroup(effectiveSequence, isUnofficialRun),
    [effectiveSequence, isUnofficialRun],
  );
  const exclusionPolicy: ExclusionConflictPolicy = comparisonExclusionPolicy(effectiveSequence);

  // ── GPU comparison state (owned by inference, not global) ─────────────────
  const [selectedDates, setSelectedDates] = useState<string[]>(() => {
    const urlDates = getUrlParam('i_dates');
    return urlDates ? urlDates.split(',').filter(Boolean) : [];
  });
  const [selectedDateRange, setSelectedDateRange] = useState<{
    startDate: string;
    endDate: string;
  }>(() => {
    const startDate = getUrlParam('i_dstart') || '';
    const endDate = getUrlParam('i_dend') || '';
    return startDate && endDate ? { startDate, endDate } : { startDate: '', endDate: '' };
  });
  const [isCheckingAvailableDates] = useState(false);
  const [showDateRangeDialog, setShowDateRangeDialog] = useState(false);

  // --- Cross-engine comparison conflict toast state ---
  const [engineConflict, setEngineConflict] = useState<EngineComparisonConflictDetail | null>(null);
  const dismissEngineConflict = useCallback(() => setEngineConflict(null), []);
  useEffect(() => {
    if (isUnofficialRun) setEngineConflict(null);
  }, [isUnofficialRun]);

  // ── Inference-specific filter state ─────────────────────────────────────────
  // Defer URL restoration until after mount so the first client render matches SSR.
  const [selectedGpuState, setSelectedGpuState] = useState<string[]>([]);
  const [gpuUrlHydrated, setGpuUrlHydrated] = useState(false);
  useEffect(() => {
    const urlGpus = getUrlParam('i_gpus');
    if (urlGpus) setSelectedGpuState(urlGpus.split(',').filter(Boolean));
    setGpuUrlHydrated(true);
  }, [getUrlParam]);
  const selectedGpuResolution = useMemo(() => {
    if (!sequenceResolved || !exclusion || selectedGpuState.length < 2) return null;
    const resolution = resolveExclusionGroups(
      new Set(selectedGpuState),
      new Set(),
      exclusion,
      exclusionPolicy,
      defaultExclusionGroup,
    );
    const selection = [...resolution.result];
    if (
      selection.length === selectedGpuState.length &&
      selection.every((gpu, index) => gpu === selectedGpuState[index])
    ) {
      return null;
    }
    return {
      selection,
      ...exclusionResolutionFamilies(selectedGpuState, resolution.result, exclusion),
    };
  }, [selectedGpuState, sequenceResolved, exclusion, exclusionPolicy, defaultExclusionGroup]);
  const selectedGPUs = selectedGpuResolution?.selection ?? selectedGpuState;
  const notifiedGpuResolutionRef = useRef('');
  useEffect(() => {
    if (!selectedGpuResolution) {
      notifiedGpuResolutionRef.current = '';
      return;
    }
    const resolutionKey = `${selectedGpuResolution.selection.join(',')}|${selectedGpuResolution.dropped.join(',')}|${selectedGpuResolution.partial.join(',')}`;
    if (resolutionKey === notifiedGpuResolutionRef.current) return;
    notifiedGpuResolutionRef.current = resolutionKey;
    if (selectedGpuResolution.dropped.length > 0 || selectedGpuResolution.partial.length > 0) {
      setEngineConflict({
        kind: 'resolved',
        kept: selectedGpuResolution.kept,
        dropped: selectedGpuResolution.dropped,
        partial: selectedGpuResolution.partial,
      });
    }
  }, [selectedGpuResolution]);
  const [selectedYAxisMetric, setSelectedYAxisMetric] = useState<string>(() =>
    resolveMetricConfigKey(getUrlParam('i_metric'), initialYAxisMetric ?? DEFAULT_Y_AXIS_METRIC),
  );
  const [selectedXAxisMetric, setSelectedXAxisMetric] = useState<string | null>(
    () => getUrlParam('i_xmetric') || 'p90_ttft',
  );
  const [requestedE2eXAxisMetric] = useState<string | null>(
    () => getUrlParam('i_e2e_xmetric') || 'p90_ttft',
  );
  // Selected chart variant. Initialize from URL only — SSR cannot read URL, so
  // computing a kind-based default here would diverge between server and client
  // and cause a hydration mismatch. The scenario-kind default is applied in a
  // post-mount effect below (and a ref tracks whether the user has overridden).
  //
  // SSR has no URL access, so seed with a fixed default and apply the URL
  // value (if any) in a post-mount effect — keeps server + client first render
  // identical and avoids "didn't match" hydration warnings when the URL holds
  // a non-default mode.
  const [requestedXAxisMode, setRequestedXAxisMode] = useState<XAxisMode>('interactivity');
  const xAxisModeFromUrlRef = useRef(false);
  useEffect(() => {
    if (xAxisModeFromUrlRef.current) return;
    const value = getUrlParam('i_xmode');
    if (value && (X_AXIS_MODES as readonly string[]).includes(value)) {
      xAxisModeFromUrlRef.current = true;
      setRequestedXAxisMode(value as XAxisMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const selectedXAxisMode = resolveEffectiveXAxisMode(
    requestedXAxisMode,
    effectiveSequence,
    sequenceResolved,
  );
  const handleSetXAxisMode = useCallback((mode: XAxisMode) => {
    xAxisModeFromUrlRef.current = true;
    setRequestedXAxisMode(mode);
  }, []);
  // Latency percentile applied to the chart x-axis for agentic scenarios.
  // Values: 'p90' | 'p99'. Non-agentic charts ignore.
  const [selectedPercentile, setSelectedPercentile] = useState<string>(
    () => getUrlParam('i_pctl') || 'p90',
  );
  const selectedE2eXAxisMetric = resolveE2eXAxisMetric(
    requestedE2eXAxisMetric,
    selectedXAxisMode,
    effectiveSequence,
    selectedPercentile,
  );
  const [scaleType, setScaleType] = useState<'auto' | 'linear' | 'log'>(
    () => (getUrlParam('i_scale') as 'auto' | 'linear' | 'log') || 'auto',
  );

  // ── Quick filters (vendor / framework / deployment / mtp-stp) ───────────────
  // Coarse pre-filters applied to the point set. Empty = no constraint.
  //
  // Initialized empty rather than from the URL so the first client render matches
  // SSR (which has no query string). Reading the params in these initializers would
  // desync the pills' aria-pressed/disabled between server and client; React does
  // not patch hydration mismatches, so a shared link would leave the pills frozen
  // inactive/disabled even while the chart filters. The URL selections are applied
  // just below, after mount.
  const [quickFilterVendors, setQuickFilterVendors] = useState<string[]>([]);
  const [quickFilterFrameworks, setQuickFilterFrameworks] = useState<string[]>([]);
  const [quickFilterDeployment, setQuickFilterDeployment] = useState<DeploymentMode[]>([]);
  const [quickFilterSpec, setQuickFilterSpec] = useState<SpecMode[]>([]);
  useEffect(() => {
    const parse = (key: 'i_vendor' | 'i_fw' | 'i_disagg' | 'i_spec') => {
      const v = getUrlParam(key);
      return v ? v.split(',').filter(Boolean) : [];
    };
    const vendors = parse('i_vendor');
    const frameworks = parse('i_fw');
    // Preserve old shared links: `agg` used to mean every non-disaggregated
    // point, so expand it to both aggregate deployment modes.
    const deployment = parseDeploymentModes(parse('i_disagg'));
    const spec = parse('i_spec') as SpecMode[];
    if (vendors.length > 0) setQuickFilterVendors(vendors);
    if (frameworks.length > 0) setQuickFilterFrameworks(frameworks);
    if (deployment.length > 0) setQuickFilterDeployment(deployment);
    if (spec.length > 0) setQuickFilterSpec(spec);
  }, [getUrlParam]);
  const quickFilters = useMemo<QuickFilters>(
    () => ({
      vendors: quickFilterVendors,
      frameworks: quickFilterFrameworks,
      deployment: quickFilterDeployment,
      spec: quickFilterSpec,
    }),
    [quickFilterVendors, quickFilterFrameworks, quickFilterDeployment, quickFilterSpec],
  );
  // Historical Trends hides Quick Filters, so never apply invisible selections there.
  // Agentic charts expose vendor, framework, and deployment filters, but speculative
  // decoding is intentionally not an agentic option. Ignore stale `i_spec` state from
  // an older shared URL without discarding it when the reader returns to fixed-seq.
  const dataQuickFilters = useMemo(
    () =>
      activeTab === 'historical'
        ? EMPTY_QUICK_FILTERS
        : effectiveSequence === Sequence.AgenticTraces
          ? { ...quickFilters, spec: [] }
          : quickFilters,
    [activeTab, effectiveSequence, quickFilters],
  );
  const { highContrast, setHighContrast, isLegendExpanded, setIsLegendExpanded } = useChartUIState({
    urlPrefix: 'i_',
  });

  const [hideNonOptimal, setHideNonOptimal] = useState(() => getUrlParam('i_optimal') !== '0');
  const [bestPerSku, setBestPerSku] = useState(
    () => activeTab === 'inference' && getUrlParam('i_best') !== '0',
  );
  const labelScenarioKind = sequenceKind(effectiveSequence);
  const initialLabelState = useMemo(
    () =>
      resolveLabelState('fixed-seq', {
        i_label: getUrlParam('i_label'),
        i_nolabel: getUrlParam('i_nolabel'),
        i_advlabel: getUrlParam('i_advlabel'),
        i_linelabel: getUrlParam('i_linelabel'),
      }),
    [getUrlParam],
  );
  const [showPointLabels, setShowPointLabels] = useState(initialLabelState.showPointLabels);
  const [logScale, setLogScale] = useState(() => getUrlParam('i_log') === '1');
  const [useAdvancedLabels, setUseAdvancedLabels] = useState(initialLabelState.useAdvancedLabels);
  const [showConcurrencyLabels, setShowConcurrencyLabels] = useState(
    () => getUrlParam('i_conclabel') === '1',
  );
  const [showGradientLabels, setShowGradientLabels] = useState(
    () => getUrlParam('i_gradlabel') === '1',
  );
  const [showLineLabels, setShowLineLabels] = useState(initialLabelState.showLineLabels);
  const [userCosts, setUserCosts] = useState<Record<string, number | undefined> | null>(null);
  const [userPowers, setUserPowers] = useState<Record<string, number | undefined> | null>(null);

  // --- Favorite presets state ---
  const [pendingHwFilter, setPendingHwFilter] = useState<string[] | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  // Persists the preset's desired hw filter beyond pendingHwFilter consumption.
  // Cleared when the user manually changes filters (clearing the preset).
  const presetHwFilterRef = useRef<string[] | null>(null);

  // Pending legend-active selection restored from `i_active` URL param.
  // Consumed once when hwTypesWithData first populates (see effect below).
  const [pendingActiveHwTypes, setPendingActiveHwTypes] = useState<Set<string> | null>(() => {
    const v = getUrlParam('i_active');
    if (v) {
      const set = new Set(v.split(',').filter(Boolean));
      return set.size > 0 ? set : null;
    }
    if (initialActiveHwTypes && initialActiveHwTypes.length > 0) {
      return new Set(initialActiveHwTypes);
    }
    return null;
  });

  // ── Data fetching (gated by isActive) ──────────────────────────────────────
  const latestDate = availableDates.length > 0 ? availableDates.at(-1) : undefined;

  // Runs available for the current model selection, and which one is selected.
  // Computed here (above useChartData) so the chart can query "as of" the selected
  // run. Re-exposed on the context value below.
  const modelPrefixes = useMemo(
    () =>
      Object.entries(MODEL_PREFIX_MAPPING)
        .filter(([, model]) => model === selectedModel)
        .map(([prefix]) => prefix),
    [selectedModel],
  );

  const filteredAvailableRuns = useMemo(
    () => filterRunsByModel(availableRuns, modelPrefixes, [...effectivePrecisions]) ?? {},
    [availableRuns, modelPrefixes, effectivePrecisions],
  );

  const effectiveSelectedRunId = useMemo(() => {
    const filteredRunIds = Object.keys(filteredAvailableRuns);
    if (filteredRunIds.length === 0 || filteredRunIds.includes(selectedRunId)) return selectedRunId;
    return filteredRunIds.reduce((max, id) => (id > max ? id : max), filteredRunIds[0]);
  }, [filteredAvailableRuns, selectedRunId]);

  // The latest run for this model on the selected date. GitHub run ids increase
  // monotonically with time, so the lexicographically-greatest id is the newest run.
  const latestRunIdForModel = useMemo(() => {
    const ids = Object.keys(filteredAvailableRuns);
    return ids.length > 0 ? ids.reduce((max, id) => (id > max ? id : max), ids[0]) : '';
  }, [filteredAvailableRuns]);

  // Only constrain the base query when an earlier-than-latest run is selected.
  const asOfRunId =
    effectiveSelectedRunId && latestRunIdForModel && effectiveSelectedRunId !== latestRunIdForModel
      ? effectiveSelectedRunId
      : undefined;

  // Run-selector scoping: only constrain benchmark data to a specific run when
  // there's actually a disambiguation to make for the CURRENT model. The
  // raw `availableRuns` is across ALL models on the date, so the picker may
  // auto-select a run that produced nothing for the current model — passing
  // that runId would return zero rows and hide the chart entirely.
  // Compute the set of runs whose CHANGELOG explicitly mentions this model +
  // precision. We can't reuse `filterRunsByModel` here because it has a
  // fallback that returns all runs when nothing matches (so the picker still
  // renders) — which would make us pass a runId that produced no rows for
  // the current model, hiding the chart.
  // Map each FULL config_key (model-precision-hardware-framework) a run's
  // changelog claims to the set of runs claiming it. Single-run scoping should
  // only kick in when two runs contest the SAME full key — e.g. a same-day
  // re-run of one hardware — because then a DISTINCT ON merge could mix them
  // and the user needs to pick which run wins. Runs covering DIFFERENT hardware
  // of the same model (e.g. a B300 run and a B200 run on the same date) are
  // complementary: both must render via carry-forward. Matching on model+
  // precision alone (the old behavior) wrongly treated those as alternatives
  // and scoped the chart to one run, hiding the other GPU's curve.
  const contestedRunIds = useMemo(() => {
    const runsByConfigKey = new Map<string, Set<string>>();
    if (availableRuns) {
      for (const [runId, runInfo] of Object.entries(availableRuns)) {
        if (!runInfo.changelog) continue;
        for (const entry of runInfo.changelog.entries) {
          for (const key of entry.config_keys) {
            const parts = key.split('-');
            if (modelPrefixes.includes(parts[0]!) && effectivePrecisions.includes(parts[1]!)) {
              let runs = runsByConfigKey.get(key);
              if (!runs) {
                runs = new Set<string>();
                runsByConfigKey.set(key, runs);
              }
              runs.add(runId);
            }
          }
        }
      }
    }
    // A run is "contested" only if some full config_key it claims is also claimed
    // by another run. Only then does picking a run disambiguate anything.
    // Downstream (useChartData / mergeRunScopedRows) this no longer scopes the
    // WHOLE chart to the run: only the configs the run actually produced are
    // pinned to it, and every other config (e.g. another framework's same-day
    // run) still carries forward from the normal latest-per-config rows.
    const contested = new Set<string>();
    for (const runs of runsByConfigKey.values()) {
      if (runs.size > 1) for (const r of runs) contested.add(r);
    }
    return contested;
  }, [availableRuns, modelPrefixes, effectivePrecisions]);
  const benchmarkRunId =
    effectiveSelectedRunId && contestedRunIds.has(String(effectiveSelectedRunId))
      ? String(effectiveSelectedRunId)
      : undefined;

  const {
    graphs,
    selectionPoints,
    loading: chartDataLoading,
    error: chartDataError,
    hardwareConfig,
    availableQuickFilters,
  } = useChartData(
    selectedModel,
    effectiveSequence,
    effectivePrecisions,
    selectedYAxisMetric,
    selectedXAxisMetric,
    selectedE2eXAxisMetric,
    selectedGPUs,
    selectedDates,
    selectedDateRange,
    userCosts,
    userPowers,
    effectiveRunDate,
    // Gate benchmark fetching on sequenceResolved: before availability loads we
    // don't yet know the model's real sequence, and the selection (e.g. an
    // agentic `?i_seq=` link) may be a scenario the model doesn't have. Fetching
    // now would fire the wrong data path, then refetch once availability snaps
    // the sequence. The chart's normal loading state covers this brief window.
    isActive && sequenceResolved,
    latestDate,
    selectedPercentile,
    compareGpuPair ?? null,
    benchmarkRunId,
    effectiveSelectedRunId ? String(effectiveSelectedRunId) : undefined,
    selectedXAxisMode,
    asOfRunId,
    dataQuickFilters,
    overviewHistoryPair,
    benchmarkQueryScope,
    selectedModel === initialBenchmarkModel ? initialBenchmarkRows : undefined,
  );

  // For GPU comparison date picker — use shared availability data from global filters
  const dbModelKeys = useMemo<string[]>(
    () => DISPLAY_MODEL_TO_DB[selectedModel] ?? [selectedModel],
    [selectedModel],
  );

  const dateRangeAvailableDates = useMemo(() => {
    if (selectedGPUs.length === 0) return availableDates;
    if (!availabilityRows) return availableDates;
    const rows = availabilityRows.filter((r) => {
      if (!dbModelKeys.includes(r.model)) return false;
      if (rowToSequence(r) !== effectiveSequence) return false;
      if (!effectivePrecisions.includes(r.precision)) return false;
      if (!r.hardware) return false;
      const hwKey = buildAvailabilityHwKey(
        r.hardware,
        r.framework,
        r.spec_method,
        r.disagg,
        r.benchmark_type,
      );
      return selectedGPUs.includes(hwKey);
    });
    const dates = [...new Set(rows.map((r) => r.date))].toSorted();
    return dates.length > 0 ? dates : availableDates;
  }, [
    availabilityRows,
    dbModelKeys,
    effectiveSequence,
    effectivePrecisions,
    selectedGPUs,
    availableDates,
  ]);

  // ── Derived state ─────────────────────────────────────────────────────────

  // GPU dropdown: only show configs that have data for current model + sequence + precision
  const availableGPUs = useMemo(() => {
    if (!availabilityRows) return [];
    const hwKeys = new Set<string>();
    for (const r of availabilityRows) {
      if (!dbModelKeys.includes(r.model)) continue;
      if (rowToSequence(r) !== effectiveSequence) continue;
      if (!effectivePrecisions.includes(r.precision)) continue;
      if (!r.hardware) continue;
      const hwKey = buildAvailabilityHwKey(
        r.hardware,
        r.framework,
        r.spec_method,
        r.disagg,
        r.benchmark_type,
      );
      if (isKnownGpu(hwKey)) hwKeys.add(hwKey);
    }
    return [...hwKeys]
      .toSorted((a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b))
      .map((hw) => ({
        value: hw,
        label: getDisplayLabel(getHardwareConfig(hw, selectedModel)),
      }));
  }, [availabilityRows, dbModelKeys, effectiveSequence, effectivePrecisions, selectedModel]);

  useEffect(() => {
    if (!sequenceResolved) return;
    const labelState = resolveLabelState(labelScenarioKind, {
      i_label: getUrlParam('i_label'),
      i_nolabel: getUrlParam('i_nolabel'),
      i_advlabel: getUrlParam('i_advlabel'),
      i_linelabel: getUrlParam('i_linelabel'),
    });
    setShowPointLabels(labelState.showPointLabels);
    setUseAdvancedLabels(labelState.useAdvancedLabels);
    setShowLineLabels(labelState.showLineLabels);
  }, [labelScenarioKind, sequenceResolved, getUrlParam]);

  // Ref guard: when true, filter changes don't clear the active preset.
  // FavoritePresetsDropdown sets this while applying a preset so its own
  // programmatic setter calls don't accidentally deactivate it.
  const presetGuardRef = useRef(false);
  const clearPresetOnChange = useCallback(() => {
    if (presetGuardRef.current) return;
    setActivePresetId((prev) => (prev === null ? prev : null));
    presetHwFilterRef.current = null;
  }, []);
  const clearScopedSelectionOnChange = useCallback(() => {
    clearPresetOnChange();
    clearOverviewHistoryPair();
  }, [clearOverviewHistoryPair, clearPresetOnChange]);
  const setSelectedModelAndClear = useCallback(
    (v: typeof selectedModel) => {
      setSelectedModel(v);
      clearScopedSelectionOnChange();
    },
    [setSelectedModel, clearScopedSelectionOnChange],
  );
  const setSelectedSequenceAndClear = useCallback(
    (v: typeof effectiveSequence) => {
      setSelectedSequence(v);
      clearScopedSelectionOnChange();
    },
    [setSelectedSequence, clearScopedSelectionOnChange],
  );
  const setSelectedPrecisionsAndClear = useCallback(
    (v: typeof effectivePrecisions) => {
      setSelectedPrecisions(v);
      clearScopedSelectionOnChange();
    },
    [setSelectedPrecisions, clearScopedSelectionOnChange],
  );
  const setSelectedYAxisMetricAndClear = useCallback(
    (v: string) => {
      setSelectedYAxisMetric(v);
      clearPresetOnChange();
    },
    [setSelectedYAxisMetric, clearPresetOnChange],
  );
  const setSelectedGPUsAndClear = useCallback(
    (next: string[]) => {
      if (!exclusion) {
        setSelectedGpuState(next);
        clearScopedSelectionOnChange();
        return;
      }

      const previous = new Set(selectedGPUs);
      const proposed = new Set(next);
      const added = [...proposed].filter((gpu) => !previous.has(gpu));
      if (added.length === 1) {
        const available = new Set([...availableGPUs.map((gpu) => gpu.value), ...proposed]);
        const decision = resolveExclusionToggle(
          previous,
          added[0],
          available,
          exclusion,
          exclusionPolicy,
        );
        if (decision.kind === 'block') {
          setEngineConflict({
            kind: 'blocked',
            attempted: decision.attempted,
            existing: decision.existing,
          });
          clearPresetOnChange();
          return;
        }
        if (decision.kind === 'silent-resolve') {
          setSelectedGpuState([...decision.result]);
          clearScopedSelectionOnChange();
          return;
        }
        setSelectedGpuState(next);
        clearScopedSelectionOnChange();
        return;
      }

      const { result, droppedGroups } = resolveExclusionGroups(
        proposed,
        previous,
        exclusion,
        exclusionPolicy,
      );
      setSelectedGpuState([...result]);
      if (droppedGroups.length > 0) {
        setEngineConflict({
          kind: 'resolved',
          ...exclusionResolutionFamilies(proposed, result, exclusion),
        });
      }
      clearScopedSelectionOnChange();
    },
    [
      selectedGPUs,
      availableGPUs,
      exclusion,
      exclusionPolicy,
      clearPresetOnChange,
      clearScopedSelectionOnChange,
    ],
  );
  const setSelectedDatesAndClear = useCallback(
    // Accept a React state updater (value OR function) so callers adding several
    // dates/runs in quick succession can use the functional form and avoid the
    // stale-closure race where each click overwrites the last.
    (v: SetStateAction<string[]>) => {
      setSelectedDates(v);
      clearScopedSelectionOnChange();
    },
    [setSelectedDates, clearScopedSelectionOnChange],
  );
  const setSelectedDateRangeAndClear = useCallback(
    (v: { startDate: string; endDate: string }) => {
      setSelectedDateRange(v);
      clearScopedSelectionOnChange();
    },
    [setSelectedDateRange, clearScopedSelectionOnChange],
  );

  // A failed availability lookup leaves `sequenceResolved` false forever, so
  // the gated benchmark query never produces rows and `chartDataLoading` would
  // pin the chart on its first-load skeleton. Availability errors are terminal:
  // drop the loading flag so ChartDisplay surfaces the error instead.
  const loading = availabilityError ? false : chartDataLoading;
  const error = availabilityError || workflowError || chartDataError;

  // ── Toggle sets ───────────────────────────────────────────────────────────

  const {
    activeSet: activeHwTypes,
    setActiveSet: setActiveHwTypes,
    selectAll: selectAllHwRaw,
    remove: removeHwRaw,
  } = useChartToggleSet();
  const {
    activeSet: activeDates,
    setActiveSet: setActiveDates,
    toggle: toggleDateRaw,
    selectAll: selectAllDatesRaw,
    remove: removeDateRaw,
  } = useChartToggleSet();

  const hwFilteredPoints = useMemo(
    () =>
      graphs.flatMap((graph) =>
        graph.data.filter((point) => effectivePrecisions.includes(point.precision)),
      ),
    [graphs, effectivePrecisions],
  );
  const hwSelectablePoints = useMemo(
    () => selectionPoints.filter((point) => effectivePrecisions.includes(point.precision)),
    [selectionPoints, effectivePrecisions],
  );
  const extractHwKey = useCallback((point: InferenceData) => point.hwKey as string, []);

  const comparisonExclusion = useMemo(
    () =>
      exclusion
        ? {
            familyOf: (key: string) =>
              exclusion.familyOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
            groupOf: (key: string) =>
              exclusion.groupOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
            scopesOf: (key: string) =>
              exclusion.scopesOf(key.startsWith('overlay:') ? key.slice('overlay:'.length) : key),
          }
        : null,
    [exclusion],
  );
  const activeHwTypesRef = useRef(activeHwTypes);
  activeHwTypesRef.current = activeHwTypes;
  const preferredHwTypesRef = useRef(activeHwTypes);
  if (activeHwTypes.size > 1) preferredHwTypesRef.current = activeHwTypes;
  const exclusionRef = useRef(comparisonExclusion);
  exclusionRef.current = comparisonExclusion;
  const exclusionPolicyRef = useRef(exclusionPolicy);
  exclusionPolicyRef.current = exclusionPolicy;
  const defaultExclusionGroupRef = useRef(defaultExclusionGroup);
  defaultExclusionGroupRef.current = defaultExclusionGroup;
  const resolveHwSelection = useCallback((proposed: Set<string>, prev?: Set<string>) => {
    const currentExclusion = exclusionRef.current;
    if (!currentExclusion) {
      return { result: proposed, keptGroup: null, droppedGroups: [] };
    }
    return resolveExclusionGroups(
      proposed,
      prev ?? activeHwTypesRef.current,
      currentExclusion,
      exclusionPolicyRef.current,
      defaultExclusionGroupRef.current,
    );
  }, []);
  const toggleComparisonSelection = useCallback(
    (prev: Set<string>, item: string, allItems: Set<string>): Set<string> | null => {
      const currentExclusion = exclusionRef.current;
      const toggleUniverse = currentExclusion
        ? effectiveLegendItems(allItems, prev, currentExclusion, preferredHwTypesRef.current)
        : allItems;
      if (currentExclusion) {
        const decision = resolveExclusionToggle(
          prev,
          item,
          toggleUniverse,
          currentExclusion,
          exclusionPolicyRef.current,
          defaultExclusionGroupRef.current,
        );
        if (decision.kind === 'block') {
          setEngineConflict({
            kind: 'blocked',
            attempted: decision.attempted,
            existing: decision.existing,
          });
          return null;
        }
        if (decision.kind === 'silent-resolve') {
          if (decision.result.size > 1) preferredHwTypesRef.current = decision.result;
          return decision.result;
        }
      }
      const result = computeToggle(prev, item, toggleUniverse);
      if (result.size > 1) preferredHwTypesRef.current = result;
      return result;
    },
    [],
  );

  // Wrap setActiveHwTypes to intercept resets and apply pendingHwFilter atomically.
  // Without this, useChartDataFilter resets to "all GPUs" in one render and the
  // pendingHwFilter effect filters it down in the next — causing a flash/race.
  const pendingHwFilterRef = useRef(pendingHwFilter);
  pendingHwFilterRef.current = pendingHwFilter;
  // Read selectedModel via a ref so the callback identity below stays stable —
  // matchesPresetHwFilter only consults the model to gate the bare-prefix
  // exclusion-suffix skip, and we want the current value at call time.
  const selectedModelRef = useRef(selectedModel);
  selectedModelRef.current = selectedModel;
  // Note: setActiveHwTypes is a useState dispatcher that accepts functional updaters,
  // but useChartToggleSet narrows the type to (set: Set<string>) => void.
  // We cast once here to allow passthrough of functional updaters from useChartDataFilter.
  const setActiveHwTypesDispatch = setActiveHwTypes as (
    u: Set<string> | ((prev: Set<string>) => Set<string>),
  ) => void;
  const setActiveHwTypesWithFilter = useCallback(
    (update: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      const filter = pendingHwFilterRef.current;
      if (!filter) {
        setActiveHwTypesDispatch((prev) => {
          const proposed = typeof update === 'function' ? update(prev) : update;
          return resolveHwSelection(proposed, prev).result;
        });
        return;
      }
      // Preset filter is active: evaluate updater to get all available items, then filter.
      // Passing empty set makes useChartDataFilter's updater return itemsWithData (all items).
      const base: Set<string> = typeof update === 'function' ? update(new Set()) : update;
      const filtered = new Set(
        [...base].filter((k) => matchesPresetHwFilter(k, filter, selectedModelRef.current)),
      );
      if (filtered.size > 0) {
        setActiveHwTypes(resolveHwSelection(filtered).result);
        setPendingHwFilter(null);
      } else {
        setActiveHwTypes(resolveHwSelection(base).result);
      }
    },
    [resolveHwSelection, setActiveHwTypes, setActiveHwTypesDispatch],
  );

  // `selectableHwTypes` is the universe the legend selection lives in: every
  // config in scope for the current model / sequence / precision, whether or
  // not it carries the selected y-metric. `hwTypesWithData` stays metric-aware
  // and drives what the legend renders and what the chart draws. Keeping the
  // two apart is what makes a y-axis switch non-destructive — the selection is
  // never intersected with metric coverage, so nothing has to be restored when
  // the user switches back.
  const selectableHwTypes = useChartDataFilter(
    hwSelectablePoints,
    setActiveHwTypesWithFilter,
    extractHwKey,
  );
  const hwTypesWithData = useMemo(
    () => new Set(hwFilteredPoints.map(extractHwKey)),
    [hwFilteredPoints, extractHwKey],
  );

  const bestHwTypes = useMemo(() => {
    const wantedType = selectedXAxisMode === 'interactivity' ? 'interactivity' : 'e2e';
    const graph = graphs.find((candidate) => candidate.chartDefinition.chartType === wantedType);
    if (!graph) return hwTypesWithData;
    const direction =
      graph.chartDefinition[
        `${selectedYAxisMetric}_roofline` as keyof typeof graph.chartDefinition
      ];
    if (
      direction !== 'upper_right' &&
      direction !== 'upper_left' &&
      direction !== 'lower_left' &&
      direction !== 'lower_right'
    ) {
      return hwTypesWithData;
    }
    const best = bestSeriesPerSku(graph.data, direction);
    return best.size > 0 ? best : hwTypesWithData;
  }, [graphs, hwTypesWithData, selectedXAxisMode, selectedYAxisMetric]);

  const setBestPerSkuAndApply = useCallback(
    (enabled: boolean, options?: { applySelection?: boolean }) => {
      setBestPerSku(enabled);
      // Overlay-mode legend edits own a temporary unified selection. They can
      // disable the automatic mode without replacing the context selection
      // that should be restored when the overlay is dismissed.
      if (options?.applySelection === false) return;
      const target = enabled ? bestHwTypes : selectableHwTypes;
      setActiveHwTypes(resolveHwSelection(target).result);
      setActivePresetId(null);
      presetHwFilterRef.current = null;
    },
    [bestHwTypes, selectableHwTypes, resolveHwSelection, setActiveHwTypes],
  );

  // Direct fallback: apply pendingHwFilter when selectableHwTypes is already populated
  // but useChartDataFilter didn't fire (e.g. re-selecting the same preset).
  useEffect(() => {
    if (!pendingHwFilter || selectableHwTypes.size === 0) return;
    const filtered = new Set(
      [...selectableHwTypes].filter((k) =>
        matchesPresetHwFilter(k, pendingHwFilter, selectedModel),
      ),
    );
    if (filtered.size > 0) {
      setActiveHwTypes(resolveHwSelection(filtered).result);
      setPendingHwFilter(null);
    }
  }, [pendingHwFilter, selectableHwTypes, selectedModel, resolveHwSelection, setActiveHwTypes]);

  const toggleHwType = useCallback(
    (hw: string) => {
      // Toggle against the selection universe, not the metric-filtered legend:
      // computeToggle's "everything is on, so solo this one" branch compares
      // set sizes, and activeHwTypes is sized against selectableHwTypes.
      const next = toggleComparisonSelection(activeHwTypes, hw, selectableHwTypes);
      if (!next) return;
      setActiveHwTypes(next);
      setBestPerSku(false);
      setActivePresetId(null);
      presetHwFilterRef.current = null;
    },
    [activeHwTypes, selectableHwTypes, setActiveHwTypes, toggleComparisonSelection],
  );

  const removeHwType = useCallback(
    (hw: string) => {
      removeHwRaw(hw);
      setBestPerSku(false);
      setActivePresetId(null);
      presetHwFilterRef.current = null;
    },
    [removeHwRaw],
  );

  const allDateIds = useMemo(() => {
    const dates = resolveComparisonEntries(selectedDates, selectedDateRange);
    return buildActiveComparisonIds(
      selectedGPUs,
      dates,
      overviewHistoryPair === undefined ? undefined : effectiveRunDate,
    );
  }, [selectedDateRange, selectedDates, selectedGPUs, overviewHistoryPair, effectiveRunDate]);

  const toggleActiveDate = useCallback(
    (id: string) => toggleDateRaw(id, allDateIds),
    [toggleDateRaw, allDateIds],
  );
  const removeActiveDate = useCallback((id: string) => removeDateRaw(id), [removeDateRaw]);
  const selectAllHwTypes = useCallback(() => {
    setBestPerSku(false);
    if (exclusion) {
      const { result, droppedGroups } = resolveHwSelection(selectableHwTypes, activeHwTypes);
      setActiveHwTypes(result);
      if (droppedGroups.length > 0) {
        setEngineConflict({
          kind: 'resolved',
          ...exclusionResolutionFamilies(selectableHwTypes, result, exclusion),
        });
      }
      return;
    }
    selectAllHwRaw(selectableHwTypes);
  }, [
    selectAllHwRaw,
    selectableHwTypes,
    activeHwTypes,
    exclusion,
    resolveHwSelection,
    setActiveHwTypes,
  ]);
  const selectAllActiveDates = useCallback(
    () => selectAllDatesRaw(allDateIds),
    [selectAllDatesRaw, allDateIds],
  );

  // ── Side effects ──────────────────────────────────────────────────────────

  // Reset legend HW toggles to "all enabled" when model, sequence, or precision changes.
  // Use a stable string key for precisions so array reference changes don't trigger a reset.
  // Skip the reset when a preset hw filter is pending — the fallback effect below handles it.
  // When a preset is still active (presetHwFilterRef), re-apply the filter instead of resetting
  // to all GPUs — this handles deferred effectivePrecisions changes from late availability data.
  // Track the last applied key with a ref and include selectableHwTypes in the deps so the
  // reset commits as soon as data for the new model arrives — without this, switching models
  // bails on the empty-data tick and never re-fires, leaving the legend at the prior intersection.
  const precisionsKey = effectivePrecisions.join(',');
  const hwResetKey = `${selectedModel}|${effectiveSequence}|${precisionsKey}|${
    isUnofficialRun ? 'preview' : 'official'
  }`;
  const lastHwResetKeyRef = useRef('');

  // Restore legend-active selection from URL on first availability of
  // selectableHwTypes. Sets lastHwResetKeyRef so the reset effect below treats
  // the current key as already-applied and bails. Empty intersections fall back
  // to all available configs before the active exclusion policy is applied.
  useEffect(() => {
    if (!pendingActiveHwTypes) return;
    if (pendingHwFilterRef.current) return;
    if (selectableHwTypes.size === 0) return;
    // Match exact hwKeys (URL-restored) AND bare GPU prefixes (used by
    // /compare/[a]-vs-[b] pages, which know the GPU key but not which framework
    // configs exist for it).
    const prefixes = [...pendingActiveHwTypes].filter((k) => !k.includes('_'));
    let restored = new Set(
      [...selectableHwTypes].filter(
        (k) =>
          pendingActiveHwTypes.has(k) || prefixes.some((p) => k.startsWith(`${p}_`) || k === p),
      ),
    );
    // Empty intersection (e.g. URL referenced GPUs no longer in availability,
    // or every referenced key disappeared) falls back to all available configs.
    if (restored.size === 0) restored = selectableHwTypes;
    if (exclusion) {
      const proposed = restored;
      const resolved = resolveHwSelection(restored, new Set());
      restored = resolved.result;
      if (resolved.droppedGroups.length > 0) {
        setEngineConflict({
          kind: 'resolved',
          ...exclusionResolutionFamilies(proposed, resolved.result, exclusion),
        });
      }
    }
    setActiveHwTypes(restored);
    lastHwResetKeyRef.current = hwResetKey;
    setPendingActiveHwTypes(null);
  }, [
    pendingActiveHwTypes,
    selectableHwTypes,
    exclusion,
    selectedModel,
    effectiveSequence,
    precisionsKey,
    hwResetKey,
    resolveHwSelection,
    setActiveHwTypes,
  ]);

  useEffect(() => {
    if (pendingHwFilterRef.current) return;
    if (pendingActiveHwTypes) return;
    if (selectableHwTypes.size === 0) return;
    const scopeChanged = lastHwResetKeyRef.current !== hwResetKey;
    const presetFilter = presetHwFilterRef.current;
    // Metric changes must preserve manual legend subsets, but automatic
    // selections still need to follow the newly selected axes. In particular,
    // Best per SKU is metric-aware and would otherwise keep the previous
    // metric's winners while its toggle remained enabled.
    if (!scopeChanged && !bestPerSku && !presetFilter) return;
    lastHwResetKeyRef.current = hwResetKey;
    if (presetFilter) {
      const filtered = new Set(
        [...selectableHwTypes].filter((k) => matchesPresetHwFilter(k, presetFilter, selectedModel)),
      );
      if (filtered.size > 0) {
        // Presets explicitly choose configs. Resolve any engine conflict
        // silently so loading a preset never flashes an invalid comparison.
        setActiveHwTypes(resolveHwSelection(filtered).result);
        return;
      }
    }
    if (exclusion) {
      // Automatic resets must never surface multiple incomparable engine groups.
      // Scenarios that restrict standard-token engines (8K/1K, AgentX) keep one
      // sticky group so their charts remain useful; variant-only rules retain
      // the existing clear-all behavior.
      const automaticSelection = bestPerSku ? bestHwTypes : selectableHwTypes;
      const { result, droppedGroups } = resolveHwSelection(automaticSelection);
      setActiveHwTypes(result);
      if (droppedGroups.length > 0) {
        setEngineConflict({
          kind: 'resolved',
          ...exclusionResolutionFamilies(automaticSelection, result, exclusion),
        });
      }
      return;
    }
    setActiveHwTypes(bestPerSku ? bestHwTypes : selectableHwTypes);
  }, [
    selectedModel,
    effectiveSequence,
    precisionsKey,
    hwResetKey,
    selectableHwTypes,
    bestHwTypes,
    bestPerSku,
    exclusion,
    pendingActiveHwTypes,
    resolveHwSelection,
  ]);

  // Remove selected GPUs only after successful availability has settled. An
  // empty successful scope is different from the transient empty loading state.
  useEffect(() => {
    if (!availabilitySettled || !sequenceResolved || selectedGPUs.length === 0) return;
    const validKeys = new Set(availableGPUs.map((gpu) => gpu.value));
    const valid = selectedGPUs.filter((gpu) => validKeys.has(gpu));
    if (valid.length !== selectedGPUs.length) setSelectedGpuState(valid);
  }, [availabilitySettled, sequenceResolved, availableGPUs, selectedGPUs]);

  useEffect(() => {
    if (!gpuUrlHydrated) return;
    if (selectedGPUs.length === 0) {
      setSelectedDateRange({ startDate: '', endDate: '' });
      setSelectedDates([]);
      setUserCosts(null);
    }
  }, [gpuUrlHydrated, selectedGPUs]);

  // Reset date range when selected dates are no longer available (e.g. precision change)
  useEffect(() => {
    if (!selectedDateRange.startDate || !selectedDateRange.endDate) return;
    if (selectedGPUs.length === 0) return;
    // Skip while availability is still loading — empty here means "not loaded yet",
    // not "no dates", so clearing would wipe URL-restored selections on mount.
    if (dateRangeAvailableDates.length === 0) return;
    const dateSet = new Set(dateRangeAvailableDates);
    if (!dateSet.has(selectedDateRange.startDate) || !dateSet.has(selectedDateRange.endDate)) {
      setSelectedDateRange({ startDate: '', endDate: '' });
      setSelectedDates([]);
    }
  }, [dateRangeAvailableDates]);

  useEffect(() => {
    setActiveDates(allDateIds);
  }, [allDateIds, setActiveDates]);

  useEffect(() => {
    if (selectedYAxisMetric !== 'y_costUser' && selectedYAxisMetric !== 'y_tokensPerDollarUser') {
      setUserCosts((prev) => (prev === null ? prev : null));
    }
    if (selectedYAxisMetric !== 'y_powerUser')
      setUserPowers((prev) => (prev === null ? prev : null));
  }, [selectedModel, effectiveSequence, effectivePrecisions, selectedYAxisMetric]);

  // ── Debounced GPU selection tracking ─────────────────────────────────────
  // Fire after 3s of no changes so we capture the "settled" selection.
  // Skip the first render (initial data load) to avoid noise.

  // Scatter chart — tracks activeHwTypes
  const scatterTrackMounted = useRef(false);
  useEffect(() => {
    if (!scatterTrackMounted.current) {
      scatterTrackMounted.current = true;
      return;
    }
    if (activeHwTypes.size === 0) return;
    const timer = setTimeout(() => {
      const gpus = [...activeHwTypes].toSorted();
      track('inference_gpu_selection_settled', {
        gpus,
        gpu_count: gpus.length,
        model: selectedModel,
        sequence: effectiveSequence,
        preset_id: activePresetId,
        yAxisMetric: selectedYAxisMetric,
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [activeHwTypes]);

  // Interactivity / E2E chart — tracks activeDates (date+gpu pairs)
  const e2eTrackMounted = useRef(false);
  useEffect(() => {
    if (!e2eTrackMounted.current) {
      e2eTrackMounted.current = true;
      return;
    }
    if (activeDates.size === 0) return;
    const timer = setTimeout(() => {
      const pairs = [...activeDates].toSorted();
      track('interactivity_selection_settled', {
        date_gpu_pairs: pairs,
        pair_count: pairs.length,
        gpus: [...new Set(pairs.map((p) => p.split('_').slice(1).join('_')))].toSorted(),
        model: selectedModel,
        sequence: effectiveSequence,
        yAxisMetric: selectedYAxisMetric,
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [activeDates]);

  // Fire once on mount to capture the initial y-axis metric (default or URL-restored)
  useEffect(() => {
    track('inference_chart_view', {
      yAxisMetric: selectedYAxisMetric,
      source: getUrlParam('i_metric') ? 'url' : 'default',
    });
  }, []);

  // ── URL sync ──────────────────────────────────────────────────────────────

  // Serialize the legend-active set, omitting (empty string → URL default) when
  // it equals the full selectable set. Comparing against the selectable set
  // rather than the metric-filtered one keeps a Measured Energy axis from
  // baking that axis's coverage into the share URL. Keeps share URLs short.
  const iActiveStr = useMemo(() => {
    if (activeHwTypes.size === 0) return '';
    if (bestPerSku && activeHwTypes.size === bestHwTypes.size) {
      let same = true;
      for (const k of activeHwTypes) {
        if (!bestHwTypes.has(k)) {
          same = false;
          break;
        }
      }
      if (same) return '';
    }
    if (activeHwTypes.size === selectableHwTypes.size) {
      let same = true;
      for (const k of activeHwTypes) {
        if (!selectableHwTypes.has(k)) {
          same = false;
          break;
        }
      }
      if (same) return '';
    }
    return [...activeHwTypes].toSorted().join(',');
  }, [activeHwTypes, selectableHwTypes, bestHwTypes, bestPerSku]);

  const serializedLabelState = serializeLabelState(labelScenarioKind, {
    showPointLabels,
    useAdvancedLabels,
    showLineLabels,
  });

  useUrlStateSync(
    {
      i_metric: selectedYAxisMetric,
      i_pctl: selectedPercentile,
      i_gpus: selectedGPUs.join(','),
      i_dates: selectedDates.join(','),
      i_dstart: selectedDateRange.startDate,
      i_dend: selectedDateRange.endDate,
      i_optimal: hideNonOptimal ? '' : '0',
      i_best: bestPerSku ? '' : '0',
      i_label: serializedLabelState.i_label,
      i_hc: highContrast ? '1' : '',
      i_log: logScale ? '1' : '',
      i_xmetric: selectedXAxisMetric || '',
      i_e2e_xmetric: selectedE2eXAxisMetric || '',
      i_xmode: selectedXAxisMode,
      i_scale: scaleType,
      i_legend: isLegendExpanded ? '' : '0',
      i_advlabel: serializedLabelState.i_advlabel,
      i_conclabel: showConcurrencyLabels ? '1' : '',
      i_gradlabel: showGradientLabels ? '1' : '',
      i_linelabel: serializedLabelState.i_linelabel,
      i_active: iActiveStr,
      i_vendor: quickFilterVendors.join(','),
      i_fw: quickFilterFrameworks.join(','),
      i_disagg: quickFilterDeployment.join(','),
      i_spec: quickFilterSpec.join(','),
    },
    [
      selectedYAxisMetric,
      selectedXAxisMetric,
      selectedE2eXAxisMetric,
      selectedXAxisMode,
      scaleType,
      selectedGPUs,
      selectedDates,
      selectedDateRange,
      hideNonOptimal,
      bestPerSku,
      showPointLabels,
      highContrast,
      logScale,
      isLegendExpanded,
      useAdvancedLabels,
      showConcurrencyLabels,
      showGradientLabels,
      showLineLabels,
      iActiveStr,
      quickFilterVendors,
      quickFilterFrameworks,
      quickFilterDeployment,
      quickFilterSpec,
    ],
  );

  // ── URL preset loading ───────────────────────────────────────────────────
  // Reads ?preset= from the URL on mount and applies it. This is the only
  // place preset URL params are consumed — the landing page links here.

  const urlPresetAppliedRef = useRef(false);
  const presetVersionRef = useRef(0);
  const [pendingTimelinePreset, setPendingTimelinePreset] = useState<
    FavoritePreset['config'] | null
  >(null);
  const pendingPresetVersionRef = useRef(0);

  // Once dateRangeAvailableDates resolves for a timeline preset, set the full range.
  useEffect(() => {
    if (!pendingTimelinePreset || dateRangeAvailableDates.length === 0) return;
    if (pendingPresetVersionRef.current !== presetVersionRef.current) {
      setPendingTimelinePreset(null);
      return;
    }
    const first = dateRangeAvailableDates[0];
    const last = dateRangeAvailableDates.at(-1)!;
    presetGuardRef.current = true;
    setSelectedDateRange({ startDate: first, endDate: last });
    setSelectedDates([]);
    presetGuardRef.current = false;
    setPendingTimelinePreset(null);
  }, [pendingTimelinePreset, dateRangeAvailableDates, setSelectedDateRange, setSelectedDates]);

  const applyPreset = useCallback(
    (preset: FavoritePreset) => {
      clearOverviewHistoryPair();
      const version = ++presetVersionRef.current;
      const { config } = preset;
      presetGuardRef.current = true;
      setSelectedModel(config.model);
      setSelectedSequence(config.sequence);
      setSelectedPrecisions(config.precisions);
      setSelectedYAxisMetric(config.yAxisMetric);
      setPendingHwFilter(config.hwFilter ?? null);
      presetHwFilterRef.current = config.hwFilter ?? null;
      setActivePresetId(preset.id);
      setHighContrast(true);
      if (config.gpus && config.gpus.length > 0) {
        setSelectedGpuState(config.gpus);
        if (config.useDateRange) {
          setSelectedDateRange({ startDate: '', endDate: '' });
          setSelectedDates([]);
          pendingPresetVersionRef.current = version;
          setPendingTimelinePreset(config);
        } else {
          setSelectedDateRange({ startDate: '', endDate: '' });
          setSelectedDates([]);
        }
      } else {
        setSelectedGpuState([]);
        setSelectedDateRange({ startDate: '', endDate: '' });
        setSelectedDates([]);
      }
      presetGuardRef.current = false;
      track('favorite_preset_applied', {
        preset_id: preset.id,
        preset_title: preset.title,
        category: preset.category,
      });
    },
    [
      setSelectedModel,
      setSelectedSequence,
      setSelectedPrecisions,
      setSelectedYAxisMetric,
      setSelectedGpuState,
      setSelectedDates,
      setSelectedDateRange,
      setActivePresetId,
      setHighContrast,
      clearOverviewHistoryPair,
    ],
  );

  useEffect(() => {
    if (urlPresetAppliedRef.current) return;
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const presetId = sp.get('preset');
    if (!presetId) return;
    const preset = FAVORITE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    urlPresetAppliedRef.current = true;
    sp.delete('preset');
    const search = sp.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}`,
    );
    applyPreset(preset);
  }, [applyPreset]);

  // ── Filtered runs ─────────────────────────────────────────────────────────
  // filteredAvailableRuns / effectiveSelectedRunId are computed above the data
  // fetch (so the chart can query "as of" the selected run).
  //
  // NOTE: We intentionally do not sync effectiveSelectedRunId back through the
  // global run action. filteredAvailableRuns depends on effectivePrecisions, so
  // doing so would replace the user's global run intent with an inference-only
  // fallback whenever the precision scope changes. The inference filter domain
  // exposes effectiveSelectedRunId directly instead.

  const handleDateRangeDialogOk = () => {
    clearOverviewHistoryPair();
    setSelectedDateRange({ startDate: '', endDate: '' });
    setSelectedDates([]);
    setShowDateRangeDialog(false);
  };

  // ── Domain context values ─────────────────────────────────────────────────

  const dataValue = useMemo<InferenceDataContextType>(
    () => ({
      hwTypesWithData,
      hardwareConfig,
      graphs,
      loading,
      error,
      availableQuickFilters,
      availableGPUs,
      availableDates,
      dateRangeAvailableDates,
      isCheckingAvailableDates,
      availableRuns: filteredAvailableRuns,
      availablePrecisions,
      availableSequences,
      availableModels,
    }),
    [
      hwTypesWithData,
      hardwareConfig,
      graphs,
      loading,
      error,
      availableQuickFilters,
      availableGPUs,
      availableDates,
      dateRangeAvailableDates,
      isCheckingAvailableDates,
      filteredAvailableRuns,
      availablePrecisions,
      availableSequences,
      availableModels,
    ],
  );

  const filtersValue = useMemo<InferenceFiltersContextType>(
    () => ({
      activeHwTypes,
      bestPerSku,
      selectedModel,
      selectedSequence: effectiveSequence,
      selectedPrecisions: effectivePrecisions,
      quickFilters,
      selectedGPUs,
      selectedDates,
      selectedDateRange,
      activeDates,
      userCosts,
      selectedRunDate,
      selectedRunId: effectiveSelectedRunId,
      userPowers,
      activePresetId,
      presetGuardRef,
      compareGpuPair: compareGpuPair ?? null,
    }),
    [
      activeHwTypes,
      bestPerSku,
      selectedModel,
      effectiveSequence,
      effectivePrecisions,
      quickFilters,
      selectedGPUs,
      selectedDates,
      selectedDateRange,
      activeDates,
      userCosts,
      selectedRunDate,
      effectiveSelectedRunId,
      userPowers,
      activePresetId,
      compareGpuPair,
    ],
  );

  const displayValue = useMemo<InferenceDisplayContextType>(
    () => ({
      selectedYAxisMetric,
      selectedPercentile,
      selectedXAxisMetric,
      selectedE2eXAxisMetric,
      selectedXAxisMode,
      scaleType,
      isLegendExpanded,
      hideNonOptimal,
      showPointLabels,
      highContrast,
      logScale,
      useAdvancedLabels,
      showConcurrencyLabels,
      showGradientLabels,
      showLineLabels,
    }),
    [
      selectedYAxisMetric,
      selectedPercentile,
      selectedXAxisMetric,
      selectedE2eXAxisMetric,
      selectedXAxisMode,
      scaleType,
      isLegendExpanded,
      hideNonOptimal,
      showPointLabels,
      highContrast,
      logScale,
      useAdvancedLabels,
      showConcurrencyLabels,
      showGradientLabels,
      showLineLabels,
    ],
  );

  const actionsValue: InferenceActionsContextType = {
    toggleActiveDate,
    removeActiveDate,
    selectAllActiveDates,
    toggleHwType,
    removeHwType,
    selectAllHwTypes,
    setBestPerSku: setBestPerSkuAndApply,
    resolveComparisonSelection: resolveHwSelection,
    toggleComparisonSelection,
    setSelectedModel: setSelectedModelAndClear,
    setSelectedSequence: setSelectedSequenceAndClear,
    setSelectedPrecisions: setSelectedPrecisionsAndClear,
    setSelectedYAxisMetric: setSelectedYAxisMetricAndClear,
    setSelectedPercentile,
    setSelectedXAxisMetric,
    setSelectedXAxisMode: handleSetXAxisMode,
    setScaleType,
    setQuickFilterVendors,
    setQuickFilterFrameworks,
    setQuickFilterDeployment,
    setQuickFilterSpec,
    setIsLegendExpanded,
    setHideNonOptimal,
    setShowPointLabels,
    setHighContrast,
    setLogScale,
    setUseAdvancedLabels,
    setShowConcurrencyLabels,
    setShowGradientLabels,
    setShowLineLabels,
    setSelectedGPUs: setSelectedGPUsAndClear,
    setSelectedDates: setSelectedDatesAndClear,
    setSelectedDatesFromRunExpansion: setSelectedDates,
    setSelectedDateRange: setSelectedDateRangeAndClear,
    setUserCosts,
    setSelectedRunDate,
    setSelectedRunId,
    setUserPowers,
    setHwFilter: setPendingHwFilter,
    setActivePresetId,
  };

  return (
    <>
      <InferenceContextsProvider
        data={dataValue}
        filters={filtersValue}
        display={displayValue}
        actions={actionsValue}
      >
        {children}
      </InferenceContextsProvider>
      <EngineComparisonConflictToast
        detail={isUnofficialRun ? null : engineConflict}
        onDismiss={dismissEngineConflict}
      />
      <Dialog open={showDateRangeDialog} onOpenChange={setShowDateRangeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Date Range Reset</DialogTitle>
            <DialogDescription>
              The chip configs are not available in the selected date range. The date range will be
              reset.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleDateRangeDialogOk}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function useRequiredInferenceContext<T>(context: T | undefined, hookName: string): T {
  if (context === undefined) {
    throw new Error(`${hookName} must be used within an InferenceProvider`);
  }
  return context;
}

export function useInferenceData() {
  return useRequiredInferenceContext(useContext(InferenceDataContext), 'useInferenceData');
}

export function useInferenceFilters() {
  return useRequiredInferenceContext(useContext(InferenceFiltersContext), 'useInferenceFilters');
}

export function useInferenceDisplay() {
  return useRequiredInferenceContext(useContext(InferenceDisplayContext), 'useInferenceDisplay');
}

export function useInferenceActions() {
  return useRequiredInferenceContext(useContext(InferenceActionsContext), 'useInferenceActions');
}
