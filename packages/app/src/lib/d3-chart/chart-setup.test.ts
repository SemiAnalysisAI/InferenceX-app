// @vitest-environment jsdom
import * as d3 from 'd3';
import { describe, it, expect } from 'vitest';

import { setupChartStructure } from './chart-setup';
import type { ChartSetupConfig } from './types';

function makeSvgEl(): SVGSVGElement {
  return d3.create('svg:svg').node()! as SVGSVGElement;
}

function defaultConfig(overrides?: Partial<ChartSetupConfig>): ChartSetupConfig {
  return {
    chartId: 'test-chart',
    containerWidth: 800,
    containerHeight: 600,
    margin: { top: 20, right: 30, bottom: 40, left: 50 },
    watermark: 'none',
    ...overrides,
  };
}

describe('setupChartStructure', () => {
  describe('first render (creates skeleton)', () => {
    it('returns a ChartLayout with correct width and height', () => {
      const svgEl = makeSvgEl();
      const config = defaultConfig();
      const layout = setupChartStructure(svgEl, config);

      expect(layout.width).toBe(800 - 50 - 30); // containerWidth - left - right
      expect(layout.height).toBe(600 - 20 - 40); // containerHeight - top - bottom
      expect(layout.margin).toEqual(config.margin);
    });

    it('sets SVG element width and height attributes', () => {
      const svgEl = makeSvgEl();
      const config = defaultConfig();
      setupChartStructure(svgEl, config);

      const svg = d3.select(svgEl);
      expect(svg.attr('width')).toBe('800');
      expect(svg.attr('height')).toBe('600');
    });

    it('creates a defs element', () => {
      const svgEl = makeSvgEl();
      const layout = setupChartStructure(svgEl, defaultConfig());

      expect(layout.defs.empty()).toBe(false);
      expect(layout.defs.node()!.tagName.toLowerCase()).toBe('defs');
    });

    it('creates a chart-root group with correct transform', () => {
      const svgEl = makeSvgEl();
      const config = defaultConfig();
      setupChartStructure(svgEl, config);

      const svg = d3.select(svgEl);
      const root = svg.select('.chart-root');
      expect(root.empty()).toBe(false);
      expect(root.attr('transform')).toBe(`translate(${config.margin.left},${config.margin.top})`);
    });

    it('creates grid group with border lines when hideAxes is false', () => {
      const svgEl = makeSvgEl();
      const config = defaultConfig();
      const layout = setupChartStructure(svgEl, config);

      expect(layout.gridGroup.empty()).toBe(false);
      expect(layout.gridGroup.attr('class')).toBe('grid');

      const borderRight = layout.gridGroup.select('.border-right');
      expect(borderRight.empty()).toBe(false);
      expect(Number(borderRight.attr('x1'))).toBe(layout.width);
      expect(Number(borderRight.attr('x2'))).toBe(layout.width);
      expect(Number(borderRight.attr('y1'))).toBe(0);
      expect(Number(borderRight.attr('y2'))).toBe(layout.height);

      const borderTop = layout.gridGroup.select('.border-top');
      expect(borderTop.empty()).toBe(false);
      expect(Number(borderTop.attr('x1'))).toBe(0);
      expect(Number(borderTop.attr('x2'))).toBe(layout.width);
      expect(Number(borderTop.attr('y1'))).toBe(0);
      expect(Number(borderTop.attr('y2'))).toBe(0);
    });

    it('omits border lines when hideAxes is true', () => {
      const svgEl = makeSvgEl();
      const layout = setupChartStructure(svgEl, defaultConfig({ hideAxes: true }));

      expect(layout.gridGroup.select('.border-right').empty()).toBe(true);
      expect(layout.gridGroup.select('.border-top').empty()).toBe(true);
    });

    it('creates x-axis group translated to the bottom', () => {
      const svgEl = makeSvgEl();
      const config = defaultConfig();
      const layout = setupChartStructure(svgEl, config);

      expect(layout.xAxisGroup.empty()).toBe(false);
      expect(layout.xAxisGroup.attr('class')).toBe('x-axis');
      expect(layout.xAxisGroup.attr('transform')).toBe(`translate(0,${layout.height})`);
    });

    it('creates y-axis group', () => {
      const svgEl = makeSvgEl();
      const layout = setupChartStructure(svgEl, defaultConfig());

      expect(layout.yAxisGroup.empty()).toBe(false);
      expect(layout.yAxisGroup.attr('class')).toBe('y-axis');
    });

    it('creates zoom-group with clip-path when clipContent is true (default)', () => {
      const svgEl = makeSvgEl();
      const config = defaultConfig({ chartId: 'clip-test' });
      const layout = setupChartStructure(svgEl, config);

      expect(layout.zoomGroup.empty()).toBe(false);
      expect(layout.zoomGroup.attr('class')).toBe('zoom-group');
      expect(layout.zoomGroup.attr('clip-path')).toBe('url(#clip-clip-test)');

      // ClipPath should exist in defs
      const clipRect = layout.defs.select('#clip-clip-test rect');
      expect(clipRect.empty()).toBe(false);
      expect(Number(clipRect.attr('width'))).toBe(layout.width);
      expect(Number(clipRect.attr('height'))).toBe(layout.height);
    });

    it('creates zoom-group without clip-path when clipContent is false', () => {
      const svgEl = makeSvgEl();
      const config = defaultConfig({ clipContent: false });
      const layout = setupChartStructure(svgEl, config);

      expect(layout.zoomGroup.empty()).toBe(false);
      expect(layout.zoomGroup.attr('clip-path')).toBeNull();

      // No clipPath in defs
      const clipPath = layout.defs.select('clipPath');
      expect(clipPath.empty()).toBe(true);
    });

    it('creates a y-axis label when yLabel is provided', () => {
      const svgEl = makeSvgEl();
      const config = defaultConfig({ yLabel: 'Latency (ms)' });
      setupChartStructure(svgEl, config);

      const svg = d3.select(svgEl);
      const yLabel = svg.select('.y-axis-label');
      expect(yLabel.empty()).toBe(false);
      expect(yLabel.text()).toBe('Latency (ms)');
      expect(yLabel.attr('transform')).toBe('rotate(-90)');
      expect(yLabel.attr('text-anchor')).toBe('middle');
      expect(yLabel.attr('font-size')).toBe('12px');
    });

    it('does not create a y-axis label when yLabel is omitted', () => {
      const svgEl = makeSvgEl();
      setupChartStructure(svgEl, defaultConfig());

      const svg = d3.select(svgEl);
      expect(svg.select('.y-axis-label').empty()).toBe(true);
    });

    it('creates an x-axis label when xLabel is provided', () => {
      const svgEl = makeSvgEl();
      const config = defaultConfig({ xLabel: 'Concurrency' });
      setupChartStructure(svgEl, config);

      const svg = d3.select(svgEl);
      const xLabel = svg.select('.x-axis-label');
      expect(xLabel.empty()).toBe(false);
      expect(xLabel.text()).toBe('Concurrency');
      expect(xLabel.attr('text-anchor')).toBe('middle');
      expect(xLabel.attr('font-size')).toBe('12px');
      expect(Number(xLabel.attr('x'))).toBe(
        config.margin.left + (config.containerWidth - config.margin.left - config.margin.right) / 2,
      );
      expect(Number(xLabel.attr('y'))).toBe(config.containerHeight - 10);
    });

    it('does not create an x-axis label when xLabel is omitted', () => {
      const svgEl = makeSvgEl();
      setupChartStructure(svgEl, defaultConfig());

      const svg = d3.select(svgEl);
      expect(svg.select('.x-axis-label').empty()).toBe(true);
    });
  });

  describe('watermark variants', () => {
    it('creates logo watermark when watermark is "logo"', () => {
      const svgEl = makeSvgEl();
      const config = defaultConfig({ watermark: 'logo' });
      setupChartStructure(svgEl, config);

      const svg = d3.select(svgEl);
      expect(svg.select('.watermark-rect').empty()).toBe(false);
      expect(svg.select('#logo-pattern').empty()).toBe(false);
    });

    it('creates unofficial watermark when watermark is "unofficial"', () => {
      const svgEl = makeSvgEl();
      const config = defaultConfig({ watermark: 'unofficial' });
      setupChartStructure(svgEl, config);

      const svg = d3.select(svgEl);
      expect(svg.select('.watermark-rect').empty()).toBe(false);
      expect(svg.select('#unofficial-pattern').empty()).toBe(false);
    });

    it('creates no watermark when watermark is "none"', () => {
      const svgEl = makeSvgEl();
      const config = defaultConfig({ watermark: 'none' });
      setupChartStructure(svgEl, config);

      const svg = d3.select(svgEl);
      expect(svg.select('.watermark-rect').empty()).toBe(true);
      expect(svg.select('#logo-pattern').empty()).toBe(true);
      expect(svg.select('#unofficial-pattern').empty()).toBe(true);
    });
  });

  describe('idempotency — second call updates, does not duplicate', () => {
    it('does not duplicate chart-root on second call', () => {
      const svgEl = makeSvgEl();
      const config = defaultConfig();
      setupChartStructure(svgEl, config);
      setupChartStructure(svgEl, config);

      const svg = d3.select(svgEl);
      expect(svg.selectAll('.chart-root').size()).toBe(1);
    });

    it('does not duplicate grid, axis, or zoom groups on second call', () => {
      const svgEl = makeSvgEl();
      const config = defaultConfig();
      setupChartStructure(svgEl, config);
      setupChartStructure(svgEl, config);

      const svg = d3.select(svgEl);
      const root = svg.select('.chart-root');
      expect(root.selectAll('.grid').size()).toBe(1);
      expect(root.selectAll('.x-axis').size()).toBe(1);
      expect(root.selectAll('.y-axis').size()).toBe(1);
      expect(root.selectAll('.zoom-group').size()).toBe(1);
    });

    it('does not duplicate defs or clipPath on second call', () => {
      const svgEl = makeSvgEl();
      const config = defaultConfig({ chartId: 'idem-clip' });
      setupChartStructure(svgEl, config);
      setupChartStructure(svgEl, config);

      const svg = d3.select(svgEl);
      expect(svg.selectAll('defs').size()).toBe(1);
      expect(svg.selectAll('#clip-idem-clip').size()).toBe(1);
    });

    it('updates dimensions on second call with different size', () => {
      const svgEl = makeSvgEl();
      const config1 = defaultConfig({ containerWidth: 800, containerHeight: 600 });
      setupChartStructure(svgEl, config1);

      const config2 = defaultConfig({ containerWidth: 1200, containerHeight: 900 });
      const layout2 = setupChartStructure(svgEl, config2);

      expect(layout2.width).toBe(1200 - 50 - 30);
      expect(layout2.height).toBe(900 - 20 - 40);

      const svg = d3.select(svgEl);
      expect(svg.attr('width')).toBe('1200');
      expect(svg.attr('height')).toBe('900');
    });

    it('updates chart-root transform on resize', () => {
      const svgEl = makeSvgEl();
      const margin1 = { top: 10, right: 10, bottom: 10, left: 10 };
      setupChartStructure(svgEl, defaultConfig({ margin: margin1 }));

      const margin2 = { top: 30, right: 40, bottom: 50, left: 60 };
      setupChartStructure(svgEl, defaultConfig({ margin: margin2 }));

      const svg = d3.select(svgEl);
      expect(svg.select('.chart-root').attr('transform')).toBe('translate(60,30)');
    });

    it('updates x-axis translate on height change', () => {
      const svgEl = makeSvgEl();
      setupChartStructure(svgEl, defaultConfig({ containerHeight: 400 }));
      const layout = setupChartStructure(svgEl, defaultConfig({ containerHeight: 800 }));

      expect(layout.xAxisGroup.attr('transform')).toBe(`translate(0,${layout.height})`);
    });

    it('updates clip rect dimensions on resize', () => {
      const svgEl = makeSvgEl();
      const config1 = defaultConfig({ chartId: 'resize-clip' });
      setupChartStructure(svgEl, config1);

      const config2 = defaultConfig({
        chartId: 'resize-clip',
        containerWidth: 1000,
        containerHeight: 700,
      });
      const layout2 = setupChartStructure(svgEl, config2);

      const clipRect = layout2.defs.select('#clip-resize-clip rect');
      expect(Number(clipRect.attr('width'))).toBe(layout2.width);
      expect(Number(clipRect.attr('height'))).toBe(layout2.height);
    });

    it('skips border line updates on second call when hideAxes is true', () => {
      const svgEl = makeSvgEl();
      // First call with hideAxes true — no border lines created
      setupChartStructure(svgEl, defaultConfig({ hideAxes: true }));
      const layout2 = setupChartStructure(svgEl, defaultConfig({ hideAxes: true }));

      expect(layout2.gridGroup.select('.border-right').empty()).toBe(true);
      expect(layout2.gridGroup.select('.border-top').empty()).toBe(true);
    });

    it('skips clip rect update when clipContent is false on second call', () => {
      const svgEl = makeSvgEl();
      setupChartStructure(svgEl, defaultConfig({ clipContent: false, chartId: 'no-clip' }));
      const layout2 = setupChartStructure(
        svgEl,
        defaultConfig({ clipContent: false, chartId: 'no-clip', containerWidth: 1000 }),
      );

      // No clipPath should exist
      const clipPath = layout2.defs.select('#clip-no-clip');
      expect(clipPath.empty()).toBe(true);
    });

    it('updates border-right and border-top positions on resize', () => {
      const svgEl = makeSvgEl();
      setupChartStructure(svgEl, defaultConfig({ containerWidth: 800, containerHeight: 600 }));

      const config2 = defaultConfig({ containerWidth: 1000, containerHeight: 500 });
      const layout2 = setupChartStructure(svgEl, config2);

      const borderRight = layout2.gridGroup.select('.border-right');
      expect(Number(borderRight.attr('x1'))).toBe(layout2.width);
      expect(Number(borderRight.attr('x2'))).toBe(layout2.width);
      expect(Number(borderRight.attr('y2'))).toBe(layout2.height);

      const borderTop = layout2.gridGroup.select('.border-top');
      expect(Number(borderTop.attr('x2'))).toBe(layout2.width);
    });

    it('updates y-axis label text and position on second call', () => {
      const svgEl = makeSvgEl();
      setupChartStructure(svgEl, defaultConfig({ yLabel: 'Old Label' }));
      setupChartStructure(svgEl, defaultConfig({ yLabel: 'New Label' }));

      const svg = d3.select(svgEl);
      const yLabel = svg.select('.y-axis-label');
      expect(yLabel.text()).toBe('New Label');
    });

    it('updates x-axis label text and position on second call', () => {
      const svgEl = makeSvgEl();
      setupChartStructure(svgEl, defaultConfig({ xLabel: 'Old X' }));
      const config2 = defaultConfig({
        xLabel: 'New X',
        containerWidth: 1000,
        containerHeight: 700,
      });
      setupChartStructure(svgEl, config2);

      const svg = d3.select(svgEl);
      const xLabel = svg.select('.x-axis-label');
      expect(xLabel.text()).toBe('New X');
      expect(Number(xLabel.attr('y'))).toBe(700 - 10);
    });

    it('clears label text when label is omitted on second call', () => {
      const svgEl = makeSvgEl();
      setupChartStructure(svgEl, defaultConfig({ yLabel: 'Some Label', xLabel: 'Some X' }));
      // Second call without labels — should clear text
      setupChartStructure(svgEl, defaultConfig());

      const svg = d3.select(svgEl);
      const yLabel = svg.select('.y-axis-label');
      if (!yLabel.empty()) {
        expect(yLabel.text()).toBe('');
      }
      const xLabel = svg.select('.x-axis-label');
      if (!xLabel.empty()) {
        expect(xLabel.text()).toBe('');
      }
    });

    it('updates watermark rect dimensions on resize without watermark switch', () => {
      const svgEl = makeSvgEl();
      setupChartStructure(svgEl, defaultConfig({ watermark: 'logo' }));
      setupChartStructure(
        svgEl,
        defaultConfig({ watermark: 'logo', containerWidth: 1200, containerHeight: 900 }),
      );

      const svg = d3.select(svgEl);
      const rect = svg.select('.watermark-rect');
      expect(Number(rect.attr('width'))).toBe(1200);
      expect(Number(rect.attr('height'))).toBe(900);
    });
  });

  describe('watermark switching on update', () => {
    it('switches from "none" to "logo" on second call', () => {
      const svgEl = makeSvgEl();
      setupChartStructure(svgEl, defaultConfig({ watermark: 'none' }));
      setupChartStructure(svgEl, defaultConfig({ watermark: 'logo' }));

      const svg = d3.select(svgEl);
      expect(svg.select('#logo-pattern').empty()).toBe(false);
      expect(svg.select('.watermark-rect').empty()).toBe(false);
    });

    it('switches from "logo" to "unofficial" on second call', () => {
      const svgEl = makeSvgEl();
      setupChartStructure(svgEl, defaultConfig({ watermark: 'logo' }));
      setupChartStructure(svgEl, defaultConfig({ watermark: 'unofficial' }));

      const svg = d3.select(svgEl);
      expect(svg.select('#logo-pattern').empty()).toBe(true);
      expect(svg.select('#unofficial-pattern').empty()).toBe(false);
    });

    it('switches from "unofficial" to "none" on second call', () => {
      const svgEl = makeSvgEl();
      setupChartStructure(svgEl, defaultConfig({ watermark: 'unofficial' }));
      setupChartStructure(svgEl, defaultConfig({ watermark: 'none' }));

      const svg = d3.select(svgEl);
      expect(svg.select('#unofficial-pattern').empty()).toBe(true);
      expect(svg.select('.watermark-rect').empty()).toBe(true);
    });

    it('switches from "unofficial" to "logo" on second call', () => {
      const svgEl = makeSvgEl();
      setupChartStructure(svgEl, defaultConfig({ watermark: 'unofficial' }));
      setupChartStructure(svgEl, defaultConfig({ watermark: 'logo' }));

      const svg = d3.select(svgEl);
      expect(svg.select('#unofficial-pattern').empty()).toBe(true);
      expect(svg.select('#logo-pattern').empty()).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles zero margin', () => {
      const svgEl = makeSvgEl();
      const margin = { top: 0, right: 0, bottom: 0, left: 0 };
      const layout = setupChartStructure(
        svgEl,
        defaultConfig({ margin, containerWidth: 500, containerHeight: 400 }),
      );

      expect(layout.width).toBe(500);
      expect(layout.height).toBe(400);
    });

    it('handles very small container', () => {
      const svgEl = makeSvgEl();
      const config = defaultConfig({ containerWidth: 100, containerHeight: 80 });
      const layout = setupChartStructure(svgEl, config);

      expect(layout.width).toBe(100 - 50 - 30); // 20
      expect(layout.height).toBe(80 - 20 - 40); // 20
    });

    it('preserves zoom-group children across updates', () => {
      const svgEl = makeSvgEl();
      const config = defaultConfig();
      const layout1 = setupChartStructure(svgEl, config);

      // Simulate a data layer adding content to zoomGroup
      layout1.zoomGroup.append('circle').attr('class', 'data-point').attr('r', 5);

      const layout2 = setupChartStructure(svgEl, config);
      const dataPoint = layout2.zoomGroup.select('.data-point');
      expect(dataPoint.empty()).toBe(false);
      expect(dataPoint.attr('r')).toBe('5');
    });
  });
});
