import { useRef } from 'react';

/**
 * Returns the previous value as long as the new one is `isEqual` to it,
 * preserving referential identity across re-renders.
 *
 * Use for derived config objects that are recomputed every render but rarely
 * change by value (e.g. chart scale domains recomputed from visible points on
 * every legend toggle). Downstream `useMemo`/`useEffect` hooks keyed on the
 * object then only fire when the value actually changed.
 *
 * Same ref-stability technique as the sorted-hardware-config check in
 * useChartData (see docs/pitfalls.md "Hardware Config Ref Stability").
 */
export function useStableValue<T>(value: T, isEqual: (prev: T, next: T) => boolean): T {
  const ref = useRef(value);
  if (ref.current !== value && !isEqual(ref.current, value)) {
    ref.current = value;
  }
  return ref.current;
}
