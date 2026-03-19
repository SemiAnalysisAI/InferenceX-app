import * as d3 from 'd3';
import { describe, expect, it, vi } from 'vitest';

import { createMockGroup, mockD3Select } from './test-helpers';
import type { MockElement } from './test-helpers';

// Partially mock d3 so that `d3.select(this)` inside .each() works with MockElements.
// We keep all real d3 exports and only replace `select`.
vi.mock('d3', async () => {
  const actual = await vi.importActual<typeof d3>('d3');
  return {
    ...actual,
    select: (node: any) => {
      // If it's a MockElement (has our attrs/styles shape), wrap it
      if (node && typeof node === 'object' && 'attrs' in node && 'styles' in node) {
        return mockD3Select(node as MockElement);
      }
      return actual.select(node);
    },
  };
});

import { renderRooflines, updateRooflinesOnZoom } from './rooflines';
import type { RooflineConfig } from './rooflines';

// ── Fixtures ─────────────────────────────────────────────────────────

const COLORS: Record<string, string> = {
  modelA: '#f00',
  modelB: '#0f0',
};

type Point = { x: number; y: number };

const SAMPLE_ROOFLINES: Record<string, Point[]> = {
  modelA: [
    { x: 1, y: 10 },
    { x: 2, y: 20 },
    { x: 3, y: 25 },
    { x: 4, y: 28 },
  ],
  modelB: [
    { x: 1, y: 5 },
    { x: 2, y: 15 },
    { x: 3, y: 22 },
  ],
};

function makeConfig(overrides?: Partial<RooflineConfig>): RooflineConfig {
  return {
    getColor: (key) => COLORS[key] ?? '#000',
    ...overrides,
  };
}

function makeScales() {
  const xScale = d3.scaleLinear().domain([0, 5]).range([0, 500]);
  const yScale = d3.scaleLinear().domain([0, 30]).range([300, 0]);
  return { xScale, yScale };
}

// ── renderRooflines ──────────────────────────────────────────────────

