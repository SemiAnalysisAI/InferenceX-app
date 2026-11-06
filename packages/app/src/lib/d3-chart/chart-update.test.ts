// @vitest-environment jsdom
import * as d3 from 'd3';
import { describe, it, expect } from 'vitest';

import { setupChartStructure } from './chart-setup';
import {
  raiseInOrder,
  renderAxes,
  renderGrid,
  setAttrIfChanged,
  setStyleIfChanged,
  setTextIfChanged,
  writeAttrs,
  writeText,
} from './chart-update';
import type { ChartLayout, ChartSetupConfig } from './types';

function makeSvgEl(): SVGSVGElement {
  return d3.create('svg:svg').node()! as SVGSVGElement;
}

function makeLayout(overrides?: Partial<ChartSetupConfig>): ChartLayout {
  const svgEl = makeSvgEl();
  return setupChartStructure(svgEl, {
    chartId: 'test',
    containerWidth: 800,
    containerHeight: 600,
    margin: { top: 20, right: 30, bottom: 40, left: 50 },
    watermark: 'none',
    ...overrides,
  });
}

describe('renderAxes', () => {
  describe('with linear scales', () => {
    it('renders x and y axis tick marks', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderAxes(layout, xScale, yScale, {});

      expect(layout.xAxisGroup.select('.domain').empty()).toBe(false);
      expect(layout.yAxisGroup.select('.domain').empty()).toBe(false);
      expect(layout.xAxisGroup.selectAll('.tick').size()).toBeGreaterThan(0);
      expect(layout.yAxisGroup.selectAll('.tick').size()).toBeGreaterThan(0);
    });

    it('respects xTickCount', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderAxes(layout, xScale, yScale, { xTickCount: 3 });

      const tickCount = layout.xAxisGroup.selectAll('.tick').size();
      expect(tickCount).toBeGreaterThan(0);
      expect(tickCount).toBeLessThanOrEqual(8);
    });

    it('thins x ticks and grid lines to about one per 80px on a narrow plot', () => {
      const layout = makeLayout({ containerWidth: 340 });
      const xScale = d3.scaleLinear().domain([0, 700]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderAxes(layout, xScale, yScale, { xTickCount: 10 });
      renderGrid(layout, xScale, yScale);

      const labels = layout.xAxisGroup
        .selectAll<SVGTextElement, unknown>('.tick text')
        .nodes()
        .map((node) => node.textContent);
      expect(labels).toEqual(['0', '200', '400', '600']);
      expect(layout.gridGroup.select('.grid-v').selectAll('line').size()).toBe(4);
    });

    it('renders only explicit x tick values within the visible domain', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([2, 10]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderAxes(layout, xScale, yScale, {
        xTickValues: [1, 2, 4, 16],
        xTickFormat: String,
      });

      const labels: string[] = [];
      layout.xAxisGroup.selectAll('.tick text').each(function () {
        labels.push(d3.select(this).text());
      });
      expect(labels).toEqual(['2', '4']);
    });

    it('hides the label next to a clamped last x tick when they collide', () => {
      Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
        value: () => 60,
        configurable: true,
      });
      try {
        const layout = makeLayout();
        const xScale = d3.scaleLinear().domain([0, layout.width]).range([0, layout.width]);
        const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

        renderAxes(layout, xScale, yScale, {
          xTickValues: [0, layout.width - 40, layout.width],
          xTickFormat: String,
        });

        const ticks = layout.xAxisGroup.selectAll<SVGGElement, unknown>('.tick').nodes();
        const text = (index: number) => ticks[index].querySelector('text')!;
        expect(text(2).getAttribute('dx')).toBe('-30');
        expect(text(1).getAttribute('visibility')).toBe('hidden');
        expect(ticks[1].querySelector('line')).not.toBeNull();
        expect(text(0).getAttribute('visibility')).toBeNull();
      } finally {
        Reflect.deleteProperty(SVGElement.prototype, 'getComputedTextLength');
      }
    });

    it('respects yTickCount', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderAxes(layout, xScale, yScale, { yTickCount: 2 });

      const tickCount = layout.yAxisGroup.selectAll('.tick').size();
      expect(tickCount).toBeGreaterThan(0);
      expect(tickCount).toBeLessThanOrEqual(6);
    });

    it('applies custom xTickFormat', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderAxes(layout, xScale, yScale, {
        xTickFormat: (d) => `$${d}`,
      });

      const tickTexts: string[] = [];
      layout.xAxisGroup.selectAll('.tick text').each(function () {
        tickTexts.push(d3.select(this).text());
      });
      expect(tickTexts.length).toBeGreaterThan(0);
      for (const t of tickTexts) {
        expect(t).toMatch(/^\$/u);
      }
    });

    it('applies custom yTickFormat', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderAxes(layout, xScale, yScale, {
        yTickFormat: (d) => `${d}ms`,
      });

      const tickTexts: string[] = [];
      layout.yAxisGroup.selectAll('.tick text').each(function () {
        tickTexts.push(d3.select(this).text());
      });
      expect(tickTexts.length).toBeGreaterThan(0);
      for (const t of tickTexts) {
        expect(t).toMatch(/ms$/u);
      }
    });

    it('defaults yTickSize to 6 for linear scale', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderAxes(layout, xScale, yScale, {});

      const firstTickLine = layout.yAxisGroup.select('.tick line');
      if (!firstTickLine.empty()) {
        expect(Number(firstTickLine.attr('x2'))).toBe(-6);
      }
    });

    it('uses provided yTickSize for linear scale', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderAxes(layout, xScale, yScale, { yTickSize: 10 });

      const firstTickLine = layout.yAxisGroup.select('.tick line');
      if (!firstTickLine.empty()) {
        expect(Number(firstTickLine.attr('x2'))).toBe(-10);
      }
    });
  });

  describe('with log scales', () => {
    it('uses measured geometric sweep values instead of generated log subdivisions', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLog().base(2).domain([0.9, 70]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);
      const measuredValues = [1, 2, 4, 8, 16, 32, 64];

      renderAxes(layout, xScale, yScale, {
        xTickValues: measuredValues,
        xTickFormat: String,
      });

      const labels: string[] = [];
      layout.xAxisGroup.selectAll('.tick text').each(function () {
        labels.push(d3.select(this).text());
      });
      expect(labels).toEqual(measuredValues.map(String));
    });
  });

  describe('with band scales', () => {
    it('renders band scale on x-axis', () => {
      const layout = makeLayout();
      const xScale = d3.scaleBand().domain(['A', 'B', 'C']).range([0, layout.width]).padding(0.1);
      const yScale = d3.scaleLinear().domain([0, 100]).range([layout.height, 0]);

      renderAxes(layout, xScale, yScale, {});

      const tickTexts: string[] = [];
      layout.xAxisGroup.selectAll('.tick text').each(function () {
        tickTexts.push(d3.select(this).text());
      });
      expect(tickTexts).toEqual(['A', 'B', 'C']);
    });

    it('renders band scale on y-axis with default tickSize 0', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3
        .scaleBand()
        .domain(['Low', 'Med', 'High'])
        .range([layout.height, 0])
        .padding(0.1);

      renderAxes(layout, xScale, yScale, {});

      const tickTexts: string[] = [];
      layout.yAxisGroup.selectAll('.tick text').each(function () {
        tickTexts.push(d3.select(this).text());
      });
      expect(tickTexts).toEqual(['Low', 'Med', 'High']);

      const firstTickLine = layout.yAxisGroup.select('.tick line');
      if (!firstTickLine.empty()) {
        expect(Number(firstTickLine.attr('x2'))).toBe(0);
      }
    });

    it('uses provided yTickSize for band scale', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleBand().domain(['A', 'B']).range([layout.height, 0]).padding(0.1);

      renderAxes(layout, xScale, yScale, { yTickSize: 4 });

      const firstTickLine = layout.yAxisGroup.select('.tick line');
      if (!firstTickLine.empty()) {
        expect(Number(firstTickLine.attr('x2'))).toBe(-4);
      }
    });
  });

  describe('with log scale', () => {
    it('renders log scale on y-axis', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLog().domain([1, 1000]).range([layout.height, 0]);

      renderAxes(layout, xScale, yScale, {});

      expect(layout.yAxisGroup.selectAll('.tick').size()).toBeGreaterThan(0);
      expect(layout.yAxisGroup.select('.domain').empty()).toBe(false);
    });
  });

  describe('with transitionDuration', () => {
    it('renders axes with transitionDuration > 0 for linear scales', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderAxes(layout, xScale, yScale, { transitionDuration: 300 });

      expect(layout.xAxisGroup.select('.domain').empty()).toBe(false);
      expect(layout.yAxisGroup.select('.domain').empty()).toBe(false);
    });

    it('renders axes with transitionDuration > 0 for band y-scale', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleBand().domain(['A', 'B', 'C']).range([layout.height, 0]).padding(0.1);

      renderAxes(layout, xScale, yScale, { transitionDuration: 200 });

      expect(layout.xAxisGroup.select('.domain').empty()).toBe(false);
      expect(layout.yAxisGroup.select('.domain').empty()).toBe(false);
    });

    it('renders axes with transitionDuration > 0 for band x-scale', () => {
      const layout = makeLayout();
      const xScale = d3.scaleBand().domain(['X', 'Y']).range([0, layout.width]).padding(0.1);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderAxes(layout, xScale, yScale, { transitionDuration: 150 });

      expect(layout.xAxisGroup.select('.domain').empty()).toBe(false);
      expect(layout.yAxisGroup.select('.domain').empty()).toBe(false);
    });
  });

  describe('idempotency', () => {
    it('calling renderAxes twice does not duplicate domain paths', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderAxes(layout, xScale, yScale, {});
      renderAxes(layout, xScale, yScale, {});

      expect(layout.xAxisGroup.selectAll('.domain').size()).toBe(1);
      expect(layout.yAxisGroup.selectAll('.domain').size()).toBe(1);
    });

    it('updates ticks when scale domain changes', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 10]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 10]).range([layout.height, 0]);

      renderAxes(layout, xScale, yScale, {});
      const ticks1 = layout.xAxisGroup.selectAll('.tick').size();

      xScale.domain([0, 1000]);
      renderAxes(layout, xScale, yScale, {});
      const ticks2 = layout.xAxisGroup.selectAll('.tick').size();

      expect(ticks1).toBeGreaterThan(0);
      expect(ticks2).toBeGreaterThan(0);
    });

    it('leaves the Y-axis subtree untouched during an X-only update', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 10]).range([0, layout.width]);
      const yScale = d3
        .scaleBand()
        .domain(['Alpha', 'Beta'])
        .range([layout.height, 0])
        .padding(0.1);

      renderAxes(layout, xScale, yScale, {});
      layout.yAxisGroup.select('.tick text').append('tspan').attr('data-static-label', 'true');
      const yRoot = layout.yAxisGroup.node();
      const yFirstChild = yRoot?.firstChild;
      const yMarkup = yRoot?.innerHTML;

      xScale.domain([2, 6]);
      renderAxes(layout, xScale, yScale.domain(['Changed']), { axes: 'x' });

      expect(layout.yAxisGroup.node()).toBe(yRoot);
      expect(layout.yAxisGroup.node()?.firstChild).toBe(yFirstChild);
      expect(layout.yAxisGroup.node()?.innerHTML).toBe(yMarkup);
    });
  });
});

