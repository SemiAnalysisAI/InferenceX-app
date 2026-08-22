import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTogglableSet } from './useTogglableSet';
import { useUrlState } from './useUrlState';

/**
 * Reconcile a user's active selection with the current available items.
 * Returns the previous set unchanged (same reference) when nothing was removed
 * to avoid unnecessary re-renders.
 */
export function reconcileActiveSet<T>(
  prev: Set<T>,
  itemsWithData: Set<T>,
  resetOnChange: boolean,
): Set<T> {
  if (prev.size === 0) return itemsWithData;

  let removedCount = 0;
  for (const item of prev) {
    if (!itemsWithData.has(item)) removedCount++;
  }

  if (removedCount === 0) return prev;

  const filtered = new Set([...prev].filter((item: T) => itemsWithData.has(item)));

  if (filtered.size === 0 && resetOnChange) return itemsWithData;

  return filtered;
}

export interface AvailableSelectionInput<T> {
  active: Set<T>;
  available: Set<T>;
  pending?: Set<T> | null;
  /** A user-visible scope changed (model, date range, benchmark, etc.). */
  scopeChanged: boolean;
  /** False while an empty available set may still be a loading transition. */
  settled: boolean;
}

export interface AvailableSelectionResult<T> {
  selection: Set<T>;
  consumedPending: boolean;
}

/**
 * Shared policy for legend selections backed by asynchronously available data.
 *
 * Pending URL intent wins once data settles. A real scope transition starts
 * fully enabled, while updates inside the same scope only prune stale keys.
 * An explicitly empty selection is preserved inside a scope rather than being
 * mistaken for an uninitialized set.
 */
export function resolveAvailableSelection<T>({
  active,
  available,
  pending,
  scopeChanged,
  settled,
}: AvailableSelectionInput<T>): AvailableSelectionResult<T> {
  if (!settled) return { selection: active, consumedPending: false };
  if (available.size === 0) {
    return {
      selection: active.size === 0 ? active : new Set(),
      consumedPending: pending !== null && pending !== undefined,
    };
  }

  if (pending) {
    const restored = new Set([...pending].filter((item) => available.has(item)));
    return {
      selection: restored.size > 0 ? restored : available,
      consumedPending: true,
    };
  }

  if (scopeChanged) return { selection: available, consumedPending: false };
  if (active.size === 0) return { selection: active, consumedPending: false };
  return {
    selection: reconcileActiveSet(active, available, false),
    consumedPending: false,
  };
}

/**
 * Common chart context state and logic shared across all chart types.
 * Extracts duplicated patterns from InferenceChartContext, ReliabilityChartContext,
 * and EvaluationChartContext.
 */

interface UseChartStateConfig {
  /** URL parameter prefix (e.g., 'i_' for inference, 'r_' for reliability, 'e_' for evaluation) */
  urlPrefix: string;
  /**
   * Initial high-contrast value when the URL has no `<prefix>hc` param.
   * Defaults to false; the inference chart opts in to true. A `<prefix>hc=0`
   * URL param overrides it back off.
   */
  defaultHighContrast?: boolean;
}

/**
 * Manages common chart UI state (high contrast, legend expansion) with URL sync.
 * Includes mobile-specific legend collapse behavior.
 */
export function useChartUIState(config: UseChartStateConfig) {
  const { urlPrefix, defaultHighContrast = false } = config;
  const { getUrlParam } = useUrlState();

  const hcParam = `${urlPrefix}hc` as any;
  const legendParam = `${urlPrefix}legend` as any;

  // Initialize with safe defaults that match SSR output to avoid hydration mismatches.
  // URL-param values are applied in a mount effect so the state is only set client-side.
  const [highContrast, setHighContrast] = useState(defaultHighContrast);
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const hcVal = getUrlParam(hcParam);
    // Respect both overrides so the toggle round-trips regardless of the default.
    if (hcVal === '1') setHighContrast(true);
    else if (hcVal === '0') setHighContrast(false);
    const legendVal = getUrlParam(legendParam);
    if (legendVal === '0') setIsLegendExpanded(false);
  }, [getUrlParam, hcParam, legendParam]);

  return {
    highContrast,
    setHighContrast,
    isLegendExpanded,
    setIsLegendExpanded,
  };
}

/**
 * Manages togglable set state (e.g., enabled models, enabled hardware)
 * with automatic initialization and callbacks.
 */
export function useChartToggleSet<T extends string = string>() {
  const {
    activeSet,
    setActiveSet,
    toggle: toggleRaw,
    selectAll: selectAllRaw,
    remove: removeRaw,
  } = useTogglableSet();

  // memoize callbacks to prevent unnecessary re-renders
  const toggle = useCallback(
    (item: T, availableItems: Set<T>) => toggleRaw(item, availableItems),
    [toggleRaw],
  );

  const selectAll = useCallback(
    (availableItems: Set<T>) => selectAllRaw(availableItems),
    [selectAllRaw],
  );

  const remove = useCallback((item: T) => removeRaw(item), [removeRaw]);

  return {
    activeSet: activeSet as Set<T>,
    setActiveSet: setActiveSet as (set: Set<T>) => void,
    toggle,
    selectAll,
    remove,
  };
}

/**
 * Syncs state to URL parameters, skipping the initial render to avoid
 * overwriting URL-provided values.
 */
export function useUrlStateSync(
  params: Record<string, string | number | boolean | undefined | null>,
  deps: any[],
) {
  const { setUrlParams } = useUrlState();
  const isMountedRef = useRef(false);

  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    setUrlParams(params);
  }, deps);
}

/**
 * Manages data filtering with memoized available items set.
 * Automatically updates active items when available items change.
 */
export function useChartDataFilter<TData, TKey extends string>(
  data: TData[],
  setActiveSet: any, // accept any to allow functional updates
  extractKey: (item: TData) => TKey,
  options?: {
    /** When available items change completely, reset to all available */
    resetOnChange?: boolean;
    /** Skip empty data (during loading transitions) */
    skipEmpty?: boolean;
  },
) {
  const { resetOnChange = true, skipEmpty = true } = options || {};

  // memoize the set of items that have data points
  const itemsWithData = useMemo(() => {
    const itemSet = new Set(data.map(extractKey));
    return itemSet;
  }, [data, extractKey]);

  // create stable string representation for comparison
  const itemsWithDataKey = useMemo(() => [...itemsWithData].toSorted().join(','), [itemsWithData]);

  // track previous key to detect actual changes
  const prevItemsKeyRef = useRef<string>('');

  // update active items when available items change
  useEffect(() => {
    // skip during loading transitions when data is temporarily empty
    if (skipEmpty && itemsWithData.size === 0) {
      return;
    }

    // skip if the key hasn't actually changed
    if (prevItemsKeyRef.current === itemsWithDataKey) {
      return;
    }

    prevItemsKeyRef.current = itemsWithDataKey;

    setActiveSet((prev: Set<TKey>) => reconcileActiveSet(prev, itemsWithData, resetOnChange));
  }, [itemsWithDataKey, itemsWithData, setActiveSet, resetOnChange, skipEmpty]);

  return itemsWithData;
}

/**
 * Creates a memoized filtered dataset based on active items.
 */
export function useFilteredData<TData, TKey extends string>(
  data: TData[],
  activeSet: Set<TKey>,
  extractKey: (item: TData) => TKey,
) {
  return useMemo(
    () => data.filter((item) => activeSet.has(extractKey(item))),
    [data, activeSet, extractKey],
  );
}
