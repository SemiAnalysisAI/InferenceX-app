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

import { track } from '@/lib/analytics';
import {
  FAVORITE_PRESETS,
  type FavoritePreset,
  matchesPresetHwFilter,
} from '@/components/favorites/favorite-presets';

import { useGlobalFilters } from '@/components/GlobalFilterContext';
import type {
  InferenceComparisonContextType,
  InferenceCoreContextType,
  InferenceData,
  InferenceTrackingContextType,
} from '@/components/inference/types';
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
import { getModelExclusion, MODEL_PREFIX_MAPPING } from '@/lib/data-mappings';
import {
  MtpEngineConflictToast,
  type MtpEngineConflictDetail,
} from '@/components/mtp-engine-conflict-toast';
import {
  buildExclusion,
  clearAllExclusionGroups,
  effectiveLegendItems,
  resolveExclusionToggle,
} from '@/lib/exclusion';
import { filterRunsByModel } from '@/lib/utils';

import { useChartData } from './hooks/useChartData';
import { useFavoritePresetsState } from './hooks/useFavoritePresetsState';
import { useGpuComparisonState } from './hooks/useGpuComparisonState';
import { useQuickFiltersState } from './hooks/useQuickFiltersState';
import { useTrackedConfigsState } from './hooks/useTrackedConfigsState';
import { resolveComparisonEntries } from './utils/comparisonEntry';
import { EMPTY_QUICK_FILTERS } from './utils/quickFilters';

// ── Split contexts ──────────────────────────────────────────────────────────
// The monolithic InferenceContext (one value of ~90 fields) was split into three
// narrow contexts so a change in one cluster doesn't re-render consumers of the
// others. The public <InferenceProvider> below composes all three; consumers
// read the narrowest hook they need (useInferenceCore / useInferenceComparison /
// useInferenceTracking). See types.ts for the per-context field docs.

