import { useLayoutEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { RulerScale } from '@/hooks/useChartTooltipHandlers';
import { getDomainAwareChartWatermark } from '@/lib/runtime/unofficial-domain';
import { registerChartExportRenderer } from '../export-registry';

import {
  computeTooltipPosition,
  getTooltipContainerGeometry,
  invalidateTooltipGeometry,
} from '../layers/scatter-points';
import { CANVAS_POINT_LAYER_SELECTOR, canvasPointLayerOf } from '../layers/canvas-point-registry';
import type { PointPositions, ScatterDatum } from '../layers/canvas-points';
import { DEFAULT_CHART_MARGIN, setupChartStructure } from '../chart-setup';
import {
  raiseInOrder,
  renderAxes,
  renderGrid,
  type AnyScale,
  type GridVisibility,
} from '../chart-update';
import type { ChartLayout, ContinuousScale } from '../types';

import { buildScale, isBandScale, type BuiltScale } from './scale-builders';
import { isTouchCompatMouseEvent } from '../touch-input';
import { overlayMarkerPosition } from '../overlay-x-marker';
import { setDotHovered, showPinRing } from '../pin-ring';
import {
  renderLayer,
  updateLayerDecorationOnZoom,
  updateLayerForDisplay,
  updateLayerForMetric,
  updateLayerPositionOnZoom,
} from './layer-renderer';
import type {
  AxisConfig,
  D3ChartProps,
  LayerConfig,
  RenderContext,
  ZoomConfig,
  ZoomContext,
} from './types';

interface RendererDeps {
  svgRef: React.RefObject<SVGSVGElement | null>;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  dimensions: { width: number; height: number };
  scalesRef: React.MutableRefObject<{ xScale: BuiltScale; yScale: BuiltScale } | null>;
  setupZoom: (
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    width: number,
    height: number,
    options?: any,
  ) => d3.ZoomBehavior<SVGSVGElement, unknown>;
  zoomTransformRef: React.MutableRefObject<d3.ZoomTransform>;
  isPinned: () => boolean;
  pinTooltip: (data: any, isOverlay?: boolean) => void;
  pinnedPointRef: React.RefObject<unknown>;
  dismissTooltip: (clearPinnedPoint?: boolean) => void;
  hideTooltipElements: (
    tooltipRef: React.RefObject<HTMLDivElement | null>,
    svgRef: React.RefObject<SVGSVGElement | null>,
  ) => void;
  createRulers: (
    group: d3.Selection<SVGGElement, unknown, null, undefined>,
    rulerType: 'vertical' | 'horizontal' | 'crosshair' | 'none',
    width: number,
    height: number,
    foregroundColor: string,
  ) => {
    rulerGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
    verticalRuler?: d3.Selection<SVGLineElement, unknown, null, undefined>;
    horizontalRuler?: d3.Selection<SVGLineElement, unknown, null, undefined>;
  };
  attachHandlers: (
    selection: d3.Selection<any, any, any, any>,
    config: any,
    containerElement: HTMLDivElement,
    tooltipElement: d3.Selection<any, unknown, any, any>,
    rulers: any,
    zoomedScales: () => { xScale: RulerScale; yScale: RulerScale },
  ) => void;
}

function resolveTickValues(
  tickValues: AxisConfig['tickValues'],
  scale: AnyScale,
): (number | Date)[] | undefined {
  if (!tickValues) return undefined;
  return typeof tickValues === 'function' ? tickValues(scale) : tickValues;
}

function gridVisibility(xAxis?: AxisConfig, yAxis?: AxisConfig): GridVisibility {
  return { x: xAxis?.grid ?? true, y: yAxis?.grid ?? true };
}

const ZOOM_REWRITES_LAYER: Record<LayerConfig['type'], boolean> = {
  bar: true,
  horizontalBar: true,
  point: true,
  errorBar: true,
  line: true,
  barLabel: true,
  roofline: false,
  scatter: false,
  radar: false,
  custom: false,
};

function rescaleForZoom(
  xScale: BuiltScale,
  yScale: BuiltScale,
  zoomConfig: ZoomConfig | undefined,
  transform: d3.ZoomTransform,
): { xScale: BuiltScale; yScale: BuiltScale } {
  const axes = zoomConfig?.axes ?? 'both';
  let zoomedX = xScale;
  let zoomedY = yScale;
  if ((axes === 'x' || axes === 'both') && !isBandScale(xScale)) {
    zoomedX = zoomConfig?.rescaleX
      ? zoomConfig.rescaleX(xScale as ContinuousScale, transform)
      : transform.rescaleX(xScale as ContinuousScale);
  }
  if ((axes === 'y' || axes === 'both') && !isBandScale(yScale)) {
    zoomedY = zoomConfig?.rescaleY
      ? zoomConfig.rescaleY(yScale as ContinuousScale, transform)
      : transform.rescaleY(yScale as ContinuousScale);
  }
  return { xScale: zoomedX, yScale: zoomedY };
}

export interface ZoomFrameBatcher {
  schedule: (work: () => void) => void;
  flush: () => void;
  cancel: () => void;
}

export function createZoomFrameBatcher(
  requestFrame: (callback: FrameRequestCallback) => number,
  cancelFrame: (id: number) => void,
): ZoomFrameBatcher {
  let frameId: number | null = null;
  let latestWork: (() => void) | null = null;

  return {
    schedule(work) {
      latestWork = work;
      if (frameId !== null) return;
      frameId = requestFrame(() => {
        frameId = null;
        const finalWork = latestWork;
        latestWork = null;
        finalWork?.();
      });
    },
    flush() {
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
      const finalWork = latestWork;
      latestWork = null;
      finalWork?.();
    },
    cancel() {
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
      latestWork = null;
    },
  };
}

export interface TransitionGeometry {
  transforms: Map<SVGGElement, string>;
  paths: Map<SVGPathElement, string>;
  points: PointPositions | null;
}

const RAISE_ORDER = ['.dot-group', CANVAS_POINT_LAYER_SELECTOR, '.point', '.line-label'] as const;
const LINE_LABEL_RAISE = ['.line-label'] as const;
const TRANSITION_POINT_SELECTOR = '.dot-group';
const TRANSITION_ROOFLINE_SELECTOR = '.roofline-path';
type GeometryVisibility = (element: SVGElement) => boolean;

function isGeometryVisible(element: SVGElement): boolean {
  return element.style.opacity !== '0' && element.style.display !== 'none';
}

function scatterOpacity<T>(layers: LayerConfig<T>[]) {
  const scatterLayer = layers.find((layer) => layer.type === 'scatter');
  return scatterLayer?.type === 'scatter' ? scatterLayer.config.getOpacity : undefined;
}

function metricGeometryVisibility<T>(layers: LayerConfig<T>[]): GeometryVisibility {
  const getOpacity = scatterOpacity(layers);
  if (!getOpacity) return isGeometryVisible;

  return (element) =>
    element.matches('.dot-group')
      ? getOpacity(d3.select(element).datum() as Parameters<typeof getOpacity>[0]) > 0
      : isGeometryVisible(element);
}

function metricPointVisibility<T>(
  layers: LayerConfig<T>[],
): ((datum: ScatterDatum) => boolean) | null {
  const getOpacity = scatterOpacity(layers);
  if (!getOpacity) return null;
  return (datum) => getOpacity(datum as Parameters<typeof getOpacity>[0]) > 0;
}

export function captureTransitionGeometry(
  group: d3.Selection<SVGGElement, unknown, any, any>,
): TransitionGeometry {
  const transforms = new Map<SVGGElement, string>();
  const paths = new Map<SVGPathElement, string>();
  group.selectAll<SVGGElement, unknown>(TRANSITION_POINT_SELECTOR).each(function () {
    if (isGeometryVisible(this)) transforms.set(this, this.getAttribute('transform') || '');
  });
  group.selectAll<SVGPathElement, unknown>(TRANSITION_ROOFLINE_SELECTOR).each(function () {
    if (isGeometryVisible(this)) paths.set(this, this.getAttribute('d') || '');
  });
  return {
    transforms,
    paths,
    points: canvasPointLayerOf(group.node())?.capturePositions() ?? null,
  };
}

export function animateTransitionGeometry(
  group: d3.Selection<SVGGElement, unknown, any, any>,
  previous: TransitionGeometry | null,
  durationMs: number | undefined = 0,
  isVisible: GeometryVisibility = isGeometryVisible,
  isPointVisible: ((datum: ScatterDatum) => boolean) | null = null,
): void {
  if (!previous || durationMs <= 0) return;
  if (previous.points) {
    canvasPointLayerOf(group.node())?.animateFrom(previous.points, durationMs, isPointVisible);
  }
  group.selectAll<SVGGElement, unknown>(TRANSITION_POINT_SELECTOR).each(function () {
    if (!isVisible(this)) {
      d3.select(this).interrupt('data-update');
      return;
    }
    const oldPosition = previous.transforms.get(this);
    const newPosition = this.getAttribute('transform');
    if (oldPosition !== undefined && newPosition && oldPosition !== newPosition) {
      this.setAttribute('transform', oldPosition);
      d3.select(this).transition('data-update').duration(durationMs).attr('transform', newPosition);
    }
  });
  group.selectAll<SVGPathElement, unknown>(TRANSITION_ROOFLINE_SELECTOR).each(function () {
    if (!isVisible(this)) {
      d3.select(this).interrupt('data-update');
      return;
    }
    const oldPath = previous.paths.get(this);
    const newPath = this.getAttribute('d');
    if (oldPath !== undefined && newPath && oldPath !== newPath) {
      this.setAttribute('d', oldPath);
      d3.select(this).transition('data-update').duration(durationMs).attr('d', newPath);
    }
  });
}
export function metricRenderCallbackContext(
  baseContext: RenderContext,
  renderedXScale: RenderContext['xScale'],
  renderedYScale: RenderContext['yScale'],
): RenderContext {
  return {
    ...baseContext,
    renderedXScale,
    renderedYScale,
  };
}

function customLayerDisplayIdentities<T>(layers: LayerConfig<T>[]): Map<string, string> {
  const identities = new Map<string, string>();
  layers.forEach((layer, index) => {
    if (layer.type === 'custom' && layer.displayIdentity !== undefined) {
      identities.set(layer.key ?? `custom:${index}`, layer.displayIdentity);
    }
  });
  return identities;
}

function customLayerDisplayPlanIdentity<T>(layers: LayerConfig<T>[]): string {
  return layers
    .map((layer, index) =>
      layer.type === 'custom' && layer.displayIdentity !== undefined
        ? `${layer.key ?? `custom:${index}`}:${layer.displayIdentity}`
        : '',
    )
    .join('|');
}

export function useD3ChartRenderer<T>(props: D3ChartProps<T>, deps: RendererDeps): void {
  const {
    chartId,
    data,
    margin = DEFAULT_CHART_MARGIN,
    watermark = 'logo',
    clipContent = true,
    dataIdentity,
    metricIdentity,
    displayIdentity,
    xScale: xScaleConfig,
    yScale: yScaleConfig,
    xAxis: xAxisConfig,
    yAxis: yAxisConfig,
    layers,
    zoom: zoomConfig,
    tooltip: tooltipConfig,
    transitionDuration,
    onRender,
    onDisplayUpdate,
  } = props;

  const {
    svgRef,
    tooltipRef,
    dimensions,
    scalesRef,
    setupZoom,
    zoomTransformRef,
    isPinned,
    pinTooltip,
    pinnedPointRef,
    dismissTooltip,
    hideTooltipElements,
    createRulers,
    attachHandlers,
  } = deps;

  const layoutRef = useRef<ChartLayout | null>(null);
  const prevDataRef = useRef(data);
  const prevScalesRef = useRef({ xScaleConfig, yScaleConfig });
  const prevYAxisConfigRef = useRef(yAxisConfig);
  const prevPlotRef = useRef({ layers, tooltipConfig });
  const zoomFrameBatcherRef = useRef<ZoomFrameBatcher | null>(null);
  if (zoomFrameBatcherRef.current === null) {
    zoomFrameBatcherRef.current = createZoomFrameBatcher(
      (callback) => requestAnimationFrame(callback),
      (id) => cancelAnimationFrame(id),
    );
  }
  const renderContextRef = useRef<RenderContext | null>(null);
  const joinedIdentityRef = useRef<string | null>(null);
  const lastMetricIdentityRef = useRef<string | undefined>(undefined);
  const lastDisplayIdentityRef = useRef<string | undefined>(undefined);
  const customLayerDisplayIdentitiesRef = useRef<Map<string, string>>(new Map());
  const layersRef = useRef(layers);
  const axesRef = useRef({ xAxisConfig, yAxisConfig });
  const zoomConfigRef = useRef(zoomConfig);
  layersRef.current = layers;
  axesRef.current = { xAxisConfig, yAxisConfig };
  zoomConfigRef.current = zoomConfig;
  const displayCallbackRef = useRef(onDisplayUpdate);
  displayCallbackRef.current = onDisplayUpdate;
  const customDisplayPlanIdentity = customLayerDisplayPlanIdentity(layers);
  const hasScales =
    xScaleConfig !== null &&
    xScaleConfig !== undefined &&
    yScaleConfig !== null &&
    yScaleConfig !== undefined;
  const hasRenderableData = data.length > 0 || layers.some((layer) => layer.type === 'custom');
  const dataJoinIdentity = dataIdentity ?? data;
  const dataPhaseXScale = dataIdentity ? null : xScaleConfig;
  const dataPhaseYScale = dataIdentity ? null : yScaleConfig;
  const dataPhaseLayers = dataIdentity ? null : layers;
  const dataPhaseTooltip = dataIdentity ? null : tooltipConfig;

  useLayoutEffect(() => {
    const source = svgRef.current;
    if (!source) return;
    return registerChartExportRenderer(source, (draw) => {
      const scales = scalesRef.current ?? {
        xScale: d3.scaleLinear(),
        yScale: d3.scaleLinear(),
      };
      draw(
        props,
        zoomConfig?.enabled
          ? rescaleForZoom(scales.xScale, scales.yScale, zoomConfig, d3.zoomTransform(source))
          : scales,
        props.tooltip?.details ? pinnedPointRef.current : null,
      );
    });
  });

  useLayoutEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return;
    if (!hasRenderableData) {
      d3.select(svgRef.current).selectAll('*').remove();
      scalesRef.current = null;
      layoutRef.current = null;
      renderContextRef.current = null;
      dismissTooltip(true);
      return;
    }

    layoutRef.current = setupChartStructure(svgRef.current, {
      chartId,
      containerWidth: dimensions.width,
      containerHeight: dimensions.height,
      margin,
      watermark: getDomainAwareChartWatermark(watermark, window.location.hostname),
      xLabel: xAxisConfig?.label,
      yLabel: yAxisConfig?.label,
      clipContent,
      hideAxes: !hasScales,
    });
  }, [
    chartId,
    dimensions.width,
    dimensions.height,
    margin.top,
    margin.right,
    margin.bottom,
    margin.left,
    watermark,
    xAxisConfig?.label,
    yAxisConfig?.label,
    clipContent,
    hasScales,
    hasRenderableData,
  ]);

  useLayoutEffect(() => {
    if (
      !svgRef.current ||
      !tooltipRef.current ||
      dimensions.width === 0 ||
      !hasRenderableData ||
      !layoutRef.current
    ) {
      return;
    }

    const dataChanged = data !== prevDataRef.current;
    const scalesChanged =
      xScaleConfig !== prevScalesRef.current.xScaleConfig ||
      yScaleConfig !== prevScalesRef.current.yScaleConfig;
    const samePlot =
      !dataChanged &&
      !scalesChanged &&
      layers === prevPlotRef.current.layers &&
      tooltipConfig === prevPlotRef.current.tooltipConfig;
    const keepPin = samePlot && Boolean(tooltipConfig?.details) && isPinned();
    prevDataRef.current = data;
    prevScalesRef.current = { xScaleConfig, yScaleConfig };
    prevPlotRef.current = { layers, tooltipConfig };
    prevYAxisConfigRef.current = yAxisConfig;

    {
      if (!svgRef.current || !tooltipRef.current) return;

      zoomTransformRef.current = d3.zoomTransform(svgRef.current);

      const existingGroup = d3.select(svgRef.current).select<SVGGElement>('.zoom-group');
      const previousGeometry =
        transitionDuration && (dataChanged || scalesChanged) && !existingGroup.empty()
          ? captureTransitionGeometry(existingGroup)
          : null;

      const layout = layoutRef.current;
      if (!layout) return;
      const { width, height, zoomGroup, g } = layout;
      const renderGroup = clipContent ? zoomGroup : g;
      const tooltip = d3.select(tooltipRef.current);

      const xScale = hasScales
        ? buildScale(xScaleConfig, [0, width])
        : buildScale({ type: 'linear', domain: [0, 1] }, [0, width]);
      const yScale = hasScales
        ? buildScale(yScaleConfig, [height, 0])
        : buildScale({ type: 'linear', domain: [0, 1] }, [height, 0]);
      scalesRef.current = { xScale, yScale };

      const initialTransform = zoomTransformRef.current;
      const restoresZoom =
        zoomConfig?.enabled &&
        (initialTransform.k !== 1 || initialTransform.x !== 0 || initialTransform.y !== 0);
      const shown = restoresZoom
        ? rescaleForZoom(xScale, yScale, zoomConfig, initialTransform)
        : { xScale, yScale };

      if (hasScales) {
        const xTickValues = resolveTickValues(xAxisConfig?.tickValues, shown.xScale as AnyScale);
        const yTickValues = resolveTickValues(yAxisConfig?.tickValues, shown.yScale as AnyScale);
        renderGrid(
          layout,
          shown.xScale as AnyScale,
          shown.yScale as any,
          yAxisConfig?.tickCount ?? 5,
          0,
          xTickValues,
          yTickValues,
          'both',
          gridVisibility(xAxisConfig, yAxisConfig),
        );
        renderAxes(layout, shown.xScale as AnyScale, shown.yScale as any, {
          xTickFormat: xAxisConfig?.tickFormat,
          yTickFormat: yAxisConfig?.tickFormat,
          xTickCount: xAxisConfig?.tickCount,
          yTickCount: yAxisConfig?.tickCount,
          xTickValues,
          yTickValues,
        });

        if (xAxisConfig?.customize) {
          xAxisConfig.customize(layout.xAxisGroup);
        }
        if (yAxisConfig?.customize) {
          yAxisConfig.customize(layout.yAxisGroup);
        }
      }

      const ctx: RenderContext = {
        layout,
        tooltipElement: tooltipRef.current,
        xScale,
        yScale,
        renderedXScale: xScale,
        renderedYScale: yScale,
        width,
        height,
        transitionDuration,
      };
      renderContextRef.current = ctx;

      const layerSelections: (d3.Selection<any, any, any, any> | null)[] = [];
      for (const layer of layers) {
        const layerScales = ZOOM_REWRITES_LAYER[layer.type] ? shown : { xScale, yScale };
        const sel = renderLayer(
          layer,
          renderGroup,
          layerScales.xScale,
          layerScales.yScale,
          layout,
          ctx,
        );
        layerSelections.push(sel);
      }
      customLayerDisplayIdentitiesRef.current = customLayerDisplayIdentities(layers);
      lastDisplayIdentityRef.current = displayIdentity;

      const getDataX = tooltipConfig?.proximityHover ? tooltipConfig.getDataX : undefined;
      if (getDataX) renderGroup.selectAll('.proximity-overlay').remove();
      raiseInOrder(renderGroup, RAISE_ORDER);

      if (tooltipConfig) {
        if (getDataX) {
          const rulers = createRulers(
            renderGroup,
            tooltipConfig.rulerType,
            width,
            height,
            'var(--foreground)',
          );
          const { rulerGroup, verticalRuler, horizontalRuler } = rulers;
          const containerEl = svgRef.current!.parentElement as HTMLDivElement;
          const panel = Boolean(tooltipConfig.details);
          const sortedData = [...data].toSorted((a, b) => getDataX(a) - getDataX(b));
          const bisector = d3.bisector<T, number>((d) => getDataX(d)).center;

          renderGroup
            .append('rect')
            .attr('class', 'proximity-overlay')
            .attr('width', width)
            .attr('height', height)
            .attr('fill', 'none')
            .attr('pointer-events', 'all')
            .on('mousemove', (event: MouseEvent) => {
              if (isPinned() && !panel) return;
              if (isTouchCompatMouseEvent(event)) return;
              const [mx] = d3.pointer(event);

              let currentXScale = xScale;
              if (svgRef.current && zoomConfig?.axes !== 'y') {
                const t = d3.zoomTransform(svgRef.current);
                if (!isBandScale(xScale)) {
                  currentXScale = zoomConfig?.rescaleX
                    ? (zoomConfig.rescaleX(xScale as ContinuousScale, t) as BuiltScale)
                    : (t.rescaleX(xScale as any) as BuiltScale);
                }
              }

              const xVal = (currentXScale as any).invert ? (currentXScale as any).invert(mx) : mx;
              const xNum = xVal instanceof Date ? xVal.getTime() : Number(xVal);
              const idx = bisector(sortedData, xNum);
              const d = sortedData[idx];
              if (!d) return;

              tooltip
                .style('opacity', 1)
                .style('display', 'block')
                .style('pointer-events', 'none')
                .html(tooltipConfig.content(d, false));
              invalidateTooltipGeometry(tooltip.node());

              const geometry = getTooltipContainerGeometry(containerEl);
              const cmx = event.clientX - geometry.bounds.left;
              const cmy = event.clientY - geometry.bounds.top;
              const pos = computeTooltipPosition(cmx, cmy, tooltip, containerEl, 10, geometry);
              tooltip.style('left', `${pos.left}px`).style('top', `${pos.top}px`);

              if (isPinned()) return;
              rulerGroup.style('display', 'block');
              if (verticalRuler && tooltipConfig.getRulerX) {
                const rx = tooltipConfig.getRulerX(d, currentXScale as any);
                verticalRuler.attr('x1', rx).attr('x2', rx);
              }
              if (horizontalRuler && tooltipConfig.getRulerY) {
                const ry = tooltipConfig.getRulerY(d, yScale as any);
                horizontalRuler.attr('y1', ry).attr('y2', ry);
              }
            })
            .on('mouseleave', () => {
              if (isPinned() && !panel) return;
              tooltip.style('opacity', 0).style('display', 'none');
              if (!isPinned()) rulerGroup.style('display', 'none');
            })
            .on('click', (event: MouseEvent) => {
              const [mx] = d3.pointer(event);
              let currentXScale = xScale;
              if (svgRef.current && zoomConfig?.axes !== 'y') {
                const t = d3.zoomTransform(svgRef.current);
                if (!isBandScale(xScale)) {
                  currentXScale = zoomConfig?.rescaleX
                    ? (zoomConfig.rescaleX(xScale as ContinuousScale, t) as BuiltScale)
                    : (t.rescaleX(xScale as any) as BuiltScale);
                }
              }
              const xVal = (currentXScale as any).invert ? (currentXScale as any).invert(mx) : mx;
              const xNum = xVal instanceof Date ? xVal.getTime() : Number(xVal);
              const idx = bisector(sortedData, xNum);
              const d = sortedData[idx];
              if (!d) return;

              event.stopPropagation();
              if (panel) {
                tooltip.style('opacity', 0).style('display', 'none');
                rulerGroup.style('display', 'none');
                if (pinnedPointRef.current === d) {
                  dismissTooltip();
                  return;
                }
                let currentYScale = yScale;
                if (svgRef.current && zoomConfig?.axes !== 'x' && !isBandScale(yScale)) {
                  const t = d3.zoomTransform(svgRef.current);
                  currentYScale = zoomConfig?.rescaleY
                    ? (zoomConfig.rescaleY(yScale as ContinuousScale, t) as BuiltScale)
                    : (t.rescaleY(yScale as any) as BuiltScale);
                }
                const px = tooltipConfig.getRulerX?.(d, currentXScale as any);
                const py = tooltipConfig.getRulerY?.(d, currentYScale as any);
                const host = rulerGroup.node()?.parentNode;
                if (host instanceof Element) showPinRing(host, px, py);
                pinTooltip(d);
                tooltipConfig.onPointClick?.(d);
                return;
              }
              const geometry = getTooltipContainerGeometry(containerEl);
              const cmx = event.clientX - geometry.bounds.left;
              const cmy = event.clientY - geometry.bounds.top;
              tooltip.html(tooltipConfig.content(d, true));
              invalidateTooltipGeometry(tooltip.node());
              const pos = computeTooltipPosition(cmx, cmy, tooltip, containerEl, 10, geometry);
              tooltip
                .style('left', `${pos.left}px`)
                .style('top', `${pos.top}px`)
                .style('opacity', 1)
                .style('display', 'block')
                .style('pointer-events', 'auto');
              pinTooltip(d);
              tooltipConfig.onPointClick?.(d);
            });
        } else {
          const attachIdx =
            tooltipConfig.attachToLayer ??
            layerSelections.findIndex((s) => s !== null && s !== undefined);
          const targetSelection = attachIdx >= 0 ? layerSelections[attachIdx] : null;

          if (targetSelection) {
            const rulers = createRulers(
              renderGroup,
              tooltipConfig.rulerType,
              width,
              height,
              'var(--foreground)',
            );

            attachHandlers(
              targetSelection,
              {
                rulerType: tooltipConfig.rulerType,
                generateTooltipContent: tooltipConfig.content,
                getRulerX: tooltipConfig.getRulerX,
                getRulerY: tooltipConfig.getRulerY,
                onHoverStart: tooltipConfig.onHoverStart,
                onHoverEnd: tooltipConfig.onHoverEnd,
                onPointClick: tooltipConfig.onPointClick,
                panel: Boolean(tooltipConfig.details),
              },
              svgRef.current!.parentElement as HTMLDivElement,
              tooltip,
              rulers,
              () =>
                rescaleForZoom(xScale, yScale, zoomConfig, d3.zoomTransform(svgRef.current!)) as {
                  xScale: RulerScale;
                  yScale: RulerScale;
                },
            );
          }
        }
      }

      let replaying = true;
      if (zoomConfig?.enabled) {
        const zoomAxes = zoomConfig.axes ?? 'both';

        setupZoom(
          layout.svg as d3.Selection<SVGSVGElement, unknown, null, undefined>,
          width,
          height,
          {
            translateExtent: [
              [0, zoomAxes === 'x' ? -Infinity : 0],
              [width, zoomAxes === 'x' ? Infinity : height],
            ] as [[number, number], [number, number]],
            extent: [
              [0, 0],
              [width, height],
            ] as [[number, number], [number, number]],
            constrain: zoomConfig.constrain,
            customTransformStorage: zoomConfig.customTransformStorage,
            onZoom: (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
              const transform = event.transform;
              const currentScales = scalesRef.current;
              const currentLayout = layoutRef.current;
              const currentCtx = renderContextRef.current;
              if (!currentScales || !currentLayout || !currentCtx) return;
              const { xScale: zoomXScale, yScale: zoomYScale } = currentScales;
              const zoomLayout = currentLayout;
              const zoomLayers = layersRef.current;
              const { xAxisConfig: zoomXAxisConfig, yAxisConfig: zoomYAxisConfig } =
                axesRef.current;
              const currentZoomConfig = zoomConfigRef.current;
              const currentZoomAxes = currentZoomConfig?.axes ?? 'both';
              const zoomRenderGroup = clipContent ? zoomLayout.zoomGroup : zoomLayout.g;
              const zoomBaseContext = currentCtx;

              const { xScale: newXScale, yScale: newYScale } = rescaleForZoom(
                zoomXScale,
                zoomYScale,
                currentZoomConfig,
                transform,
              );

              const zoomContext: ZoomContext = {
                ...zoomBaseContext,
                newXScale,
                newYScale,
                transform,
              };

              for (const layer of zoomLayers) {
                updateLayerPositionOnZoom(
                  layer,
                  zoomRenderGroup,
                  zoomXScale,
                  newXScale,
                  newYScale,
                  zoomLayout,
                );
              }

              const pinHost = zoomRenderGroup.node();
              const pinX = tooltipConfig?.details ? tooltipConfig.getRulerX : undefined;
              if (isPinned() && !replaying && pinHost && pinX) {
                const pinned = pinnedPointRef.current as T;
                showPinRing(
                  pinHost,
                  pinX(pinned, newXScale as ContinuousScale),
                  tooltipConfig?.getRulerY?.(pinned, newYScale as ContinuousScale),
                );
              } else if (isPinned() && !(replaying && keepPin)) {
                dismissTooltip(true);
                hideTooltipElements(tooltipRef, svgRef);
              }

              zoomFrameBatcherRef.current?.schedule(() => {
                const updatesX = currentZoomAxes === 'x' || currentZoomAxes === 'both';
                const updatesY = currentZoomAxes === 'y' || currentZoomAxes === 'both';
                const xTickValues = updatesX
                  ? resolveTickValues(zoomXAxisConfig?.tickValues, newXScale as AnyScale)
                  : undefined;
                const yTickValues = updatesY
                  ? resolveTickValues(zoomYAxisConfig?.tickValues, newYScale as AnyScale)
                  : undefined;
                const zoomYAxisScale = newYScale as unknown as
                  | ContinuousScale
                  | d3.ScaleBand<string>;
                renderAxes(zoomLayout, newXScale as AnyScale, zoomYAxisScale, {
                  xTickFormat: zoomXAxisConfig?.tickFormat,
                  yTickFormat: zoomYAxisConfig?.tickFormat,
                  xTickCount: zoomXAxisConfig?.tickCount,
                  yTickCount: zoomYAxisConfig?.tickCount,
                  xTickValues,
                  yTickValues,
                  axes: currentZoomAxes,
                });
                if (updatesX) zoomXAxisConfig?.customize?.(zoomLayout.xAxisGroup);
                if (updatesY) zoomYAxisConfig?.customize?.(zoomLayout.yAxisGroup);
                renderGrid(
                  zoomLayout,
                  newXScale as AnyScale,
                  zoomYAxisScale,
                  zoomYAxisConfig?.tickCount ?? 5,
                  0,
                  xTickValues,
                  yTickValues,
                  currentZoomAxes,
                  gridVisibility(zoomXAxisConfig, zoomYAxisConfig),
                );
                for (const layer of zoomLayers) {
                  updateLayerDecorationOnZoom(
                    layer,
                    zoomRenderGroup,
                    zoomXScale,
                    newXScale,
                    newYScale,
                    zoomLayout,
                    zoomContext,
                  );
                }
                raiseInOrder(zoomRenderGroup, LINE_LABEL_RAISE);
                currentZoomConfig?.onZoom?.(event, zoomContext);
              });
            },
          },
        );

        replaying = false;
        const restored = zoomTransformRef.current;
        if (restored.k === 1 && restored.x === 0 && restored.y === 0 && isPinned() && !keepPin) {
          dismissTooltip(true);
          tooltip.style('opacity', 0).style('display', 'none').style('pointer-events', 'none');
          renderGroup.select('.ruler-group').style('display', 'none');
        }
      }
      zoomFrameBatcherRef.current?.flush();

      if (keepPin && tooltipConfig) {
        const pinned = pinnedPointRef.current;
        const marker = renderGroup
          .selectAll<Element, unknown>('*')
          .filter((d) => d === pinned)
          .node();
        let position = marker ? overlayMarkerPosition(marker) : null;
        setDotHovered(marker, true);
        if (!position && tooltipConfig.getRulerX && tooltipConfig.getRulerY && svgRef.current) {
          const zoomed = rescaleForZoom(
            xScale,
            yScale,
            zoomConfig,
            d3.zoomTransform(svgRef.current),
          );
          if (!isBandScale(zoomed.yScale)) {
            position = {
              x: tooltipConfig.getRulerX(
                pinned as T,
                zoomed.xScale as ContinuousScale | d3.ScaleBand<string>,
              ),
              y: tooltipConfig.getRulerY(pinned as T, zoomed.yScale as ContinuousScale),
            };
          }
        }
        const host = renderGroup.node();
        if (position && host) {
          showPinRing(host, position.x, position.y);
        } else if (zoomConfig?.enabled) {
          dismissTooltip(true);
          hideTooltipElements(tooltipRef, svgRef);
        }
      }

      animateTransitionGeometry(renderGroup, previousGeometry, transitionDuration);

      renderContextRef.current = ctx;
      joinedIdentityRef.current = dataIdentity ?? null;
      lastMetricIdentityRef.current = metricIdentity;
      onRender?.(ctx);
    }
    return () => {
      zoomFrameBatcherRef.current?.cancel();
    };
  }, [
    dataJoinIdentity,
    dimensions.width,
    dimensions.height,
    chartId,
    dataPhaseXScale,
    dataPhaseYScale,
    dataPhaseLayers,
    zoomConfig?.enabled,
    dataPhaseTooltip,
    transitionDuration,
    setupZoom,
    watermark,
    clipContent,
    hasRenderableData,
    hideTooltipElements,
  ]);

  useLayoutEffect(() => {
    if (
      !dataIdentity ||
      metricIdentity === undefined ||
      joinedIdentityRef.current !== dataIdentity ||
      lastMetricIdentityRef.current === metricIdentity ||
      !svgRef.current ||
      !tooltipRef.current ||
      !layoutRef.current
    ) {
      return;
    }

    zoomFrameBatcherRef.current?.cancel();

    const layout = layoutRef.current;
    const { width, height } = layout;
    const renderGroup = clipContent ? layout.zoomGroup : layout.g;
    if (isPinned()) {
      dismissTooltip(true);
      hideTooltipElements(tooltipRef, svgRef);
    }
    const xScale = hasScales
      ? buildScale(xScaleConfig!, [0, width])
      : buildScale({ type: 'linear', domain: [0, 1] }, [0, width]);
    const yScale = hasScales
      ? buildScale(yScaleConfig!, [height, 0])
      : buildScale({ type: 'linear', domain: [0, 1] }, [height, 0]);
    scalesRef.current = { xScale, yScale };

    const zoomAxes = zoomConfig?.axes ?? 'both';
    const { xScale: currentXScale, yScale: currentYScale } = rescaleForZoom(
      xScale,
      yScale,
      zoomConfig,
      d3.zoomTransform(svgRef.current),
    );

    if (hasScales) {
      const yIsStatic =
        zoomAxes === 'x' &&
        prevScalesRef.current.yScaleConfig === yScaleConfig &&
        prevYAxisConfigRef.current === yAxisConfig;
      const updateAxes = yIsStatic ? 'x' : 'both';
      const xTickValues = resolveTickValues(xAxisConfig?.tickValues, currentXScale as AnyScale);
      const yTickValues = yIsStatic
        ? undefined
        : resolveTickValues(yAxisConfig?.tickValues, currentYScale as AnyScale);
      const yAxisScale = currentYScale as unknown as ContinuousScale | d3.ScaleBand<string>;
      renderGrid(
        layout,
        currentXScale as AnyScale,
        yAxisScale,
        yAxisConfig?.tickCount ?? 5,
        0,
        xTickValues,
        yTickValues,
        updateAxes,
        gridVisibility(xAxisConfig, yAxisConfig),
      );
      renderAxes(layout, currentXScale as AnyScale, yAxisScale, {
        xTickFormat: xAxisConfig?.tickFormat,
        yTickFormat: yAxisConfig?.tickFormat,
        xTickCount: xAxisConfig?.tickCount,
        yTickCount: yAxisConfig?.tickCount,
        xTickValues,
        yTickValues,
        axes: updateAxes,
      });
      xAxisConfig?.customize?.(layout.xAxisGroup);
      if (!yIsStatic) yAxisConfig?.customize?.(layout.yAxisGroup);
    }

    const baseCtx: RenderContext = {
      layout,
      tooltipElement: tooltipRef.current,
      xScale,
      yScale,
      renderedXScale: xScale,
      renderedYScale: yScale,
      width,
      height,
      transitionDuration,
    };
    const metricCtx: RenderContext = {
      ...baseCtx,
      xScale: currentXScale,
      yScale: currentYScale,
      renderedXScale: currentXScale,
      renderedYScale: currentYScale,
    };
    const callbackCtx = metricRenderCallbackContext(baseCtx, currentXScale, currentYScale);
    const previousGeometry =
      (transitionDuration ?? 0) > 0 ? captureTransitionGeometry(renderGroup) : null;
    const metricLayerSelections = layers.map((layer) =>
      updateLayerForMetric(layer, renderGroup, currentXScale, currentYScale, layout, metricCtx),
    );
    animateTransitionGeometry(
      renderGroup,
      previousGeometry,
      transitionDuration,
      metricGeometryVisibility(layers),
      metricPointVisibility(layers),
    );
    customLayerDisplayIdentitiesRef.current = customLayerDisplayIdentities(layers);
    lastDisplayIdentityRef.current = displayIdentity;
    raiseInOrder(renderGroup, RAISE_ORDER);

    if (tooltipConfig && !tooltipConfig.proximityHover) {
      const attachIdx =
        tooltipConfig.attachToLayer ??
        metricLayerSelections.findIndex((selection) => selection !== null);
      const targetSelection = attachIdx >= 0 ? metricLayerSelections[attachIdx] : null;
      if (targetSelection) {
        const rulers = createRulers(
          renderGroup,
          tooltipConfig.rulerType,
          width,
          height,
          'var(--foreground)',
        );
        attachHandlers(
          targetSelection,
          {
            rulerType: tooltipConfig.rulerType,
            generateTooltipContent: tooltipConfig.content,
            getRulerX: tooltipConfig.getRulerX,
            getRulerY: tooltipConfig.getRulerY,
            onHoverStart: tooltipConfig.onHoverStart,
            onHoverEnd: tooltipConfig.onHoverEnd,
            onPointClick: tooltipConfig.onPointClick,
            panel: Boolean(tooltipConfig.details),
          },
          svgRef.current.parentElement as HTMLDivElement,
          d3.select(tooltipRef.current),
          rulers,
          () =>
            rescaleForZoom(xScale, yScale, zoomConfig, d3.zoomTransform(svgRef.current!)) as {
              xScale: RulerScale;
              yScale: RulerScale;
            },
        );
      }
    }

    renderContextRef.current = baseCtx;
    lastMetricIdentityRef.current = metricIdentity;
    prevScalesRef.current = { xScaleConfig, yScaleConfig };
    prevYAxisConfigRef.current = yAxisConfig;
    onRender?.(callbackCtx);
  }, [
    dataIdentity,
    metricIdentity,
    dimensions.width,
    dimensions.height,
    xScaleConfig,
    yScaleConfig,
    xAxisConfig,
    yAxisConfig,
    layers,
    hideTooltipElements,
    zoomConfig,
    tooltipConfig,
    transitionDuration,
    onRender,
    hasScales,
    clipContent,
    scalesRef,
    svgRef,
    tooltipRef,
    createRulers,
    attachHandlers,
    isPinned,
    dismissTooltip,
  ]);

  useLayoutEffect(() => {
    const ctx = renderContextRef.current;
    if (!ctx) return;
    const renderGroup = clipContent ? ctx.layout.zoomGroup : ctx.layout.g;
    const previousCustomIdentities = customLayerDisplayIdentitiesRef.current;
    const nextCustomIdentities = customLayerDisplayIdentities(layersRef.current);
    const displayChanged = lastDisplayIdentityRef.current !== displayIdentity;
    layersRef.current.forEach((layer, index) => {
      if (layer.type === 'custom') {
        if (layer.displayIdentity === undefined) return;
        const key = layer.key ?? `custom:${index}`;
        if (previousCustomIdentities.get(key) === layer.displayIdentity) return;
      } else if (!displayChanged) {
        return;
      }
      updateLayerForDisplay(layer, renderGroup, ctx);
    });
    customLayerDisplayIdentitiesRef.current = nextCustomIdentities;
    lastDisplayIdentityRef.current = displayIdentity;
    if (displayChanged) displayCallbackRef.current?.(ctx);
  }, [displayIdentity, customDisplayPlanIdentity]);
}
