/**
 * Pure toggle state transition.
 *
 * - If all items are active and one is toggled, only that item remains active (solo).
 * - If only one item is active and it's toggled, all items become active (restore all).
 * - Otherwise, the item is simply added or removed from the active set.
 *
 * Kept free of React so server-only modules (`exclusion.ts`, and through it the
 * overview data layer) can reuse it without pulling client hooks into a Server
 * Component graph.
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
    }
    // Remove the clicked item
    const next = new Set(prev);
    next.delete(item);
    return next;
  }
  // Add the clicked item
  const next = new Set([...prev, item]);
  return next;
}
