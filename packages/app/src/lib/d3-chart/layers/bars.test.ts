import * as d3 from 'd3';
import { describe, expect, it } from 'vitest';

import { asMock, createMockGroup } from './test-helpers';
import { renderBars, updateBarsOnZoom } from './bars';
import type { BarConfig } from './bars';

// ── Fixtures ─────────────────────────────────────────────────────────

interface TestDatum {
  label: string;
  value: number;
  color: string;
}

const SAMPLE_DATA: TestDatum[] = [
  { label: 'A', value: 30, color: '#f00' },
  { label: 'B', value: 70, color: '#0f0' },
  { label: 'C', value: 50, color: '#00f' },
];

function makeConfig(overrides?: Partial<BarConfig<TestDatum>>): BarConfig<TestDatum> {
  return {
    getX: (d) => d.label,
    getY: (d) => d.value,
    getColor: (d) => d.color,
    getForeground: () => '#fff',
    ...overrides,
  };
}

function makeScales() {
  const xScale = d3.scaleBand<string>().domain(['A', 'B', 'C']).range([0, 300]).padding(0.1);
  const yScale = d3.scaleLinear().domain([0, 100]).range([200, 0]);
  return { xScale, yScale };
}

// ── renderBars ───────────────────────────────────────────────────────

describe('renderBars', () => {
  it('creates one rect per data item', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const result = asMock(renderBars(group as any, SAMPLE_DATA, xScale, yScale, 200, makeConfig()));

    expect(result.elements).toHaveLength(3);
    for (const el of result.elements) {
      expect(el.tag).toBe('rect');
    }
  });

  it('sets correct class on each bar', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const result = asMock(renderBars(group as any, SAMPLE_DATA, xScale, yScale, 200, makeConfig()));

    for (const el of result.elements) {
      expect(el.attrs['class']).toBe('bar');
    }
  });

  it('computes x position from xScale', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const result = asMock(renderBars(group as any, SAMPLE_DATA, xScale, yScale, 200, makeConfig()));

    for (let i = 0; i < SAMPLE_DATA.length; i++) {
      const expected = xScale(SAMPLE_DATA[i].label) || 0;
      expect(result.elements[i].attrs['x']).toBe(expected);
    }
  });

  it('computes y position from yScale', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const result = asMock(renderBars(group as any, SAMPLE_DATA, xScale, yScale, 200, makeConfig()));

    for (let i = 0; i < SAMPLE_DATA.length; i++) {
      expect(result.elements[i].attrs['y']).toBe(yScale(SAMPLE_DATA[i].value));
    }
  });

  it('computes height as chartHeight - yScale(value)', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const height = 200;
    const result = asMock(
      renderBars(group as any, SAMPLE_DATA, xScale, yScale, height, makeConfig()),
    );

    for (let i = 0; i < SAMPLE_DATA.length; i++) {
      expect(result.elements[i].attrs['height']).toBe(height - yScale(SAMPLE_DATA[i].value));
    }
  });

  it('sets width to xScale.bandwidth()', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const result = asMock(renderBars(group as any, SAMPLE_DATA, xScale, yScale, 200, makeConfig()));

    for (const el of result.elements) {
      expect(el.attrs['width']).toBe(xScale.bandwidth());
    }
  });

  it('sets fill from config.getColor', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const result = asMock(renderBars(group as any, SAMPLE_DATA, xScale, yScale, 200, makeConfig()));

    expect(result.elements[0].attrs['fill']).toBe('#f00');
    expect(result.elements[1].attrs['fill']).toBe('#0f0');
    expect(result.elements[2].attrs['fill']).toBe('#00f');
  });

  it('uses default stroke/strokeWidth/rx when not provided', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const result = asMock(renderBars(group as any, SAMPLE_DATA, xScale, yScale, 200, makeConfig()));

    for (const el of result.elements) {
      expect(el.attrs['stroke']).toBe('none');
      expect(el.attrs['stroke-width']).toBe(0);
      expect(el.attrs['rx']).toBe(2);
    }
  });

  it('uses custom stroke/strokeWidth/rx when provided', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const config = makeConfig({ stroke: '#999', strokeWidth: 2, rx: 5 });
    const result = asMock(renderBars(group as any, SAMPLE_DATA, xScale, yScale, 200, config));

    for (const el of result.elements) {
      expect(el.attrs['stroke']).toBe('#999');
      expect(el.attrs['stroke-width']).toBe(2);
      expect(el.attrs['rx']).toBe(5);
    }
  });

  it('sets cursor to pointer', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const result = asMock(renderBars(group as any, SAMPLE_DATA, xScale, yScale, 200, makeConfig()));

    for (const el of result.elements) {
      expect(el.attrs['cursor']).toBe('pointer');
    }
  });

  it('handles empty data array', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const result = asMock(renderBars(group as any, [], xScale, yScale, 200, makeConfig()));

    expect(result.elements).toHaveLength(0);
  });

  it('handles single item data', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const result = asMock(
      renderBars(group as any, [SAMPLE_DATA[0]], xScale, yScale, 200, makeConfig()),
    );

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].attrs['fill']).toBe('#f00');
  });

  it('bar at y=0 has height equal to chart height', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const height = 200;
    const data = [{ label: 'A', value: 0, color: '#000' }];
    const result = asMock(renderBars(group as any, data, xScale, yScale, height, makeConfig()));

    // yScale(0) = 200 (bottom), so height = 200 - 200 = 0
    expect(result.elements[0].attrs['height']).toBe(0);
  });

  it('bar at max value has y at top', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const data = [{ label: 'A', value: 100, color: '#000' }];
    const result = asMock(renderBars(group as any, data, xScale, yScale, 200, makeConfig()));

    expect(result.elements[0].attrs['y']).toBe(0);
    expect(result.elements[0].attrs['height']).toBe(200);
  });
});

// ── updateBarsOnZoom ─────────────────────────────────────────────────

describe('updateBarsOnZoom', () => {
  it('updates y and height on existing bars', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const height = 200;
    renderBars(group as any, SAMPLE_DATA, xScale, yScale, height, makeConfig());

    // Simulate zoom by creating a new yScale with different domain
    const newYScale = d3.scaleLinear().domain([0, 200]).range([200, 0]);
    updateBarsOnZoom(group as any, newYScale, height, (d: TestDatum) => d.value);

    const bars = group.selectAll('.bar');
    for (let i = 0; i < bars.elements.length; i++) {
      const d = SAMPLE_DATA[i];
      expect(bars.elements[i].attrs['y']).toBe(newYScale(d.value));
      expect(bars.elements[i].attrs['height']).toBe(height - newYScale(d.value));
    }
  });

  it('does nothing on empty group', () => {
    const group = createMockGroup();
    const yScale = d3.scaleLinear().domain([0, 100]).range([200, 0]);
    // Should not throw
    updateBarsOnZoom(group as any, yScale, 200, (d: TestDatum) => d.value);
  });
});
