import type { BuiltScale } from './D3Chart/scale-builders';
import type { D3ChartProps } from './D3Chart/types';

export interface ChartExportScales {
  xScale: BuiltScale;
  yScale: BuiltScale;
}

export type ChartExportDraw = <T>(props: D3ChartProps<T>, scales: ChartExportScales) => void;

type ChartExportSource = (draw: ChartExportDraw) => void;

export const chartExportSources = new WeakMap<SVGSVGElement, ChartExportSource>();

export function registerChartExportRenderer(source: SVGSVGElement, snapshot: ChartExportSource) {
  chartExportSources.set(source, snapshot);
  return () => {
    chartExportSources.delete(source);
  };
}
