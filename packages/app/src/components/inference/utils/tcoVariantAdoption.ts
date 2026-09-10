import { stripTcoVariantSuffix, tcoVariantForHwKey } from '@semianalysisai/inferencex-constants';

/**
 * Decides which fixed-rate TCO variant keys should join the legend selection.
 *
 * Variant curves only exist while a re-priced metric is selected, and
 * `reconcileActiveSet` intersects without ever re-widening, so a variant that
 * appears would otherwise sit in the legend permanently inactive. A variant is
 * adopted once, when it first becomes selectable and its source curve is
 * showing; a later deliberate deselect then sticks.
 *
 * Pure so the ordering rules can be tested directly: this runs inside a
 * functional state updater, because the adoption effect can land in the same
 * commit as the `i_active` restore and the reconcile pass, and a snapshot read
 * outside the updater would clobber whichever of those landed first.
 *
 * @param active     the live selection (the updater's `prev`)
 * @param candidates selectable variant keys not yet adopted
 * @returns the keys to add, and the keys to mark adopted. An empty `adopt`
 *   leaves the candidates un-adopted so a later render can retry — which is
 *   what makes a share link work when the selection has not been restored yet.
 */
export function planTcoVariantAdoption(
  active: ReadonlySet<string>,
  candidates: readonly string[],
): { add: string[]; adopt: string[] } {
  // An empty selection means nothing has been established yet (first paint, or
  // a pending `i_active` restore). Deciding now would mark every variant
  // adopted against a selection that does not exist, and it would never retry.
  if (active.size === 0 || candidates.length === 0) return { add: [], adopt: [] };

  const add: string[] = [];
  const adopt: string[] = [];
  for (const key of candidates) {
    if (!tcoVariantForHwKey(key)) continue;
    adopt.push(key);
    if (active.has(stripTcoVariantSuffix(key)) && !active.has(key)) add.push(key);
  }
  return { add, adopt };
}
