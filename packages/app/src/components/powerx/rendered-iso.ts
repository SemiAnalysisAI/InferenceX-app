import type { InferenceData } from '@/components/inference/types';
import { intersectPathAtX, type PerfRulerPathLike } from '@/lib/d3-chart/layers/perf-ruler';

/** The same dated official/overlay series that owns a rendered roofline. */
export interface RenderedIsoSeries {
  key: string;
  points: readonly InferenceData[];
  overlayIndex?: number;
}

export interface RenderedIsoRow extends RenderedIsoSeries {
  status: 'exact' | 'curve' | 'outside-range' | 'missing' | 'ambiguous';
  value: number | null;
  sources: readonly InferenceData[];
}

export function evaluateRenderedIso(
  series: RenderedIsoSeries,
  target: number,
  path: PerfRulerPathLike | null,
  toPixelX: (x: number) => number,
  fromPixelY: (y: number) => number,
): RenderedIsoRow {
  const unavailable = (status: RenderedIsoRow['status']): RenderedIsoRow => ({
    ...series,
    status,
    value: null,
    sources: [],
  });
  const points = series.points.toSorted((a, b) => a.x - b.x);
  if (points.length === 0) return unavailable('missing');
  if (!Number.isFinite(target) || target <= 0) return unavailable('outside-range');
  // Guard in data space: the ruler's pixel helper tolerates endpoint rounding,
  // but an explicitly entered target must never be clamped or extrapolated.
  if (target < points[0].x || target > points.at(-1)!.x) return unavailable('outside-range');
  const exact = points.filter((point) => point.x === target);
  if (exact.length > 1) return unavailable('ambiguous');
  if (exact.length === 1) {
    const value = exact[0].y;
    return Number.isFinite(value) && value > 0
      ? { ...series, status: 'exact', value, sources: exact }
      : unavailable('missing');
  }
  const right = points.findIndex((point) => point.x > target);
  if (right <= 0 || !path) return unavailable('missing');
  const sources = [points[right - 1], points[right]];
  if (sources.some((source) => points.filter((point) => point.x === source.x).length > 1))
    return unavailable('ambiguous');
  const hit = intersectPathAtX(path, toPixelX(target), { tolerance: 0.001 });
  const value = hit ? fromPixelY(hit.y) : NaN;
  return Number.isFinite(value) && value > 0
    ? { ...series, status: 'curve', value, sources }
    : unavailable('missing');
}
