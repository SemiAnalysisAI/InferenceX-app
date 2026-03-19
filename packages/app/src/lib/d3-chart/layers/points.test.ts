import * as d3 from 'd3';
import { describe, expect, it, vi } from 'vitest';

import { asMock, createMockGroup } from './test-helpers';
import { renderPoints, updatePointsOnZoom } from './points';
import type { PointConfig } from './points';

// Mock the downsample module so we can control when LTTB triggers
vi.mock('../downsample', () => ({
  lttbDownsample: vi.fn((data: any[], target: number) => {
    // Simple mock: just return first `target` items
    return data.slice(0, target);
  }),
}));

import { lttbDownsample } from '../downsample';

// ── Fixtures ─────────────────────────────────────────────────────────

interface TestPoint {
  id: string;
  px: number;
  py: number;
  dataX: number;
  dataY: number;
  color: string;
  radius: number;
}

const SAMPLE_DATA: TestPoint[] = [
  { id: 'p1', px: 50, py: 150, dataX: 10, dataY: 30, color: '#f00', radius: 5 },
  { id: 'p2', px: 150, py: 100, dataX: 30, dataY: 60, color: '#0f0', radius: 6 },
  { id: 'p3', px: 250, py: 50, dataX: 50, dataY: 90, color: '#00f', radius: 4 },
];

function makeConfig(overrides?: Partial<PointConfig<TestPoint>>): PointConfig<TestPoint> {
  return {
    getCx: (d) => d.px,
    getCy: (d) => d.py,
    getColor: (d) => d.color,
    ...overrides,
  };
}

function makeScales() {
  const xScale = d3.scaleLinear().domain([0, 100]).range([0, 500]);
  const yScale = d3.scaleLinear().domain([0, 100]).range([300, 0]);
  return { xScale, yScale };
}

// ── renderPoints ─────────────────────────────────────────────────────