describe('renderGrid', () => {
  describe('with linear scales', () => {
    it('creates vertical grid lines matching x-scale ticks', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale);

      const vGroup = layout.gridGroup.select('.grid-v');
      expect(vGroup.empty()).toBe(false);
      const vLines = vGroup.selectAll('line').size();
      expect(vLines).toBeGreaterThan(0);
    });

    it('uses explicit x tick values for vertical grid lines', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLog().base(2).domain([1, 64]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);
      const measuredValues = [1, 4, 16, 64];

      renderGrid(layout, xScale, yScale, 5, 0, measuredValues);

      const positions: number[] = [];
      layout.gridGroup
        .select('.grid-v')
        .selectAll('line')
        .each(function () {
          positions.push(Number(d3.select(this).attr('x1')));
        });
      expect(positions).toEqual(measuredValues.map((value) => xScale(value)));
    });

    it('creates horizontal grid lines matching y-scale ticks', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale);

      const hGroup = layout.gridGroup.select('.grid-h');
      expect(hGroup.empty()).toBe(false);
      const hLines = hGroup.selectAll('line').size();
      expect(hLines).toBeGreaterThan(0);
    });

    it('vertical lines span full chart height', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale);

      const firstVLine = layout.gridGroup.select('.grid-v line');
      expect(Number(firstVLine.attr('y1'))).toBe(0);
      expect(Number(firstVLine.attr('y2'))).toBe(layout.height);
    });

    it('horizontal lines span full chart width', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale);

      const firstHLine = layout.gridGroup.select('.grid-h line');
      expect(Number(firstHLine.attr('x1'))).toBe(0);
      expect(Number(firstHLine.attr('x2'))).toBe(layout.width);
    });

    it('vertical line x-positions correspond to scale tick values', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale);

      const ticks = xScale.ticks();
      const lineXPositions: number[] = [];
      layout.gridGroup
        .select('.grid-v')
        .selectAll('line')
        .each(function () {
          lineXPositions.push(Number(d3.select(this).attr('x1')));
        });

      expect(lineXPositions.length).toBe(ticks.length);
      for (let i = 0; i < ticks.length; i++) {
        expect(lineXPositions[i]).toBeCloseTo(xScale(ticks[i]));
      }
    });

    it('horizontal line y-positions correspond to scale tick values', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);
      const yTickCount = 5;

      renderGrid(layout, xScale, yScale, yTickCount);

      const ticks = yScale.ticks(yTickCount);
      const lineYPositions: number[] = [];
      layout.gridGroup
        .select('.grid-h')
        .selectAll('line')
        .each(function () {
          lineYPositions.push(Number(d3.select(this).attr('y1')));
        });

      expect(lineYPositions.length).toBe(ticks.length);
      for (let i = 0; i < ticks.length; i++) {
        expect(lineYPositions[i]).toBeCloseTo(yScale(ticks[i]));
      }
    });

    it('respects yTickCount parameter', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale, 3);
      const hLines3 = layout.gridGroup.select('.grid-h').selectAll('line').size();

      const layout2 = makeLayout();
      renderGrid(layout2, xScale, yScale, 10);
      const hLines10 = layout2.gridGroup.select('.grid-h').selectAll('line').size();

      expect(hLines3).toBeGreaterThan(0);
      expect(hLines10).toBeGreaterThan(0);
      expect(hLines10).toBeGreaterThanOrEqual(hLines3);
    });

    it('defaults yTickCount to 5 when not provided', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale);

      const expectedTicks = yScale.ticks(5);
      const actualLines = layout.gridGroup.select('.grid-h').selectAll('line').size();
      expect(actualLines).toBe(expectedTicks.length);
    });
  });

  describe('visibility', () => {
    it('skips vertical lines when x grid is disabled but keeps horizontal ones', () => {
      const layout = makeLayout();
      const domain = ['A', 'B', 'C', 'D'];
      const xScale = d3.scaleBand().domain(domain).range([0, layout.width]).padding(0.1);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale, 5, 0, undefined, undefined, 'both', { x: false });

      expect(layout.gridGroup.select('.grid-v').selectAll('line').size()).toBe(0);
      expect(layout.gridGroup.select('.grid-h').selectAll('line').size()).toBeGreaterThan(0);
    });

    it('removes previously drawn vertical lines when x grid is turned off', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale);
      expect(layout.gridGroup.select('.grid-v').selectAll('line').size()).toBeGreaterThan(0);

      renderGrid(layout, xScale, yScale, 5, 0, undefined, undefined, 'both', { x: false });
      expect(layout.gridGroup.select('.grid-v').selectAll('line').size()).toBe(0);
      expect(layout.gridGroup.select('.grid-h').selectAll('line').size()).toBeGreaterThan(0);
    });

    it('skips horizontal lines when y grid is disabled', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale, 5, 0, undefined, undefined, 'both', { y: false });

      expect(layout.gridGroup.select('.grid-h').selectAll('line').size()).toBe(0);
      expect(layout.gridGroup.select('.grid-v').selectAll('line').size()).toBeGreaterThan(0);
    });
  });

  describe('with band scales', () => {
    it('creates vertical lines at band centers for band x-scale', () => {
      const layout = makeLayout();
      const domain = ['A', 'B', 'C', 'D'];
      const xScale = d3.scaleBand().domain(domain).range([0, layout.width]).padding(0.1);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale);

      const vGroup = layout.gridGroup.select('.grid-v');
      const vLines = vGroup.selectAll('line').size();
      expect(vLines).toBe(domain.length);

      const lineXPositions: number[] = [];
      vGroup.selectAll('line').each(function () {
        lineXPositions.push(Number(d3.select(this).attr('x1')));
      });

      for (let i = 0; i < domain.length; i++) {
        const expected = (xScale(domain[i]) || 0) + xScale.bandwidth() / 2;
        expect(lineXPositions[i]).toBeCloseTo(expected);
      }
    });

    it('creates horizontal lines at band centers for band y-scale', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const domain = ['Low', 'Med', 'High'];
      const yScale = d3.scaleBand().domain(domain).range([layout.height, 0]).padding(0.1);

      renderGrid(layout, xScale, yScale);

      const hGroup = layout.gridGroup.select('.grid-h');
      const hLines = hGroup.selectAll('line').size();
      expect(hLines).toBe(domain.length);

      hGroup.selectAll('line').each(function () {
        const line = d3.select(this);
        expect(Number(line.attr('x1'))).toBe(0);
        expect(Number(line.attr('x2'))).toBe(layout.width);
      });
    });

    it('applies stroke-width 0.5 to horizontal band grid lines', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleBand().domain(['A', 'B']).range([layout.height, 0]).padding(0.1);

      renderGrid(layout, xScale, yScale);

      const firstHLine = layout.gridGroup.select('.grid-h line');
      expect(firstHLine.style('stroke-width')).toBe('0.5');
    });
  });

  describe('idempotency', () => {
    it('does not duplicate grid-v or grid-h groups on second call', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale);
      renderGrid(layout, xScale, yScale);

      expect(layout.gridGroup.selectAll('.grid-v').size()).toBe(1);
      expect(layout.gridGroup.selectAll('.grid-h').size()).toBe(1);
    });

    it('leaves the horizontal grid subtree untouched during an X-only update', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale);
      const horizontalGrid = layout.gridGroup.select<SVGGElement>('.grid-h').node();
      const firstLine = horizontalGrid?.firstChild;
      const markup = horizontalGrid?.innerHTML;

      xScale.domain([25, 50]);
      yScale.domain([500, 1000]);
      renderGrid(layout, xScale, yScale, 5, 0, undefined, undefined, 'x');

      expect(layout.gridGroup.select('.grid-h').node()).toBe(horizontalGrid);
      expect(horizontalGrid?.firstChild).toBe(firstLine);
      expect(horizontalGrid?.innerHTML).toBe(markup);
    });

    it('updates line positions when scale domain changes', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale);

      const ticks1 = xScale.ticks();
      const positions1: number[] = [];
      layout.gridGroup
        .select('.grid-v')
        .selectAll('line')
        .each(function () {
          positions1.push(Number(d3.select(this).attr('x1')));
        });
      expect(positions1.length).toBe(ticks1.length);
      for (let i = 0; i < ticks1.length; i++) {
        expect(positions1[i]).toBeCloseTo(xScale(ticks1[i]));
      }

      xScale.domain([0, 1000]);
      renderGrid(layout, xScale, yScale);

      const ticks2 = xScale.ticks();
      const positions2: number[] = [];
      layout.gridGroup
        .select('.grid-v')
        .selectAll('line')
        .each(function () {
          positions2.push(Number(d3.select(this).attr('x1')));
        });
      expect(positions2.length).toBe(ticks2.length);
      for (let i = 0; i < ticks2.length; i++) {
        expect(positions2[i]).toBeCloseTo(xScale(ticks2[i]));
      }
    });

    it('data-join removes excess lines when domain shrinks', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale);
      const initialCount = layout.gridGroup.select('.grid-v').selectAll('line').size();

      xScale.domain([0, 2]);
      renderGrid(layout, xScale, yScale);
      const updatedCount = layout.gridGroup.select('.grid-v').selectAll('line').size();

      expect(initialCount).toBeGreaterThan(0);
      expect(updatedCount).toBeGreaterThan(0);
      expect(updatedCount).toBeLessThanOrEqual(initialCount);
    });
  });

  describe('with transitionDuration', () => {
    it('renders grid with transitionDuration > 0 for linear scales', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale, 5, 300);

      expect(layout.gridGroup.select('.grid-v').selectAll('line').size()).toBeGreaterThan(0);
      expect(layout.gridGroup.select('.grid-h').selectAll('line').size()).toBeGreaterThan(0);
    });

    it('updates grid with transitionDuration > 0 on second call', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale);

      xScale.domain([0, 200]);
      renderGrid(layout, xScale, yScale, 5, 200);

      expect(layout.gridGroup.select('.grid-v').selectAll('line').size()).toBeGreaterThan(0);
      expect(layout.gridGroup.select('.grid-h').selectAll('line').size()).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('handles single-value domain', () => {
      const layout = makeLayout();
      const xScale = d3.scaleBand().domain(['Only']).range([0, layout.width]).padding(0.1);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale);

      const vLines = layout.gridGroup.select('.grid-v').selectAll('line').size();
      expect(vLines).toBe(1);
    });

    it('handles empty band domain gracefully', () => {
      const layout = makeLayout();
      const xScale = d3.scaleBand().domain([]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale);

      const vLines = layout.gridGroup.select('.grid-v').selectAll('line').size();
      expect(vLines).toBe(0);
    });

    it('works with both x and y as band scales', () => {
      const layout = makeLayout();
      const xScale = d3.scaleBand().domain(['X1', 'X2']).range([0, layout.width]).padding(0.1);
      const yScale = d3
        .scaleBand()
        .domain(['Y1', 'Y2', 'Y3'])
        .range([layout.height, 0])
        .padding(0.1);

      renderGrid(layout, xScale, yScale);

      expect(layout.gridGroup.select('.grid-v').selectAll('line').size()).toBe(2);
      expect(layout.gridGroup.select('.grid-h').selectAll('line').size()).toBe(3);
    });
  });
});

