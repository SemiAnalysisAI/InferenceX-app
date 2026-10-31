// @vitest-environment jsdom
import * as d3 from 'd3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupChartStructure } from './chart-setup';
import { renderLayer } from './D3Chart/layer-renderer';
import type { D3ChartProps, RenderContext } from './D3Chart/types';
import {
  registerChartExportRenderer,
  renderChartForExport,
  renderExportChart,
} from './export-renderer';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('isolated PNG chart rendering', () => {
  it('recomputes axes and keyed marks, keeping typography, source DOM and scales unchanged', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.append(svg);
    const margin = { top: 24, right: 10, bottom: 40, left: 60 };
    const layout = setupChartStructure(svg, {
      chartId: 'export-test',
      containerWidth: 800,
      containerHeight: 600,
      margin,
      watermark: 'none',
    });
    const scales = {
      xScale: d3.scaleLinear().domain([0, 10]).range([0, layout.width]),
      yScale: d3.scaleLinear().domain([0, 10]).range([layout.height, 0]),
    };
    const data = [{ id: 'a', x: 2, y: 4, precision: 'fp16' }];
    const onRender = vi.fn();
    const onExportRender = vi.fn();
    const props: D3ChartProps<(typeof data)[number]> = {
      data,
      chartId: 'export-test',
      margin,
      watermark: 'none',
      xScale: { type: 'linear', domain: [0, 10] },
      yScale: { type: 'linear', domain: [0, 10] },
      xAxis: { label: 'X' },
      yAxis: { label: 'Y' },
      onRender,
      onExportRender,
      layers: [
        {
          type: 'scatter',
          data,
          keyFn: (d) => d.id,
          config: { getColor: () => '#f00', getLabelText: () => 'A' },
        },
      ],
    };
    const ctx = {
      layout,
      ...scales,
      width: layout.width,
      height: layout.height,
      transitionDuration: 0,
      tooltipElement: document.createElement('div'),
    } as RenderContext;
    renderLayer(props.layers[0], layout.zoomGroup, scales.xScale, scales.yScale, layout, ctx);
    const before = svg.outerHTML;
    const mark = svg.querySelector('.dot-group')!;
    const radius = mark.querySelector('.visible-shape')!.getAttribute('r');
    const unregister = registerChartExportRenderer(svg, (target, w, h) =>
      renderExportChart(target, w, h, props, scales),
    );
    const clone = svg.cloneNode(true) as SVGSVGElement;
    document.body.append(clone);
    renderChartForExport(svg, clone, 1200, 400);
    expect(clone.querySelectorAll('.dot-group')).toHaveLength(1);
    expect(clone.querySelector('.dot-group')!.getAttribute('transform')).toBe(
      'translate(226,201.6)',
    );
    expect(clone.querySelector('.visible-shape')!.getAttribute('r')).toBe(radius);
    expect(clone.querySelector('.x-axis')!.getAttribute('transform')).toBe('translate(0,336)');
    expect(clone.querySelector('clipPath rect')!.getAttribute('width')).toBe('1130');
    expect(clone.querySelector('.zoom-group')!.getAttribute('clip-path')).toBe(
      'url(#clip-export-test-png)',
    );
    expect(onExportRender).toHaveBeenCalledOnce();
    expect(onRender).not.toHaveBeenCalled();
    expect(svg.outerHTML).toBe(before);
    expect(scales.xScale.range()).toEqual([0, 730]);
    expect(scales.yScale.range()).toEqual([536, 0]);
    unregister();
    expect(() => renderChartForExport(svg, clone, 1000, 800)).toThrow('not ready');
  });
});
