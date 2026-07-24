import { useCallback, useState } from 'react';

import { computeToggle } from '@/lib/toggle-set';

export { computeToggle };

/**
 * Hook for managing a togglable set with "click to solo, click again to restore all" behavior.
 */
export function useTogglableSet() {
  const [activeSet, setActiveSet] = useState<Set<string>>(new Set());

  const toggle = useCallback((item: string, allItems: Set<string>) => {
    setActiveSet((prev) => computeToggle(prev, item, allItems));
  }, []);

  const selectAll = useCallback((allItems: Set<string>) => {
    setActiveSet(allItems);
  }, []);

  const remove = useCallback((item: string) => {
    setActiveSet((prev) => {
      const next = new Set(prev);
      next.delete(item);
      return next;
    });
  }, []);

  return { activeSet, setActiveSet, toggle, selectAll, remove };
}
