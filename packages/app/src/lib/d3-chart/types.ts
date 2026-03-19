import * as d3 from 'd3';

/** D3 selections returned from chart structure setup. */
export interface ChartLayout {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  g: d3.Selection<SVGGElement, unknown, null, undefined>;
  zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  xAxisGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  yAxisGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  gridGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  defs: d3.Selection<SVGDefsElement, unknown, null, undefined>;
  width: number;
  height: number;
  margin: ChartMargin;
}

export interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartSetupConfig {
  chartId: string;
  containerWidth: number;
  containerHeight: number;
  margin: ChartMargin;
  watermark: 'logo' | 'unofficial' | 'none';
  xLabel?: string;
  yLabel?: string;
  clipContent?: boolean;
  /** Skip border lines, axis groups, and grid. Used for radial charts. */
  hideAxes?: boolean;
}

export type ContinuousScale = d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>;
