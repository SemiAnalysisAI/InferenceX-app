// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as d3 from 'd3';

import { setupChartStructure } from '../chart-setup';
import type { LayerConfig, RenderContext } from './types';
import { renderLayer, updateLayerForDisplay, updateLayerForMetric } from './layer-renderer';

interface PointDatum {
  id: string;
  precision: string;
  x: number;
  y: number;
}

function scatterLayer(data: PointDatum[]): LayerConfig<PointDatum> {
  return {
    type: 'scatter',
    data,
    keyFn: (point) => point.id,
    config: {
      getColor: () => '#000',
      selectedPrecisions: ['fp8'],
    },
  };
}

describe('updateLayerForMetric', () => {
  it('updates bound coordinates by stable key without replacing joined point nodes', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const layout = setupChartStructure(svg, {
      chartId: 'metric-phase-test',
      containerWidth: 400,
      containerHeight: 300,
      margin: { top: 10, right: 10, bottom: 20, left: 30 },
      watermark: 'none',
    });
    const xScale = d3.scaleLinear().domain([0, 10]).range([0, layout.width]);
    const yScale = d3.scaleLinear().domain([0, 10]).range([layout.height, 0]);
    const tooltipElement = document.createElement('div');
    const ctx: RenderContext = {
      layout,
      tooltipElement,
      xScale,
      yScale,
      width: layout.width,
      height: layout.height,
    };
    const initial = scatterLayer([
      { id: 'a', precision: 'fp8', x: 1, y: 2 },
      { id: 'b', precision: 'fp8', x: 3, y: 4 },
    ]);
    renderLayer(initial, layout.zoomGroup, xScale, yScale, layout, ctx);
    const before = layout.zoomGroup.selectAll<SVGGElement, PointDatum>('.dot-group').nodes();

    const updated = scatterLayer([
      { id: 'a', precision: 'fp8', x: 2, y: 8 },
      { id: 'b', precision: 'fp8', x: 4, y: 6 },
    ]);
    updateLayerForMetric(updated, layout.zoomGroup, xScale, yScale, layout, ctx);
    const after = layout.zoomGroup.selectAll<SVGGElement, PointDatum>('.dot-group').nodes();

    expect(after).toHaveLength(before.length);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    const boundData = layout.zoomGroup.selectAll<SVGGElement, PointDatum>('.dot-group').data();
    expect(boundData.map((point) => point.y)).toEqual([8, 6]);
    expect(after[0].getAttribute('transform')).toBe(`translate(${xScale(2)},${yScale(8)})`);
  });
});

describe('updateLayerForDisplay', () => {
  it('recolors points, labels, and rooflines without replacing marks or changing zoomed geometry', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const layout = setupChartStructure(svg, {
      chartId: 'display-phase-test',
      containerWidth: 400,
      containerHeight: 300,
      margin: { top: 10, right: 10, bottom: 20, left: 30 },
      watermark: 'none',
    });
    const xScale = d3.scaleLinear().domain([0, 10]).range([0, layout.width]);
    const yScale = d3.scaleLinear().domain([0, 10]).range([layout.height, 0]);
    const ctx: RenderContext = {
      layout,
      tooltipElement: document.createElement('div'),
      xScale,
      yScale,
      width: layout.width,
      height: layout.height,
    };
    const data = [{ id: 'a', precision: 'fp8', x: 1, y: 2 }];
    const initialPointLayer = {
      type: 'scatter',
      data,
      keyFn: (point: PointDatum) => point.id,
      config: {
        getColor: () => '#000000',
        getLabelText: () => 'point',
        foreground: '#111111',
        selectedPrecisions: ['fp8'],
      },
    } satisfies LayerConfig<PointDatum>;
    const initialRooflineLayer = {
      type: 'roofline',
      rooflines: {
        series: [
          { x: 1, y: 2 },
          { x: 4, y: 5 },
        ],
      },
      config: { getColor: () => '#000000' },
    } satisfies LayerConfig<PointDatum>;
    renderLayer(initialPointLayer, layout.zoomGroup, xScale, yScale, layout, ctx);
    renderLayer(initialRooflineLayer, layout.zoomGroup, xScale, yScale, layout, ctx);

    const point = layout.zoomGroup.select<SVGGElement>('.dot-group');
    const roofline = layout.zoomGroup.select<SVGPathElement>('.roofline-path');
    const pointNode = point.node();
    const rooflineNode = roofline.node();
    point.attr('transform', 'translate(123,45)');
    roofline.attr('d', 'M 123 45 L 234 56');

    updateLayerForDisplay(
      {
        ...initialPointLayer,
        config: {
          ...initialPointLayer.config,
          getColor: () => '#ff0000',
          foreground: '#eeeeee',
          hideLabels: true,
        },
      },
      layout.zoomGroup,
      ctx,
    );
    updateLayerForDisplay(
      {
        ...initialRooflineLayer,
        config: { getColor: () => '#00ff00' },
      },
      layout.zoomGroup,
      ctx,
    );

    expect(point.node()).toBe(pointNode);
    expect(roofline.node()).toBe(rooflineNode);
    expect(point.attr('transform')).toBe('translate(123,45)');
    expect(roofline.attr('d')).toBe('M 123 45 L 234 56');
    expect(point.select('.visible-shape').attr('fill')).toBe('#ff0000');
    expect(point.select('.point-label').attr('fill')).toBe('#eeeeee');
    expect(point.select('.point-label').style('display')).toBe('none');
    expect(roofline.attr('stroke')).toBe('#00ff00');
  });
});
