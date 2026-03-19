import * as d3 from 'd3';
import { describe, expect, it } from 'vitest';

import { asMock, createMockGroup } from './test-helpers';
import { renderHorizontalBars, updateHorizontalBarsOnZoom } from './horizontal-bars';
import type { HorizontalBarConfig } from './horizontal-bars';

// ── Fixtures ─────────────────────────────────────────────────────────

interface TestDatum {
  label: string;
  value: number;
  color: string;
}

const SAMPLE_DATA: TestDatum[] = [
  { label: 'GPU-A', value: 120, color: '#f00' },
  { label: 'GPU-B', value: 250, color: '#0f0' },
  { label: 'GPU-C', value: 80, color: '#00f' },
];

function makeConfig(
  overrides?: Partial<HorizontalBarConfig<TestDatum>>,
): HorizontalBarConfig<TestDatum> {
  return {
    getY: (d) => d.label,
    getX: (d) => d.value,
    getColor: (d) => d.color,
    ...overrides,
  };
}

function makeScales() {
  const yScale = d3
    .scaleBand<string>()
    .domain(['GPU-A', 'GPU-B', 'GPU-C'])
    .range([0, 300])
    .padding(0.1);
  const xScale = d3.scaleLinear().domain([0, 300]).range([0, 600]);
  return { yScale, xScale };
}

// ── renderHorizontalBars ─────────────────────────────────────────────

