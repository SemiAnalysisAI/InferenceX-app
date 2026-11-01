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
import type { BenchmarkRow } from '@/lib/api/api';
import { track, trackOncePerPageview } from '@/lib/analytics/analytics';
import {
  type SelectionAnalyticsContext,
  selectionAnalyticsContext,
} from '@/lib/analytics/selection-context';
import { EngineComparisonConfirmation } from '@/components/inference/ui/engine-comparison-confirmation';
import {
  needsEngineComparisonConsent,
  supportsEngineComparisonConsent,
  useEngineComparisonConsent,
} from './hooks/use-engine-comparison-consent';
import {
  FAVORITE_PRESETS,
  type FavoritePreset,
  matchesPresetHwFilter,
} from '@/components/favorites/favorite-presets';

import {
  latestRunId,
  useGlobalFilterActions,
  useGlobalFilterAvailability,
  useGlobalFilterRun,
  useGlobalFilterSelection,
  useGlobalFilterWorkflow,
} from '@/providers/GlobalFilterContext';
import { useUnofficialRun } from '@/providers/unofficial-run-provider';
import { useFeatureGate } from '@/lib/runtime/use-feature-gate';
import type {
  InferenceActionsContextType,
  InferenceData,
  InferenceDataContextType,
  InferenceDisplayContextType,
  InferenceFiltersContextType,
  PowerCompare,
  TokenRevenuePriceSource,
} from '@/components/inference/types';
import {
  resolveMetricConfigKey,
  tokenBasisForMetric,
} from '@/components/inference/metric-registry';
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
import { serializePerfRulers } from '@/lib/d3-chart/layers/perf-ruler';
import type { FixedSequenceStatistic } from '@/components/inference/utils/resolveXAxisField';
import { parsePowerCompare } from '@/components/inference/utils/power-compare';
import {
  PERSISTED_PERF_RULER_CHART_ID,
  PerfRulerStoreContext,
  persistedPerfRulerAxisKey,
  usePerfRulerStoreValue,
} from '@/components/inference/perf-ruler-store';
import { useParetoHighlightToggle } from './hooks/useParetoHighlightToggle';
import { useOpenRouterPricing } from '@/hooks/api/use-openrouter-pricing';
import { DEFAULT_Y_AXIS_METRIC } from '@/lib/routing/url-state';
import { computeToggle } from '@/hooks/useTogglableSet';
import { buildAvailabilityHwKey } from '@/lib/charts/chart-utils';
import {
  getHardwareConfig,
  getModelSortIndex,
  hardwareKeyMatchesBase,
  isKnownGpu,
} from '@/lib/catalog/constants';
import { frameworkFamily } from '@/lib/catalog/framework-family';
import {
  getOpenRouterModelId,
  isBestPerSkuDefaultOff,
  Model,
  MODEL_PREFIX_MAPPING,
  Sequence,
  sequenceKind,
} from '@/lib/catalog/data-mappings';
import { NORMALIZED_TOKEN_REVENUE_PRICING, usesTokenSalePricing } from './token-revenue';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  EngineComparisonConflictToast,
  type EngineComparisonConflictDetail,
} from '@/components/inference/ui/engine-comparison-conflict-toast';
import {
  effectiveLegendItems,
  exclusionResolutionFamilies,
  resolveExclusionGroups,
  resolveExclusionToggle,
  type ExclusionConflictPolicy,
} from '@/lib/benchmarks/exclusion';
import type { TokenBasis } from '@/lib/benchmarks/benchmark-transform';
import { filterRunsByModel, getDisplayLabel } from '@/lib/shared/utils';
import {
  isAgenticOnlyXAxisMode,
  useChartData,
  X_AXIS_MODES,
  type XAxisMode,
} from './hooks/useChartData';
import { buildActiveComparisonIds, resolveComparisonEntries } from './utils/comparisonEntry';
import {
  blockedComparisonToggles,
  comparisonDefaultGroup,
  comparisonExclusionPolicy,
  comparisonExclusion as resolveComparisonExclusion,
  isEngineGuardLifted,
} from './utils/comparison-exclusion';
import { resolveLabelState, serializeLabelState } from './utils/label-defaults';
import { defaultInferenceHardware, defaultInferenceXAxisMode } from './utils/model-defaults';
import { powerXViewFor } from './powerx/powerx-views';
import { usePowerXSurface } from './ui/powerx-surface';
import { bestSeriesPerSku, withUnrankedSkus } from './utils/best-series-per-sku';
import { resolveBenchmarkSeed } from './utils/benchmark-seed';
import {
  EMPTY_QUICK_FILTERS,
  parseDeploymentModes,
  parsePowerTiers,
  type DeploymentMode,
  type PowerTier,
  type QuickFilters,
  type SpecMode,
} from './utils/quickFilters';

const splitUrlList = (value: string | undefined): string[] =>
  value ? value.split(',').filter(Boolean) : [];

const InferenceDataContext = createContext<InferenceDataContextType | undefined>(undefined);
const InferenceFiltersContext = createContext<InferenceFiltersContextType | undefined>(undefined);
const InferenceDisplayContext = createContext<InferenceDisplayContextType | undefined>(undefined);
const InferenceActionsContext = createContext<InferenceActionsContextType | undefined>(undefined);

