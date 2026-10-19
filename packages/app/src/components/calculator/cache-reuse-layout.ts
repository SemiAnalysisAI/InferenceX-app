export type CacheReuseOrientation = 'vertical' | 'horizontal';

export const HORIZONTAL_LAYOUT_QUERY = '(max-width: 767px)';

const LABEL_CHAR_EM = 0.62;
const LABEL_PAD = 2;

export function estimateLabelWidth(text: string, fontSize: number): number {
  return text.length * fontSize * LABEL_CHAR_EM;
}

export type VerticalLabelMode = 'upright' | 'rotated';

export function verticalLabelMode(
  barWidth: number,
  labels: readonly string[],
  fontSize: number,
): VerticalLabelMode {
  const widest = Math.max(0, ...labels.map((l) => estimateLabelWidth(l, fontSize)));
  return barWidth >= widest + 2 * LABEL_PAD ? 'upright' : 'rotated';
}

export function labelFits(text: string, fontSize: number, along: number, across: number): boolean {
  return (
    along >= estimateLabelWidth(text, fontSize) + 2 * LABEL_PAD &&
    across >= fontSize + 2 * LABEL_PAD
  );
}

export function horizontalRowStep(seriesCount: number): number {
  return seriesCount > 1 ? 22 * seriesCount + 8 : 28;
}

export const HORIZONTAL_MARGIN = { top: 8, right: 16, bottom: 56, left: 52 };

export function horizontalChartHeight(rowCount: number, seriesCount: number): number {
  const plot = Math.max(1, rowCount) * horizontalRowStep(seriesCount);
  return plot + HORIZONTAL_MARGIN.top + HORIZONTAL_MARGIN.bottom;
}
