/**
 * Pure layout / math helpers shared by the two horizontal-bar D3 charts
 * (evaluation `BarChartD3` and reliability `BarChartD3`).
 *
 * These are deliberately DOM-free and React-free so they can be unit-tested in
 * isolation and reused by the thin per-tab layer builders. Anything that only
 * *looks* similar between the two charts (tooltip HTML, the specific layer set)
 * stays in the tab components — see `horizontal-bar-chart-core.tsx` for the
 * shared component wiring and the module doc there for the split rationale.
 */

import { getModelSortIndex } from '@/lib/constants';

/**
 * Vertical pixel center of a band-scale row. Both charts place points, error
 * bars, X-markers and labels at `band(key) + bandwidth/2`; this is that value,
 * defensive against an undefined band lookup (which d3 returns for keys not in
 * the domain).
 */
export function barCenterY(band: (key: string) => number | undefined, key: string): number {
  return (band(key) ?? 0) + bandBandwidth(band);
}

/**
 * Half the band bandwidth. Kept separate so callers that only need the row
 * center don't have to reach for the scale's `.bandwidth()` twice. The band
 * accessor carries its bandwidth on the function object (d3 scaleBand), so we
 * read it off there when available and fall back to 0.
 */
function bandBandwidth(band: (key: string) => number | undefined): number {
  const bw = (band as unknown as { bandwidth?: () => number }).bandwidth;
  return typeof bw === 'function' ? bw.call(band) / 2 : 0;
}

/**
 * Comparator that orders items by their model/hardware sort index, then breaks
 * ties alphabetically on the raw key. This is the exact ordering both charts
 * apply to legend items and chart rows (via `getModelSortIndex`), extracted so
 * the two stay in lockstep.
 */
export function compareByModelSortIndex(aKey: string, bKey: string): number {
  return getModelSortIndex(aKey) - getModelSortIndex(bKey) || aKey.localeCompare(bKey);
}

export interface InsideLabelPlacement {
  /** X coordinate to set on the text element. */
  x: number;
  /** `text-anchor` to set on the text element. */
  textAnchor: 'start' | 'end';
  /** Whether the label fits inside the bar (drives fill color choice). */
  fitsInside: boolean;
}

/**
 * Decide whether a value label sits *inside* the end of a horizontal bar or
 * flips to *outside* it, matching the reliability chart's rule: the label fits
 * inside when the bar end leaves room for the widest label plus 24px of
 * breathing room; inside labels are right-anchored 10px in from the end,
 * outside labels are left-anchored 6px past the end.
 *
 * Pure so the flip threshold can be unit-tested without a DOM or d3 scale.
 *
 * @param barEndX  pixel x of the bar's end (`xScale(value)`)
 * @param maxLabelWidth  measured width of the widest label in this row's group
 */
export function resolveInsideLabelPlacement(
  barEndX: number,
  maxLabelWidth: number,
): InsideLabelPlacement {
  const fitsInside = barEndX > maxLabelWidth + 24;
  return {
    x: fitsInside ? barEndX - 10 : barEndX + 6,
    textAnchor: fitsInside ? 'end' : 'start',
    fitsInside,
  };
}
