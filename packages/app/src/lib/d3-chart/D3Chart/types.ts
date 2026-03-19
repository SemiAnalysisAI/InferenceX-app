import * as d3 from 'd3';

import type { ChartLayout, ChartMargin, ContinuousScale } from '../types';
import type { AnyScale } from '../chart-update';
import type { BarConfig } from '../layers/bars';
import type { HorizontalBarConfig } from '../layers/horizontal-bars';
import type { PointConfig } from '../layers/points';
import type { ErrorBarConfig } from '../layers/error-bars';
import type { LineConfig } from '../layers/lines';
import type { RooflineConfig } from '../layers/rooflines';
import type { BarLabelConfig } from '../layers/bar-labels';
import type { ScatterPointConfig } from '../layers/scatter-points';
import type { RadarConfig } from '../layers/radar';

// ---------------------------------------------------------------------------
// Scale configs
// ---------------------------------------------------------------------------

export type ScaleConfig =
  | { type: 'band'; domain: string[]; padding?: number }
  | { type: 'linear'; domain: [number, number]; nice?: boolean }
  | { type: 'log'; domain: [number, number]; nice?: boolean }
  | { type: 'time'; domain: [Date, Date]; nice?: boolean };

// ---------------------------------------------------------------------------
// Layer configs
// ---------------------------------------------------------------------------

interface LayerBase {
  /** Optional key for stable identity across re-renders. */
  key?: string;
}

export interface BarLayerConfig<T> extends LayerBase {
  type: 'bar';
  data: T[];
  config: BarConfig<T>;
}

export interface HorizontalBarLayerConfig<T> extends LayerBase {
  type: 'horizontalBar';
  data: T[];
  config: HorizontalBarConfig<T>;
}

export interface PointLayerConfig<T> extends LayerBase {
  type: 'point';
  data: T[];
  config: PointConfig<T>;
}

export interface ErrorBarLayerConfig<T> extends LayerBase {
  type: 'errorBar';
  data: T[];
  config: ErrorBarConfig<T>;
}

export interface LineLayerConfig extends LayerBase {
  type: 'line';
  lines: Record<string, { x: number; y: number }[]>;
  config: LineConfig;
}

export interface RooflineLayerConfig extends LayerBase {
  type: 'roofline';
  rooflines: Record<string, { x: number; y: number }[]>;
  config: RooflineConfig;
}

export interface BarLabelLayerConfig<T> extends LayerBase {
  type: 'barLabel';
  data: T[];
  config: BarLabelConfig<T>;
}

export interface ScatterLayerConfig<
  T extends { precision: string; x: number; y: number },
> extends LayerBase {
  type: 'scatter';
  data: T[];
  config: ScatterPointConfig<T>;
  keyFn?: (d: T) => string;
}

export interface RadarLayerConfig<T> extends LayerBase {
  type: 'radar';
  data: T[];
  config: RadarConfig<T>;
}

export interface CustomLayerConfig extends LayerBase {
  type: 'custom';
  /**
   * Custom render function. Return a D3 selection if this layer should be
   * targetable by tooltip `attachToLayer`.
   */
  render:
    | ((
        zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
        ctx: RenderContext,
      ) => d3.Selection<any, any, any, any> | void)
    | null;
  onZoom?:
    | ((zoomGroup: d3.Selection<SVGGElement, unknown, null, undefined>, ctx: ZoomContext) => void)
    | null;
}

export type LayerConfig<T = any> =
  | BarLayerConfig<T>
  | HorizontalBarLayerConfig<T>
  | PointLayerConfig<T>
  | ErrorBarLayerConfig<T>
  | LineLayerConfig
  | RooflineLayerConfig
  | BarLabelLayerConfig<T>
  | ScatterLayerConfig<any>
  | RadarLayerConfig<any>
  | CustomLayerConfig;

// ---------------------------------------------------------------------------
// Axis configs
// ---------------------------------------------------------------------------

export interface AxisConfig {
  label?: string;
  tickFormat?: (d: d3.AxisDomain) => string;
  tickCount?: number;
  /** Post-render callback for custom axis label formatting (e.g., multi-line tspan). */
  customize?: (axisGroup: d3.Selection<SVGGElement, unknown, null, undefined>) => void;
}

// ---------------------------------------------------------------------------
// Zoom config
// ---------------------------------------------------------------------------

