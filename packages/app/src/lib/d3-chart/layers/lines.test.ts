// @vitest-environment jsdom
import * as d3 from 'd3';
import { describe, expect, it } from 'vitest';

import { renderLines, updateLinesOnZoom, type LineConfig } from './lines';

const COLORS: Record<string, string> = {
  seriesA: '#f00',
  seriesB: '#0f0',
};

const SAMPLE_LINES: Record<string, { x: number; y: number }[]> = {
  seriesA: [
    { x: 0, y: 10 },
    { x: 1, y: 30 },
    { x: 2, y: 20 },
    { x: 3, y: 50 },
  ],
  seriesB: [
    { x: 0, y: 5 },
    { x: 1, y: 15 },
    { x: 2, y: 25 },
  ],
};

function makeConfig(overrides?: Partial<LineConfig>): LineConfig {
  return {
    getColor: (key) => COLORS[key] ?? '#000',
    ...overrides,
  };
}

function makeScales() {
  const xScale = d3.scaleLinear().domain([0, 3]).range([0, 300]);
  const yScale = d3.scaleLinear().domain([0, 50]).range([200, 0]);
  return { xScale, yScale };
}

function makeGroup() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  return d3.select(svg).append('g') as unknown as d3.Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  >;
}

function pathsByKey(group: d3.Selection<SVGGElement, unknown, null, undefined>) {
  const paths = [...group.node()!.querySelectorAll<SVGPathElement>('path.line-path')];
  return Object.fromEntries(paths.map((path) => [path.dataset.lineKey, path]));
}

describe('renderLines', () => {
  it('creates one path per non-empty series, tagged with its key', () => {
    const group = makeGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group, { ...SAMPLE_LINES, empty: [] }, xScale, yScale, makeConfig());

    expect(Object.keys(pathsByKey(group)).toSorted()).toEqual(['seriesA', 'seriesB']);
  });

  it('applies per-series stroke color and dash pattern', () => {
    const group = makeGroup();
    const { xScale, yScale } = makeScales();
    renderLines(
      group,
      SAMPLE_LINES,
      xScale,
      yScale,
      makeConfig({ getStrokeDasharray: (key) => (key === 'seriesA' ? 'none' : '9 4') }),
    );

    const paths = pathsByKey(group);
    expect(paths.seriesA.getAttribute('stroke')).toBe('#f00');
    expect(paths.seriesB.getAttribute('stroke')).toBe('#0f0');
    expect(paths.seriesA.getAttribute('stroke-dasharray')).toBe('none');
    expect(paths.seriesB.getAttribute('stroke-dasharray')).toBe('9 4');
    expect(paths.seriesA.getAttribute('fill')).toBe('none');
  });

  it('uses a stroke width of 2 unless one is configured', () => {
    const { xScale, yScale } = makeScales();
    const defaults = makeGroup();
    renderLines(defaults, SAMPLE_LINES, xScale, yScale, makeConfig());
    const custom = makeGroup();
    renderLines(custom, SAMPLE_LINES, xScale, yScale, makeConfig({ strokeWidth: 3 }));

    expect(pathsByKey(defaults).seriesA.getAttribute('stroke-width')).toBe('2');
    expect(pathsByKey(custom).seriesA.getAttribute('stroke-width')).toBe('3');
  });

  it('draws the configured curve through the scaled points', () => {
    const group = makeGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group, SAMPLE_LINES, xScale, yScale, makeConfig({ curve: d3.curveLinear }));

    expect(pathsByKey(group).seriesB.getAttribute('d')).toBe('M0,180L100,140L200,100');
  });

  it('breaks the path where isDefined rejects a point', () => {
    const group = makeGroup();
    const { xScale, yScale } = makeScales();
    const gapped = {
      gapped: [
        { x: 0, y: 10 },
        { x: 1, y: 0 },
        { x: 2, y: 20 },
      ],
    };
    renderLines(
      group,
      gapped,
      xScale,
      yScale,
      makeConfig({ curve: d3.curveLinear, isDefined: (d) => d.y > 0 }),
    );

    expect(pathsByKey(group).gapped.getAttribute('d')).toBe('M0,160ZM200,120Z');
  });
});

describe('updateLinesOnZoom', () => {
  it('redraws each series with the new scales and curve', () => {
    const group = makeGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group, SAMPLE_LINES, xScale, yScale, makeConfig({ curve: d3.curveLinear }));

    const zoomedX = d3.scaleLinear().domain([0, 2]).range([0, 300]);
    const zoomedY = d3.scaleLinear().domain([0, 100]).range([200, 0]);
    updateLinesOnZoom(group, SAMPLE_LINES, zoomedX, zoomedY, { curve: d3.curveLinear });

    expect(pathsByKey(group).seriesB.getAttribute('d')).toBe('M0,190L150,170L300,150');
  });

  it('updates series whose key is not a valid CSS class name', () => {
    const lines = { 'Huawei 950PR': SAMPLE_LINES.seriesB, 'H100 SXM (8x)': SAMPLE_LINES.seriesA };
    const group = makeGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group, lines, xScale, yScale, makeConfig({ curve: d3.curveLinear }));

    const zoomedX = d3.scaleLinear().domain([0, 2]).range([0, 300]);
    updateLinesOnZoom(group, lines, zoomedX, yScale, { curve: d3.curveLinear });

    expect(pathsByKey(group)['Huawei 950PR'].getAttribute('d')).toBe('M0,180L150,140L300,100');
  });

  it('leaves paths alone for series absent from the update', () => {
    const group = makeGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group, SAMPLE_LINES, xScale, yScale, makeConfig({ curve: d3.curveLinear }));
    const before = pathsByKey(group).seriesA.getAttribute('d');

    const zoomedX = d3.scaleLinear().domain([0, 2]).range([0, 300]);
    updateLinesOnZoom(group, { seriesB: SAMPLE_LINES.seriesB, constructor: [] }, zoomedX, yScale);

    expect(pathsByKey(group).seriesA.getAttribute('d')).toBe(before);
  });

  it('applies isDefined gaps when redrawing', () => {
    const lines = {
      gapped: [
        { x: 0, y: 10 },
        { x: 1, y: 0 },
        { x: 2, y: 20 },
      ],
    };
    const group = makeGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group, lines, xScale, yScale, makeConfig({ curve: d3.curveLinear }));

    updateLinesOnZoom(group, lines, xScale, yScale, {
      curve: d3.curveLinear,
      isDefined: (d) => d.y > 0,
    });

    expect(pathsByKey(group).gapped.getAttribute('d')).toBe('M0,160ZM200,120Z');
  });
});