const SVG_NS = 'http://www.w3.org/2000/svg';

function makeGroup(classes: string[]) {
  const group = document.createElementNS(SVG_NS, 'g');
  for (const cls of classes) {
    const child = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    child.setAttribute('class', cls);
    child.dataset.id = `${cls}-${group.childNodes.length}`;
    group.append(child);
  }
  return group;
}

const order = (group: Element) =>
  [...group.children].map((child) => (child as SVGElement).dataset.id);

function recordMutations(root: Node, run: () => void): MutationRecord[] {
  const observer = new MutationObserver(() => undefined);
  observer.observe(root, { attributes: true, childList: true, characterData: true, subtree: true });
  run();
  const records = observer.takeRecords();
  observer.disconnect();
  return records;
}

describe('write-if-changed helpers', () => {
  it('emit no records for unchanged values and one per real change', () => {
    const element = document.createElementNS(SVG_NS, 'text');
    setAttrIfChanged(element, 'fill', 'red');
    setStyleIfChanged(element, 'opacity', '1');
    setTextIfChanged(element, 'TP8');

    expect(
      recordMutations(element, () => {
        setAttrIfChanged(element, 'fill', 'red');
        setStyleIfChanged(element, 'opacity', '1');
        setTextIfChanged(element, 'TP8');
      }),
    ).toHaveLength(0);

    expect(
      recordMutations(element, () => {
        setAttrIfChanged(element, 'fill', 'blue');
        setStyleIfChanged(element, 'opacity', '0');
        setTextIfChanged(element, 'TP4');
      }).map((record) => record.attributeName ?? record.type),
    ).toEqual(['fill', 'style', 'childList']);
  });

  it("clears a style property for '' like selection.style(name, '')", () => {
    const element = document.createElementNS(SVG_NS, 'text');
    element.style.display = 'none';
    setStyleIfChanged(element, 'display', '');
    expect(element.style.display).toBe('');
  });
});