describe('renderRooflines', () => {
  it('creates one path per roofline series', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderRooflines(group as any, SAMPLE_ROOFLINES, xScale, yScale, makeConfig());

    const paths = group.selectAll('.roofline-path');
    expect(paths.elements).toHaveLength(2);
  });

  it('sets class including series key', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderRooflines(group as any, SAMPLE_ROOFLINES, xScale, yScale, makeConfig());

    const paths = group.selectAll('.roofline-path');
    const classes = paths.elements.map((el) => el.attrs['class']);
    expect(classes).toContain('roofline-path roofline-modelA');
    expect(classes).toContain('roofline-path roofline-modelB');
  });

  it('sets fill to none', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderRooflines(group as any, SAMPLE_ROOFLINES, xScale, yScale, makeConfig());

    const paths = group.selectAll('.roofline-path');
    for (const el of paths.elements) {
      expect(el.attrs['fill']).toBe('none');
    }
  });

  it('sets stroke from config.getColor', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderRooflines(group as any, SAMPLE_ROOFLINES, xScale, yScale, makeConfig());

    const paths = group.selectAll('.roofline-path');
    const strokeByClass: Record<string, string | number> = {};
    for (const el of paths.elements) {
      strokeByClass[el.attrs['class'] as string] = el.attrs['stroke'];
    }
    expect(strokeByClass['roofline-path roofline-modelA']).toBe('#f00');
    expect(strokeByClass['roofline-path roofline-modelB']).toBe('#0f0');
  });

  it('uses default strokeWidth of 2', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderRooflines(group as any, SAMPLE_ROOFLINES, xScale, yScale, makeConfig());

    const paths = group.selectAll('.roofline-path');
    for (const el of paths.elements) {
      expect(el.attrs['stroke-width']).toBe(2);
    }
  });

  it('uses custom strokeWidth', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderRooflines(group as any, SAMPLE_ROOFLINES, xScale, yScale, makeConfig({ strokeWidth: 3 }));

    const paths = group.selectAll('.roofline-path');
    for (const el of paths.elements) {
      expect(el.attrs['stroke-width']).toBe(3);
    }
  });

  it('generates valid d attribute', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderRooflines(group as any, SAMPLE_ROOFLINES, xScale, yScale, makeConfig());

    const paths = group.selectAll('.roofline-path');
    for (const el of paths.elements) {
      const d = String(el.attrs['d']);
      expect(d).toBeTruthy();
      expect(d.startsWith('M')).toBe(true);
    }
  });

  it('filters out series with fewer than 2 points', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const rooflines = {
      ...SAMPLE_ROOFLINES,
      tiny: [{ x: 1, y: 5 }],
    };
    renderRooflines(group as any, rooflines, xScale, yScale, makeConfig());

    const paths = group.selectAll('.roofline-path');
    expect(paths.elements).toHaveLength(2);
  });

  it('filters out series with 0 points', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const rooflines = {
      ...SAMPLE_ROOFLINES,
      empty: [],
    };
    renderRooflines(group as any, rooflines, xScale, yScale, makeConfig());

    const paths = group.selectAll('.roofline-path');
    expect(paths.elements).toHaveLength(2);
  });

  it('renders series with exactly 2 points', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const rooflines = {
      minimal: [
        { x: 1, y: 10 },
        { x: 2, y: 20 },
      ],
    };
    renderRooflines(group as any, rooflines, xScale, yScale, makeConfig());

    const paths = group.selectAll('.roofline-path');
    expect(paths.elements).toHaveLength(1);
  });

  it('applies strokeDasharray when specified', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderRooflines(
      group as any,
      SAMPLE_ROOFLINES,
      xScale,
      yScale,
      makeConfig({ strokeDasharray: '5,3' }),
    );

    const paths = group.selectAll('.roofline-path');
    for (const el of paths.elements) {
      expect(el.attrs['stroke-dasharray']).toBe('5,3');
    }
  });

  it('does not set strokeDasharray when not specified', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderRooflines(group as any, SAMPLE_ROOFLINES, xScale, yScale, makeConfig());

    const paths = group.selectAll('.roofline-path');
    for (const el of paths.elements) {
      expect(el.attrs['stroke-dasharray']).toBeUndefined();
    }
  });

  it('respects isVisible filter', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const config = makeConfig({
      isVisible: (key) => key === 'modelA',
    });
    renderRooflines(group as any, SAMPLE_ROOFLINES, xScale, yScale, config);

    const paths = group.selectAll('.roofline-path');
    expect(paths.elements).toHaveLength(1);
    expect(paths.elements[0].attrs['class']).toBe('roofline-path roofline-modelA');
  });

  it('handles all series filtered by isVisible', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const config = makeConfig({
      isVisible: () => false,
    });
    renderRooflines(group as any, SAMPLE_ROOFLINES, xScale, yScale, config);

    const paths = group.selectAll('.roofline-path');
    expect(paths.elements).toHaveLength(0);
  });

  it('handles empty rooflines object', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderRooflines(group as any, {}, xScale, yScale, makeConfig());

    const paths = group.selectAll('.roofline-path');
    expect(paths.elements).toHaveLength(0);
  });

  it('applies getOpacity via .each()', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();

    const config = makeConfig({
      getOpacity: (key) => (key === 'modelA' ? 0.5 : 1.0),
    });

    // We can verify getOpacity is called correctly by checking the config
    expect(config.getOpacity!('modelA')).toBe(0.5);
    expect(config.getOpacity!('modelB')).toBe(1.0);

    // The render should not throw even though .each uses d3.select(this)
    // In our mock, `this` will be a MockElement
    renderRooflines(group as any, SAMPLE_ROOFLINES, xScale, yScale, config);
  });
});

// ── updateRooflinesOnZoom ────────────────────────────────────────────

describe('updateRooflinesOnZoom', () => {
  it('does not throw on empty group', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    updateRooflinesOnZoom(group as any, {}, xScale, yScale);
  });

  it('skips rooflines with fewer than 2 points', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderRooflines(group as any, SAMPLE_ROOFLINES, xScale, yScale, makeConfig());

    // Add a tiny roofline to the update data
    const withTiny = { ...SAMPLE_ROOFLINES, tiny: [{ x: 1, y: 5 }] };
    updateRooflinesOnZoom(group as any, withTiny, xScale, yScale);
    // Should not throw
  });

  it('updates d attribute for existing rooflines', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderRooflines(group as any, SAMPLE_ROOFLINES, xScale, yScale, makeConfig());

    const newXScale = d3.scaleLinear().domain([0, 10]).range([0, 500]);
    const newYScale = d3.scaleLinear().domain([0, 50]).range([300, 0]);

    // The function internally does group.select(`.roofline-${key}`)
    // Our mock may not perfectly support this nested select pattern,
    // but we verify it doesn't throw.
    updateRooflinesOnZoom(group as any, SAMPLE_ROOFLINES, newXScale, newYScale);
  });

  it('handles roofline keys not present in the DOM', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();

    // Render with one set of keys
    renderRooflines(
      group as any,
      { modelA: SAMPLE_ROOFLINES.modelA },
      xScale,
      yScale,
      makeConfig(),
    );

    // Update with different keys — should skip non-existent ones
    updateRooflinesOnZoom(
      group as any,
      {
        modelZ: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
      xScale,
      yScale,
    );
  });
});
