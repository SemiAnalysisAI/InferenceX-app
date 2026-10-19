import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTogglableSet } from './useTogglableSet';
import { useUrlState } from './useUrlState';

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
  scopeChanged: boolean;
  settled: boolean;
}

export interface AvailableSelectionResult<T> {
  selection: Set<T>;
  consumedPending: boolean;
}

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

interface UseChartStateConfig {
  urlPrefix: string;
  defaultHighContrast?: boolean;
}

export function useChartUIState(config: UseChartStateConfig) {
  const { urlPrefix, defaultHighContrast = false } = config;
  const { getUrlParam } = useUrlState();

  const hcParam = `${urlPrefix}hc` as any;
  const legendParam = `${urlPrefix}legend` as any;

  const [highContrast, setHighContrast] = useState(defaultHighContrast);
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const hcVal = getUrlParam(hcParam);
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

export function useChartToggleSet<T extends string = string>() {
  const {
    activeSet,
    setActiveSet,
    toggle: toggleRaw,
    selectAll: selectAllRaw,
    remove: removeRaw,
  } = useTogglableSet();

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

export function useChartDataFilter<TData, TKey extends string>(
  data: TData[],
  setActiveSet: any,
  extractKey: (item: TData) => TKey,
  options?: {
    resetOnChange?: boolean;
    skipEmpty?: boolean;
  },
) {
  const { resetOnChange = true, skipEmpty = true } = options || {};

  const itemsWithData = useMemo(() => {
    const itemSet = new Set(data.map(extractKey));
    return itemSet;
  }, [data, extractKey]);

  const itemsWithDataKey = useMemo(() => [...itemsWithData].toSorted().join(','), [itemsWithData]);

  const prevItemsKeyRef = useRef<string>('');

  useEffect(() => {
    if (skipEmpty && itemsWithData.size === 0) {
      return;
    }

    if (prevItemsKeyRef.current === itemsWithDataKey) {
      return;
    }

    prevItemsKeyRef.current = itemsWithDataKey;

    setActiveSet((prev: Set<TKey>) => reconcileActiveSet(prev, itemsWithData, resetOnChange));
  }, [itemsWithDataKey, itemsWithData, setActiveSet, resetOnChange, skipEmpty]);

  return itemsWithData;
}
