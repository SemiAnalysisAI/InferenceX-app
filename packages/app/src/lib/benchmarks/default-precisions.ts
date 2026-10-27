import { Precision, PRECISION_OPTIONS } from '../catalog/data-mappings';

/**
 * Display order for precisions: FP4 first, then the `PRECISION_OPTIONS` order,
 * unknown keys last. Shared by every consumer of the default selection so the
 * dashboard, calculator and read-only APIs list precisions identically.
 */
function precisionRank(p: string): number {
  if (p === Precision.FP4) return -1;
  const i = (PRECISION_OPTIONS as readonly string[]).indexOf(p);
  return i === -1 ? PRECISION_OPTIONS.length : i;
}

export function sortPrecisions(precisions: Iterable<string>): string[] {
  return [...new Set(precisions)].toSorted((a, b) => precisionRank(a) - precisionRank(b));
}

/**
 * Resolves the precisions a view renders.
 *
 * - Explicit selection (URL `i_prec`, API `precisions=`, or a control change)
 *   is honoured as-is, intersected with what the data carries.
 * - Otherwise every available precision is selected, so each chip is shown at
 *   its best submitted precision instead of the dashboard forcing one pick.
 *   `Optimal Only` / `best=true` then ranks each chip's configs across those
 *   precisions (see `bestSeriesPerSku`).
 */
export function resolveEffectivePrecisions(opts: {
  selectedPrecisions: string[];
  availablePrecisions: string[];
  explicit: boolean;
}): string[] {
  const { selectedPrecisions, availablePrecisions, explicit } = opts;
  const available = new Set(availablePrecisions);

  if (explicit) {
    const valid = selectedPrecisions.filter((p) => available.has(p));
    if (valid.length > 0) return valid;
    return availablePrecisions.length > 0 ? [availablePrecisions[0]] : selectedPrecisions;
  }

  const all = sortPrecisions(availablePrecisions);
  return all.length > 0 ? all : selectedPrecisions;
}
