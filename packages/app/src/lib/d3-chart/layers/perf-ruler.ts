import type * as d3 from 'd3';

/**
 * Perf ruler layer — a vertical measurement ruler between two selected data
 * points. Draws a vertical line at the midpoint of the two points' x pixel
 * positions, spanning their y pixel positions, with short horizontal end caps
 * and a label chip showing the performance multiple between the two RAW
 * y-values (e.g. "2.03x", optionally "+103%").
 *
 * Pure module: geometry math is separated from rendering so both are unit
 * testable (see perf-ruler.test.ts). Rendering follows the narrow-mutation
 * rules from docs/d3-charts.md — a single keyed join, texts written before
 * any measurement, rects sized last.
 */

type GroupSelection = d3.Selection<SVGGElement, unknown, null, undefined>;

export interface PerfRulerPointInput {
  /** Pixel x position of the point (already passed through the x scale). */
  px: number;
  /** Pixel y position of the point (already passed through the y scale). */
  py: number;
  /** Raw data-space y value — the ratio uses raw values, never pixels. */
  rawY: number;
}

export interface PerfRulerGeometry {
  /** Ruler line x pixel position: midpoint of the two points' x positions. */
  x: number;
  /** Top pixel y of the ruler span. */
  y1: number;
  /** Bottom pixel y of the ruler span. */
  y2: number;
  /** Performance multiple: higher raw y over lower raw y (>= 1). */
  ratio: number;
  /** Formatted ratio, e.g. "2.03x". */
  ratioLabel: string;
  /** Formatted relative gain, e.g. "+103%". */
  percentLabel: string;
}

/** Format a performance multiple like "2.03x" (fewer decimals as it grows). */
export function formatPerfRatio(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '';
  if (ratio >= 100) return `${Math.round(ratio)}x`;
  if (ratio >= 10) return `${ratio.toFixed(1)}x`;
  return `${ratio.toFixed(2)}x`;
}

/** Format the relative gain of a multiple like "+103%". */
export function formatPerfPercent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '';
  return `+${Math.round((ratio - 1) * 100)}%`;
}

/**
 * Compute ruler geometry for two selected points. Returns null for degenerate
 * inputs: non-finite coordinates or non-positive raw y values (a ratio over a
 * zero/negative value is meaningless, and log scales cannot place them).
 * Argument order does not matter.
 */
export function computePerfRulerGeometry(
  a: PerfRulerPointInput,
  b: PerfRulerPointInput,
): PerfRulerGeometry | null {
  const inputs = [a.px, a.py, a.rawY, b.px, b.py, b.rawY];
  if (!inputs.every((value) => Number.isFinite(value))) return null;
  if (a.rawY <= 0 || b.rawY <= 0) return null;

  const hi = Math.max(a.rawY, b.rawY);
  const lo = Math.min(a.rawY, b.rawY);
  const ratio = hi / lo;

  return {
    x: (a.px + b.px) / 2,
    y1: Math.min(a.py, b.py),
    y2: Math.max(a.py, b.py),
    ratio,
    ratioLabel: formatPerfRatio(ratio),
    percentLabel: formatPerfPercent(ratio),
  };
}

export interface PerfRulerRenderOptions {
  /** Stroke for the ruler line and end caps (e.g. `var(--primary)`). */
  color: string;
  /** Label chip background (readability over chart marks). */
  labelBg: string;
  /** Label text color, paired with `labelBg`. */
  labelText: string;
  /** Chart inner width; lets the label flip sides instead of clipping. */
  chartWidth?: number;
  /** Half-length of the horizontal end caps in px. Default 6. */
  capHalfWidth?: number;
  /**
   * Minimum vertical pixel span before the secondary "+NN%" line is shown.
   * Below this the chip only fits the ratio cleanly. Default 34.
   */
  minSpanForPercent?: number;
}

const LABEL_GAP = 10;
const CHIP_PAD_X = 6;
const CHIP_PAD_Y = 4;
const RATIO_FONT_SIZE = 11;
const PERCENT_FONT_SIZE = 9;
const LINE_HEIGHT = 13;
export const DEFAULT_MIN_SPAN_FOR_PERCENT = 34;

/**
 * Estimate text width via getBBox when a real DOM is available, falling back
 * to a character-count estimate in non-DOM environments (unit tests).
 */
function measureTextWidth(node: unknown, text: string, fontSize: number): number {
  const maybe = node as { getBBox?: () => { width: number } } | null;
  if (maybe && typeof maybe.getBBox === 'function') {
    const width = maybe.getBBox().width;
    if (width > 0) return width;
  }
  return text.length * fontSize * 0.62;
}

