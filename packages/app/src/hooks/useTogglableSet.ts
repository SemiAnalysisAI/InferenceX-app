import { useCallback, useState } from 'react';

/**
 * Pure toggle state transition.
 *
 * - If all items are active and one is toggled, only that item remains active (solo).
 * - If only one item is active and it's toggled, all items become active (restore all).
 * - Otherwise, the item is simply added or removed from the active set.
 */
export function computeToggle(prev: Set<string>, item: string, allItems: Set<string>): Set<string> {
  const allAreActive = prev.size === allItems.size;
  const isActive = prev.has(item);

  if (isActive) {
    if (allAreActive) {
      // Solo: only keep the clicked item
      return new Set([item]);
    } else if (prev.size === 1) {
      // Restore all: re-enable everything
      return allItems;
    } else {
      // Remove the clicked item
      const next = new Set(prev);
      next.delete(item);
      return next;
    }
  } else {
    // Add the clicked item
    const next = new Set(prev);
    next.add(item);
    return next;
  }
}

/**
 * Hook for managing a toggleable set with "click to solo, click again to restore all" behavior.
 */
export function useTogglableSet() {
  const [activeSet, setActiveSet] = useState<Set<string>>(new Set());

  const toggle = useCallback((item: string, allItems: Set<string>) => {
    setActiveSet((prev) => computeToggle(prev, item, allItems));
  }, []);

  const selectAll = useCallback((allItems: Set<string>) => {
    setActiveSet(allItems);
  }, []);

  return { activeSet, setActiveSet, toggle, selectAll };
}
