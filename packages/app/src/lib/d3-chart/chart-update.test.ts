// @vitest-environment jsdom
import * as d3 from 'd3';
import { describe, it, expect } from 'vitest';

import { setupChartStructure } from './chart-setup';
import { renderAxes, renderGrid } from './chart-update';
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

      // D3 axisBottom/axisLeft create .tick groups and a .domain path
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

      // D3 .ticks(3) is a hint, not exact, but should produce roughly 3-5 ticks
      const tickCount = layout.xAxisGroup.selectAll('.tick').size();
      expect(tickCount).toBeGreaterThan(0);
      expect(tickCount).toBeLessThanOrEqual(8);
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
      // Every formatted tick should start with $
      for (const t of tickTexts) {
        expect(t).toMatch(/^\$/);
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
        expect(t).toMatch(/ms$/);
      }
    });

    it('defaults yTickSize to 6 for linear scale', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderAxes(layout, xScale, yScale, {});

      // D3 creates <line> inside each .tick with x2 = -tickSize for axisLeft
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

      // Default yTickSize for band is 0
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

      // Should not throw — the transition path creates a d3 transition
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

      // D3 axis replaces content, so there should be exactly 1 .domain per axis group
      expect(layout.xAxisGroup.selectAll('.domain').size()).toBe(1);
      expect(layout.yAxisGroup.selectAll('.domain').size()).toBe(1);
    });

    it('updates ticks when scale domain changes', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 10]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 10]).range([layout.height, 0]);

      renderAxes(layout, xScale, yScale, {});
      const ticks1 = layout.xAxisGroup.selectAll('.tick').size();

      // Change to wider domain
      xScale.domain([0, 1000]);
      renderAxes(layout, xScale, yScale, {});
      const ticks2 = layout.xAxisGroup.selectAll('.tick').size();

      // Both should have ticks; exact count may differ
      expect(ticks1).toBeGreaterThan(0);
      expect(ticks2).toBeGreaterThan(0);
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

      // Reset
      const layout2 = makeLayout();
      renderGrid(layout2, xScale, yScale, 10);
      const hLines10 = layout2.gridGroup.select('.grid-h').selectAll('line').size();

      // More ticks requested should produce at least as many lines (D3 ticks() is a hint)
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

      // Each line should be at band center
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

      // Each line should span full width
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

    it('updates line positions when scale domain changes', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      renderGrid(layout, xScale, yScale);

      // After first render, lines should match [0, 100] ticks
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

      // Change domain — same range, different mapping
      xScale.domain([0, 1000]);
      renderGrid(layout, xScale, yScale);

      // After second render, lines should match [0, 1000] ticks
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

      // Use a much narrower domain that produces fewer ticks
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

      // Should not throw and should produce grid lines
      renderGrid(layout, xScale, yScale, 5, 300);

      expect(layout.gridGroup.select('.grid-v').selectAll('line').size()).toBeGreaterThan(0);
      expect(layout.gridGroup.select('.grid-h').selectAll('line').size()).toBeGreaterThan(0);
    });

    it('updates grid with transitionDuration > 0 on second call', () => {
      const layout = makeLayout();
      const xScale = d3.scaleLinear().domain([0, 100]).range([0, layout.width]);
      const yScale = d3.scaleLinear().domain([0, 50]).range([layout.height, 0]);

      // First render without transition
      renderGrid(layout, xScale, yScale);

      // Second render with transition — exercises the update + transition branches
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
