import type { AvailableModelSequence } from '@/components/unofficial-run-provider';
import { Sequence, type Model } from '@/lib/data-mappings';

export interface AutoSwitchDecision {
  /** New value the caller should write into the dedupe ref. */
  nextKey: string;
  /** Model to switch to, or null when no switch is needed. */
  modelToSet: Model | null;
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

export interface UnofficialOverrideDecision {
  /** New value the caller should write into the dedupe ref. */
  nextKey: string;
  /** Whether the caller should apply the temporary override. */
  shouldOverride: boolean;
}

/**
 * TEMPORARY (this branch only): when an unofficial run loads, override the
 * default sequence to `8K / 256` and the default y-axis metric to "Output
 * Token Throughput per GPU" so the InfiniteBench-style sweeps land on a
 * useful default view. Mirrors the dedupe behavior of
 * {@link computeAutoSwitchDecision} so manual user changes stick once they
 * are URL-synced, and a fresh run-set transition can re-arm the override.
 *
 * - When the overlay set is empty, the dedupe key is reset.
 * - When the URL pinned the corresponding param explicitly, no override
 *   fires (respect intent).
 * - The dedupe key is the sorted unique list of overlay models — same shape
 *   as the auto-switch key — so a sequence-only delta does not invalidate a
 *   manual user pick.
 */
export function computeUnofficialOverrideDecision(
  unofficialAvailable: AvailableModelSequence[],
  urlValue: string | undefined,
  lastKey: string,
): UnofficialOverrideDecision {
  if (unofficialAvailable.length === 0) {
    return { nextKey: '', shouldOverride: false };
  }
  if (urlValue) {
    return { nextKey: lastKey, shouldOverride: false };
  }
  const sortedModels = [...new Set(unofficialAvailable.map((a) => a.model))].toSorted();
  const key = sortedModels.join(',');
  if (lastKey === key) {
    return { nextKey: lastKey, shouldOverride: false };
  }
  return { nextKey: key, shouldOverride: true };
}

/**
 * Pick the sequence shown when an unofficial run loads without an `i_seq`
 * URL pin. Keep this branch's 8K/256 preference when that sequence exists for
 * the model that will be displayed, otherwise fall back to an actual sequence
 * from the run so its points are visible.
 */
export function selectUnofficialDefaultSequence(
  unofficialAvailable: AvailableModelSequence[],
  selectedModel: Model,
  urlModel: string | undefined,
): Sequence | null {
  if (unofficialAvailable.length === 0) return null;

  const sortedModels = [...new Set(unofficialAvailable.map((entry) => entry.model))].toSorted();
  const targetModel =
    urlModel ?? (sortedModels.includes(selectedModel) ? selectedModel : sortedModels[0]);
  const sequences = [
    ...new Set(
      unofficialAvailable
        .filter((entry) => entry.model === targetModel)
        .map((entry) => entry.sequence),
    ),
  ];

  if (sequences.includes(Sequence.EightK_256)) return Sequence.EightK_256;
  return sequences.toSorted()[0] ?? null;
}
