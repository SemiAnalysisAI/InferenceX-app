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

  const filtered = new Set(Array.from(prev).filter((item: T) => itemsWithData.has(item)));

  if (filtered.size === 0 && resetOnChange) return itemsWithData;

  return filtered;
}

/**
 * Common chart context state and logic shared across all chart types.
 * Extracts duplicated patterns from InferenceChartContext, ReliabilityChartContext,
 * and EvaluationChartContext.
 */

interface UseChartStateConfig {
  /** URL parameter prefix (e.g., 'i_' for inference, 'r_' for reliability, 'e_' for evaluation) */
  urlPrefix: string;
}

/**
 * Manages common chart UI state (high contrast, legend expansion) with URL sync.
 * Includes mobile-specific legend collapse behavior.
 */
export function useChartUIState(config: UseChartStateConfig) {
  const { urlPrefix } = config;
  const { getUrlParam } = useUrlState();

  const hcParam = `${urlPrefix}hc` as any;
  const legendParam = `${urlPrefix}legend` as any;

  // Initialize with safe defaults that match SSR output to avoid hydration mismatches.
  // URL-param values are applied in a mount effect so the state is only set client-side.
  const [highContrast, setHighContrast] = useState(false);
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const hcVal = getUrlParam(hcParam);
    if (hcVal === '1') setHighContrast(true);
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
 * Automatically initializes a togglable set when available items change.
 * Prevents unnecessary reinitialization when the set is already populated.
 */
export function useAutoInitializeToggleSet<T>(
  availableItems: T[],
  activeSet: Set<T>,
  setActiveSet: (set: Set<T>) => void,
) {
  useEffect(() => {
    if (availableItems.length > 0 && activeSet.size === 0) {
      setActiveSet(new Set(availableItems));
    }
  }, [availableItems, activeSet.size, setActiveSet]);
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
  const itemsWithDataKey = useMemo(() => {
    return Array.from(itemsWithData).sort().join(',');
  }, [itemsWithData]);

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
  return useMemo(() => {
    return data.filter((item) => activeSet.has(extractKey(item)));
  }, [data, activeSet, extractKey]);
}
