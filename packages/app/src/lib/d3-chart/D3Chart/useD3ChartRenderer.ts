import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

import { setupChartStructure } from '../chart-setup';
import { renderAxes, renderGrid } from '../chart-update';
import type { AnyScale } from '../chart-update';
import type { ChartLayout, ContinuousScale } from '../types';

import { buildScale, isBandScale, type BuiltScale } from './scale-builders';
import { renderLayer, updateLayerOnZoom } from './layer-renderer';
import type { D3ChartProps, RenderContext, ZoomContext } from './types';

interface RendererDeps {
  svgRef: React.RefObject<SVGSVGElement | null>;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  dimensions: { width: number; height: number };
  setupZoom: (
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    width: number,
    height: number,
    options?: any,
  ) => d3.ZoomBehavior<SVGSVGElement, unknown>;
  zoomTransformRef: React.MutableRefObject<d3.ZoomTransform>;
  // Tooltip handlers
  isPinned: () => boolean;
  dismissTooltip: (clearPinnedPoint?: boolean) => void;
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
    xScale: any,
    yScale?: any,
    svgRef?: React.RefObject<SVGSVGElement | null>,
    zoomAxes?: 'x' | 'y' | 'both',
  ) => void;
}

/**
 * Core render effect for D3Chart. Builds scales, renders structure/axes/grid/layers,
 * wires up tooltip and zoom handlers.
 */