describe('writeAttrs and writeText', () => {
  it('write only changed attributes, remove nullish ones and keep attribute order', () => {
    const element = document.createElementNS(SVG_NS, 'rect');
    const selection = d3.select(element).datum(2);
    writeAttrs(selection, { x: (d) => d * 10, class: 'bar', fill: 'red' });
    expect(element.outerHTML).toBe('<rect x="20" class="bar" fill="red"></rect>');

    const records = recordMutations(element, () =>
      writeAttrs(selection, { x: (d) => d * 10, class: () => undefined, fill: null, y: 5 }),
    );
    expect(records.map((record) => record.attributeName)).toEqual(['class', 'fill', 'y']);
    expect(element.outerHTML).toBe('<rect x="20" y="5"></rect>');
  });

  it('replace element children with one text node, as selection.text does', () => {
    const element = document.createElementNS(SVG_NS, 'text');
    const tspan = document.createElementNS(SVG_NS, 'tspan');
    tspan.textContent = 'TP8';
    element.append(tspan);
    const selection = d3.select(element).datum('TP8');

    writeText(selection, (d) => d);
    expect(element.outerHTML).toBe('<text>TP8</text>');
    expect(recordMutations(element, () => writeText(selection, (d) => d))).toHaveLength(0);

    writeText(selection, () => null);
    expect(element.childNodes).toHaveLength(0);
    expect(recordMutations(element, () => writeText(selection, () => ''))).toHaveLength(0);

    element.append('TP8', tspan);
    writeText(selection, (d) => d);
    expect(element.outerHTML).toBe('<text>TP8</text>');
  });
});

