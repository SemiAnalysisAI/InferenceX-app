import { measureTextWidth } from '@/lib/d3-chart/dynamic-margins';

const NARROW_WIDTH = 640;

/** Label and value column widths for the session row charts (flamegraph, latency waterfall). */
export function rowChartColumns(containerWidth: number): { label: number; value: number } {
  return containerWidth < NARROW_WIDTH ? { label: 88, value: 44 } : { label: 180, value: 70 };
}

export function fitLabel(text: string, font: string, maxWidth: number): string {
  if (measureTextWidth(text, font) <= maxWidth) return text;
  let end = text.length - 1;
  while (end > 0 && measureTextWidth(`${text.slice(0, end)}…`, font) > maxWidth) end--;
  return `${text.slice(0, end).trimEnd()}…`;
}
