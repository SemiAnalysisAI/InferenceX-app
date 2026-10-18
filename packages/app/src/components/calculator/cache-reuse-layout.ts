/**
 * Geometry for the Prefix Cache Reuse chart. Pure so the orientation and label
 * decisions can be unit-tested without a DOM: jsdom has no text metrics.
 */

export type CacheReuseOrientation = 'vertical' | 'horizontal';

/**
 * Below this viewport width the chart lays bars out horizontally. A phone has
 * room for ~20 concurrency columns only at ~8px each, far too thin for a
 * percentage, while a row the full plot width wide fits one per segment.
 */
export const HORIZONTAL_LAYOUT_QUERY = '(max-width: 767px)';

/** Approximate advance of a 600-weight digit or `%` relative to font size. */
const LABEL_CHAR_EM = 0.62;
/** Clearance kept between a label and its segment's edges. */
const LABEL_PAD = 2;

export function estimateLabelWidth(text: string, fontSize: number): number {
  return text.length * fontSize * LABEL_CHAR_EM;
}

/**
 * How the vertical layout writes its percentages. One mode for the whole chart,
 * chosen by the widest label against the bar width, so neighbouring bars never
 * mix upright and sideways text.
 */
export type VerticalLabelMode = 'upright' | 'rotated';

export function verticalLabelMode(
  barWidth: number,
  labels: readonly string[],
  fontSize: number,
): VerticalLabelMode {
  const widest = Math.max(0, ...labels.map((l) => estimateLabelWidth(l, fontSize)));
  return barWidth >= widest + 2 * LABEL_PAD ? 'upright' : 'rotated';
}

/**
 * Whether one segment can hold its label. `along` is the segment's extent in
 * the label's reading direction, `across` the extent perpendicular to it. A
 * segment too small keeps no label; its tooltip still carries the value.
 */
export function labelFits(text: string, fontSize: number, along: number, across: number): boolean {
  return (
    along >= estimateLabelWidth(text, fontSize) + 2 * LABEL_PAD &&
    across >= fontSize + 2 * LABEL_PAD
  );
}

/** Height of one concurrency row in the horizontal layout. */
export function horizontalRowStep(seriesCount: number): number {
  return seriesCount > 1 ? 22 * seriesCount + 8 : 28;
}

export const HORIZONTAL_MARGIN = { top: 8, right: 16, bottom: 56, left: 52 };

export function horizontalChartHeight(rowCount: number, seriesCount: number): number {
  const plot = Math.max(1, rowCount) * horizontalRowStep(seriesCount);
  return plot + HORIZONTAL_MARGIN.top + HORIZONTAL_MARGIN.bottom;
}
