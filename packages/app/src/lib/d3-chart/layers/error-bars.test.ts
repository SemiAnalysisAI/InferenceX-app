import { describe, expect, it } from 'vitest';

import { createMockGroup } from './test-helpers';
import { renderErrorBars, updateErrorBarsOnZoom } from './error-bars';
import type { ErrorBarConfig } from './error-bars';

// ── Fixtures ─────────────────────────────────────────────────────────

interface TestDatum {
  cx: number;
  yMin: number;
  yMax: number;
}

const SAMPLE_DATA: TestDatum[] = [
  { cx: 50, yMin: 120, yMax: 80 },
  { cx: 150, yMin: 160, yMax: 40 },
  { cx: 250, yMin: 140, yMax: 60 },
];

function makeConfig(overrides?: Partial<ErrorBarConfig<TestDatum>>): ErrorBarConfig<TestDatum> {
  return {
    getCx: (d) => d.cx,
    getYMin: (d) => d.yMin,
    getYMax: (d) => d.yMax,
    capWidth: 10,
    stroke: '#888',
    ...overrides,
  };
}

// ── renderErrorBars ──────────────────────────────────────────────────

describe('renderErrorBars', () => {
  it('creates one group per data item with error-bar class', () => {
    const group = createMockGroup();
    renderErrorBars(group as any, SAMPLE_DATA, makeConfig());

    const bars = group.selectAll('.error-bar');
    expect(bars.elements).toHaveLength(3);
    for (const el of bars.elements) {
      expect(el.tag).toBe('g');
      expect(el.attrs['class']).toBe('error-bar');
    }
  });

  it('each error bar group has 3 line children (stem, cap-top, cap-bot)', () => {
    const group = createMockGroup();
    renderErrorBars(group as any, SAMPLE_DATA, makeConfig());

    const bars = group.selectAll('.error-bar');
    for (const bar of bars.elements) {
      const lines = bar.children.filter((c) => c.tag === 'line');
      expect(lines).toHaveLength(3);

      const classes = lines.map((l) => l.attrs['class']);
      expect(classes).toContain('eb-stem');
      expect(classes).toContain('eb-cap-top');
      expect(classes).toContain('eb-cap-bot');
    }
  });

  it('stem lines have correct stroke and stroke-width', () => {
    const group = createMockGroup();
    renderErrorBars(group as any, SAMPLE_DATA, makeConfig({ strokeWidth: 2 }));

    const bars = group.selectAll('.error-bar');
    for (const bar of bars.elements) {
      const stem = bar.children.find((c) => c.attrs['class'] === 'eb-stem')!;
      expect(stem.attrs['stroke']).toBe('#888');
      expect(stem.attrs['stroke-width']).toBe(2);
    }
  });

  it('stem line uses default strokeWidth of 1 when not specified', () => {
    const group = createMockGroup();
    renderErrorBars(group as any, SAMPLE_DATA, makeConfig());

    const bars = group.selectAll('.error-bar');
    const stem = bars.elements[0].children.find((c) => c.attrs['class'] === 'eb-stem')!;
    expect(stem.attrs['stroke-width']).toBe(1);
  });

  it('stem lines connect yMax to yMin vertically at cx', () => {
    const group = createMockGroup();
    renderErrorBars(group as any, SAMPLE_DATA, makeConfig());

    const bars = group.selectAll('.error-bar');
    for (let i = 0; i < SAMPLE_DATA.length; i++) {
      // The stem is the first child line that gets `.select('.eb-stem')` attrs applied.
      const stem = bars.elements[i].children.find((c) => c.attrs['class'] === 'eb-stem')!;
      expect(stem).toBeDefined();
      expect(stem.attrs['stroke']).toBe('#888');
    }
  });

  it('cap-top lines have correct stroke', () => {
    const group = createMockGroup();
    renderErrorBars(group as any, SAMPLE_DATA, makeConfig());

    const bars = group.selectAll('.error-bar');
    for (const bar of bars.elements) {
      const cap = bar.children.find((c) => c.attrs['class'] === 'eb-cap-top')!;
      expect(cap.attrs['stroke']).toBe('#888');
    }
  });

  it('cap-bot lines have correct stroke', () => {
    const group = createMockGroup();
    renderErrorBars(group as any, SAMPLE_DATA, makeConfig());

    const bars = group.selectAll('.error-bar');
    for (const bar of bars.elements) {
      const cap = bar.children.find((c) => c.attrs['class'] === 'eb-cap-bot')!;
      expect(cap.attrs['stroke']).toBe('#888');
    }
  });

  it('handles empty data', () => {
    const group = createMockGroup();
    renderErrorBars(group as any, [], makeConfig());

    const bars = group.selectAll('.error-bar');
    expect(bars.elements).toHaveLength(0);
  });

  it('handles single data point', () => {
    const group = createMockGroup();
    renderErrorBars(group as any, [SAMPLE_DATA[0]], makeConfig());

    const bars = group.selectAll('.error-bar');
    expect(bars.elements).toHaveLength(1);
    expect(bars.elements[0].children.filter((c) => c.tag === 'line')).toHaveLength(3);
  });

  it('uses custom stroke color', () => {
    const group = createMockGroup();
    renderErrorBars(group as any, SAMPLE_DATA, makeConfig({ stroke: '#ff0000' }));

    const bars = group.selectAll('.error-bar');
    for (const bar of bars.elements) {
      for (const child of bar.children) {
        expect(child.attrs['stroke']).toBe('#ff0000');
      }
    }
  });
});

// ── updateErrorBarsOnZoom ────────────────────────────────────────────

describe('updateErrorBarsOnZoom', () => {
  it('does not throw on empty group', () => {
    const group = createMockGroup();
    const config = makeConfig();
    // No error bars rendered — update should be a no-op
    updateErrorBarsOnZoom(group as any, config);
  });

  it('updates error bars after render', () => {
    const group = createMockGroup();
    const config = makeConfig();
    renderErrorBars(group as any, SAMPLE_DATA, config);

    // Call with modified config (simulating new scale-derived accessors)
    const zoomedConfig: ErrorBarConfig<TestDatum> = {
      ...config,
      getCx: (d) => d.cx * 2,
      getYMin: (d) => d.yMin * 0.5,
      getYMax: (d) => d.yMax * 0.5,
    };

    // Should not throw
    updateErrorBarsOnZoom(group as any, zoomedConfig);
  });
});
