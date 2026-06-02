'use client';

import { type ReactNode, createContext, use, useCallback, useMemo, useRef, useState } from 'react';

import { useGlobalFilters } from '@/components/GlobalFilterContext';
import type { InferenceChartContextType } from '@/components/inference/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useChartUIState } from '@/hooks/useChartContext';
import { useUrlState } from '@/hooks/useUrlState';
import { MODEL_PREFIX_MAPPING } from '@/lib/data-mappings';
import {
  MtpEngineConflictToast,
  type MtpEngineConflictDetail,
} from '@/components/mtp-engine-conflict-toast';
import { useChartData } from './hooks/useChartData';
import { useInferenceAvailability } from './hooks/useInferenceAvailability';
import { useTrackedConfigs } from './hooks/useTrackedConfigs';
import { useInferenceSelectionTracking } from './hooks/useInferenceSelectionTracking';
import { useInferenceUrlSync } from './hooks/useInferenceUrlSync';
import { useInferencePresetLoading } from './hooks/useInferencePresetLoading';
import { useLegendHwFilters } from './hooks/useLegendHwFilters';
import { usePresetClearSetters } from './hooks/usePresetClearSetters';
import { useFilteredRuns } from './hooks/useFilteredRuns';

/** @internal Exported for test provider wrapping only. */
export const InferenceContext = createContext<InferenceChartContextType | undefined>(undefined);

