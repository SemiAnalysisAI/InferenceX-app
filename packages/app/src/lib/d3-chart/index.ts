export { setupChartStructure } from './chart-setup';
export { renderAxes, renderGrid } from './chart-update';
export type { ChartLayout, ChartMargin, ChartSetupConfig, ContinuousScale } from './types';
export type { AnyScale, AxisUpdateConfig } from './chart-update';
export * from './layers';
export { contrastColors } from './contrast-colors';
export { D3Chart } from './D3Chart';
export type {
  D3ChartHandle,
  D3ChartProps,
  ScaleConfig,
  LayerConfig,
  AxisConfig,
  ZoomConfig,
  TooltipConfig,
  RenderContext,
  ZoomContext,
} from './D3Chart';
