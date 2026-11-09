import * as d3 from 'd3';

import { setupChartStructure } from './chart-setup';
import { raiseInOrder, renderAxes, renderGrid, type AnyScale } from './chart-update';
import { renderLayer } from './D3Chart/layer-renderer';
import type { BuiltScale } from './D3Chart/scale-builders';
import type { D3ChartProps, RenderContext } from './D3Chart/types';
import { chartExportSources, type ChartExportScales } from './export-registry';
import { getDomainAwareChartWatermark } from '@/lib/runtime/unofficial-domain';
import type { ContinuousScale } from './types';
import {
  CANVAS_POINT_LAYER_SELECTOR,
  CANVAS_UNDERLAY_ATTRIBUTE,
  canvasPointLayerOf,
  revealCanvasUnderlay,
} from './layers/canvas-point-registry';
import { setDotHovered, showPinRing } from './pin-ring';

export function renderChartForExport(
  source: SVGSVGElement,
  target: SVGSVGElement,
  width: number,
  height: number,
) {
  const snapshot = chartExportSources.get(source);
  if (!snapshot) throw new Error('This chart is not ready for PNG layout');
  // D3 joins need the original bindings, which cloneNode does not copy.
  const originals = [source, ...source.querySelectorAll('*')];
  const copies = [target, ...target.querySelectorAll('*')];
  originals.forEach((node, index) => {
    if (copies[index]) d3.select(copies[index]).datum(d3.select(node).datum());
  });
  snapshot((props, scales, pinned) => {
    const layers = props.layers.map((layer) => {
      if (layer.type !== 'scatter' || !layer.canvas) return layer;
      const points = canvasPointLayerOf<(typeof layer.data)[number]>(source);
      return points ? { ...layer, data: points.orderedLike(layer.data, layer.keyFn) } : layer;
    });
    renderExportChart(target, width, height, { ...props, layers }, scales, pinned);
  });
}

function ticks(axis: D3ChartProps['xAxis'], scale: BuiltScale) {
  return typeof axis?.tickValues === 'function'
    ? axis.tickValues(scale as AnyScale)
    : axis?.tickValues;
}

/** Rebuild geometry on the clone only. Never invoke live-chart lifecycle callbacks. */
function renderExportChart<T>(
  target: SVGSVGElement,
  width: number,
  height: number,
  props: D3ChartProps<T>,
  visibleScales: ChartExportScales,
  pinned: unknown,
) {
  const { xAxis, yAxis, layers, clipContent = true } = props;
  namespaceExportIds(target);
  for (const shape of target.querySelectorAll<SVGElement>(`[${CANVAS_UNDERLAY_ATTRIBUTE}]`)) {
    revealCanvasUnderlay(shape);
  }
  const layout = setupChartStructure(target, {
    chartId: `${props.chartId}-png`,
    containerWidth: width,
    containerHeight: height,
    margin: props.margin ?? { top: 24, right: 10, bottom: 40, left: 60 },
    watermark: getDomainAwareChartWatermark(props.watermark ?? 'logo', window.location.hostname),
    xLabel: xAxis?.label,
    yLabel: yAxis?.label,
    clipContent,
    hideAxes: !props.xScale || !props.yScale,
  });
  const xScale = visibleScales.xScale.copy().range([0, layout.width]) as BuiltScale;
  const yScale = visibleScales.yScale.copy().range([layout.height, 0]) as BuiltScale;
  if (props.xScale && props.yScale) {
    const xTickValues = ticks(xAxis, xScale);
    const yTickValues = ticks(yAxis, yScale);
    renderGrid(
      layout,
      xScale as AnyScale,
      yScale as ContinuousScale,
      yAxis?.tickCount ?? 5,
      0,
      xTickValues,
      yTickValues,
      'both',
      { x: xAxis?.grid ?? true, y: yAxis?.grid ?? true },
    );
    renderAxes(layout, xScale as AnyScale, yScale as ContinuousScale, {
      xTickFormat: xAxis?.tickFormat,
      yTickFormat: yAxis?.tickFormat,
      xTickCount: xAxis?.tickCount,
      yTickCount: yAxis?.tickCount,
      xTickValues,
      yTickValues,
    });
    xAxis?.customize?.(layout.xAxisGroup);
    yAxis?.customize?.(layout.yAxisGroup);
  }
  const ctx: RenderContext = {
    layout,
    xScale,
    yScale,
    renderedXScale: xScale,
    renderedYScale: yScale,
    width: layout.width,
    height: layout.height,
    transitionDuration: 0,
    tooltipElement: document.createElement('div'),
  };
  const group = clipContent ? layout.zoomGroup : layout.g;
  for (const clone of group.node()?.querySelectorAll(CANVAS_POINT_LAYER_SELECTOR) ?? []) {
    clone.remove();
  }
  for (const layer of layers) renderLayer(layer, group, xScale, yScale, layout, ctx, 'export');
  raiseInOrder(group, ['.dot-group', '.point', '.line-label']);
  const host = group.node();
  if (pinned && host && props.tooltip?.getRulerX) {
    showPinRing(
      host,
      props.tooltip.getRulerX(pinned as T, xScale as ContinuousScale),
      props.tooltip.getRulerY?.(pinned as T, yScale as ContinuousScale),
    );
    setDotHovered(
      group
        .selectAll<SVGGElement, unknown>('.dot-group')
        .filter((d) => d === pinned)
        .node(),
      true,
    );
  }
  props.onExportRender?.(ctx);
  namespaceExportIds(target);
}

function namespaceExportIds(target: SVGSVGElement) {
  // Fragment URLs must resolve to the clone, not the live chart's first matching ID.
  const ids = new Map<string, string>();
  for (const node of target.querySelectorAll('[id]')) {
    if (node.id.endsWith('-png')) continue;
    ids.set(node.id, `${node.id}-png`);
    [...target.querySelectorAll('[id]')].find((other) => other.id === `${node.id}-png`)?.remove();
    node.id = `${node.id}-png`;
  }
  if (ids.size === 0) return;
  for (const node of target.querySelectorAll('*')) {
    for (const attribute of node.attributes) {
      if (!attribute.value.includes('#')) continue;
      let value = attribute.value;
      for (const [id, replacement] of ids) {
        value = value.replaceAll(`url(#${id})`, `url(#${replacement})`);
        value = value.replaceAll(`url("#${id}")`, `url("#${replacement}")`);
        value = value.replaceAll(`url('#${id}')`, `url('#${replacement}')`);
        if (value === `#${id}`) value = `#${replacement}`;
      }
      if (value !== attribute.value) node.setAttribute(attribute.name, value);
    }
  }
}
