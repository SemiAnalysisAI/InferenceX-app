import * as d3 from 'd3';
import { describe, expect, it } from 'vitest';

import { createMockGroup } from './test-helpers';
import { renderBarLabels, updateBarLabelsOnZoom } from './bar-labels';
import type { BarLabelConfig } from './bar-labels';

// ── Fixtures ─────────────────────────────────────────────────────────

interface TestDatum {
  label: string;
  value: number;
  displayLabel: string;
}

const SAMPLE_DATA: TestDatum[] = [
  { label: 'A', value: 40, displayLabel: '40%' },
  { label: 'B', value: 80, displayLabel: '80%' },
  { label: 'C', value: 60, displayLabel: '60%' },
];

function makeConfig(): BarLabelConfig<TestDatum> {
  return {
    getX: (d) => d.label,
    getY: (d) => d.value,
    getLabel: (d) => d.displayLabel,
    foreground: '#ffffff',
  };
}

function makeScales() {
  const xScale = d3.scaleBand<string>().domain(['A', 'B', 'C']).range([0, 300]).padding(0.1);
  const yScale = d3.scaleLinear().domain([0, 100]).range([200, 0]);
  return { xScale, yScale };
}

// ── renderBarLabels ──────────────────────────────────────────────────

describe('renderBarLabels', () => {
  it('creates text elements with bar-label class', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderBarLabels(group as any, SAMPLE_DATA, xScale, yScale, 200, makeConfig());

    const labels = group.selectAll('.bar-label');
    expect(labels.elements).toHaveLength(3);
    for (const el of labels.elements) {
      expect(el.tag).toBe('text');
      expect(el.attrs['class']).toBe('bar-label');
    }
  });

  it('positions labels at center of bar horizontally', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderBarLabels(group as any, SAMPLE_DATA, xScale, yScale, 200, makeConfig());

    const labels = group.selectAll('.bar-label');
    for (let i = 0; i < SAMPLE_DATA.length; i++) {
      const expectedX = (xScale(SAMPLE_DATA[i].label) || 0) + xScale.bandwidth() / 2;
      expect(labels.elements[i].attrs['x']).toBe(expectedX);
    }
  });

  it('positions labels at vertical center of bar', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const height = 200;
    renderBarLabels(group as any, SAMPLE_DATA, xScale, yScale, height, makeConfig());

    const labels = group.selectAll('.bar-label');
    for (let i = 0; i < SAMPLE_DATA.length; i++) {
      const barHeight = height - yScale(SAMPLE_DATA[i].value);
      const expectedY = yScale(SAMPLE_DATA[i].value) + barHeight / 2;
      expect(labels.elements[i].attrs['y']).toBe(expectedY);
    }
  });

  it('sets text-anchor to middle', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderBarLabels(group as any, SAMPLE_DATA, xScale, yScale, 200, makeConfig());

    const labels = group.selectAll('.bar-label');
    for (const el of labels.elements) {
      expect(el.attrs['text-anchor']).toBe('middle');
    }
  });

  it('sets dominant-baseline to central', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderBarLabels(group as any, SAMPLE_DATA, xScale, yScale, 200, makeConfig());

    const labels = group.selectAll('.bar-label');
    for (const el of labels.elements) {
      expect(el.attrs['dominant-baseline']).toBe('central');
    }
  });

  it('applies -90 degree rotation around label center', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const height = 200;
    renderBarLabels(group as any, SAMPLE_DATA, xScale, yScale, height, makeConfig());

    const labels = group.selectAll('.bar-label');
    for (let i = 0; i < SAMPLE_DATA.length; i++) {
      const cx = (xScale(SAMPLE_DATA[i].label) || 0) + xScale.bandwidth() / 2;
      const barHeight = height - yScale(SAMPLE_DATA[i].value);
      const cy = yScale(SAMPLE_DATA[i].value) + barHeight / 2;
      expect(labels.elements[i].attrs['transform']).toBe(`rotate(-90, ${cx}, ${cy})`);
    }
  });

  it('uses foreground color from config', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderBarLabels(group as any, SAMPLE_DATA, xScale, yScale, 200, makeConfig());

    const labels = group.selectAll('.bar-label');
    for (const el of labels.elements) {
      expect(el.attrs['fill']).toBe('#ffffff');
    }
  });

  it('computes font-size based on bar height, clamped 8-14px', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const height = 200;
    renderBarLabels(group as any, SAMPLE_DATA, xScale, yScale, height, makeConfig());

    const labels = group.selectAll('.bar-label');
    for (let i = 0; i < SAMPLE_DATA.length; i++) {
      const barHeight = height - yScale(SAMPLE_DATA[i].value);
      const expectedSize = Math.min(Math.max(barHeight * 0.3, 8), 14);
      expect(labels.elements[i].attrs['font-size']).toBe(`${expectedSize}px`);
    }
  });

  it('sets font-weight to 600', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderBarLabels(group as any, SAMPLE_DATA, xScale, yScale, 200, makeConfig());

    const labels = group.selectAll('.bar-label');
    for (const el of labels.elements) {
      expect(el.attrs['font-weight']).toBe('600');
    }
  });

  it('sets pointer-events to none', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderBarLabels(group as any, SAMPLE_DATA, xScale, yScale, 200, makeConfig());

    const labels = group.selectAll('.bar-label');
    for (const el of labels.elements) {
      expect(el.attrs['pointer-events']).toBe('none');
    }
  });

  it('sets text content from getLabel', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderBarLabels(group as any, SAMPLE_DATA, xScale, yScale, 200, makeConfig());

    const labels = group.selectAll('.bar-label');
    expect(labels.elements[0].textContent).toBe('40%');
    expect(labels.elements[1].textContent).toBe('80%');
    expect(labels.elements[2].textContent).toBe('60%');
  });

  it('handles empty data', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    renderBarLabels(group as any, [], xScale, yScale, 200, makeConfig());

    const labels = group.selectAll('.bar-label');
    expect(labels.elements).toHaveLength(0);
  });

  it('font-size clamps to minimum 8px for very small bars', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const height = 200;
    // Value of 5 -> barHeight = 200 - yScale(5) = 200 - 190 = 10 -> 10*0.3=3 -> clamped to 8
    const data: TestDatum[] = [{ label: 'A', value: 5, displayLabel: '5%' }];
    renderBarLabels(group as any, data, xScale, yScale, height, makeConfig());

    const labels = group.selectAll('.bar-label');
    expect(labels.elements[0].attrs['font-size']).toBe('8px');
  });

  it('font-size clamps to maximum 14px for very tall bars', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const height = 200;
    // Value of 100 -> barHeight = 200 - 0 = 200 -> 200*0.3=60 -> clamped to 14
    const data: TestDatum[] = [{ label: 'A', value: 100, displayLabel: '100%' }];
    renderBarLabels(group as any, data, xScale, yScale, height, makeConfig());

    const labels = group.selectAll('.bar-label');
    expect(labels.elements[0].attrs['font-size']).toBe('14px');
  });
});

// ── updateBarLabelsOnZoom ────────────────────────────────────────────

describe('updateBarLabelsOnZoom', () => {
  it('re-renders labels (delegates to renderBarLabels)', () => {
    const group = createMockGroup();
    const { xScale, yScale } = makeScales();
    const height = 200;
    const config = makeConfig();

    renderBarLabels(group as any, SAMPLE_DATA, xScale, yScale, height, config);

    // Change the scale to simulate zoom
    const newYScale = d3.scaleLinear().domain([0, 200]).range([200, 0]);
    updateBarLabelsOnZoom(group as any, SAMPLE_DATA, xScale, newYScale, height, config);

    // After zoom, positions should reflect the new scale
    const labels = group.selectAll('.bar-label');
    for (let i = 0; i < SAMPLE_DATA.length; i++) {
      const barHeight = height - newYScale(SAMPLE_DATA[i].value);
      const expectedY = newYScale(SAMPLE_DATA[i].value) + barHeight / 2;
      expect(labels.elements[i].attrs['y']).toBe(expectedY);
    }
  });
});
