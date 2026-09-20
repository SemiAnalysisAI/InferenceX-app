/**
 * Linear axis domain for the hardware chart, anchored at zero and padded past
 * the data by the `pad` multiplier so point labels clear the plot edges.
 * Positive-only data spans [0, pad·max]; all-negative data — profit per
 * GPU-hour when the API price misses every tier cost — spans [pad·min, 0], so
 * break-even is the top edge rather than a synthetic ceiling above the data;
 * mixed data pads both ends. Only empty data gets the unit domain that keeps
 * the axes drawn, and all-zero data keeps that unit height instead of
 * collapsing the scale to a single tick.
 */
export function zeroAnchoredDomain(values: readonly number[], pad: number): [number, number] {
  if (values.length === 0) return [0, 1];
  const lo = Math.min(0, ...values) * pad;
  const hi = Math.max(0, ...values) * pad;
  return lo === hi ? [0, 1] : [lo, hi];
}
