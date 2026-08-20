/**
 * Viewport-space bounds of a chart's clip region.
 *
 * `setupChart` clips the zoom group to a rect covering the plot area only:
 * `(0, 0, width, height)` inside `.chart-root`, which is itself translated by
 * the chart margins. On the inference scatter those margins are 60px on the
 * left and bottom — the axis gutters — so the SVG's own box is a sizeable
 * superset of what the user can actually see.
 *
 * A zoom pushes points out of the plot, where the clip path paints them away
 * while `getBoundingClientRect()` keeps reporting perfectly ordinary geometry.
 * Anything asking "can the user see this point?" therefore has to compare
 * against this rect, never against the SVG box.
 *
 * Deliberately free of d3 so callers outside the chart bundle (the anchored
 * nudge) can import it without pulling d3 onto pages that have no chart.
 */

export interface PlotBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** `translate(x,y)` as written by `setupChart` — also tolerates space separators. */
const TRANSLATE = /translate\(\s*(?<x>-?[\d.]+)[\s,]+(?<y>-?[\d.]+)\s*\)/u;

/**
 * @param svg the chart's `<svg>` element (`[data-testid="d3-chart-svg"]`).
 * @returns the clip region in viewport coordinates, or `null` when the chart
 *   does not clip its content (`clipContent: false`) or has not rendered its
 *   skeleton yet. A `null` result means "nothing is being clipped away", so
 *   callers should fall back to the SVG box rather than reject everything.
 */
export function plotBounds(svg: Element): PlotBounds | null {
  const root = svg.querySelector('.chart-root');
  const clip = svg.querySelector('defs clipPath rect');
  if (!root || !clip) return null;

  const translate = TRANSLATE.exec(root.getAttribute('transform') ?? '')?.groups;
  const width = Number(clip.getAttribute('width'));
  const height = Number(clip.getAttribute('height'));
  if (!translate || !(width > 0) || !(height > 0)) return null;

  // No viewBox on the chart SVG, so one user unit is one CSS pixel and the
  // margins can be added to the client rect directly.
  const box = svg.getBoundingClientRect();
  const left = box.left + Number(translate.x);
  const top = box.top + Number(translate.y);
  return { left, top, right: left + width, bottom: top + height };
}