const prefixedLabel = (d: d3.AxisDomain) => `#${String(d)}`;

describe('renderAxes parity with d3-axis', () => {
  it('renders the same DOM as d3 axis generators across domain, format and tick changes', () => {
    const ours = makeLayout();
    const theirs = makeLayout();
    const steps: [
      d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>,
      number[] | undefined,
    ][] = [
      [d3.scaleLinear().domain([0, 100]).range([0, 720]), undefined],
      [d3.scaleLinear().domain([20, 60]).range([0, 720]), undefined],
      [d3.scaleLinear().domain([60, 20]).range([0, 720]), [25, 30, 55, 70]],
      [d3.scaleLog().domain([1, 1000]).range([0, 720]), undefined],
    ];
    for (const [index, [xScale, tickValues]] of steps.entries()) {
      const yScale = d3
        .scaleLinear()
        .domain([0, 10 * (index + 1)])
        .range([540, 0]);
      renderAxes(ours, xScale, yScale, {
        xTickCount: index === 1 ? 4 : undefined,
        xTickValues: tickValues,
        xTickFormat: index === 2 ? prefixedLabel : undefined,
        yTickCount: 3,
        yTickSize: index === 3 ? 0 : undefined,
      });
      const xGen = d3.axisBottom(xScale).tickSize(6);
      if (index === 1) xGen.ticks(4);
      if (tickValues) xGen.tickValues(tickValues.filter((v) => v >= 20 && v <= 60));
      if (index === 2) xGen.tickFormat(prefixedLabel);
      theirs.xAxisGroup.call(xGen);
      theirs.yAxisGroup.call(
        d3
          .axisLeft(yScale)
          .tickSize(index === 3 ? 0 : 6)
          .ticks(3),
      );
      expect(ours.xAxisGroup.node()!.outerHTML).toBe(theirs.xAxisGroup.node()!.outerHTML);
      expect(ours.yAxisGroup.node()!.outerHTML).toBe(theirs.yAxisGroup.node()!.outerHTML);
    }
  });

  it('matches d3 for band and time scales and after labels are customized', () => {
    const ours = makeLayout();
    const theirs = makeLayout();
    const split = (group: d3.Selection<SVGGElement, unknown, null, undefined>) => {
      group.selectAll('.tick').attr('data-mark', (_, index) => String(index));
      group.selectAll<SVGTextElement, unknown>('.tick text').each(function () {
        const label = this.textContent ?? '';
        this.textContent = '';
        const tspan = document.createElementNS(SVG_NS, 'tspan');
        tspan.textContent = label;
        this.append(tspan);
      });
    };
    const domains = [
      ['b200 fp4', 'h100 fp8', 'mi355x fp4'],
      ['h100 fp8', 'gb200 fp4', 'b200 fp4', 'mi300x fp8'],
      ['h100 fp8', 'gb200 fp4', 'b200 fp4', 'mi300x fp8'],
    ];
    for (const [index, domain] of domains.entries()) {
      const yScale = d3.scaleBand().domain(domain).range([0, 540]).padding(0.2);
      const xScale = d3
        .scaleTime()
        .domain([new Date(2026, 0, 1), new Date(2026, index + 2, 1)])
        .range([0, 720]);
      renderAxes(ours, xScale, yScale, { xTickCount: 5 });
      theirs.xAxisGroup.call(d3.axisBottom(xScale).tickSize(6).ticks(5));
      theirs.yAxisGroup.call(d3.axisLeft(yScale).tickSize(0));
      expect(ours.xAxisGroup.node()!.outerHTML).toBe(theirs.xAxisGroup.node()!.outerHTML);
      expect(ours.yAxisGroup.node()!.outerHTML).toBe(theirs.yAxisGroup.node()!.outerHTML);
      split(ours.yAxisGroup);
      split(theirs.yAxisGroup);
    }
    const bandX = d3.scaleBand().domain(['a', 'b', 'c']).range([0, 720]).round(true);
    renderAxes(ours, bandX, d3.scaleLinear().range([540, 0]), { xTickFormat: (d) => `#${d}` });
    theirs.xAxisGroup.call(
      d3
        .axisBottom(bandX)
        .tickSize(6)
        .tickFormat((d) => `#${d}`),
    );
    expect(ours.xAxisGroup.node()!.outerHTML).toBe(theirs.xAxisGroup.node()!.outerHTML);
  });

  it('writes nothing when axes and grid are re-rendered with unchanged scales', () => {
    const layout = makeLayout();
    const xScale = d3.scaleLinear().domain([0, 100]).range([0, 720]);
    const yScale = d3.scaleLinear().domain([0, 10]).range([540, 0]);
    renderAxes(layout, xScale, yScale, {});
    renderGrid(layout, xScale, yScale, 5);
    expect(
      recordMutations(layout.g.node()!, () => {
        renderAxes(layout, xScale, yScale, {});
        renderGrid(layout, xScale, yScale, 5);
      }),
    ).toHaveLength(0);
  });
});

