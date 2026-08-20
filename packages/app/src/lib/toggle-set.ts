/**
 * Pure toggle state transition.
 *
 * - Clicking an active item while others are active solos it.
 * - Clicking the only active item restores all.
 * - Clicking an inactive item adds it.
 *
 * Solo used to require EVERY item to be active, which quietly made it
 * unreachable wherever something starts deselected. On the agentic view the
 * engine guard switches SGLang off on load, so a fresh chart never had all
 * items active and the first click on a legend entry removed it instead of
 * isolating it. Individual removal has its own control — the X that appears on
 * a legend row on hover — so the label click is free to always mean "show only
 * this".
 *
 * Kept free of React so server-only modules (`exclusion.ts`, and through it the
 * overview data layer) can reuse it without pulling client hooks into a Server
 * Component graph.
 */
export function computeToggle(prev: Set<string>, item: string, allItems: Set<string>): Set<string> {
  if (prev.has(item)) {
    // Sole survivor -> restore everything, so a second click undoes the solo.
    if (prev.size <= 1) return allItems;
    return new Set([item]);
  }
  return new Set([...prev, item]);
}