export function useD3ChartRenderer<T>(props: D3ChartProps<T>, deps: RendererDeps): void {
  const {
    chartId,
    data,
    margin = { top: 24, right: 10, bottom: 40, left: 60 },
    watermark = 'logo',
    clipContent = true,
    xScale: xScaleConfig,
    yScale: yScaleConfig,
    xAxis: xAxisConfig,
    yAxis: yAxisConfig,
    layers,
    zoom: zoomConfig,
    tooltip: tooltipConfig,
    transitionDuration,
    onRender,
  } = props;

  const {
    svgRef,
    tooltipRef,
    dimensions,
    setupZoom,
    zoomTransformRef,
    isPinned,
    dismissTooltip,
    createRulers,
    attachHandlers,
  } = deps;

  // Store scales in ref so zoom handler can read them without stale closures
  const scalesRef = useRef<{ xScale: BuiltScale; yScale: BuiltScale } | null>(null);
  const layoutRef = useRef<ChartLayout | null>(null);
  const prevDataRef = useRef(data);
  const prevScalesRef = useRef({ xScaleConfig, yScaleConfig });

  useEffect(() => {
    if (!svgRef.current || !tooltipRef.current || dimensions.width === 0) return;
    if (data.length === 0 && layers.every((l) => l.type !== 'custom')) return;

    // Animate when data or scale domains changed (but not on resize/theme changes)
    const dataChanged = data !== prevDataRef.current;
    const scalesChanged =
      xScaleConfig !== prevScalesRef.current.xScaleConfig ||
      yScaleConfig !== prevScalesRef.current.yScaleConfig;
    prevDataRef.current = data;
    prevScalesRef.current = { xScaleConfig, yScaleConfig };

    const timeoutId = setTimeout(() => {
      if (!svgRef.current || !tooltipRef.current) return;

      // Preserve zoom transform before structure rebuild
      zoomTransformRef.current = d3.zoomTransform(svgRef.current);

      // ── Save old positions for animated transitions ──
      const oldTransforms = new Map<SVGGElement, string>();
      const oldPaths = new Map<SVGPathElement, string>();
      if (transitionDuration && (dataChanged || scalesChanged)) {
        const existingGroup = d3.select(svgRef.current).select('.zoom-group');
        if (!existingGroup.empty()) {
          existingGroup.selectAll<SVGGElement, unknown>('.dot-group').each(function () {
            oldTransforms.set(this, this.getAttribute('transform') || '');
          });
          existingGroup.selectAll<SVGPathElement, unknown>('.roofline-path').each(function () {
            oldPaths.set(this, this.getAttribute('d') || '');
          });
        }
      }

      // ── Structure setup ──
      const hasScales = xScaleConfig != null && yScaleConfig != null;
      const layout = setupChartStructure(svgRef.current, {
        chartId,
        containerWidth: dimensions.width,
        containerHeight: dimensions.height,
        margin,
        watermark,
        xLabel: xAxisConfig?.label,
        yLabel: yAxisConfig?.label,
        clipContent,
        hideAxes: !hasScales,
      });
      layoutRef.current = layout;

      const { width, height, zoomGroup, g } = layout;
      const renderGroup = clipContent ? zoomGroup : g;
      const tooltip = d3.select(tooltipRef.current);

      // ── Build scales (skip for radial-only charts) ──
      const xScale = hasScales
        ? buildScale(xScaleConfig, [0, width])
        : buildScale({ type: 'linear', domain: [0, 1] }, [0, width]);
      const yScale = hasScales
        ? buildScale(yScaleConfig, [height, 0])
        : buildScale({ type: 'linear', domain: [0, 1] }, [height, 0]);
      scalesRef.current = { xScale, yScale };

      // ── Grid + Axes (skip when no scale configs) ──
      if (hasScales) {
        renderGrid(layout, xScale as AnyScale, yScale as any, yAxisConfig?.tickCount ?? 5);
        renderAxes(layout, xScale as AnyScale, yScale as any, {
          xTickFormat: xAxisConfig?.tickFormat,
          yTickFormat: yAxisConfig?.tickFormat,
          xTickCount: xAxisConfig?.tickCount,
          yTickCount: yAxisConfig?.tickCount,
        });

        // Custom axis formatting callbacks
        if (xAxisConfig?.customize) {
          xAxisConfig.customize(layout.xAxisGroup);
        }
        if (yAxisConfig?.customize) {
          yAxisConfig.customize(layout.yAxisGroup);
        }
      }

      // ── Render context ──
      const ctx: RenderContext = {
        layout,
        xScale,
        yScale,
        width,
        height,
        transitionDuration: transitionDuration,
      };

      // ── Render layers ──
      const layerSelections: (d3.Selection<any, any, any, any> | null)[] = [];
      for (const layer of layers) {
        const sel = renderLayer(layer, renderGroup, xScale, yScale, layout, ctx);
        layerSelections.push(sel);
      }

      // Ensure points render above lines/rooflines on re-renders
      // (D3 enter appends new elements at the end, so new lines can end up after existing dots)
      renderGroup.selectAll('.dot-group').raise();
      renderGroup.selectAll('.point').raise();

      // ── Tooltip ──
      if (tooltipConfig) {
        const attachIdx =
          tooltipConfig.attachToLayer ?? layerSelections.findIndex((s) => s != null);
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
            },
            svgRef.current!.parentElement as HTMLDivElement,
            tooltip,
            rulers,
            xScale as any,
            isBandScale(yScale) ? undefined : (yScale as any),
            svgRef,
            zoomConfig?.axes,
          );
        }
      }

      // ── Zoom ──
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

              // Dismiss tooltip on zoom
              if (isPinned()) {
                dismissTooltip(true);
                tooltip
                  .style('opacity', 0)
                  .style('display', 'none')
                  .style('pointer-events', 'none');
                renderGroup.select('.ruler-group').style('display', 'none');
              }

              // Compute new scales
              let newXScale: BuiltScale = xScale;
              let newYScale: BuiltScale = yScale;

              if (zoomAxes === 'x' || zoomAxes === 'both') {
                if (zoomConfig.rescaleX && !isBandScale(xScale)) {
                  newXScale = zoomConfig.rescaleX(xScale as ContinuousScale, transform);
                } else if (!isBandScale(xScale)) {
                  newXScale = transform.rescaleX(xScale as any);
                }
              }
              if (zoomAxes === 'y' || zoomAxes === 'both') {
                if (zoomConfig.rescaleY && !isBandScale(yScale)) {
                  newYScale = zoomConfig.rescaleY(yScale as ContinuousScale, transform);
                } else if (!isBandScale(yScale)) {
                  newYScale = transform.rescaleY(yScale as any);
                }
              }

              // Update axes + grid
              renderAxes(layout, newXScale as AnyScale, newYScale as any, {
                xTickFormat: xAxisConfig?.tickFormat,
                yTickFormat: yAxisConfig?.tickFormat,
                xTickCount: xAxisConfig?.tickCount,
                yTickCount: yAxisConfig?.tickCount,
              });
              if (xAxisConfig?.customize) {
                xAxisConfig.customize(layout.xAxisGroup);
              }
              if (yAxisConfig?.customize) {
                yAxisConfig.customize(layout.yAxisGroup);
              }
              renderGrid(
                layout,
                newXScale as AnyScale,
                newYScale as any,
                yAxisConfig?.tickCount ?? 5,
              );

              // Update layers
              const zoomCtx: ZoomContext = {
                ...ctx,
                newXScale,
                newYScale,
                transform,
              };

              for (const layer of layers) {
                updateLayerOnZoom(
                  layer,
                  renderGroup,
                  xScale,
                  yScale,
                  newXScale,
                  newYScale,
                  layout,
                  zoomCtx,
                );
              }

              // User callback
              zoomConfig.onZoom?.(event, zoomCtx);
            },
          },
        );
      }

      // ── Animate from old positions to new positions ──
      if (transitionDuration && (oldTransforms.size > 0 || oldPaths.size > 0)) {
        // Scatter points: restore old position, then transition to current
        renderGroup.selectAll<SVGGElement, unknown>('.dot-group').each(function () {
          const oldPos = oldTransforms.get(this);
          const newPos = this.getAttribute('transform');
          if (oldPos !== undefined && newPos && oldPos !== newPos) {
            this.setAttribute('transform', oldPos);
            d3.select(this)
              .transition('data-update')
              .duration(transitionDuration)
              .attr('transform', newPos);
          }
        });
        // Roofline paths: restore old path, then transition to current
        renderGroup.selectAll<SVGPathElement, unknown>('.roofline-path').each(function () {
          const oldD = oldPaths.get(this);
          const newD = this.getAttribute('d');
          if (oldD !== undefined && newD && oldD !== newD) {
            this.setAttribute('d', oldD);
            d3.select(this).transition('data-update').duration(transitionDuration).attr('d', newD);
          }
        });
      }

      // ── User onRender callback ──
      onRender?.(ctx);
    }, 0);

    return () => clearTimeout(timeoutId);
    // We intentionally list specific deps rather than the entire props object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data,
    dimensions,
    chartId,
    xScaleConfig,
    yScaleConfig,
    layers,
    zoomConfig?.enabled,
    tooltipConfig,
    transitionDuration,
    setupZoom,
    watermark,
  ]);
}