describe('renderPoints', () => {
  it('creates one circle per data item', () => {
    const group = createMockGroup();
    const result = asMock(renderPoints(group as any, SAMPLE_DATA, makeConfig()));

    expect(result.elements).toHaveLength(3);
    for (const el of result.elements) {
      expect(el.tag).toBe('circle');
    }
  });

  it('sets class to point', () => {
    const group = createMockGroup();
    const result = asMock(renderPoints(group as any, SAMPLE_DATA, makeConfig()));

    for (const el of result.elements) {
      expect(el.attrs['class']).toBe('point');
    }
  });

  it('uses getCx/getCy for pixel positions when getX/getY not provided', () => {
    const group = createMockGroup();
    const result = asMock(renderPoints(group as any, SAMPLE_DATA, makeConfig()));

    expect(result.elements[0].attrs['cx']).toBe(50);
    expect(result.elements[0].attrs['cy']).toBe(150);
    expect(result.elements[1].attrs['cx']).toBe(150);
    expect(result.elements[1].attrs['cy']).toBe(100);
  });

  it('uses xScale(getX(d)) when getX is provided with xScale', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const config = makeConfig({ getX: (d) => d.dataX, getY: (d) => d.dataY });
    const result = asMock(renderPoints(group as any, SAMPLE_DATA, config, xScale, yScale));

    for (let i = 0; i < SAMPLE_DATA.length; i++) {
      expect(result.elements[i].attrs['cx']).toBe(xScale(SAMPLE_DATA[i].dataX));
      expect(result.elements[i].attrs['cy']).toBe(yScale(SAMPLE_DATA[i].dataY));
    }
  });

  it('falls back to getCx when getX is provided but xScale is not', () => {
    const group = createMockGroup();
    const config = makeConfig({ getX: (d) => d.dataX });
    const result = asMock(renderPoints(group as any, SAMPLE_DATA, config));

    // Without xScale, should use getCx
    expect(result.elements[0].attrs['cx']).toBe(50);
  });

  it('uses default radius of 4 when getRadius not provided', () => {
    const group = createMockGroup();
    const result = asMock(renderPoints(group as any, SAMPLE_DATA, makeConfig()));

    for (const el of result.elements) {
      expect(el.attrs['r']).toBe(4);
    }
  });

  it('uses getRadius when provided', () => {
    const group = createMockGroup();
    const config = makeConfig({ getRadius: (d) => d.radius });
    const result = asMock(renderPoints(group as any, SAMPLE_DATA, config));

    expect(result.elements[0].attrs['r']).toBe(5);
    expect(result.elements[1].attrs['r']).toBe(6);
    expect(result.elements[2].attrs['r']).toBe(4);
  });

  it('sets fill from getColor', () => {
    const group = createMockGroup();
    const result = asMock(renderPoints(group as any, SAMPLE_DATA, makeConfig()));

    expect(result.elements[0].attrs['fill']).toBe('#f00');
    expect(result.elements[1].attrs['fill']).toBe('#0f0');
    expect(result.elements[2].attrs['fill']).toBe('#00f');
  });

  it('uses default stroke/strokeWidth when not provided', () => {
    const group = createMockGroup();
    const result = asMock(renderPoints(group as any, SAMPLE_DATA, makeConfig()));

    for (const el of result.elements) {
      expect(el.attrs['stroke']).toBe('none');
      expect(el.attrs['stroke-width']).toBe(0);
    }
  });

  it('uses custom stroke/strokeWidth when provided', () => {
    const group = createMockGroup();
    const config = makeConfig({ stroke: '#fff', strokeWidth: 1.5 });
    const result = asMock(renderPoints(group as any, SAMPLE_DATA, config));

    for (const el of result.elements) {
      expect(el.attrs['stroke']).toBe('#fff');
      expect(el.attrs['stroke-width']).toBe(1.5);
    }
  });

  it('sets cursor to pointer', () => {
    const group = createMockGroup();
    const result = asMock(renderPoints(group as any, SAMPLE_DATA, makeConfig()));

    for (const el of result.elements) {
      expect(el.attrs['cursor']).toBe('pointer');
    }
  });

  it('handles empty data', () => {
    const group = createMockGroup();
    const result = asMock(renderPoints(group as any, [], makeConfig()));

    expect(result.elements).toHaveLength(0);
  });

  it('handles single data point', () => {
    const group = createMockGroup();
    const result = asMock(renderPoints(group as any, [SAMPLE_DATA[0]], makeConfig()));

    expect(result.elements).toHaveLength(1);
  });

  it('triggers LTTB downsampling when data exceeds maxPoints', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();

    // Generate data that exceeds the default 2000 threshold
    const bigData: TestPoint[] = Array.from({ length: 3000 }, (_, i) => ({
      id: `p${i}`,
      px: i,
      py: i,
      dataX: i,
      dataY: i,
      color: '#000',
      radius: 4,
    }));

    const config = makeConfig({
      getX: (d) => d.dataX,
      getY: (d) => d.dataY,
    });

    renderPoints(group as any, bigData, config, xScale, yScale);

    // lttbDownsample should have been called
    expect(lttbDownsample).toHaveBeenCalled();
  });

  it('does not downsample when data is below maxPoints', () => {
    vi.mocked(lttbDownsample).mockClear();
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();

    const config = makeConfig({
      getX: (d) => d.dataX,
      getY: (d) => d.dataY,
    });

    renderPoints(group as any, SAMPLE_DATA, config, xScale, yScale);

    expect(lttbDownsample).not.toHaveBeenCalled();
  });

  it('respects custom maxPoints threshold', () => {
    vi.mocked(lttbDownsample).mockClear();
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();

    const fivePoints: TestPoint[] = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      px: i * 10,
      py: i * 10,
      dataX: i * 10,
      dataY: i * 10,
      color: '#000',
      radius: 4,
    }));

    const config = makeConfig({
      getX: (d) => d.dataX,
      getY: (d) => d.dataY,
      maxPoints: 3,
    });

    renderPoints(group as any, fivePoints, config, xScale, yScale);

    expect(lttbDownsample).toHaveBeenCalledWith(fivePoints, 3, config.getX, config.getY);
  });

  it('skips downsampling when getX/getY not provided even if data is large', () => {
    vi.mocked(lttbDownsample).mockClear();
    const group = createMockGroup();

    const bigData: TestPoint[] = Array.from({ length: 5000 }, (_, i) => ({
      id: `p${i}`,
      px: i,
      py: i,
      dataX: i,
      dataY: i,
      color: '#000',
      radius: 4,
    }));

    // No getX/getY → no downsampling
    renderPoints(group as any, bigData, makeConfig());

    expect(lttbDownsample).not.toHaveBeenCalled();
  });
});

// ── updatePointsOnZoom ───────────────────────────────────────────────

describe('updatePointsOnZoom', () => {
  it('updates cx and cy on existing points', () => {
    const group = createMockGroup();
    renderPoints(group as any, SAMPLE_DATA, makeConfig());

    const newGetCx = (d: TestPoint) => d.px * 2;
    const newGetCy = (d: TestPoint) => d.py * 0.5;

    updatePointsOnZoom(group as any, newGetCx, newGetCy);

    const points = group.selectAll('.point');
    for (let i = 0; i < points.elements.length; i++) {
      expect(points.elements[i].attrs['cx']).toBe(SAMPLE_DATA[i].px * 2);
      expect(points.elements[i].attrs['cy']).toBe(SAMPLE_DATA[i].py * 0.5);
    }
  });

  it('does nothing on empty group', () => {
    const group = createMockGroup();
    updatePointsOnZoom(
      group as any,
      () => 0,
      () => 0,
    );
    // Should not throw
  });
});