export interface ZoomConfig {
  enabled: boolean;
  axes?: 'x' | 'y' | 'both';
  scaleExtent?: [number, number];
  resetEventName?: string;
  defaultZoomK?: number;
  /** Custom constrain function for zoom transform. */
  constrain?: (
    transform: d3.ZoomTransform,
    extent: [[number, number], [number, number]],
    translateExtent: [[number, number], [number, number]],
  ) => d3.ZoomTransform;
  /** Custom X rescale (e.g., left-anchored zoom). When set, overrides default rescaleX. */
  rescaleX?: (xScale: ContinuousScale, transform: d3.ZoomTransform) => ContinuousScale;
  /** Custom Y rescale (e.g., top-anchored zoom). When set, overrides default rescaleY. */
  rescaleY?: (yScale: ContinuousScale, transform: d3.ZoomTransform) => ContinuousScale;
  /** Custom transform storage (e.g., Y-only storage). */
  customTransformStorage?: (transform: d3.ZoomTransform) => d3.ZoomTransform;
  /** Called after zoom reset animation completes. */
  onReset?: () => void;
  /** Called on each zoom event, AFTER default axis/grid/layer updates. */
  onZoom?: (event: d3.D3ZoomEvent<SVGSVGElement, unknown>, ctx: ZoomContext) => void;
}

// ---------------------------------------------------------------------------
// Tooltip config
// ---------------------------------------------------------------------------

export interface TooltipConfig<T = any> {
  rulerType: 'vertical' | 'horizontal' | 'crosshair' | 'none';
  content: (d: T, isPinned: boolean) => string;
  getRulerX?: (
    d: T,
    xScale:
      | d3.ScaleBand<string>
      | d3.ScaleLinear<number, number>
      | d3.ScaleLogarithmic<number, number>,
  ) => number;
  getRulerY?: (
    d: T,
    yScale: d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>,
  ) => number;
  onHoverStart?: (sel: d3.Selection<any, T, any, any>, d: T) => void;
  onHoverEnd?: (sel: d3.Selection<any, T, any, any>, d: T) => void;
  onPointClick?: (d: T) => void;
  /** Which layer index to attach tooltip handlers to. Defaults to first renderable layer. */
  attachToLayer?: number;
}

// ---------------------------------------------------------------------------
// Render / Zoom context passed to custom layers
// ---------------------------------------------------------------------------

export interface RenderContext {
  layout: ChartLayout;
  xScale: AnyScale | d3.ScaleTime<number, number>;
  yScale: AnyScale | d3.ScaleTime<number, number>;
  width: number;
  height: number;
  /** Transition duration in ms for animated scale/domain changes. */
  transitionDuration?: number;
}

export interface ZoomContext extends RenderContext {
  newXScale: AnyScale | d3.ScaleTime<number, number>;
  newYScale: AnyScale | d3.ScaleTime<number, number>;
  transform: d3.ZoomTransform;
}

// ---------------------------------------------------------------------------
// Imperative handle (exposed via ref)
// ---------------------------------------------------------------------------

export interface D3ChartHandle {
  dismissTooltip: (clearPinnedPoint?: boolean) => void;
  /** Immediately hide tooltip + rulers without waiting for React re-render. */
  hideTooltip: () => void;
  getPinnedPoint: () => unknown;
  getPinnedPointIsOverlay: () => boolean;
  isPinned: () => boolean;
  pinTooltip: (point: unknown, isOverlay?: boolean) => void;
  getSvgElement: () => SVGSVGElement | null;
  getTooltipElement: () => HTMLDivElement | null;
}

// ---------------------------------------------------------------------------
// Main component props
// ---------------------------------------------------------------------------

export interface D3ChartProps<T = any> {
  chartId: string;
  data: T[];
  height?: number;
  margin?: ChartMargin;
  watermark?: 'logo' | 'unofficial' | 'none';
  testId?: string;
  grabCursor?: boolean;
  instructions?: string;
  /** When false, chart structure uses the root `g` group instead of clip-pathed zoomGroup. */
  clipContent?: boolean;

  xScale?: ScaleConfig;
  yScale?: ScaleConfig;
  xAxis?: AxisConfig;
  yAxis?: AxisConfig;

  layers: LayerConfig<T>[];

  zoom?: ZoomConfig;
  tooltip?: TooltipConfig<T>;

  transitionDuration?: number;
  legendElement?: React.ReactNode;
  noDataOverlay?: React.ReactNode;
  caption?: React.ReactNode;

  /** Called after all layers render. Useful for one-off DOM manipulations. */
  onRender?: (ctx: RenderContext) => void;
}
