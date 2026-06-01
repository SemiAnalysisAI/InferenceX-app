import type { AvailableModelSequence } from '@/components/unofficial-run-provider';
import type { Model, Sequence } from '@/lib/data-mappings';

export interface AutoSwitchDecision {
  /** New value the caller should write into the dedupe ref. */
  nextKey: string;
  /** Model to switch to, or null when no switch is needed. */
  modelToSet: Model | null;
}

export interface AutoAddPrecisionDecision {
  /** New value the caller should write into the dedupe ref. */
  nextKey: string;
  /**
   * Precision the caller should add to the user's `selectedPrecisions` set,
   * or null when no addition is needed. Always a single key picked
   * deterministically from the run's precisions.
   */
  precisionToAdd: string | null;
}

/**
 * Pure decision helper for the unofficial-run auto-switch effect in
 * `GlobalFilterContext`. Given the unofficial run's available models, the URL
 * `g_model` param, the currently selected model, and the previous dedupe key,
 * returns whether to swap `selectedModel` and what the new dedupe key should be.
 *
 * - When the overlay set is empty, the dedupe key is reset so the next load
 *   re-arms the effect.
 * - When the URL pinned `g_model` explicitly, no switch fires (respect intent).
 * - Otherwise the dedupe key is the sorted unique list of overlay models — the
 *   sequence dimension is intentionally excluded so a sequence-only delta does
 *   not invalidate a manual model pick the user made earlier.
 * - The first model is taken from a sorted unique list to keep the choice
 *   deterministic across renders (insertion order from `Object.keys` is not
 *   guaranteed for multi-model runs).
 */
export function computeAutoSwitchDecision(
  unofficialAvailable: AvailableModelSequence[],
  urlModel: string | undefined,
  selectedModel: Model,
  lastKey: string,
): AutoSwitchDecision {
  if (unofficialAvailable.length === 0) {
    return { nextKey: '', modelToSet: null };
  }
  if (urlModel) {
    return { nextKey: lastKey, modelToSet: null };
  }
  const sortedModels = [...new Set(unofficialAvailable.map((a) => a.model))].toSorted();
  const key = sortedModels.join(',');
  if (lastKey === key) {
    return { nextKey: lastKey, modelToSet: null };
  }
  if (sortedModels.includes(selectedModel)) {
    return { nextKey: key, modelToSet: null };
  }
  return { nextKey: key, modelToSet: sortedModels[0] };
}

/**
 * Pure decision helper for auto-adding an unofficial-run precision into the
 * user's `selectedPrecisions` set. Companion to `computeAutoSwitchDecision` —
 * model auto-switch handles the case where the run's model differs from the
 * current selection, this handles the case where the run's *precision* for
 * the current (model, sequence) is not in the user's filter.
 *
 * Without this, navigating to `?unofficialrun=<id>` for a run whose precision
 * is outside the default (`fp4`) leaves the overlay invisible: `ScatterGraph`
 * filters overlay points by `selectedPrecisions`, so an fp8-only ATOM/MTP
 * run renders no points despite the data being loaded.
 *
 * Behavior:
 * - Empty overlay set → reset the dedupe key so a subsequent load re-arms.
 * - `urlPrec` pinned (user pinned `i_prec=...` in the URL) → no-op; respect
 *   intent. The key is *not* advanced so a later URL clear can still re-fire.
 * - If the run has no precisions for the current (model, sequence) → no-op
 *   (the user has navigated to a model/seq the run doesn't cover; nothing
 *   to add).
 * - If `selectedPrecisions` already intersects the run's precisions → no-op
 *   but advance the dedupe key so we don't keep re-evaluating.
 * - Otherwise: return the alphabetically-first run precision so the caller
 *   can merge it into `selectedPrecisions`. Picked from a sorted list to
 *   stay deterministic across insertion orders.
 *
 * The dedupe key includes model, sequence, and the sorted set of run
 * precisions so a manual change to any of those re-evaluates the decision,
 * while incidental re-renders (e.g. unrelated state changes) do not.
 */
export function computeAutoAddPrecisionDecision(
  unofficialAvailable: AvailableModelSequence[],
  urlPrec: string | undefined,
  selectedPrecisions: readonly string[],
  selectedModel: Model,
  effectiveSequence: Sequence,
  lastKey: string,
): AutoAddPrecisionDecision {
  if (unofficialAvailable.length === 0) {
    return { nextKey: '', precisionToAdd: null };
  }
  if (urlPrec) {
    return { nextKey: lastKey, precisionToAdd: null };
  }
  const runPrecisions = [
    ...new Set(
      unofficialAvailable
        .filter((a) => a.model === selectedModel && a.sequence === effectiveSequence)
        .flatMap((a) => a.precisions),
    ),
  ].toSorted();
  if (runPrecisions.length === 0) {
    return { nextKey: lastKey, precisionToAdd: null };
  }
  const key = `${selectedModel}|${effectiveSequence}|${runPrecisions.join(',')}`;
  if (lastKey === key) {
    return { nextKey: lastKey, precisionToAdd: null };
  }
  if (selectedPrecisions.some((p) => runPrecisions.includes(p))) {
    return { nextKey: key, precisionToAdd: null };
  }
  return { nextKey: key, precisionToAdd: runPrecisions[0] };
}
