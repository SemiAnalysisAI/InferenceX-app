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
/** The `clip-path="url(#…)"` reference `setupChart` puts on the zoom group. */
const CLIP_URL = /url\(\s*#(?<id>[^)\s]+)\s*\)/u;

/** Width and height of the plot area, in the zoom group's own user units. */
export interface PlotSize {
  width: number;
  height: number;
}

/**
 * Size of the clip rect a zoom group is painted through.
 *
 * The zoom group carries no transform of its own (zoom re-scales point
 * positions instead), so the clip rect `(0, 0, width, height)` is also the
 * plot area in the coordinate space every `.dot-group` translate is written
 * in. Anything laid out inside the zoom group — point labels in particular —
 * can compare against this rect directly to know whether it will be painted
 * or clipped away.
 *
 * @param zoomGroup the chart's `.zoom-group` element.
 * @param svg the owning `<svg>`; defaults to the zoom group's own owner.
 * @returns the clip size, or `null` when the group clips nothing
 *   (`clipContent: false`), the referenced clipPath is missing, or the rect
 *   is degenerate.
 */
export function plotClipSize(
  zoomGroup: Element,
  svg: Element | null = (zoomGroup as SVGElement).ownerSVGElement,
): PlotSize | null {
  if (!svg) return null;
  // Follow the zoom group's own reference rather than assuming the chart's is
  // the only clipPath in the SVG — the overflow-continuation layer defines one
  // per group, and future layers may too. No reference means `clipContent:
  // false`, i.e. nothing is being clipped away.
  const clipId = CLIP_URL.exec(zoomGroup.getAttribute('clip-path') ?? '')?.groups?.id;
  if (!clipId) return null;
  const clip = [...svg.querySelectorAll('clipPath')]
    .find((candidate) => candidate.id === clipId)
    ?.querySelector('rect');
  if (!clip) return null;

  const width = Number(clip.getAttribute('width'));
  const height = Number(clip.getAttribute('height'));
  if (!(width > 0) || !(height > 0)) return null;
  return { width, height };
}

/**
 * @param svg the chart's `<svg>` element (`[data-testid="d3-chart-svg"]`).
 * @returns the clip region in viewport coordinates, or `null` when the chart
 *   does not clip its content (`clipContent: false`) or has not rendered its
 *   skeleton yet. A `null` result means "nothing is being clipped away", so
 *   callers should fall back to the SVG box rather than reject everything.
 */
export function plotBounds(svg: Element): PlotBounds | null {
  const root = svg.querySelector('.chart-root');
  const zoomGroup = svg.querySelector('.zoom-group');
  if (!root || !zoomGroup) return null;

  const size = plotClipSize(zoomGroup, svg);
  if (!size) return null;
  const { width, height } = size;

  const translate = TRANSLATE.exec(root.getAttribute('transform') ?? '')?.groups;
  if (!translate) return null;

  // No viewBox on the chart SVG, so one user unit is one CSS pixel and the
  // margins can be added to the client rect directly.
  const box = svg.getBoundingClientRect();
  const left = box.left + Number(translate.x);
  const top = box.top + Number(translate.y);
  return { left, top, right: left + width, bottom: top + height };
}