export function InferenceProvider({
  children,
  activeTab,
  initialActiveHwTypes,
  compareGpuPair,
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
  /**
   * Initial y-axis metric key when the URL has no `?i_metric=` param. Used by
   * `/compare-per-dollar/[slug]` to default the chart to
   * `y_costh` (Cost per Million Total Tokens — Owning Hyperscaler) instead of
   * the dashboard's default `y_tpPerGpu`. URL param still wins so existing
   * shared links are unaffected.
   */
  initialYAxisMetric?: string;
}) {
  const isActive =
    activeTab === 'inference' || activeTab === 'historical' || activeTab === 'compare';

  const {
    selectedModel,
    setSelectedModel,
    effectiveSequence,
    setSelectedSequence,
    effectivePrecisions,
    setSelectedPrecisions,
    selectedRunDate,
    setSelectedRunDate,
    selectedRunId,
    setSelectedRunId,
    availableModels,
    availableSequences,
    availablePrecisions,
    availableDates,
    effectiveRunDate,
    availabilityRows,
    workflowInfo,
    availableRuns,
    workflowError,
  } = useGlobalFilters();

  const { getUrlParam } = useUrlState();

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

  // ── Inference-specific filter state ─────────────────────────────────────────
  const [selectedGPUs, setSelectedGPUs] = useState<string[]>(() => {
    const urlGpus = getUrlParam('i_gpus');
    return urlGpus ? urlGpus.split(',').filter(Boolean) : [];
  });
  const [selectedYAxisMetric, setSelectedYAxisMetric] = useState<string>(
    () => getUrlParam('i_metric') || initialYAxisMetric || 'y_tpPerGpu',
  );
  const [selectedXAxisMetric, setSelectedXAxisMetric] = useState<string | null>(
    () => getUrlParam('i_xmetric') || 'p99_ttft',
  );
  const [selectedE2eXAxisMetric, setSelectedE2eXAxisMetric] = useState<string | null>(
    () => getUrlParam('i_e2e_xmetric') || null,
  );
  const [scaleType, setScaleType] = useState<'auto' | 'linear' | 'log'>(
    () => (getUrlParam('i_scale') as 'auto' | 'linear' | 'log') || 'auto',
  );
  const { highContrast, setHighContrast, isLegendExpanded, setIsLegendExpanded } = useChartUIState({
    urlPrefix: 'i_',
  });

  const [hideNonOptimal, setHideNonOptimal] = useState(() => getUrlParam('i_optimal') !== '0');
  const [hidePointLabels, setHidePointLabels] = useState(() => getUrlParam('i_nolabel') === '1');
  const [logScale, setLogScale] = useState(() => getUrlParam('i_log') === '1');
  const [useAdvancedLabels, setUseAdvancedLabels] = useState(
    () => getUrlParam('i_advlabel') === '1',
  );
  const [showGradientLabels, setShowGradientLabels] = useState(
    () => getUrlParam('i_gradlabel') === '1',
  );
  const [showLineLabels, setShowLineLabels] = useState(() => getUrlParam('i_linelabel') === '1');
  const [showSpeedOverlay, setShowSpeedOverlay] = useState(() => getUrlParam('i_speed') === '1');
  const [showMinecraftOverlay, setShowMinecraftOverlay] = useState(
    () => getUrlParam('i_mc') === '1',
  );
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

  // --- MTP cross-engine conflict toast state ---
  const [mtpConflict, setMtpConflict] = useState<MtpEngineConflictDetail | null>(null);
  const dismissMtpConflict = useCallback(() => setMtpConflict(null), []);

  // ── Data fetching (gated by isActive) ──────────────────────────────────────
  const latestDate = availableDates.length > 0 ? availableDates.at(-1) : undefined;

  const {
    graphs,
    loading: chartDataLoading,
    error: chartDataError,
    hardwareConfig,
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
    isActive,
    latestDate,
    compareGpuPair ?? null,
  );

  // For GPU comparison date picker — use shared availability data from global filters
  const { dateRangeAvailableDates, availableGPUs } = useInferenceAvailability({
    selectedModel,
    effectiveSequence,
    effectivePrecisions,
    selectedGPUs,
    availabilityRows,
    availableDates,
  });

  // ── Derived state ─────────────────────────────────────────────────────────

  // --- Tracked config functions ---
  const {
    trackedConfigs,
    setTrackedConfigs,
    addTrackedConfig,
    removeTrackedConfig,
    clearTrackedConfigs,
  } = useTrackedConfigs(hardwareConfig);

  // Clear selector-scoped state (tracked configs, custom cost/power overrides)
  // whenever the top-level selectors change. Done during render with a prev-deps
  // comparison (mirroring the old effect dep array, reference equality) so the
  // reset commits in the same render instead of forcing an extra one.
  const [prevSelectorDeps, setPrevSelectorDeps] = useState({
    selectedModel,
    effectiveSequence,
    effectivePrecisions,
    selectedYAxisMetric,
  });
  if (
    prevSelectorDeps.selectedModel !== selectedModel ||
    prevSelectorDeps.effectiveSequence !== effectiveSequence ||
    prevSelectorDeps.effectivePrecisions !== effectivePrecisions ||
    prevSelectorDeps.selectedYAxisMetric !== selectedYAxisMetric
  ) {
    setPrevSelectorDeps({
      selectedModel,
      effectiveSequence,
      effectivePrecisions,
      selectedYAxisMetric,
    });
    setTrackedConfigs((prev) => (prev.length > 0 ? [] : prev));
    if (selectedYAxisMetric !== 'y_costUser') setUserCosts((prev) => (prev === null ? prev : null));
    if (selectedYAxisMetric !== 'y_powerUser')
      setUserPowers((prev) => (prev === null ? prev : null));
  }

  // Ref guard: when true, filter changes don't clear the active preset.
  // FavoritePresetsDropdown sets this while applying a preset so its own
  // programmatic setter calls don't accidentally deactivate it.
  const presetGuardRef = useRef(false);
  const {
    setSelectedModelAndClear,
    setSelectedSequenceAndClear,
    setSelectedPrecisionsAndClear,
    setSelectedYAxisMetricAndClear,
    setSelectedGPUsAndClear,
    setSelectedDatesAndClear,
    setSelectedDateRangeAndClear,
  } = usePresetClearSetters({
    setSelectedModel,
    setSelectedSequence,
    setSelectedPrecisions,
    setSelectedYAxisMetric,
    setSelectedGPUs,
    setSelectedDates,
    setSelectedDateRange,
    setActivePresetId,
    presetGuardRef,
    presetHwFilterRef,
  });

  const loading = chartDataLoading;
  const error = workflowError || chartDataError;

  // ── Legend HW/date toggles + filter side effects ──────────────────────────
  const {
    activeHwTypes,
    hwTypesWithData,
    toggleHwType,
    removeHwType,
    selectAllHwTypes,
    activeDates,
    setActiveDates,
    toggleActiveDate,
    removeActiveDate,
    selectAllActiveDates,
  } = useLegendHwFilters({
    graphs,
    effectivePrecisions,
    selectedModel,
    effectiveSequence,
    selectedGPUs,
    setSelectedGPUs,
    selectedDates,
    setSelectedDates,
    selectedDateRange,
    setSelectedDateRange,
    availableGPUs,
    dateRangeAvailableDates,
    setUserCosts,
    pendingHwFilter,
    setPendingHwFilter,
    pendingActiveHwTypes,
    setPendingActiveHwTypes,
    presetHwFilterRef,
    setActivePresetId,
    setMtpConflict,
  });

  const modelPrefixes = useMemo(
    () =>
      Object.entries(MODEL_PREFIX_MAPPING).flatMap(([prefix, model]) =>
        model === selectedModel ? [prefix] : [],
      ),
    [selectedModel],
  );

  // ── Debounced selection tracking + once-on-mount chart-view event ─────────
  useInferenceSelectionTracking({
    activeHwTypes,
    activeDates,
    selectedModel,
    effectiveSequence,
    activePresetId,
    selectedYAxisMetric,
    getUrlParam,
  });

  // ── URL sync ──────────────────────────────────────────────────────────────
  useInferenceUrlSync({
    activeHwTypes,
    hwTypesWithData,
    selectedYAxisMetric,
    selectedXAxisMetric,
    selectedE2eXAxisMetric,
    scaleType,
    selectedGPUs,
    selectedDates,
    selectedDateRange,
    hideNonOptimal,
    hidePointLabels,
    highContrast,
    logScale,
    isLegendExpanded,
    useAdvancedLabels,
    showGradientLabels,
    showLineLabels,
    showSpeedOverlay,
    showMinecraftOverlay,
  });

  // ── URL preset loading ───────────────────────────────────────────────────
  // Reads ?preset= from the URL on mount and applies it. This is the only
  // place preset URL params are consumed — the landing page links here.
  useInferencePresetLoading({
    dateRangeAvailableDates,
    presetGuardRef,
    presetHwFilterRef,
    setSelectedModel,
    setSelectedSequence,
    setSelectedPrecisions,
    setSelectedYAxisMetric,
    setSelectedGPUs,
    setSelectedDates,
    setSelectedDateRange,
    setActivePresetId,
    setHighContrast,
    setPendingHwFilter,
  });

  // ── Filtered runs ─────────────────────────────────────────────────────────
  const { filteredAvailableRuns, effectiveSelectedRunId } = useFilteredRuns({
    availableRuns,
    modelPrefixes,
    effectivePrecisions,
    selectedRunId,
  });

  const handleDateRangeDialogOk = () => {
    setSelectedDateRange({ startDate: '', endDate: '' });
    setSelectedDates([]);
    setShowDateRangeDialog(false);
  };

  // ── Context value ─────────────────────────────────────────────────────────

  const value = useMemo(
    () => ({
      activeHwTypes,
      hwTypesWithData,
      toggleHwType,
      removeHwType,
      selectAllHwTypes,
      hardwareConfig,
      graphs,
      selectedModel,
      setSelectedModel: setSelectedModelAndClear,
      selectedSequence: effectiveSequence,
      setSelectedSequence: setSelectedSequenceAndClear,
      selectedPrecisions: effectivePrecisions,
      setSelectedPrecisions: setSelectedPrecisionsAndClear,
      isLegendExpanded,
      setIsLegendExpanded,
      hideNonOptimal,
      setHideNonOptimal,
      hidePointLabels,
      setHidePointLabels,
      highContrast,
      setHighContrast,
      logScale,
      setLogScale,
      selectedXAxisMetric,
      setSelectedXAxisMetric,
      selectedE2eXAxisMetric,
      setSelectedE2eXAxisMetric,
      scaleType,
      setScaleType,
      loading,
      error,
      workflowInfo,
      selectedYAxisMetric,
      setSelectedYAxisMetric: setSelectedYAxisMetricAndClear,
      selectedGPUs,
      setSelectedGPUs: setSelectedGPUsAndClear,
      availableGPUs,
      selectedDates,
      setSelectedDates: setSelectedDatesAndClear,
      selectedDateRange,
      setSelectedDateRange: setSelectedDateRangeAndClear,
      activeDates,
      setActiveDates,
      toggleActiveDate,
      removeActiveDate,
      selectAllActiveDates,
      selectedRunDate,
      setSelectedRunDate,
      userCosts,
      setUserCosts,
      availableDates,
      dateRangeAvailableDates,
      isCheckingAvailableDates,
      availableRuns: filteredAvailableRuns,
      selectedRunId: effectiveSelectedRunId,
      setSelectedRunId,
      availablePrecisions,
      availableSequences,
      availableModels,
      userPowers,
      setUserPowers,
      useAdvancedLabels,
      setUseAdvancedLabels,
      showGradientLabels,
      setShowGradientLabels,
      showLineLabels,
      setShowLineLabels,
      showSpeedOverlay,
      setShowSpeedOverlay,
      showMinecraftOverlay,
      setShowMinecraftOverlay,
      trackedConfigs,
      addTrackedConfig,
      removeTrackedConfig,
      clearTrackedConfigs,
      setHwFilter: setPendingHwFilter,
      activePresetId,
      setActivePresetId,
      presetGuardRef,
      compareGpuPair: compareGpuPair ?? null,
    }),
    [
      activeHwTypes,
      hwTypesWithData,
      toggleHwType,
      removeHwType,
      selectAllHwTypes,
      hardwareConfig,
      graphs,
      loading,
      error,
      workflowInfo,
      selectedModel,
      effectiveSequence,
      effectivePrecisions,
      selectedYAxisMetric,
      selectedXAxisMetric,
      selectedE2eXAxisMetric,
      scaleType,
      selectedGPUs,
      selectedDates,
      selectedDateRange,
      activeDates,
      toggleActiveDate,
      removeActiveDate,
      selectAllActiveDates,
      selectedRunDate,
      availableDates,
      dateRangeAvailableDates,
      isCheckingAvailableDates,
      availableGPUs,
      filteredAvailableRuns,
      effectiveSelectedRunId,
      availablePrecisions,
      availableSequences,
      availableModels,
      hideNonOptimal,
      hidePointLabels,
      highContrast,
      logScale,
      isLegendExpanded,
      useAdvancedLabels,
      showGradientLabels,
      showLineLabels,
      showSpeedOverlay,
      showMinecraftOverlay,
      userCosts,
      userPowers,
      trackedConfigs,
      addTrackedConfig,
      removeTrackedConfig,
      clearTrackedConfigs,
      activePresetId,
      compareGpuPair,
    ],
  );

  return (
    <InferenceContext.Provider value={value}>
      {children}
      <MtpEngineConflictToast detail={mtpConflict} onDismiss={dismissMtpConflict} />
      <Dialog open={showDateRangeDialog} onOpenChange={setShowDateRangeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Date Range Reset</DialogTitle>
            <DialogDescription>
              The GPU configs are not available in the selected date range. The date range will be
              reset.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleDateRangeDialogOk}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </InferenceContext.Provider>
  );
}

export function useInference() {
  const context = use(InferenceContext);
  if (context === undefined) {
    throw new Error('useInference must be used within an InferenceProvider');
  }
  return context;
}
