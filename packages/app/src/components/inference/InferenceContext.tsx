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

import { DISPLAY_MODEL_TO_DB, islOslToSequence } from '@semianalysisai/inferencex-constants';
import { track } from '@/lib/analytics';
import { FAVORITE_PRESETS, type FavoritePreset } from '@/components/favorites/favorite-presets';

import { useGlobalFilters } from '@/components/GlobalFilterContext';
import {
  HardwareConfig,
  InferenceChartContextType,
  InferenceData,
  TrackedConfig,
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
import { buildAvailabilityHwKey } from '@/lib/chart-utils';
import { getModelSortIndex, HARDWARE_CONFIG, TABLEAU_10 } from '@/lib/constants';
import { MODEL_PREFIX_MAPPING } from '@/lib/data-mappings';
import { filterRunsByModel, getDisplayLabel } from '@/lib/utils';

import { useChartData } from './hooks/useChartData';

/** @internal Exported for test provider wrapping only. */
export const InferenceContext = createContext<InferenceChartContextType | undefined>(undefined);

export function InferenceProvider({
  children,
  activeTab,
}: {
  children: ReactNode;
  activeTab: string;
}) {
  const isActive = activeTab === 'inference' || activeTab === 'historical';

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
    () => getUrlParam('i_metric') || 'y_tpPerGpu',
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
  const [colorShuffleSeed, setColorShuffleSeed] = useState(0);
  const shuffleColors = useCallback(() => {
    setColorShuffleSeed((prev) => prev + 1);
  }, []);

  const [hideNonOptimal, setHideNonOptimal] = useState(() => getUrlParam('i_optimal') !== '0');
  const [hidePointLabels, setHidePointLabels] = useState(() => getUrlParam('i_nolabel') === '1');
  const [logScale, setLogScale] = useState(() => getUrlParam('i_log') === '1');
  const [useAdvancedLabels, setUseAdvancedLabels] = useState(
    () => getUrlParam('i_advlabel') === '1',
  );
  const [showGradientLabels, setShowGradientLabels] = useState(
    () => getUrlParam('i_gradlabel') === '1',
  );
  const [userCosts, setUserCosts] = useState<{ [gpuKey: string]: number | undefined } | null>(null);
  const [userPowers, setUserPowers] = useState<{ [gpuKey: string]: number | undefined } | null>(
    null,
  );

  // --- Tracked configs state ---
  const [trackedConfigs, setTrackedConfigs] = useState<TrackedConfig[]>([]);

  // --- Favorite presets state ---
  const [pendingHwFilter, setPendingHwFilter] = useState<string[] | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // ── Data fetching (gated by isActive) ──────────────────────────────────────
  const latestDate =
    availableDates.length > 0 ? availableDates[availableDates.length - 1] : undefined;

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
  );

  // For GPU comparison date picker — use shared availability data from global filters
  const dbModelKey = useMemo(
    () => DISPLAY_MODEL_TO_DB[selectedModel] ?? selectedModel,
    [selectedModel],
  );

  const dateRangeAvailableDates = useMemo(() => {
    if (selectedGPUs.length === 0) return availableDates;
    if (!availabilityRows) return availableDates;
    const rows = availabilityRows.filter((r) => {
      if (r.model !== dbModelKey) return false;
      if (islOslToSequence(r.isl, r.osl) !== effectiveSequence) return false;
      if (!effectivePrecisions.includes(r.precision)) return false;
      if (!r.hardware) return false;
      const hwKey = buildAvailabilityHwKey(r.hardware, r.framework, r.spec_method, r.disagg);
      return selectedGPUs.includes(hwKey);
    });
    const dates = [...new Set(rows.map((r) => r.date))].sort();
    return dates.length > 0 ? dates : availableDates;
  }, [
    availabilityRows,
    dbModelKey,
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
      if (r.model !== dbModelKey) continue;
      if (islOslToSequence(r.isl, r.osl) !== effectiveSequence) continue;
      if (!effectivePrecisions.includes(r.precision)) continue;
      if (!r.hardware) continue;
      const hwKey = buildAvailabilityHwKey(r.hardware, r.framework, r.spec_method, r.disagg);
      if (HARDWARE_CONFIG[hwKey]) hwKeys.add(hwKey);
    }
    return [...hwKeys]
      .sort((a, b) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b))
      .map((hw) => ({
        value: hw,
        label: getDisplayLabel(HARDWARE_CONFIG[hw as keyof HardwareConfig]),
      }));
  }, [availabilityRows, dbModelKey, effectiveSequence, effectivePrecisions]);

  // --- Tracked config functions ---
  const buildTrackedConfigId = useCallback((point: InferenceData): string => {
    let key = `${point.hwKey}|${point.precision}|${point.tp}|${point.conc}`;
    if (point.disagg) {
      key += `|disagg|${point.num_prefill_gpu ?? 0}|${point.num_decode_gpu ?? 0}`;
    }
    return key;
  }, []);

  const addTrackedConfig = useCallback(
    (point: InferenceData, chartType: string) => {
      setTrackedConfigs((prev) => {
        const id = buildTrackedConfigId(point);
        if (prev.some((c) => c.id === id)) {
          return prev.filter((c) => c.id !== id);
        }
        if (prev.length >= 6) return prev;

        const hwConfig = hardwareConfig[point.hwKey];
        const label = hwConfig
          ? `${getDisplayLabel(hwConfig)} — TP${point.tp} conc=${point.conc} ${point.precision.toUpperCase()}`
          : `${point.hwKey} — TP${point.tp} conc=${point.conc} ${point.precision.toUpperCase()}`;

        const color = TABLEAU_10[prev.length % TABLEAU_10.length];
        return [
          ...prev,
          {
            id,
            hwKey: point.hwKey as string,
            precision: point.precision,
            tp: point.tp,
            conc: point.conc,
            label,
            color,
            chartType,
            disagg: point.disagg,
            num_prefill_gpu: point.num_prefill_gpu,
            num_decode_gpu: point.num_decode_gpu,
          },
        ];
      });
    },
    [buildTrackedConfigId, hardwareConfig],
  );

  const removeTrackedConfig = useCallback((id: string) => {
    setTrackedConfigs((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearTrackedConfigs = useCallback(() => {
    setTrackedConfigs([]);
  }, []);

  // Clear tracked configs whenever the top-level selectors change
  useEffect(() => {
    setTrackedConfigs((prev) => (prev.length > 0 ? [] : prev));
  }, [selectedModel, effectiveSequence, effectivePrecisions, selectedYAxisMetric]);

  // Ref guard: when true, filter changes don't clear the active preset.
  // FavoritePresetsDropdown sets this while applying a preset so its own
  // programmatic setter calls don't accidentally deactivate it.
  const presetGuardRef = useRef(false);
  const clearPresetOnChange = useCallback(() => {
    if (presetGuardRef.current) return;
    setActivePresetId((prev) => (prev !== null ? null : prev));
  }, []);
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
    (v: string[]) => {
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
      const filterSet = new Set(filter);
      const filtered = new Set(Array.from(base).filter((hwKey: string) => filterSet.has(hwKey)));
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
    const filterSet = new Set(pendingHwFilter);
    const filtered = new Set(Array.from(hwTypesWithData).filter((hwKey) => filterSet.has(hwKey)));
    if (filtered.size > 0) {
      setActiveHwTypes(filtered);
      setPendingHwFilter(null);
    }
  }, [pendingHwFilter, hwTypesWithData, setActiveHwTypes]);

  const toggleHwType = useCallback(
    (hw: string) => {
      toggleHwRaw(hw, hwTypesWithData);
      setActivePresetId(null);
    },
    [toggleHwRaw, hwTypesWithData],
  );

  const removeHwType = useCallback(
    (hw: string) => {
      removeHwRaw(hw);
      setActivePresetId(null);
    },
    [removeHwRaw],
  );

  const allDateIds = useMemo(() => {
    const dates: string[] = [];
    if (selectedDateRange.startDate && selectedDateRange.endDate) {
      dates.push(selectedDateRange.startDate, selectedDateRange.endDate);
    }
    dates.push(...selectedDates);
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
  const selectAllHwTypes = useCallback(
    () => selectAllHwRaw(hwTypesWithData),
    [selectAllHwRaw, hwTypesWithData],
  );
  const selectAllActiveDates = useCallback(
    () => selectAllDatesRaw(allDateIds),
    [selectAllDatesRaw, allDateIds],
  );

  // ── Side effects ──────────────────────────────────────────────────────────

  // Reset legend HW toggles to "all enabled" when model, sequence, or precision changes.
  // Use a stable string key for precisions so array reference changes don't trigger a reset.
  // Skip the reset when a preset hw filter is pending — the fallback effect below handles it.
  const precisionsKey = effectivePrecisions.join(',');
  useEffect(() => {
    if (pendingHwFilterRef.current) return;
    if (hwTypesWithData.size > 0) setActiveHwTypes(hwTypesWithData);
  }, [selectedModel, effectiveSequence, precisionsKey]); // eslint-disable-line react-hooks/exhaustive-deps -- precisionsKey is a stable proxy for effectivePrecisions

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
    if (selectedYAxisMetric !== 'y_costUser') setUserCosts((prev) => (prev !== null ? null : prev));
    if (selectedYAxisMetric !== 'y_powerUser')
      setUserPowers((prev) => (prev !== null ? null : prev));
  }, [selectedModel, effectiveSequence, effectivePrecisions, selectedYAxisMetric]);

  const modelPrefixes = useMemo(
    () =>
      Object.entries(MODEL_PREFIX_MAPPING)
        .filter(([, model]) => model === selectedModel)
        .map(([prefix]) => prefix),
    [selectedModel],
  );

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
      const gpus = [...activeHwTypes].sort();
      track('inference_gpu_selection_settled', {
        gpus,
        gpu_count: gpus.length,
        model: selectedModel,
        sequence: effectiveSequence,
        preset_id: activePresetId,
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [activeHwTypes]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only re-fire on GPU set changes

  // Interactivity / E2E chart — tracks activeDates (date+gpu pairs)
  const e2eTrackMounted = useRef(false);
  useEffect(() => {
    if (!e2eTrackMounted.current) {
      e2eTrackMounted.current = true;
      return;
    }
    if (activeDates.size === 0) return;
    const timer = setTimeout(() => {
      const pairs = [...activeDates].sort();
      track('interactivity_selection_settled', {
        date_gpu_pairs: pairs,
        pair_count: pairs.length,
        gpus: [...new Set(pairs.map((p) => p.split('_').slice(1).join('_')))].sort(),
        model: selectedModel,
        sequence: effectiveSequence,
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [activeDates]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only re-fire on date selection changes

  // ── URL sync ──────────────────────────────────────────────────────────────

  useUrlStateSync(
    {
      i_metric: selectedYAxisMetric,
      i_gpus: selectedGPUs.join(','),
      i_dates: selectedDates.join(','),
      i_dstart: selectedDateRange.startDate,
      i_dend: selectedDateRange.endDate,
      i_optimal: hideNonOptimal ? '' : '0',
      i_nolabel: hidePointLabels ? '1' : '',
      i_hc: highContrast ? '1' : '',
      i_log: logScale ? '1' : '',
      i_xmetric: selectedXAxisMetric || '',
      i_e2e_xmetric: selectedE2eXAxisMetric || '',
      i_scale: scaleType,
      i_legend: isLegendExpanded ? '' : '0',
      i_advlabel: useAdvancedLabels ? '1' : '',
      i_gradlabel: showGradientLabels ? '1' : '',
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
      hidePointLabels,
      highContrast,
      logScale,
      isLegendExpanded,
      useAdvancedLabels,
      showGradientLabels,
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
    const last = dateRangeAvailableDates[dateRangeAvailableDates.length - 1];
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
      setActivePresetId(preset.id);
      setHighContrast(false);
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
      colorShuffleSeed,
      shuffleColors,
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
      trackedConfigs,
      addTrackedConfig,
      removeTrackedConfig,
      clearTrackedConfigs,
      setHwFilter: setPendingHwFilter,
      activePresetId,
      setActivePresetId,
      presetGuardRef,
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
      colorShuffleSeed,
      logScale,
      isLegendExpanded,
      useAdvancedLabels,
      showGradientLabels,
      userCosts,
      userPowers,
      trackedConfigs,
      addTrackedConfig,
      removeTrackedConfig,
      clearTrackedConfigs,
      activePresetId,
    ],
  );

  return (
    <InferenceContext.Provider value={value}>
      {children}
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
  const context = useContext(InferenceContext);
  if (context === undefined) {
    throw new Error('useInference must be used within an InferenceProvider');
  }
  return context;
}