/** @internal Exported for test provider wrapping only. */
export const InferenceCoreContext = createContext<InferenceCoreContextType | undefined>(undefined);
/** @internal Exported for test provider wrapping only. */
export const InferenceComparisonContext = createContext<InferenceComparisonContextType | undefined>(
  undefined,
);
/** @internal Exported for test provider wrapping only. */
export const InferenceTrackingContext = createContext<InferenceTrackingContextType | undefined>(
  undefined,
);

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

  // ── GPU / date comparison state (owned by inference, not global) ──────────
  // Base state + availability-derived memos live in useGpuComparisonState; the
  // preset-clearing setter wrappers and cross-cluster auto-clear effects stay
  // below in this component.
  const {
    selectedGPUs,
    setSelectedGPUs,
    selectedDates,
    setSelectedDates,
    selectedDateRange,
    setSelectedDateRange,
    isCheckingAvailableDates,
    showDateRangeDialog,
    setShowDateRangeDialog,
    availableGPUs,
    dateRangeAvailableDates,
  } = useGpuComparisonState({
    availabilityRows,
    availableDates,
    selectedModel,
    effectiveSequence,
    effectivePrecisions,
  });

  // ── Inference-specific filter state ─────────────────────────────────────────
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

  // ── Quick filters (vendor / framework / agg-disagg / mtp-stp) ────────────────
  // Coarse pre-filters applied to the point set. State + URL hydration live in
  // useQuickFiltersState; the historical-tab gate stays below.
  const {
    quickFilters,
    quickFilterVendors,
    quickFilterFrameworks,
    quickFilterDisagg,
    quickFilterSpec,
    setQuickFilterVendors,
    setQuickFilterFrameworks,
    setQuickFilterDisagg,
    setQuickFilterSpec,
  } = useQuickFiltersState();
  // The Historical Trends tab hides the quick-filter pills (hideGpuComparison), so
  // don't silently narrow its chart with selections carried in via share links or
  // the inference tab — there would be no pill to clear them.
  const dataQuickFilters = activeTab === 'historical' ? EMPTY_QUICK_FILTERS : quickFilters;
  const { highContrast, setHighContrast, isLegendExpanded, setIsLegendExpanded } = useChartUIState({
    urlPrefix: 'i_',
  });

  const [hideNonOptimal, setHideNonOptimal] = useState(() => getUrlParam('i_optimal') !== '0');
  const [showPointLabels, setShowPointLabels] = useState(() => {
    // Legacy `?i_nolabel=1` from before the rename: keep hiding point labels
    // explicitly so the share link's intent survives future default changes.
    if (getUrlParam('i_nolabel') === '1') return false;
    if (getUrlParam('i_label') === '1') return true;
    // Old share links set `?i_advlabel=1` while keeping the labels default
    // (shown). Mirror the toggle's auto-enable side-effect on load so those
    // links still render advanced labels under the new default-off behavior.
    if (getUrlParam('i_advlabel') === '1') return true;
    return false;
  });
  const [logScale, setLogScale] = useState(() => getUrlParam('i_log') === '1');
  const [useAdvancedLabels, setUseAdvancedLabels] = useState(
    () => getUrlParam('i_advlabel') === '1',
  );
  const [showGradientLabels, setShowGradientLabels] = useState(
    () => getUrlParam('i_gradlabel') === '1',
  );
  const [showLineLabels, setShowLineLabels] = useState(() => getUrlParam('i_linelabel') !== '0');
  const [showSpeedOverlay, setShowSpeedOverlay] = useState(() => getUrlParam('i_speed') === '1');
  const [showMinecraftOverlay, setShowMinecraftOverlay] = useState(
    () => getUrlParam('i_mc') === '1',
  );
  const [userCosts, setUserCosts] = useState<Record<string, number | undefined> | null>(null);
  const [userPowers, setUserPowers] = useState<Record<string, number | undefined> | null>(null);

  // --- Favorite presets state ---
  // State primitives + guard machinery live in useFavoritePresetsState. The
  // applyPreset orchestration and its two effects (URL ?preset= loader, timeline
  // range resolver) stay in this component — they drive setters from every
  // cluster, so keeping them here avoids reintroducing the coupling as args.
  const {
    pendingHwFilter,
    setPendingHwFilter,
    activePresetId,
    setActivePresetId,
    presetHwFilterRef,
    presetGuardRef,
    urlPresetAppliedRef,
    presetVersionRef,
    pendingPresetVersionRef,
    pendingTimelinePreset,
    setPendingTimelinePreset,
    clearPresetOnChange,
  } = useFavoritePresetsState();

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
    () => filterRunsByModel(availableRuns, modelPrefixes, [...effectivePrecisions]),
    [availableRuns, modelPrefixes, effectivePrecisions],
  );

  const effectiveSelectedRunId = useMemo(() => {
    if (!filteredAvailableRuns) return selectedRunId;
    const filteredRunIds = Object.keys(filteredAvailableRuns);
    if (filteredRunIds.length === 0 || filteredRunIds.includes(selectedRunId)) return selectedRunId;
    return filteredRunIds.reduce((max, id) => (id > max ? id : max), filteredRunIds[0]);
  }, [filteredAvailableRuns, selectedRunId]);

  // The latest run for this model on the selected date. GitHub run ids increase
  // monotonically with time, so the lexicographically-greatest id is the newest run.
  const latestRunIdForModel = useMemo(() => {
    const ids = filteredAvailableRuns ? Object.keys(filteredAvailableRuns) : [];
    return ids.length > 0 ? ids.reduce((max, id) => (id > max ? id : max), ids[0]) : '';
  }, [filteredAvailableRuns]);

  // Only constrain the query when an earlier-than-latest run is selected; otherwise
  // the chart shows the full latest view (and reuses the materialized-view fast path).
  const asOfRunId =
    effectiveSelectedRunId && latestRunIdForModel && effectiveSelectedRunId !== latestRunIdForModel
      ? effectiveSelectedRunId
      : undefined;

  const {
    graphs,
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
    isActive,
    latestDate,
    compareGpuPair ?? null,
    asOfRunId,
    dataQuickFilters,
  );

  // ── Derived state ─────────────────────────────────────────────────────────
  // availableGPUs / dateRangeAvailableDates / dbModelKeys are computed in
  // useGpuComparisonState (above) from availabilityRows + the current filters.

  // --- Tracked configs (up to 6 pinned points + auto-clear on selector change) ---
  const { trackedConfigs, addTrackedConfig, removeTrackedConfig, clearTrackedConfigs } =
    useTrackedConfigsState({
      hardwareConfig,
      selectedModel,
      effectiveSequence,
      effectivePrecisions,
      selectedYAxisMetric,
    });

  // --- Preset-clearing setter wrappers ---
  // Each wraps a base setter so a *user* change deactivates the active preset.
  // clearPresetOnChange (from useFavoritePresetsState) no-ops while the guard is
  // set (during a programmatic apply). Kept as individual useCallbacks so their
  // identities stay stable across renders — the provider value memo depends on them.
  const setSelectedModelAndClear = useCallback(
    (v: typeof selectedModel) => {
      setSelectedModel(v);
      clearPresetOnChange();
    },
    [setSelectedModel, clearPresetOnChange],
  );
  const setSelectedSequenceAndClear = useCallback(
    (v: typeof effectiveSequence) => {
      setSelectedSequence(v);
      clearPresetOnChange();
    },
    [setSelectedSequence, clearPresetOnChange],
  );
  const setSelectedPrecisionsAndClear = useCallback(
    (v: typeof effectivePrecisions) => {
      setSelectedPrecisions(v);
      clearPresetOnChange();
    },
    [setSelectedPrecisions, clearPresetOnChange],
  );
  const setSelectedYAxisMetricAndClear = useCallback(
    (v: string) => {
      setSelectedYAxisMetric(v);
      clearPresetOnChange();
    },
    [setSelectedYAxisMetric, clearPresetOnChange],
  );
  const setSelectedGPUsAndClear = useCallback(
    (v: string[]) => {
      setSelectedGPUs(v);
      clearPresetOnChange();
    },
    [setSelectedGPUs, clearPresetOnChange],
  );
  const setSelectedDatesAndClear = useCallback(
    // Accept a React state updater (value OR function) so callers adding several
    // dates/runs in quick succession can use the functional form and avoid the
    // stale-closure race where each click overwrites the last.
    (v: SetStateAction<string[]>) => {
      setSelectedDates(v);
      clearPresetOnChange();
    },
    [setSelectedDates, clearPresetOnChange],
  );
  const setSelectedDateRangeAndClear = useCallback(
    (v: { startDate: string; endDate: string }) => {
      setSelectedDateRange(v);
      clearPresetOnChange();
    },
    [setSelectedDateRange, clearPresetOnChange],
  );

  const loading = chartDataLoading;
  const error = workflowError || chartDataError;

  // ── Toggle sets ───────────────────────────────────────────────────────────

  const {
    activeSet: activeHwTypes,
    setActiveSet: setActiveHwTypes,
    toggle: toggleHwRaw,
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
  const extractHwKey = useCallback((point: InferenceData) => point.hwKey as string, []);

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
        setActiveHwTypesDispatch(update);
        return;
      }
      // Preset filter is active: evaluate updater to get all available items, then filter.
      // Passing empty set makes useChartDataFilter's updater return itemsWithData (all items).
      const base: Set<string> = typeof update === 'function' ? update(new Set()) : update;
      const filtered = new Set(
        [...base].filter((k) => matchesPresetHwFilter(k, filter, selectedModelRef.current)),
      );
      if (filtered.size > 0) {
        setActiveHwTypes(filtered);
        setPendingHwFilter(null);
      } else {
        setActiveHwTypes(base);
      }
    },
    [setActiveHwTypes, setActiveHwTypesDispatch],
  );

  const hwTypesWithData = useChartDataFilter(
    hwFilteredPoints,
    setActiveHwTypesWithFilter,
    extractHwKey,
  );

  // Direct fallback: apply pendingHwFilter when hwTypesWithData is already populated
  // but useChartDataFilter didn't fire (e.g. re-selecting the same preset).
  useEffect(() => {
    if (!pendingHwFilter || hwTypesWithData.size === 0) return;
    const filtered = new Set(
      [...hwTypesWithData].filter((k) => matchesPresetHwFilter(k, pendingHwFilter, selectedModel)),
    );
    if (filtered.size > 0) {
      setActiveHwTypes(filtered);
      setPendingHwFilter(null);
    }
  }, [pendingHwFilter, hwTypesWithData, setActiveHwTypes]);

  const exclusion = useMemo(() => {
    const specs = getModelExclusion(selectedModel);
    return specs.length > 0 ? buildExclusion(specs) : null;
  }, [selectedModel]);
  const toggleHwType = useCallback(
    (hw: string) => {
      // Under exclusion, hide participating keys from inactive groups when
      // computing the toggle "universe". This makes the default-deselected
      // state (DSv4 MTP on first load) count as "all selected", so clicking a
      // legend entry solos it instead of just removing it.
      const toggleUniverse = exclusion
        ? effectiveLegendItems(hwTypesWithData, activeHwTypes, exclusion)
        : hwTypesWithData;
      if (exclusion) {
        const decision = resolveExclusionToggle(activeHwTypes, hw, toggleUniverse, exclusion);
        if (decision.kind === 'block') {
          setMtpConflict({
            kind: 'blocked',
            attempted: decision.attempted,
            existing: decision.existing,
          });
          return;
        }
        if (decision.kind === 'silent-disable-all') {
          setActiveHwTypes(decision.result);
          setActivePresetId(null);
          presetHwFilterRef.current = null;
          return;
        }
      }
      toggleHwRaw(hw, toggleUniverse);
      setActivePresetId(null);
      presetHwFilterRef.current = null;
    },
    [toggleHwRaw, hwTypesWithData, exclusion, activeHwTypes, setActiveHwTypes],
  );

  const removeHwType = useCallback(
    (hw: string) => {
      removeHwRaw(hw);
      setActivePresetId(null);
      presetHwFilterRef.current = null;
    },
    [removeHwRaw],
  );

  const allDateIds = useMemo(() => {
    const dates = resolveComparisonEntries(selectedDates, selectedDateRange);
    const allIds = new Set<string>();
    selectedGPUs.forEach((gpu) => {
      dates.forEach((date) => allIds.add(`${date}_${gpu}`));
    });
    return allIds;
  }, [selectedDateRange, selectedDates, selectedGPUs]);

  const toggleActiveDate = useCallback(
    (id: string) => toggleDateRaw(id, allDateIds),
    [toggleDateRaw, allDateIds],
  );
  const removeActiveDate = useCallback((id: string) => removeDateRaw(id), [removeDateRaw]);
  const selectAllHwTypes = useCallback(() => {
    if (exclusion) {
      const { result, droppedGroups } = clearAllExclusionGroups(hwTypesWithData, exclusion);
      setActiveHwTypes(result);
      if (droppedGroups.length > 0) {
        setMtpConflict({ kind: 'cleared', families: droppedGroups });
      }
      return;
    }
    selectAllHwRaw(hwTypesWithData);
  }, [selectAllHwRaw, hwTypesWithData, exclusion, setActiveHwTypes]);
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
  // Track the last applied key with a ref and include hwTypesWithData in the deps so the
  // reset commits as soon as data for the new model arrives — without this, switching models
  // bails on the empty-data tick and never re-fires, leaving the legend at the prior intersection.
  const precisionsKey = effectivePrecisions.join(',');
  const lastHwResetKeyRef = useRef('');

  // Restore legend-active selection from URL on first availability of
  // hwTypesWithData. Sets lastHwResetKeyRef so the reset effect below treats
  // the current key as already-applied and bails. Empty intersection (e.g.
  // shared GPUs no longer in availability) falls back to "all available".
  // Multi-family MTP keys are cleared the same way as the auto-reset path.
  useEffect(() => {
    if (!pendingActiveHwTypes) return;
    if (pendingHwFilterRef.current) return;
    if (hwTypesWithData.size === 0) return;
    // Match exact hwKeys (URL-restored) AND bare GPU prefixes (used by
    // /compare/[a]-vs-[b] pages, which know the GPU key but not which framework
    // configs exist for it).
    const prefixes = [...pendingActiveHwTypes].filter((k) => !k.includes('_'));
    let restored = new Set(
      [...hwTypesWithData].filter(
        (k) =>
          pendingActiveHwTypes.has(k) || prefixes.some((p) => k.startsWith(`${p}_`) || k === p),
      ),
    );
    // Empty intersection (e.g. URL referenced GPUs no longer in availability,
    // or the URL only contained multi-family MTP keys that get sanitized away)
    // → fall back to the default "all available" set. MTP sanitization is then
    // applied below so the fallback itself is engine-exclusion safe.
    if (restored.size === 0) restored = hwTypesWithData;
    if (exclusion) {
      const cleared = clearAllExclusionGroups(restored, exclusion);
      restored = cleared.result;
      if (cleared.droppedGroups.length > 0) {
        setMtpConflict({ kind: 'cleared', families: cleared.droppedGroups });
      }
    }
    setActiveHwTypes(restored);
    lastHwResetKeyRef.current = `${selectedModel}|${effectiveSequence}|${precisionsKey}`;
    setPendingActiveHwTypes(null);
  }, [
    pendingActiveHwTypes,
    hwTypesWithData,
    exclusion,
    selectedModel,
    effectiveSequence,
    precisionsKey,
    setActiveHwTypes,
  ]);

  useEffect(() => {
    if (pendingHwFilterRef.current) return;
    if (pendingActiveHwTypes) return;
    if (hwTypesWithData.size === 0) return;
    const key = `${selectedModel}|${effectiveSequence}|${precisionsKey}`;
    if (lastHwResetKeyRef.current === key) return;
    lastHwResetKeyRef.current = key;
    const presetFilter = presetHwFilterRef.current;
    if (presetFilter) {
      const filtered = new Set(
        [...hwTypesWithData].filter((k) => matchesPresetHwFilter(k, presetFilter, selectedModel)),
      );
      if (filtered.size > 0) {
        // Presets explicitly chose hw configs — respect their picks. The
        // matcher already excludes rule-suffix keys under bare prefixes for
        // models with an exclusion rule, so we don't fall through to
        // clearAllExclusionGroups (which would fire the toast). The legend
        // toggle guard still blocks adding a second comparability group later.
        setActiveHwTypes(filtered);
        return;
      }
    }
    if (exclusion) {
      // When multiple comparability groups have data, disable them all by
      // default and surface a toast. The user has to opt into one group
      // explicitly — never multiple at once.
      const { result, droppedGroups } = clearAllExclusionGroups(hwTypesWithData, exclusion);
      setActiveHwTypes(result);
      if (droppedGroups.length > 0) {
        setMtpConflict({ kind: 'cleared', families: droppedGroups });
      }
      return;
    }
    setActiveHwTypes(hwTypesWithData);
  }, [
    selectedModel,
    effectiveSequence,
    precisionsKey,
    hwTypesWithData,
    exclusion,
    pendingActiveHwTypes,
  ]);

  // Remove selected GPUs that no longer have data for current filters
  useEffect(() => {
    if (selectedGPUs.length === 0 || availableGPUs.length === 0) return;
    const validKeys = new Set(availableGPUs.map((g) => g.value));
    const valid = selectedGPUs.filter((g) => validKeys.has(g));
    if (valid.length !== selectedGPUs.length) setSelectedGPUs(valid);
  }, [availableGPUs]);

  useEffect(() => {
    if (selectedGPUs.length === 0) {
      setSelectedDateRange({ startDate: '', endDate: '' });
      setSelectedDates([]);
      setUserCosts(null);
    }
  }, [selectedGPUs]);

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
    if (selectedYAxisMetric !== 'y_costUser') setUserCosts((prev) => (prev === null ? prev : null));
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
  // it equals the full set of items with data. Keeps share URLs short.
  const iActiveStr = useMemo(() => {
    if (activeHwTypes.size === 0) return '';
    if (activeHwTypes.size === hwTypesWithData.size) {
      let same = true;
      for (const k of activeHwTypes) {
        if (!hwTypesWithData.has(k)) {
          same = false;
          break;
        }
      }
      if (same) return '';
    }
    return [...activeHwTypes].toSorted().join(',');
  }, [activeHwTypes, hwTypesWithData]);

  useUrlStateSync(
    {
      i_metric: selectedYAxisMetric,
      i_gpus: selectedGPUs.join(','),
      i_dates: selectedDates.join(','),
      i_dstart: selectedDateRange.startDate,
      i_dend: selectedDateRange.endDate,
      i_optimal: hideNonOptimal ? '' : '0',
      i_label: showPointLabels ? '1' : '',
      i_hc: highContrast ? '1' : '',
      i_log: logScale ? '1' : '',
      i_xmetric: selectedXAxisMetric || '',
      i_e2e_xmetric: selectedE2eXAxisMetric || '',
      i_scale: scaleType,
      i_legend: isLegendExpanded ? '' : '0',
      i_advlabel: useAdvancedLabels ? '1' : '',
      i_gradlabel: showGradientLabels ? '1' : '',
      i_linelabel: showLineLabels ? '' : '0',
      i_speed: showSpeedOverlay ? '1' : '',
      i_mc: showMinecraftOverlay ? '1' : '',
      i_active: iActiveStr,
      i_vendor: quickFilterVendors.join(','),
      i_fw: quickFilterFrameworks.join(','),
      i_disagg: quickFilterDisagg.join(','),
      i_spec: quickFilterSpec.join(','),
    },
    [
      selectedYAxisMetric,
      selectedXAxisMetric,
      selectedE2eXAxisMetric,
      scaleType,
      selectedGPUs,
      selectedDates,
      selectedDateRange,
      hideNonOptimal,
      showPointLabels,
      highContrast,
      logScale,
      isLegendExpanded,
      useAdvancedLabels,
      showGradientLabels,
      showLineLabels,
      showSpeedOverlay,
      showMinecraftOverlay,
      iActiveStr,
      quickFilterVendors,
      quickFilterFrameworks,
      quickFilterDisagg,
      quickFilterSpec,
    ],
  );

  // ── URL preset loading ───────────────────────────────────────────────────
  // Reads ?preset= from the URL on mount and applies it. This is the only
  // place preset URL params are consumed — the landing page links here.
  // The version/applied refs and pendingTimelinePreset state live in
  // useFavoritePresetsState; applyPreset + the two effects below orchestrate
  // across every state cluster and so stay in this component.

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
        setSelectedGPUs(config.gpus);
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
        setSelectedGPUs([]);
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
      setSelectedGPUs,
      setSelectedDates,
      setSelectedDateRange,
      setActivePresetId,
      setHighContrast,
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
  // NOTE: We intentionally do NOT sync effectiveSelectedRunId back to
  // GlobalFilterContext (setSelectedRunId). That would cause a full tree
  // re-render on every precision change because filteredAvailableRuns
  // depends on effectivePrecisions. Instead, InferenceContext exposes
  // effectiveSelectedRunId directly (line ~499).

  const handleDateRangeDialogOk = () => {
    setSelectedDateRange({ startDate: '', endDate: '' });
    setSelectedDates([]);
    setShowDateRangeDialog(false);
  };

  // ── Context values ────────────────────────────────────────────────────────
  // Three independently-memoized values so a change in one cluster (e.g. a
  // GPU/date comparison toggle) does not invalidate the others' identity and
  // re-render their consumers. `activePresetId` / `setActivePresetId` /
  // `setPendingHwFilter` / `presetGuardRef` are intentionally NOT exposed on any
  // value — they have no external consumers and stay internal to the provider.

  const coreValue = useMemo<InferenceCoreContextType>(
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
      showPointLabels,
      setShowPointLabels,
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
      quickFilters,
      availableQuickFilters,
      setQuickFilterVendors,
      setQuickFilterFrameworks,
      setQuickFilterDisagg,
      setQuickFilterSpec,
      loading,
      error,
      workflowInfo,
      selectedYAxisMetric,
      setSelectedYAxisMetric: setSelectedYAxisMetricAndClear,
      selectedRunDate,
      setSelectedRunDate,
      userCosts,
      setUserCosts,
      availableDates,
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
      quickFilters,
      availableQuickFilters,
      selectedRunDate,
      availableDates,
      filteredAvailableRuns,
      effectiveSelectedRunId,
      availablePrecisions,
      availableSequences,
      availableModels,
      hideNonOptimal,
      showPointLabels,
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
      compareGpuPair,
    ],
  );

  const comparisonValue = useMemo<InferenceComparisonContextType>(
    () => ({
      selectedGPUs,
      setSelectedGPUs: setSelectedGPUsAndClear,
      availableGPUs,
      selectedDates,
      setSelectedDates: setSelectedDatesAndClear,
      selectedDateRange,
      setSelectedDateRange: setSelectedDateRangeAndClear,
      activeDates,
      toggleActiveDate,
      removeActiveDate,
      selectAllActiveDates,
      dateRangeAvailableDates,
      isCheckingAvailableDates,
    }),
    [
      selectedGPUs,
      availableGPUs,
      selectedDates,
      selectedDateRange,
      activeDates,
      toggleActiveDate,
      removeActiveDate,
      selectAllActiveDates,
      dateRangeAvailableDates,
      isCheckingAvailableDates,
    ],
  );

  const trackingValue = useMemo<InferenceTrackingContextType>(
    () => ({
      trackedConfigs,
      addTrackedConfig,
      removeTrackedConfig,
      clearTrackedConfigs,
    }),
    [trackedConfigs, addTrackedConfig, removeTrackedConfig, clearTrackedConfigs],
  );

  return (
    <InferenceCoreContext.Provider value={coreValue}>
      <InferenceComparisonContext.Provider value={comparisonValue}>
        <InferenceTrackingContext.Provider value={trackingValue}>
          {children}
          <MtpEngineConflictToast detail={mtpConflict} onDismiss={dismissMtpConflict} />
          <Dialog open={showDateRangeDialog} onOpenChange={setShowDateRangeDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Date Range Reset</DialogTitle>
                <DialogDescription>
                  The GPU configs are not available in the selected date range. The date range will
                  be reset.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={handleDateRangeDialogOk}>OK</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </InferenceTrackingContext.Provider>
      </InferenceComparisonContext.Provider>
    </InferenceCoreContext.Provider>
  );
}

/**
 * Core inference chart state (data, model/axis selection, display toggles,
 * HW-legend). Read by (nearly) every consumer.
 */
export function useInferenceCore() {
  const context = useContext(InferenceCoreContext);
  if (context === undefined) {
    throw new Error('useInferenceCore must be used within an InferenceProvider');
  }
  return context;
}

/**
 * GPU + date comparison selection. Read only by the comparison UI so a
 * comparison toggle doesn't re-render the core rendering tree.
 */
export function useInferenceComparison() {
  const context = useContext(InferenceComparisonContext);
  if (context === undefined) {
    throw new Error('useInferenceComparison must be used within an InferenceProvider');
  }
  return context;
}

/** Pinned tracked-config points (Performance-Over-Time drill-down). */
export function useInferenceTracking() {
  const context = useContext(InferenceTrackingContext);
  if (context === undefined) {
    throw new Error('useInferenceTracking must be used within an InferenceProvider');
  }
  return context;
}