describe('raiseInOrder', () => {
  const SELECTORS = ['.dot-group', '.point', '.line-label'];

  it('matches sequential selection.raise() calls', () => {
    const classes = ['line-label', 'roofline', 'dot-group', 'point', 'roofline', 'dot-group'];
    const expected = makeGroup(classes);
    for (const selector of SELECTORS) d3.select(expected).selectAll(selector).raise();
    const actual = makeGroup(classes);

    raiseInOrder(d3.select(actual), SELECTORS);

    expect(order(actual)).toEqual(order(expected));
  });

  it('moves nothing when the DOM is already in raised order', () => {
    const group = makeGroup(['roofline', 'dot-group', 'dot-group', 'point', 'line-label']);

    expect(recordMutations(group, () => raiseInOrder(d3.select(group), SELECTORS))).toHaveLength(0);
  });

  it('reorders when a new element lands after the raised tail', () => {
    const group = makeGroup(['roofline', 'dot-group', 'line-label']);
    const late = document.createElementNS(SVG_NS, 'path') as SVGPathElement;
    late.dataset.id = 'late-roofline';
    group.append(late);

    raiseInOrder(d3.select(group), SELECTORS);

    expect(order(group)).toEqual(['roofline-0', 'late-roofline', 'dot-group-1', 'line-label-2']);
  });
});
