'use client';

import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { matchesPresetHwFilter } from '@/components/favorites/favorite-presets';
import { useChartToggleSet, useChartDataFilter } from '@/hooks/useChartContext';
import { hasMtpEngineExclusion } from '@/lib/data-mappings';
import { clearAllMtpFamilies, effectiveLegendItems, resolveMtpToggle } from '@/lib/mtp-exclusion';
import type { MtpEngineConflictDetail } from '@/components/mtp-engine-conflict-toast';

import type { InferenceData, RenderableGraph } from '@/components/inference/types';

/**
 * Legend hardware-toggle + date-toggle cluster for the inference chart.
 *
 * This is the most entangled part of InferenceProvider: it owns the active HW
 * and date toggle sets, derives `hwTypesWithData`, intercepts resets to apply a
 * pending preset hw filter atomically, restores the URL `i_active` selection,
 * auto-resets the legend on model/sequence/precision change (with MTP
 * cross-engine exclusion), prunes stale selected GPUs, and resets date state.
 *
 * Extracted verbatim from InferenceProvider as a single unit — every memo,
 * callback, effect, and render-time state-adjustment block keeps its original
 * order and dependency arrays. State that is shared with the rest of the
 * provider (pendingHwFilter, pendingActiveHwTypes, presetHwFilterRef,
 * setActivePresetId, setMtpConflict) is owned by the provider and passed in;
 * nothing here is duplicated.
 *
 * Overlay note: `hwTypesWithData` / `activeHwTypes` returned here gate both the
 * official rendering path and unofficial-run overlay visibility downstream, so
 * the toggle semantics must remain byte-for-byte identical.
 */
export function useLegendHwFilters(params: {
  graphs: RenderableGraph[];
  effectivePrecisions: string[];
  selectedModel: string;
  effectiveSequence: string;
  selectedGPUs: string[];
  setSelectedGPUs: (v: string[]) => void;
  selectedDates: string[];
  setSelectedDates: (v: string[]) => void;
  selectedDateRange: { startDate: string; endDate: string };
  setSelectedDateRange: (v: { startDate: string; endDate: string }) => void;
  availableGPUs: { value: string; label: string }[];
  dateRangeAvailableDates: string[];
  setUserCosts: (v: Record<string, number | undefined> | null) => void;
  pendingHwFilter: string[] | null;
  setPendingHwFilter: (v: string[] | null) => void;
  pendingActiveHwTypes: Set<string> | null;
  setPendingActiveHwTypes: Dispatch<SetStateAction<Set<string> | null>>;
  presetHwFilterRef: RefObject<string[] | null>;
  setActivePresetId: Dispatch<SetStateAction<string | null>>;
  setMtpConflict: (v: MtpEngineConflictDetail | null) => void;
}) {
  const {
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
  } = params;

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
  // matchesPresetHwFilter only consults the model to gate the bare-prefix MTP
  // skip (mtpEngineExclusion models), and we want the current value at call time.
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

  // Direct fallback: apply pendingHwFilter once hwTypesWithData is populated but
  // useChartDataFilter didn't fire (e.g. re-selecting the same preset). Done during
  // render — it converges because applying the filter clears the pending flag.
  if (pendingHwFilter && hwTypesWithData.size > 0) {
    const filtered = new Set(
      [...hwTypesWithData].filter((k) => matchesPresetHwFilter(k, pendingHwFilter, selectedModel)),
    );
    if (filtered.size > 0) {
      setActiveHwTypes(filtered);
      setPendingHwFilter(null);
    }
  }

  const mtpExclusion = hasMtpEngineExclusion(selectedModel);
  const toggleHwType = useCallback(
    (hw: string) => {
      // Under MTP exclusion, hide MTP keys from inactive families when
      // computing the toggle "universe". This makes the default-deselected
      // state (DSv4 on first load) count as "all selected", so clicking a
      // legend entry solos it instead of just removing it.
      const toggleUniverse = mtpExclusion
        ? effectiveLegendItems(hwTypesWithData, activeHwTypes)
        : hwTypesWithData;
      if (mtpExclusion) {
        const decision = resolveMtpToggle(activeHwTypes, hw, toggleUniverse);
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
    [toggleHwRaw, hwTypesWithData, mtpExclusion, activeHwTypes, setActiveHwTypes],
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
  const selectAllHwTypes = useCallback(() => {
    if (mtpExclusion) {
      const { result, droppedFamilies } = clearAllMtpFamilies(hwTypesWithData);
      setActiveHwTypes(result);
      if (droppedFamilies.length > 0) {
        setMtpConflict({ kind: 'cleared', families: droppedFamilies });
      }
      return;
    }
    selectAllHwRaw(hwTypesWithData);
  }, [selectAllHwRaw, hwTypesWithData, mtpExclusion, setActiveHwTypes]);
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
    if (mtpExclusion) {
      const cleared = clearAllMtpFamilies(restored);
      restored = cleared.result;
      if (cleared.droppedFamilies.length > 0) {
        setMtpConflict({ kind: 'cleared', families: cleared.droppedFamilies });
      }
    }
    setActiveHwTypes(restored);
    lastHwResetKeyRef.current = `${selectedModel}|${effectiveSequence}|${precisionsKey}`;
    setPendingActiveHwTypes(null);
  }, [
    pendingActiveHwTypes,
    hwTypesWithData,
    mtpExclusion,
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
        // matcher already excludes _mtp under bare prefixes for
        // mtpEngineExclusion models, so we don't fall through to
        // clearAllMtpFamilies (which would fire the toast). The legend
        // toggle guard still blocks adding a second engine family later.
        setActiveHwTypes(filtered);
        return;
      }
    }
    if (mtpExclusion) {
      // When multiple engine families' MTP have data, disable them all by
      // default and surface a toast. The user has to opt in to one engine's
      // MTP explicitly — never multiple at once.
      const { result, droppedFamilies } = clearAllMtpFamilies(hwTypesWithData);
      setActiveHwTypes(result);
      if (droppedFamilies.length > 0) {
        setMtpConflict({ kind: 'cleared', families: droppedFamilies });
      }
      return;
    }
    setActiveHwTypes(hwTypesWithData);
  }, [
    selectedModel,
    effectiveSequence,
    precisionsKey,
    hwTypesWithData,
    mtpExclusion,
    pendingActiveHwTypes,
  ]);

  // Remove selected GPUs that no longer have data for current filters. Done
  // during render with a prev-value comparison instead of an effect so the prune
  // commits in the same render. `availableGPUs` is memoized, so its identity only
  // changes when the available set changes.
  const [prevAvailableGPUs, setPrevAvailableGPUs] = useState(availableGPUs);
  if (availableGPUs !== prevAvailableGPUs) {
    setPrevAvailableGPUs(availableGPUs);
    if (selectedGPUs.length > 0 && availableGPUs.length > 0) {
      const validKeys = new Set(availableGPUs.map((g) => g.value));
      const valid = selectedGPUs.filter((g) => validKeys.has(g));
      if (valid.length !== selectedGPUs.length) setSelectedGPUs(valid);
    }
  }

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

  // Reset the active (toggleable) date set whenever the available date ids
  // change. Done during render with a prev-value comparison instead of an effect
  // so the reset commits in the same render. `allDateIds` is memoized, so its
  // identity only changes when the underlying date set changes.
  const [prevAllDateIds, setPrevAllDateIds] = useState(allDateIds);
  if (allDateIds !== prevAllDateIds) {
    setPrevAllDateIds(allDateIds);
    setActiveDates(allDateIds);
  }

  return {
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
  };
}
