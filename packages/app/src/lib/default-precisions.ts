import { Precision, PRECISION_OPTIONS } from './data-mappings';

/**
 * Default precision selection.
 *
 * Historically every model defaulted to FP4-only, which left FP8-heavy models
 * (e.g. MiniMax M3, whose FP4 lives on a single GPU while FP8 spans seven)
 * showing a near-empty chart on first load. Instead we default to whichever
 * precision has the most data, with a guard against committing to a sparse one.
 *
 * "Curves" = distinct (hardware, framework, spec_method, disagg) series that
 * would render for a precision — i.e. how many lines the chart draws.
 */

/**
 * Curve threshold for picking a sole default. We only commit to a single
 * precision when *every* available precision clears it; if any is below (e.g.
 * MiniMax M3's lone FP4 curve next to its FP8 fleet) we show all of them so the
 * sparse precision isn't silently dropped (per #470 discussion).
 */
export const MIN_SOLE_DEFAULT_CURVES = 4;

interface CurveRow {
  precision: string;
  hardware: string;
  framework: string;
  spec_method: string;
  disagg: boolean;
}

/** Count distinct curves per precision from already-filtered rows (model + sequence). */
export function countCurvesByPrecision(rows: CurveRow[]): Record<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const r of rows) {
    let curves = seen.get(r.precision);
    if (!curves) {
      curves = new Set();
      seen.set(r.precision, curves);
    }
    curves.add(`${r.hardware}|${r.framework}|${r.spec_method}|${r.disagg}`);
  }
  const counts: Record<string, number> = {};
  for (const [precision, curves] of seen) counts[precision] = curves.size;
  return counts;
}

/**
 * Tie-break rank (lower sorts first): FP4 wins ties so models that previously
 * defaulted to FP4 are unchanged, then canonical enum order, unknowns last.
 */
function precisionRank(p: string): number {
  if (p === Precision.FP4) return -1;
  const i = (PRECISION_OPTIONS as readonly string[]).indexOf(p);
  return i === -1 ? PRECISION_OPTIONS.length : i;
}

function byRank(a: string, b: string): number {
  return precisionRank(a) - precisionRank(b);
}

/**
 * Pick the default precision selection from per-precision curve counts:
 * - the single densest precision when *every* available precision has
 *   >= `minCurves` curves;
 * - otherwise every precision present, so a sparse precision (e.g. M3's lone FP4
 *   alongside its dense FP8) is shown rather than silently dropped.
 * Returns [] when there are no precisions.
 */
export function pickDefaultPrecisions(
  counts: Record<string, number>,
  minCurves = MIN_SOLE_DEFAULT_CURVES,
): string[] {
  const precisions = Object.keys(counts);
  if (precisions.length === 0) return [];
  const someSparse = precisions.some((p) => counts[p] < minCurves);
  if (someSparse) return precisions.toSorted(byRank);
  const densest = precisions.reduce((best, p) => {
    if (counts[p] > counts[best]) return p;
    if (counts[p] === counts[best] && precisionRank(p) < precisionRank(best)) return p;
    return best;
  });
  return [densest];
}

/**
 * Resolve the effective precision selection for the current model + sequence.
 *
 * - When the user has explicitly chosen a precision (URL `i_prec`, a preset, or
 *   a manual toggle), honor it — intersected with what's available, falling back
 *   to the first available precision (preserves prior behavior).
 * - Otherwise auto-pick the densest precision (see `pickDefaultPrecisions`) and
 *   union in any precisions present in a loaded unofficial run, so an overlay the
 *   user explicitly opened is visible by default instead of hidden behind FP4.
 */
export function resolveEffectivePrecisions(opts: {
  selectedPrecisions: string[];
  availablePrecisions: string[];
  curveCounts: Record<string, number>;
  unofficialPrecisions?: string[];
  explicit: boolean;
  minCurves?: number;
}): string[] {
  const { selectedPrecisions, availablePrecisions, curveCounts, explicit } = opts;
  const available = new Set(availablePrecisions);

  if (explicit) {
    const valid = selectedPrecisions.filter((p) => available.has(p));
    if (valid.length > 0) return valid;
    return availablePrecisions.length > 0 ? [availablePrecisions[0]] : selectedPrecisions;
  }

  const base = pickDefaultPrecisions(curveCounts, opts.minCurves);
  const merged = [...new Set([...base, ...(opts.unofficialPrecisions ?? [])])]
    .filter((p) => available.has(p))
    .toSorted(byRank);
  if (merged.length > 0) return merged;
  return availablePrecisions.length > 0 ? [availablePrecisions[0]] : selectedPrecisions;
}