export const INFERENCE_CONTEXT_STRINGS = {
  en: {
    dateRangeResetTitle: 'Date Range Reset',
    dateRangeResetDescription:
      'The chip configs are not available in the selected date range. The date range will be reset.',
    ok: 'OK',
  },
  zh: {
    dateRangeResetTitle: '重置日期范围',
    dateRangeResetDescription: '所选日期范围内没有这些芯片配置，将重置日期范围。',
    ok: '确定',
  },
} as const;

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
  fixedSequenceStatistic: FixedSequenceStatistic = 'median',
): string | null {
  if (mode === 'ttft') {
    return sequenceKind(sequence) === 'agentic'
      ? `${percentile}_ttft`
      : `${fixedSequenceStatistic}_ttft`;
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
  initialBenchmarkSequence,
  initialYAxisMetric,
  autoSelectAllGpus = false,
  lockedFrameworks,
  minimalChrome = false,
  quietEngineResolution = false,
}: {
  children: ReactNode;
  activeTab: string;
  initialActiveHwTypes?: string[];
  compareGpuPair?: readonly [string, string];
  benchmarkQueryScope?: string;
  initialBenchmarkModel?: string;
  initialBenchmarkRows?: BenchmarkRow[];
  /** Sequence the seed rows cover; omit when they cover every sequence. */
  initialBenchmarkSequence?: string;
  initialYAxisMetric?: string;
  autoSelectAllGpus?: boolean;
  lockedFrameworks?: readonly string[];
  minimalChrome?: boolean;
  quietEngineResolution?: boolean;
}) {
  const locale = useLocale();
  const localeStrings = INFERENCE_CONTEXT_STRINGS[locale];
  const isActive =
    activeTab === 'inference' || activeTab === 'historical' || activeTab === 'compare';

  const { selectedModel, effectiveSequence, sequenceResolved, effectivePrecisions, tcoBasis } =
    useGlobalFilterSelection();
  const {
    setSelectedModel,
    setSelectedSequence,
    setSelectedPrecisions,
    setSelectedRunDate,
    setSelectedRunId,
  } = useGlobalFilterActions();
  const { selectedRunDate, selectedRunDateRev, selectedRunId, effectiveRunDate } =
    useGlobalFilterRun();
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
  const featureGateUnlocked = useFeatureGate();
  const engineGuardLifted = isEngineGuardLifted(isUnofficialRun, featureGateUnlocked);
  const engineConsent = useEngineComparisonConsent(
    `${selectedModel}|${effectiveSequence}|${effectivePrecisions.join(',')}`,
  );
  const consentSupported = supportsEngineComparisonConsent(effectiveSequence);
  const comparisonGuardLifted = engineGuardLifted || (consentSupported && engineConsent.accepted);

  const { getUrlParam, setUrlParams } = useUrlState();
  const [hasExplicitRunSelection, setHasExplicitRunSelection] = useState(() =>
    Boolean(getUrlParam('g_rundate') || getUrlParam('g_runid')),
  );
  const selectRunManually = useCallback(
    (runId: string) => {
      setHasExplicitRunSelection(true);
      setSelectedRunId(runId);
    },
    [setSelectedRunId],
  );

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
        comparisonGuardLifted,
        overviewHistoryPair !== undefined,
      ),
    [selectedModel, effectiveSequence, comparisonGuardLifted, overviewHistoryPair],
  );
  const requestEngineComparison = useCallback(
    (keys: Iterable<string>, apply: () => void): boolean => {
      if (!consentSupported || !needsEngineComparisonConsent(keys, exclusion)) return false;
      engineConsent.request(apply);
      track('inference_engine_comparison_confirmation_opened');
      return true;
    },
    [consentSupported, exclusion, engineConsent.request],
  );
  const defaultExclusionGroup = useMemo(
    () => comparisonDefaultGroup(effectiveSequence, engineGuardLifted),
    [effectiveSequence, engineGuardLifted],
  );
  const exclusionPolicy: ExclusionConflictPolicy = comparisonExclusionPolicy(effectiveSequence);

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

  const [engineConflict, setEngineConflict] = useState<EngineComparisonConflictDetail | null>(null);
  const dismissEngineConflict = useCallback(() => setEngineConflict(null), []);
  useEffect(() => {
    if (comparisonGuardLifted) setEngineConflict(null);
  }, [comparisonGuardLifted]);

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
  const [tokenRevenuePriceSource, setTokenRevenuePriceSource] = useState<TokenRevenuePriceSource>(
    () => (getUrlParam('i_revenue') === 'openrouter' ? 'openrouter' : 'normalized'),
  );
  const openRouterModelId = getOpenRouterModelId(selectedModel);
  const openRouterPricingQuery = useOpenRouterPricing(
    openRouterModelId,
    usesTokenSalePricing(selectedYAxisMetric) && tokenRevenuePriceSource === 'openrouter',
  );
  const tokenRevenuePricing =
    tokenRevenuePriceSource === 'normalized'
      ? NORMALIZED_TOKEN_REVENUE_PRICING
      : (openRouterPricingQuery.data ?? null);
  const openRouterPricingError =
    tokenRevenuePriceSource === 'openrouter'
      ? openRouterModelId
        ? openRouterPricingQuery.error instanceof Error
          ? openRouterPricingQuery.error.message
          : null
        : 'No OpenRouter model mapping is configured.'
      : null;
  const [selectedXAxisMetric, setSelectedXAxisMetric] = useState<string | null>(
    () => getUrlParam('i_xmetric') || 'p90_ttft',
  );
  const [requestedE2eXAxisMetric] = useState<string | null>(
    () => getUrlParam('i_e2e_xmetric') || 'p90_ttft',
  );
  const [requestedXAxisMode, setRequestedXAxisMode] = useState<XAxisMode | null>(null);
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
  const defaultXAxisMode =
    activeTab === 'inference' ? defaultInferenceXAxisMode(selectedModel) : 'interactivity';
  const selectedXAxisMode = resolveEffectiveXAxisMode(
    requestedXAxisMode ?? defaultXAxisMode,
    effectiveSequence,
    sequenceResolved,
  );
  const handleSetXAxisMode = useCallback((mode: XAxisMode) => {
    xAxisModeFromUrlRef.current = true;
    setRequestedXAxisMode(mode);
  }, []);
  const [fixedSequenceStatistic, setFixedSequenceStatistic] =
    useState<FixedSequenceStatistic>('median');
  useEffect(() => {
    setFixedSequenceStatistic(getUrlParam('i_mstat') === 'mean' ? 'mean' : 'median');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [requestedTokenBasis, setTokenBasis] = useState<TokenBasis>('total');
  useEffect(() => {
    setTokenBasis(getUrlParam('i_tokens') === 'uncached' ? 'uncached' : 'total');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The Horace He Metric is hidden behind the feature gate; locked viewers always see the total basis.
  const tokenBasis: TokenBasis = featureGateUnlocked ? requestedTokenBasis : 'total';

  const selectedPercentile = 'p90';
  const selectedE2eXAxisMetric = resolveE2eXAxisMetric(
    requestedE2eXAxisMetric,
    selectedXAxisMode,
    effectiveSequence,
    selectedPercentile,
    fixedSequenceStatistic,
  );
  const [scaleType, setScaleType] = useState<'auto' | 'linear' | 'log'>(
    () => (getUrlParam('i_scale') as 'auto' | 'linear' | 'log') || 'auto',
  );
  const [powerCompare, setPowerCompare] = useState<PowerCompare>(() =>
    parsePowerCompare(getUrlParam('i_pcompare')),
  );

  const [quickFilterVendors, setQuickFilterVendors] = useState<string[]>([]);
  const [quickFilterFrameworksState, setQuickFilterFrameworksState] = useState<string[]>([]);
  const frameworkLock = useMemo<string[] | null>(
    () => (lockedFrameworks && lockedFrameworks.length > 0 ? [...lockedFrameworks] : null),
    [lockedFrameworks],
  );
  const quickFilterFrameworks = frameworkLock ?? quickFilterFrameworksState;
  const setQuickFilterFrameworks = useCallback(
    (next: SetStateAction<string[]>) => {
      if (frameworkLock) return;
      setQuickFilterFrameworksState(next);
    },
    [frameworkLock],
  );
  const [quickFilterDeployment, setQuickFilterDeployment] = useState<DeploymentMode[]>([]);
  const [quickFilterSpec, setQuickFilterSpec] = useState<SpecMode[]>([]);
  const [quickFilterPower, setQuickFilterPower] = useState<PowerTier[]>([]);
  const [quickFilterTopologies, setQuickFilterTopologies] = useState<string[]>([]);
  useEffect(() => {
    const parse = (key: 'i_vendor' | 'i_fw' | 'i_disagg' | 'i_spec' | 'i_power' | 'i_topology') =>
      splitUrlList(getUrlParam(key));
    const vendors = parse('i_vendor');
    const frameworks = parse('i_fw');
    const deployment = parseDeploymentModes(parse('i_disagg'));
    const spec = parse('i_spec') as SpecMode[];
    const power = parsePowerTiers(parse('i_power'));
    const topologies = parse('i_topology');
    if (vendors.length > 0) setQuickFilterVendors(vendors);
    if (frameworks.length > 0) setQuickFilterFrameworks(frameworks);
    if (deployment.length > 0) setQuickFilterDeployment(deployment);
    if (spec.length > 0) setQuickFilterSpec(spec);
    if (power.length > 0) setQuickFilterPower(power);
    if (topologies.length > 0) setQuickFilterTopologies(topologies);
  }, [getUrlParam, setQuickFilterFrameworks]);
  const quickFilters = useMemo<QuickFilters>(
    () => ({
      vendors: quickFilterVendors,
      frameworks: quickFilterFrameworks,
      deployment: quickFilterDeployment,
      spec: quickFilterSpec,
      power: quickFilterPower,
      topologies: quickFilterTopologies,
    }),
    [
      quickFilterVendors,
      quickFilterFrameworks,
      quickFilterDeployment,
      quickFilterSpec,
      quickFilterPower,
      quickFilterTopologies,
    ],
  );
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
  const [bestPerSkuChoice, setBestPerSku] = useState<boolean | null>(() => {
    if (activeTab !== 'inference') return false;
    const raw = getUrlParam('i_best');
    return raw === '0' ? false : raw === '1' ? true : null;
  });
  const bestPerSkuDefault = !isBestPerSkuDefaultOff(selectedModel, effectiveSequence);
  const bestPerSku = bestPerSkuChoice ?? bestPerSkuDefault;
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
  const [showOffloadingLabel, setShowOffloadingLabel] = useState(
    () => getUrlParam('i_offloadlabel') !== '0',
  );
  const [showFrameworkLabel, setShowFrameworkLabel] = useState(
    () => getUrlParam('i_frameworklabel') !== '0',
  );
  const {
    visible: showParetoFrontier,
    playful: paretoFrontierPlayful,
    setVisible: setShowParetoFrontier,
  } = useParetoHighlightToggle(getUrlParam('i_frontier'));
  const [userCosts, setUserCosts] = useState<Record<string, number | undefined> | null>(null);
  const [userPowers, setUserPowers] = useState<Record<string, number | undefined> | null>(null);

  const [pendingHwFilter, setPendingHwFilter] = useState<string[] | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const presetHwFilterRef = useRef<string[] | null>(null);

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
  const [hardwareDefaultsOverridden, setHardwareDefaultsOverridden] = useState(() =>
    Boolean(getUrlParam('i_active') || initialActiveHwTypes?.length || autoSelectAllGpus),
  );

  const latestDate = availableDates.length > 0 ? availableDates.at(-1) : undefined;

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

  const latestRunIdForModel = useMemo(
    () => latestRunId(filteredAvailableRuns),
    [filteredAvailableRuns],
  );

  const effectiveSelectedRunId = useMemo(() => {
    const filteredRunIds = Object.keys(filteredAvailableRuns);
    if (filteredRunIds.length === 0 || filteredRunIds.includes(selectedRunId)) return selectedRunId;
    return latestRunIdForModel;
  }, [filteredAvailableRuns, selectedRunId, latestRunIdForModel]);

  const asOfRunId =
    effectiveSelectedRunId && latestRunIdForModel && effectiveSelectedRunId !== latestRunIdForModel
      ? effectiveSelectedRunId
      : undefined;

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
  const { rows: seedRows, scope: chartQueryScope } = resolveBenchmarkSeed({
    scope: benchmarkQueryScope,
    seedRows: initialBenchmarkRows,
    seedModel: initialBenchmarkModel,
    seedSequence: initialBenchmarkSequence,
    selectedModel,
    selectedSequence: effectiveSequence,
  });

  const {
    graphs,
    selectionPoints,
    loading: chartDataLoading,
    refreshing: chartDataRefreshing,
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
    tokenRevenuePricing,
    tokenRevenuePriceSource,
    effectiveRunDate,
    isActive && sequenceResolved,
    latestDate,
    selectedPercentile,
    compareGpuPair ?? null,
    benchmarkRunId,
    selectedXAxisMode,
    asOfRunId,
    dataQuickFilters,
    overviewHistoryPair,
    chartQueryScope,
    seedRows,
    tcoBasis,
    activeTab === 'inference' &&
      !autoSelectAllGpus &&
      !isUnofficialRun &&
      !hasExplicitRunSelection &&
      selectedRunDateRev === 0,
    powerCompare,
    fixedSequenceStatistic,
    tokenBasisForMetric(selectedYAxisMetric, tokenBasis),
    isActive && !sequenceResolved && !effectiveRunDate && !seedRows,
  );

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

  const availableGPUs = useMemo(() => {
    if (!availabilityRows) return [];
    const hwKeys = new Set<string>();
    for (const r of availabilityRows) {
      if (!dbModelKeys.includes(r.model)) continue;
      if (rowToSequence(r) !== effectiveSequence) continue;
      if (!effectivePrecisions.includes(r.precision)) continue;
      if (!r.hardware) continue;
      if (frameworkLock) {
        const family = frameworkFamily(r.framework);
        if (!family || !frameworkLock.includes(family)) continue;
      }
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
  }, [
    availabilityRows,
    dbModelKeys,
    effectiveSequence,
    effectivePrecisions,
    selectedModel,
    frameworkLock,
  ]);

  const autoSelectedGpusRef = useRef(false);
  useEffect(() => {
    if (!autoSelectAllGpus || autoSelectedGpusRef.current) return;
    if (!gpuUrlHydrated || !availabilitySettled || !sequenceResolved) return;
    if (getUrlParam('i_gpus') || selectedGpuState.length > 0) {
      autoSelectedGpusRef.current = true;
      return;
    }
    if (availableGPUs.length === 0) return;
    autoSelectedGpusRef.current = true;
    const all = new Set(availableGPUs.map((gpu) => gpu.value));
    const selection = exclusion
      ? [
          ...resolveExclusionGroups(
            all,
            new Set(),
            exclusion,
            exclusionPolicy,
            defaultExclusionGroup,
          ).result,
        ]
      : [...all];
    setSelectedGpuState(selection);
  }, [
    autoSelectAllGpus,
    gpuUrlHydrated,
    availabilitySettled,
    sequenceResolved,
    exclusion,
    exclusionPolicy,
    defaultExclusionGroup,
    availableGPUs,
    selectedGpuState,
    getUrlParam,
  ]);

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
      if (v !== selectedModel) {
        if (activeTab === 'inference' && v === Model.Qwen3_5) {
          setRequestedXAxisMode(null);
        }
        setBestPerSku(activeTab === 'inference' ? null : false);
        setPendingActiveHwTypes(null);
        setHardwareDefaultsOverridden(Boolean(initialActiveHwTypes?.length || autoSelectAllGpus));
      }
      setSelectedModel(v);
      clearScopedSelectionOnChange();
    },
    [
      selectedModel,
      activeTab,
      setSelectedModel,
      clearScopedSelectionOnChange,
      initialActiveHwTypes,
      autoSelectAllGpus,
    ],
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
      if (activeTab === 'inference' && selectedModel === Model.Qwen3_5) {
        setRequestedXAxisMode(null);
      }
      setSelectedPrecisions(v);
      clearScopedSelectionOnChange();
    },
    [activeTab, selectedModel, setSelectedPrecisions, clearScopedSelectionOnChange],
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
      if (
        requestEngineComparison(next, () => {
          setSelectedGpuState(next);
          clearScopedSelectionOnChange();
        })
      )
        return;
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
      requestEngineComparison,
    ],
  );
  const setSelectedDatesAndClear = useCallback(
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

  const openRouterPricingLoading =
    usesTokenSalePricing(selectedYAxisMetric) &&
    tokenRevenuePriceSource === 'openrouter' &&
    openRouterPricingQuery.isLoading;
  const loading = availabilityError ? false : chartDataLoading || openRouterPricingLoading;
  const refreshing = !availabilityError && chartDataRefreshing;
  const error = availabilityError || workflowError || chartDataError;

  const perfRulerStore = usePerfRulerStoreValue(
    PERSISTED_PERF_RULER_CHART_ID,
    getUrlParam('i_rulers'),
    persistedPerfRulerAxisKey(graphs, selectedXAxisMode, selectedYAxisMetric),
  );
  const iRulersStr = useMemo(
    () => serializePerfRulers(perfRulerStore.state),
    [perfRulerStore.state],
  );

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

  const pendingHwFilterRef = useRef(pendingHwFilter);
  pendingHwFilterRef.current = pendingHwFilter;
  const selectedModelRef = useRef(selectedModel);
  selectedModelRef.current = selectedModel;
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

  const selectableHwTypes = useChartDataFilter(
    hwSelectablePoints,
    setActiveHwTypesWithFilter,
    extractHwKey,
  );
  const hwTypesWithData = useMemo(
    () => new Set(hwFilteredPoints.map(extractHwKey)),
    [hwFilteredPoints, extractHwKey],
  );
  const blockedHwToggles = useMemo(
    () =>
      blockedComparisonToggles(
        activeHwTypes,
        selectableHwTypes,
        comparisonExclusion,
        consentSupported,
      ),
    [activeHwTypes, selectableHwTypes, comparisonExclusion, consentSupported],
  );

  const bestHwTypes = useMemo(() => {
    const wantedType = selectedXAxisMode === 'interactivity' ? 'interactivity' : 'e2e';
    const graph = graphs.find((candidate) => candidate.chartDefinition.chartType === wantedType);
    if (!graph) return hwTypesWithData;
    const tableCandidates = graph.tableData?.filter((point) =>
      effectivePrecisions.includes(point.precision),
    );
    const unrankedHwTypes = tableCandidates
      ? new Set(tableCandidates.map(extractHwKey))
      : hwTypesWithData;
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
      return unrankedHwTypes;
    }
    const best = bestSeriesPerSku(graph.data, direction, effectivePrecisions);
    if (best.size === 0) return unrankedHwTypes;
    return tableCandidates ? withUnrankedSkus(best, graph.data, tableCandidates) : best;
  }, [
    graphs,
    hwTypesWithData,
    selectedXAxisMode,
    selectedYAxisMetric,
    effectivePrecisions,
    extractHwKey,
  ]);

  const setBestPerSkuAndApply = useCallback(
    (enabled: boolean, options?: { applySelection?: boolean }) => {
      if (
        !enabled &&
        options?.applySelection !== false &&
        requestEngineComparison(selectableHwTypes, () => {
          setHardwareDefaultsOverridden(true);
          setBestPerSku(false);
          setActiveHwTypes(selectableHwTypes);
          setActivePresetId(null);
          presetHwFilterRef.current = null;
        })
      )
        return;
      setHardwareDefaultsOverridden(true);
      setBestPerSku(enabled);
      if (options?.applySelection === false) return;
      const target = enabled ? bestHwTypes : selectableHwTypes;
      setActiveHwTypes(resolveHwSelection(target).result);
      setActivePresetId(null);
      presetHwFilterRef.current = null;
    },
    [bestHwTypes, selectableHwTypes, resolveHwSelection, setActiveHwTypes, requestEngineComparison],
  );

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
      const proposed = computeToggle(activeHwTypes, hw, selectableHwTypes);
      if (
        !activeHwTypes.has(hw) &&
        requestEngineComparison(proposed, () => {
          setHardwareDefaultsOverridden(true);
          setActiveHwTypes(proposed);
          setBestPerSku(false);
          setActivePresetId(null);
          presetHwFilterRef.current = null;
        })
      )
        return;
      const next = toggleComparisonSelection(activeHwTypes, hw, selectableHwTypes);
      if (!next) return;
      setHardwareDefaultsOverridden(true);
      setActiveHwTypes(next);
      setBestPerSku(false);
      setActivePresetId(null);
      presetHwFilterRef.current = null;
    },
    [
      activeHwTypes,
      selectableHwTypes,
      setActiveHwTypes,
      toggleComparisonSelection,
      requestEngineComparison,
    ],
  );

  const removeHwType = useCallback(
    (hw: string) => {
      setHardwareDefaultsOverridden(true);
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
    if (
      requestEngineComparison(selectableHwTypes, () => {
        setHardwareDefaultsOverridden(true);
        setBestPerSku(false);
        setActiveHwTypes(selectableHwTypes);
      })
    )
      return;
    setHardwareDefaultsOverridden(true);
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
    requestEngineComparison,
  ]);
  const selectAllActiveDates = useCallback(
    () => selectAllDatesRaw(allDateIds),
    [selectAllDatesRaw, allDateIds],
  );

  const precisionsKey = effectivePrecisions.join(',');
  const hwResetKey = `${selectedModel}|${effectiveSequence}|${precisionsKey}|${
    engineGuardLifted ? 'preview' : 'official'
  }`;
  const lastHwResetKeyRef = useRef('');
  const lastHwResetModelRef = useRef(selectedModel);
  // PowerX Energy per token opens without H200: its joules per token flatten every other chip.
  const powerXSurface = usePowerXSurface();
  const hideH200 = powerXSurface && powerXViewFor(selectedYAxisMetric, powerCompare) === 'energy';
  const lastHideH200Ref = useRef(hideH200);
  const automaticHardware = useCallback(
    (hardware: Set<string>) => {
      const defaults = defaultInferenceHardware(selectedModel, hardware);
      if (!hideH200) return defaults;
      const shown = new Set([...defaults].filter((key) => !hardwareKeyMatchesBase(key, 'h200')));
      return shown.size > 0 ? shown : defaults;
    },
    [selectedModel, hideH200],
  );

  useEffect(() => {
    if (!pendingActiveHwTypes) return;
    if (pendingHwFilterRef.current) return;
    if (selectableHwTypes.size === 0) return;
    const prefixes = [...pendingActiveHwTypes].filter((k) => !k.includes('_'));
    let restored = new Set(
      [...selectableHwTypes].filter(
        (k) =>
          pendingActiveHwTypes.has(k) || prefixes.some((p) => k.startsWith(`${p}_`) || k === p),
      ),
    );
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
    lastHwResetModelRef.current = selectedModel;
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
    const modelChanged = lastHwResetModelRef.current !== selectedModel;
    const presetFilter = presetHwFilterRef.current;
    // Re-apply the default when the H200 rule flips, unless the reader picked hardware.
    const hideH200Changed = !hardwareDefaultsOverridden && lastHideH200Ref.current !== hideH200;
    if (!scopeChanged && !bestPerSku && !presetFilter && !hideH200Changed) return;
    lastHideH200Ref.current = hideH200;
    lastHwResetKeyRef.current = hwResetKey;
    lastHwResetModelRef.current = selectedModel;
    const previousSelection = modelChanged ? new Set<string>() : undefined;
    if (modelChanged) preferredHwTypesRef.current = new Set();
    if (presetFilter) {
      const filtered = new Set(
        [...selectableHwTypes].filter((k) => matchesPresetHwFilter(k, presetFilter, selectedModel)),
      );
      if (filtered.size > 0) {
        setActiveHwTypes(resolveHwSelection(filtered, previousSelection).result);
        return;
      }
    }
    const candidates = bestPerSku ? bestHwTypes : selectableHwTypes;
    const automaticSelection =
      activeTab === 'inference' && !hardwareDefaultsOverridden
        ? automaticHardware(candidates)
        : candidates;
    if (exclusion) {
      const { result, droppedGroups } = resolveHwSelection(automaticSelection, previousSelection);
      setActiveHwTypes(result);
      if (droppedGroups.length > 0) {
        setEngineConflict({
          kind: 'resolved',
          ...exclusionResolutionFamilies(automaticSelection, result, exclusion),
        });
      }
      return;
    }
    setActiveHwTypes(automaticSelection);
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
    activeTab,
    hardwareDefaultsOverridden,
    automaticHardware,
  ]);

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

  useEffect(() => {
    if (!selectedDateRange.startDate || !selectedDateRange.endDate) return;
    if (selectedGPUs.length === 0) return;
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
        metric: selectedYAxisMetric,
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [activeHwTypes]);

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
        metric: selectedYAxisMetric,
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [activeDates]);

  useEffect(() => {
    trackOncePerPageview('inference_chart_view', {
      metric: selectedYAxisMetric,
      source: getUrlParam('i_metric') ? 'url' : 'default',
    });
  }, []);

  const iActiveStr = useMemo(() => {
    if (activeHwTypes.size === 0) return '';
    const defaultSelection = (items: Set<string>) =>
      activeTab === 'inference' && !initialActiveHwTypes?.length && !autoSelectAllGpus
        ? automaticHardware(items)
        : items;
    const defaultBest = defaultSelection(bestHwTypes);
    const defaultAll = defaultSelection(selectableHwTypes);
    if (bestPerSku && activeHwTypes.size === defaultBest.size) {
      let same = true;
      for (const k of activeHwTypes) {
        if (!defaultBest.has(k)) {
          same = false;
          break;
        }
      }
      if (same) return '';
    }
    if (activeHwTypes.size === defaultAll.size) {
      let same = true;
      for (const k of activeHwTypes) {
        if (!defaultAll.has(k)) {
          same = false;
          break;
        }
      }
      if (same) return '';
    }
    return [...activeHwTypes].toSorted().join(',');
  }, [
    activeHwTypes,
    selectableHwTypes,
    bestHwTypes,
    bestPerSku,
    activeTab,
    automaticHardware,
    initialActiveHwTypes,
    autoSelectAllGpus,
  ]);

  // Label defaults depend on the scenario kind, so until the sequence resolves the URL's label
  // overrides pass through unchanged. Serializing against the provisional kind would drop an
  // override that matches its defaults (e.g. `i_label=0` while the kind still reads fixed-seq)
  // before the effect above applies it to the resolved agentic scenario.
  const serializedLabelState = sequenceResolved
    ? serializeLabelState(labelScenarioKind, {
        showPointLabels,
        useAdvancedLabels,
        showLineLabels,
      })
    : {
        i_label: getUrlParam('i_label') ?? '',
        i_advlabel: getUrlParam('i_advlabel') ?? '',
        i_linelabel: getUrlParam('i_linelabel') ?? '',
      };

  useUrlStateSync(
    {
      i_metric:
        selectedYAxisMetric === (initialYAxisMetric ?? DEFAULT_Y_AXIS_METRIC)
          ? ''
          : selectedYAxisMetric,
      i_revenue: usesTokenSalePricing(selectedYAxisMetric) ? tokenRevenuePriceSource : 'normalized',
      i_mstat: fixedSequenceStatistic,
      i_tokens: tokenBasis,
      i_gpus: selectedGPUs.join(','),
      i_dates: selectedDates.join(','),
      i_dstart: selectedDateRange.startDate,
      i_dend: selectedDateRange.endDate,
      i_optimal: hideNonOptimal ? '' : '0',
      i_best:
        bestPerSkuChoice === null || bestPerSkuChoice === bestPerSkuDefault
          ? ''
          : bestPerSkuChoice
            ? '1'
            : '0',
      i_label: serializedLabelState.i_label,
      i_hc: highContrast ? '1' : '',
      i_log: logScale ? '1' : '',
      i_xmetric: selectedXAxisMetric || '',
      i_e2e_xmetric: selectedE2eXAxisMetric || '',
      i_xmode: requestedXAxisMode === null ? '' : selectedXAxisMode,
      i_scale: scaleType,
      i_legend: isLegendExpanded ? '' : '0',
      i_advlabel: serializedLabelState.i_advlabel,
      i_conclabel: showConcurrencyLabels ? '1' : '',
      i_offloadlabel: showOffloadingLabel ? '1' : '0',
      i_frameworklabel: showFrameworkLabel ? '1' : '0',
      i_gradlabel: showGradientLabels ? '1' : '',
      i_frontier: showParetoFrontier ? (paretoFrontierPlayful ? '2' : '1') : '',
      i_linelabel: serializedLabelState.i_linelabel,
      i_active: iActiveStr,
      i_vendor: quickFilterVendors.join(','),
      i_fw: quickFilterFrameworks.join(','),
      i_disagg: quickFilterDeployment.join(','),
      i_spec: quickFilterSpec.join(','),
      i_power: quickFilterPower.join(','),
      i_topology: quickFilterTopologies.join(','),
      i_rulers: iRulersStr,
      i_pcompare: powerCompare === 'none' ? '' : powerCompare,
    },
    [
      selectedYAxisMetric,
      initialYAxisMetric,
      tokenRevenuePriceSource,
      selectedXAxisMetric,
      selectedE2eXAxisMetric,
      selectedXAxisMode,
      requestedXAxisMode,
      fixedSequenceStatistic,
      tokenBasis,
      scaleType,
      selectedGPUs,
      selectedDates,
      selectedDateRange,
      hideNonOptimal,
      bestPerSkuChoice,
      bestPerSkuDefault,
      showPointLabels,
      highContrast,
      logScale,
      isLegendExpanded,
      useAdvancedLabels,
      showConcurrencyLabels,
      showOffloadingLabel,
      showFrameworkLabel,
      showGradientLabels,
      showParetoFrontier,
      paretoFrontierPlayful,
      showLineLabels,
      iActiveStr,
      quickFilterVendors,
      quickFilterFrameworks,
      quickFilterDeployment,
      quickFilterSpec,
      quickFilterPower,
      quickFilterTopologies,
      iRulersStr,
      powerCompare,
    ],
  );

  const urlPresetAppliedRef = useRef(false);
  const presetVersionRef = useRef(0);
  const [pendingTimelinePreset, setPendingTimelinePreset] = useState<
    FavoritePreset['config'] | null
  >(null);
  const pendingPresetVersionRef = useRef(0);

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
      setSelectedModel(config.model, { userSelection: false });
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

  const handleDateRangeDialogOk = () => {
    clearOverviewHistoryPair();
    setSelectedDateRange({ startDate: '', endDate: '' });
    setSelectedDates([]);
    setShowDateRangeDialog(false);
  };

  const dataValue = useMemo<InferenceDataContextType>(
    () => ({
      hwTypesWithData,
      hardwareConfig,
      graphs,
      selectionPoints,
      loading,
      refreshing,
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
      selectionPoints,
      loading,
      refreshing,
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
      blockedHwToggles,
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
      lockedFrameworks: frameworkLock,
      minimalChrome,
    }),
    [
      activeHwTypes,
      bestPerSku,
      blockedHwToggles,
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
      frameworkLock,
      minimalChrome,
    ],
  );

  const displayValue = useMemo<InferenceDisplayContextType>(
    () => ({
      selectedYAxisMetric,
      tokenRevenuePriceSource,
      tokenRevenuePricing,
      openRouterModelId,
      openRouterPricingLoading,
      openRouterPricingError,
      selectedPercentile,
      selectedXAxisMetric,
      selectedE2eXAxisMetric,
      selectedXAxisMode,
      fixedSequenceStatistic,
      tokenBasis,
      defaultXAxisMode,
      scaleType,
      powerCompare,
      isLegendExpanded,
      hideNonOptimal,
      showPointLabels,
      highContrast,
      logScale,
      useAdvancedLabels,
      showConcurrencyLabels,
      showOffloadingLabel,
      showFrameworkLabel,
      showGradientLabels,
      showParetoFrontier,
      paretoFrontierPlayful,
      showLineLabels,
    }),
    [
      selectedYAxisMetric,
      tokenRevenuePriceSource,
      tokenRevenuePricing,
      openRouterModelId,
      openRouterPricingLoading,
      openRouterPricingError,
      selectedPercentile,
      selectedXAxisMetric,
      selectedE2eXAxisMetric,
      selectedXAxisMode,
      fixedSequenceStatistic,
      tokenBasis,
      defaultXAxisMode,
      scaleType,
      powerCompare,
      isLegendExpanded,
      hideNonOptimal,
      showPointLabels,
      highContrast,
      logScale,
      useAdvancedLabels,
      showConcurrencyLabels,
      showOffloadingLabel,
      showFrameworkLabel,
      showGradientLabels,
      showParetoFrontier,
      paretoFrontierPlayful,
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
    setTokenRevenuePriceSource,
    setFixedSequenceStatistic,
    setTokenBasis,
    setSelectedXAxisMetric,
    setSelectedXAxisMode: handleSetXAxisMode,
    setScaleType,
    setPowerCompare,
    setQuickFilterVendors,
    setQuickFilterFrameworks,
    setQuickFilterDeployment,
    setQuickFilterSpec,
    setQuickFilterPower,
    setQuickFilterTopologies,
    setIsLegendExpanded,
    setHideNonOptimal,
    setShowPointLabels,
    setHighContrast,
    setLogScale,
    setUseAdvancedLabels,
    setShowConcurrencyLabels,
    setShowGradientLabels,
    setShowParetoFrontier,
    setShowLineLabels,
    setShowOffloadingLabel,
    setShowFrameworkLabel,
    setSelectedGPUs: setSelectedGPUsAndClear,
    setSelectedDates: setSelectedDatesAndClear,
    setSelectedDatesFromRunExpansion: setSelectedDates,
    setSelectedDateRange: setSelectedDateRangeAndClear,
    setUserCosts,
    setSelectedRunDate,
    setSelectedRunId: selectRunManually,
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
        <PerfRulerStoreContext.Provider value={perfRulerStore}>
          {children}
        </PerfRulerStoreContext.Provider>
      </InferenceContextsProvider>
      <EngineComparisonConflictToast
        detail={
          comparisonGuardLifted || (quietEngineResolution && engineConflict?.kind === 'resolved')
            ? null
            : engineConflict
        }
        onDismiss={dismissEngineConflict}
        onCompare={
          consentSupported
            ? () => {
                const keys = selectedGpuState.length > 0 ? selectedGpuState : selectableHwTypes;
                requestEngineComparison(keys, () => {
                  setBestPerSku(false);
                  setActiveHwTypes(new Set(keys));
                  setEngineConflict(null);
                });
              }
            : undefined
        }
      />
      <EngineComparisonConfirmation
        open={engineConsent.open}
        onCancel={() => {
          engineConsent.cancel();
          track('inference_engine_comparison_confirmation_cancelled');
        }}
        onConfirm={() => {
          engineConsent.confirm();
          track('inference_engine_comparison_confirmation_accepted');
        }}
      />
      <Dialog open={showDateRangeDialog} onOpenChange={setShowDateRangeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{localeStrings.dateRangeResetTitle}</DialogTitle>
            <DialogDescription>{localeStrings.dateRangeResetDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleDateRangeDialogOk}>{localeStrings.ok}</Button>
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

/**
 * The selected model, sequence and precision, to spread into inference analytics events. Returns an
 * empty object outside an InferenceProvider, so shared components can call it anywhere.
 */
export function useInferenceAnalyticsContext(): SelectionAnalyticsContext {
  const filters = useContext(InferenceFiltersContext);
  const model = filters?.selectedModel;
  const sequence = filters?.selectedSequence;
  const precisions = filters?.selectedPrecisions;
  return useMemo(
    () => selectionAnalyticsContext({ model, sequence, precisions }),
    [model, sequence, precisions],
  );
}
