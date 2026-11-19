import { Precision, PRECISION_OPTIONS } from '../catalog/data-mappings';

export const MIN_SOLE_DEFAULT_CURVES = 4;

interface CurveRow {
  precision: string;
  hardware: string;
  framework: string;
  spec_method: string;
  disagg: boolean;
  benchmark_type?: string;
}

export function countCurvesByPrecision(rows: CurveRow[]): Record<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const r of rows) {
    let curves = seen.get(r.precision);
    if (!curves) {
      curves = new Set();
      seen.set(r.precision, curves);
    }
    const specMethod = r.benchmark_type === 'agentic_traces' ? '' : r.spec_method;
    curves.add(`${r.hardware}|${r.framework}|${specMethod}|${r.disagg}`);
  }
  const counts: Record<string, number> = {};
  for (const [precision, curves] of seen) counts[precision] = curves.size;
  return counts;
}

function precisionRank(p: string): number {
  if (p === Precision.FP4) return -1;
  const i = (PRECISION_OPTIONS as readonly string[]).indexOf(p);
  return i === -1 ? PRECISION_OPTIONS.length : i;
}

function byRank(a: string, b: string): number {
  return precisionRank(a) - precisionRank(b);
}

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

export function resolveEffectivePrecisions(opts: {
  selectedPrecisions: string[];
  availablePrecisions: string[];
  curveCounts: Record<string, number>;
  unofficialPrecisions?: string[];
  explicit: boolean;
  minCurves?: number;
  modelDefaultPrecisions?: readonly string[];
}): string[] {
  const { selectedPrecisions, availablePrecisions, curveCounts, explicit } = opts;
  const available = new Set(availablePrecisions);

  if (explicit) {
    const valid = selectedPrecisions.filter((p) => available.has(p));
    if (valid.length > 0) return valid;
    return availablePrecisions.length > 0 ? [availablePrecisions[0]] : selectedPrecisions;
  }

  const modelDefaults = (opts.modelDefaultPrecisions ?? []).filter((p) => available.has(p));
  const base =
    modelDefaults.length > 0 ? modelDefaults : pickDefaultPrecisions(curveCounts, opts.minCurves);
  const merged = [...new Set([...base, ...(opts.unofficialPrecisions ?? [])])]
    .filter((p) => available.has(p))
    .toSorted(byRank);
  if (merged.length > 0) return merged;
  return availablePrecisions.length > 0 ? [availablePrecisions[0]] : selectedPrecisions;
}
