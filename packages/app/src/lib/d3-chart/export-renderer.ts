import * as d3 from 'd3';

import { setupChartStructure } from './chart-setup';
import { raiseInOrder, renderAxes, renderGrid, type AnyScale } from './chart-update';
import { renderLayer } from './D3Chart/layer-renderer';
import type { BuiltScale } from './D3Chart/scale-builders';
import type { D3ChartProps, RenderContext } from './D3Chart/types';
import { getDomainAwareChartWatermark } from '@/lib/runtime/unofficial-domain';
import type { ContinuousScale } from './types';

type ExportRenderer = (target: SVGSVGElement, width: number, height: number) => void;
const renderers = new WeakMap<SVGSVGElement, ExportRenderer>();

export function registerChartExportRenderer(source: SVGSVGElement, render: ExportRenderer) {
  renderers.set(source, render);
  return () => {
    renderers.delete(source);
  };
}

export function renderChartForExport(
  source: SVGSVGElement,
  target: SVGSVGElement,
  width: number,
  height: number,
) {
  const render = renderers.get(source);
  if (!render) throw new Error('This chart is not ready for PNG layout');
  // D3 joins need the original bindings, which cloneNode does not copy.
  const originals = [source, ...source.querySelectorAll('*')];
  const copies = [target, ...target.querySelectorAll('*')];
  originals.forEach((node, index) => {
    if (copies[index]) d3.select(copies[index]).datum(d3.select(node).datum());
  });
  render(target, width, height);
}

function ticks(axis: D3ChartProps['xAxis'], scale: BuiltScale) {
  return typeof axis?.tickValues === 'function'
    ? axis.tickValues(scale as AnyScale)
    : axis?.tickValues;
}

/** Rebuild geometry on the clone only. Never invoke live-chart lifecycle callbacks. */
export function renderExportChart<T>(
  target: SVGSVGElement,
  width: number,
  height: number,
  props: D3ChartProps<T>,
  visibleScales: { xScale: BuiltScale; yScale: BuiltScale },
) {
  const { xAxis, yAxis, layers, clipContent = true } = props;
  namespaceExportIds(target);
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
  for (const layer of layers) renderLayer(layer, group, xScale, yScale, layout, ctx);
  raiseInOrder(group, ['.dot-group', '.point', '.line-label']);
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
  for (const node of target.querySelectorAll('*')) {
    for (const attribute of node.attributes) {
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