/**
 * Render (or clear, when `geometry` is null) the perf ruler inside `group`.
 * Idempotent keyed join — safe to call from render, zoom, and display passes.
 * The whole layer is pointer-events: none so it never intercepts point clicks.
 */
export function renderPerfRuler(
  group: GroupSelection,
  geometry: PerfRulerGeometry | null,
  opts: PerfRulerRenderOptions,
): void {
  const selection = group
    .selectAll<SVGGElement, PerfRulerGeometry>('.perf-ruler')
    .data(geometry ? [geometry] : []);

  selection.exit().remove();
  if (!geometry) return;

  const entered = selection.enter().append('g').attr('class', 'perf-ruler');
  entered
    .append('line')
    .attr('class', 'pr-line')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '5 4');
  entered.append('line').attr('class', 'pr-cap pr-cap-top').attr('stroke-width', 2);
  entered.append('line').attr('class', 'pr-cap pr-cap-bottom').attr('stroke-width', 2);
  entered.append('rect').attr('class', 'pr-bg').attr('rx', 4).attr('ry', 4).attr('opacity', 0.92);
  entered
    .append('text')
    .attr('class', 'pr-text pr-text-ratio')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', `${RATIO_FONT_SIZE}px`)
    .attr('font-weight', '700');
  entered
    .append('text')
    .attr('class', 'pr-text pr-text-percent')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', `${PERCENT_FONT_SIZE}px`)
    .attr('font-weight', '600');

  const merged = entered.merge(selection).style('pointer-events', 'none');

  const { x, y1, y2 } = geometry;
  const capHalfWidth = opts.capHalfWidth ?? 6;
  const midY = (y1 + y2) / 2;

  merged
    .select('.pr-line')
    .attr('x1', x)
    .attr('x2', x)
    .attr('y1', y1)
    .attr('y2', y2)
    .attr('stroke', opts.color);
  merged
    .select('.pr-cap-top')
    .attr('x1', x - capHalfWidth)
    .attr('x2', x + capHalfWidth)
    .attr('y1', y1)
    .attr('y2', y1)
    .attr('stroke', opts.color);
  merged
    .select('.pr-cap-bottom')
    .attr('x1', x - capHalfWidth)
    .attr('x2', x + capHalfWidth)
    .attr('y1', y2)
    .attr('y2', y2)
    .attr('stroke', opts.color);

  const showPercent =
    Math.abs(y2 - y1) >= (opts.minSpanForPercent ?? DEFAULT_MIN_SPAN_FOR_PERCENT) &&
    geometry.percentLabel !== '';

  // Two passes per docs/d3-charts.md "Batched Label Measurement": write both
  // texts first, then measure, then position the chip and texts.
  merged.select('.pr-text-ratio').attr('fill', opts.labelText).text(geometry.ratioLabel);
  merged
    .select('.pr-text-percent')
    .attr('fill', opts.labelText)
    .style('display', showPercent ? '' : 'none')
    .text(showPercent ? geometry.percentLabel : '');

  const ratioWidth = measureTextWidth(
    merged.select('.pr-text-ratio').node(),
    geometry.ratioLabel,
    RATIO_FONT_SIZE,
  );
  const percentWidth = showPercent
    ? measureTextWidth(
        merged.select('.pr-text-percent').node(),
        geometry.percentLabel,
        PERCENT_FONT_SIZE,
      )
    : 0;
  const chipWidth = Math.max(ratioWidth, percentWidth) + CHIP_PAD_X * 2;
  const chipHeight = (showPercent ? 2 : 1) * LINE_HEIGHT + CHIP_PAD_Y * 2;

  // Prefer the right side of the line; flip left when the chip would clip.
  const flipLeft = opts.chartWidth !== undefined && x + LABEL_GAP + chipWidth > opts.chartWidth;
  const chipX = flipLeft ? x - LABEL_GAP - chipWidth : x + LABEL_GAP;
  const chipY = midY - chipHeight / 2;
  const textX = chipX + chipWidth / 2;

  merged
    .select('.pr-bg')
    .attr('x', chipX)
    .attr('y', chipY)
    .attr('width', chipWidth)
    .attr('height', chipHeight)
    .attr('fill', opts.labelBg);
  merged
    .select('.pr-text-ratio')
    .attr('x', textX)
    .attr('y', chipY + CHIP_PAD_Y + LINE_HEIGHT / 2);
  merged
    .select('.pr-text-percent')
    .attr('x', textX)
    .attr('y', chipY + CHIP_PAD_Y + LINE_HEIGHT * 1.5);
}
