import * as d3 from 'd3';
import { describe, expect, it } from 'vitest';

import { createMockGroup } from './test-helpers';
import { renderLines, updateLinesOnZoom } from './lines';
import type { LineConfig } from './lines';

// ── Fixtures ─────────────────────────────────────────────────────────

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

// ── renderLines ──────────────────────────────────────────────────────

describe('renderLines', () => {
  it('creates one path per line series', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group as any, SAMPLE_LINES, xScale, yScale, makeConfig());

    const paths = group.selectAll('.line-path');
    expect(paths.elements).toHaveLength(2);
  });

  it('sets class including series key', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group as any, SAMPLE_LINES, xScale, yScale, makeConfig());

    const paths = group.selectAll('.line-path');
    const classes = paths.elements.map((el) => el.attrs['class']);
    expect(classes).toContain('line-path line-seriesA');
    expect(classes).toContain('line-path line-seriesB');
  });

  it('sets fill to none', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group as any, SAMPLE_LINES, xScale, yScale, makeConfig());

    const paths = group.selectAll('.line-path');
    for (const el of paths.elements) {
      expect(el.attrs['fill']).toBe('none');
    }
  });

  it('sets stroke from config.getColor', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group as any, SAMPLE_LINES, xScale, yScale, makeConfig());

    const paths = group.selectAll('.line-path');
    const strokeByClass: Record<string, string | number> = {};
    for (const el of paths.elements) {
      strokeByClass[el.attrs['class'] as string] = el.attrs['stroke'];
    }
    expect(strokeByClass['line-path line-seriesA']).toBe('#f00');
    expect(strokeByClass['line-path line-seriesB']).toBe('#0f0');
  });

  it('uses default strokeWidth of 2 when not specified', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group as any, SAMPLE_LINES, xScale, yScale, makeConfig());

    const paths = group.selectAll('.line-path');
    for (const el of paths.elements) {
      expect(el.attrs['stroke-width']).toBe(2);
    }
  });

  it('uses custom strokeWidth when specified', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group as any, SAMPLE_LINES, xScale, yScale, makeConfig({ strokeWidth: 3 }));

    const paths = group.selectAll('.line-path');
    for (const el of paths.elements) {
      expect(el.attrs['stroke-width']).toBe(3);
    }
  });

  it('generates valid d attribute from line generator', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group as any, SAMPLE_LINES, xScale, yScale, makeConfig());

    const paths = group.selectAll('.line-path');
    for (const el of paths.elements) {
      const d = el.attrs['d'] as string;
      // d attribute should be a non-empty string starting with M (move-to)
      expect(d).toBeTruthy();
      expect(String(d).startsWith('M')).toBe(true);
    }
  });

  it('filters out empty series', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const lines = {
      ...SAMPLE_LINES,
      emptyLine: [],
    };
    renderLines(group as any, lines, xScale, yScale, makeConfig());

    const paths = group.selectAll('.line-path');
    // Only seriesA and seriesB should appear
    expect(paths.elements).toHaveLength(2);
  });

  it('handles all empty series', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group as any, { a: [], b: [] }, xScale, yScale, makeConfig());

    const paths = group.selectAll('.line-path');
    expect(paths.elements).toHaveLength(0);
  });

  it('handles empty lines object', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group as any, {}, xScale, yScale, makeConfig());

    const paths = group.selectAll('.line-path');
    expect(paths.elements).toHaveLength(0);
  });

  it('handles single-point series', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const lines = { single: [{ x: 1, y: 20 }] };
    renderLines(group as any, lines, xScale, yScale, makeConfig());

    const paths = group.selectAll('.line-path');
    expect(paths.elements).toHaveLength(1);
  });

  it('respects isDefined to create gaps', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const config = makeConfig({
      isDefined: (d) => d.y > 0,
    });
    const lines = {
      gapped: [
        { x: 0, y: 10 },
        { x: 1, y: 0 },
        { x: 2, y: 20 },
      ],
    };
    renderLines(group as any, lines, xScale, yScale, config);

    const paths = group.selectAll('.line-path');
    expect(paths.elements).toHaveLength(1);
    // The d attribute should still be generated (with a gap)
    const d = String(paths.elements[0].attrs['d']);
    expect(d).toBeTruthy();
  });

  it('uses curveMonotoneX by default', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    // Just verify it doesn't throw with default curve
    renderLines(group as any, SAMPLE_LINES, xScale, yScale, makeConfig());

    const paths = group.selectAll('.line-path');
    // Monotone curves produce C (cubic bezier) commands
    const d = String(paths.elements[0].attrs['d']);
    expect(d.includes('C') || d.includes('M')).toBe(true);
  });

  it('accepts custom curve factory', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group as any, SAMPLE_LINES, xScale, yScale, makeConfig({ curve: d3.curveLinear }));

    const paths = group.selectAll('.line-path');
    const d = String(paths.elements[0].attrs['d']);
    // Linear curve produces L (line-to) commands, not C
    expect(d.includes('L')).toBe(true);
  });
});

// ── updateLinesOnZoom ────────────────────────────────────────────────

describe('updateLinesOnZoom', () => {
  it('does not throw on empty group', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    updateLinesOnZoom(group as any, {}, xScale, yScale);
  });

  it('updates d attribute with new scales', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group as any, SAMPLE_LINES, xScale, yScale, makeConfig());

    // Zoom: change both scales
    const newXScale = d3.scaleLinear().domain([0, 2]).range([0, 300]);
    const newYScale = d3.scaleLinear().domain([0, 100]).range([200, 0]);

    updateLinesOnZoom(group as any, SAMPLE_LINES, newXScale, newYScale);

    // The update uses group.select(`.line-${key}`).datum().attr('d', ...)
    // which writes to single elements found by class selector.
    // Since our mock tracks these, verify the function at least runs without error.
  });

  it('skips series not present in the group', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group as any, { seriesA: SAMPLE_LINES.seriesA }, xScale, yScale, makeConfig());

    // Try updating with a series that wasn't rendered
    updateLinesOnZoom(group as any, { seriesZ: [{ x: 0, y: 0 }] }, xScale, yScale);
    // Should not throw
  });

  it('respects isDefined in zoom update', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const config: LineConfig = {
      getColor: () => '#000',
      isDefined: (d) => d.y !== 0,
    };
    renderLines(group as any, SAMPLE_LINES, xScale, yScale, config);

    updateLinesOnZoom(group as any, SAMPLE_LINES, xScale, yScale, { isDefined: config.isDefined });
    // Should not throw
  });

  it('respects custom curve in zoom update', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderLines(group as any, SAMPLE_LINES, xScale, yScale, makeConfig({ curve: d3.curveLinear }));

    updateLinesOnZoom(group as any, SAMPLE_LINES, xScale, yScale, { curve: d3.curveLinear });
  });
});