describe('renderHorizontalBars', () => {
  it('creates one rect per data item', () => {
    const group = createMockGroup();
    const { yScale, xScale } = makeScales();
    const result = asMock(
      renderHorizontalBars(group as any, SAMPLE_DATA, yScale, xScale, makeConfig()),
    );

    expect(result.elements).toHaveLength(3);
    for (const el of result.elements) {
      expect(el.tag).toBe('rect');
    }
  });

  it('sets class to bar', () => {
    const group = createMockGroup();
    const { yScale, xScale } = makeScales();
    const result = asMock(
      renderHorizontalBars(group as any, SAMPLE_DATA, yScale, xScale, makeConfig()),
    );

    for (const el of result.elements) {
      expect(el.attrs['class']).toBe('bar');
    }
  });

  it('sets x to 0 (bars grow from left)', () => {
    const group = createMockGroup();
    const { yScale, xScale } = makeScales();
    const result = asMock(
      renderHorizontalBars(group as any, SAMPLE_DATA, yScale, xScale, makeConfig()),
    );

    for (const el of result.elements) {
      expect(el.attrs['x']).toBe(0);
    }
  });

  it('computes y position from yScale band', () => {
    const group = createMockGroup();
    const { yScale, xScale } = makeScales();
    const result = asMock(
      renderHorizontalBars(group as any, SAMPLE_DATA, yScale, xScale, makeConfig()),
    );

    for (let i = 0; i < SAMPLE_DATA.length; i++) {
      const expected = yScale(SAMPLE_DATA[i].label) || 0;
      expect(result.elements[i].attrs['y']).toBe(expected);
    }
  });

  it('computes width from xScale with Math.max(0, ...)', () => {
    const group = createMockGroup();
    const { yScale, xScale } = makeScales();
    const result = asMock(
      renderHorizontalBars(group as any, SAMPLE_DATA, yScale, xScale, makeConfig()),
    );

    for (let i = 0; i < SAMPLE_DATA.length; i++) {
      const expected = Math.max(0, xScale(SAMPLE_DATA[i].value));
      expect(result.elements[i].attrs['width']).toBe(expected);
    }
  });

  it('clamps negative xScale values to 0', () => {
    const group = createMockGroup();
    const { yScale } = makeScales();
    // Scale that can produce negative values
    const xScale = d3.scaleLinear().domain([100, 300]).range([0, 600]);
    const data: TestDatum[] = [{ label: 'GPU-A', value: 50, color: '#f00' }];
    const result = asMock(renderHorizontalBars(group as any, data, yScale, xScale, makeConfig()));

    // xScale(50) would be negative
    expect(result.elements[0].attrs['width']).toBe(0);
  });

  it('sets height to yScale.bandwidth()', () => {
    const group = createMockGroup();
    const { yScale, xScale } = makeScales();
    const result = asMock(
      renderHorizontalBars(group as any, SAMPLE_DATA, yScale, xScale, makeConfig()),
    );

    for (const el of result.elements) {
      expect(el.attrs['height']).toBe(yScale.bandwidth());
    }
  });

  it('applies fill from getColor', () => {
    const group = createMockGroup();
    const { yScale, xScale } = makeScales();
    const result = asMock(
      renderHorizontalBars(group as any, SAMPLE_DATA, yScale, xScale, makeConfig()),
    );

    expect(result.elements[0].attrs['fill']).toBe('#f00');
    expect(result.elements[1].attrs['fill']).toBe('#0f0');
    expect(result.elements[2].attrs['fill']).toBe('#00f');
  });

  it('uses default stroke/strokeWidth/rx/opacity when not provided', () => {
    const group = createMockGroup();
    const { yScale, xScale } = makeScales();
    const result = asMock(
      renderHorizontalBars(group as any, SAMPLE_DATA, yScale, xScale, makeConfig()),
    );

    for (const el of result.elements) {
      expect(el.attrs['stroke']).toBe('none');
      expect(el.attrs['stroke-width']).toBe(0);
      expect(el.attrs['rx']).toBe(2);
      expect(el.attrs['opacity']).toBe(0.85);
    }
  });

  it('uses custom stroke/strokeWidth/rx/opacity when provided', () => {
    const group = createMockGroup();
    const { yScale, xScale } = makeScales();
    const config = makeConfig({ stroke: '#333', strokeWidth: 1.5, rx: 4, opacity: 0.6 });
    const result = asMock(renderHorizontalBars(group as any, SAMPLE_DATA, yScale, xScale, config));

    for (const el of result.elements) {
      expect(el.attrs['stroke']).toBe('#333');
      expect(el.attrs['stroke-width']).toBe(1.5);
      expect(el.attrs['rx']).toBe(4);
      expect(el.attrs['opacity']).toBe(0.6);
    }
  });

  it('sets cursor to pointer', () => {
    const group = createMockGroup();
    const { yScale, xScale } = makeScales();
    const result = asMock(
      renderHorizontalBars(group as any, SAMPLE_DATA, yScale, xScale, makeConfig()),
    );

    for (const el of result.elements) {
      expect(el.attrs['cursor']).toBe('pointer');
    }
  });

  it('handles empty data', () => {
    const group = createMockGroup();
    const { yScale, xScale } = makeScales();
    const result = asMock(renderHorizontalBars(group as any, [], yScale, xScale, makeConfig()));

    expect(result.elements).toHaveLength(0);
  });

  it('handles single item', () => {
    const group = createMockGroup();
    const { yScale, xScale } = makeScales();
    const result = asMock(
      renderHorizontalBars(group as any, [SAMPLE_DATA[0]], yScale, xScale, makeConfig()),
    );

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].attrs['fill']).toBe('#f00');
  });

  it('bar with value=0 has width=0', () => {
    const group = createMockGroup();
    const { yScale, xScale } = makeScales();
    const data: TestDatum[] = [{ label: 'GPU-A', value: 0, color: '#f00' }];
    const result = asMock(renderHorizontalBars(group as any, data, yScale, xScale, makeConfig()));

    expect(result.elements[0].attrs['width']).toBe(0);
  });
});

// ── updateHorizontalBarsOnZoom ───────────────────────────────────────

describe('updateHorizontalBarsOnZoom', () => {
  it('updates width on existing bars with new scale', () => {
    const group = createMockGroup();
    const { yScale, xScale } = makeScales();
    renderHorizontalBars(group as any, SAMPLE_DATA, yScale, xScale, makeConfig());

    const newXScale = d3.scaleLinear().domain([0, 500]).range([0, 600]);
    updateHorizontalBarsOnZoom(group as any, newXScale, (d: TestDatum) => d.value);

    const bars = group.selectAll('.bar');
    for (let i = 0; i < bars.elements.length; i++) {
      const expected = Math.max(0, newXScale(SAMPLE_DATA[i].value));
      expect(bars.elements[i].attrs['width']).toBe(expected);
    }
  });

  it('does nothing on empty group', () => {
    const group = createMockGroup();
    const xScale = d3.scaleLinear().domain([0, 300]).range([0, 600]);
    updateHorizontalBarsOnZoom(group as any, xScale, (d: TestDatum) => d.value);
    // Should not throw
  });
});
