import { describe, expect, it } from 'vitest';

import { asMock, createMockGroup } from './test-helpers';
import { renderRadar } from './radar';
import type { RadarConfig } from './radar';

// ── Fixtures ─────────────────────────────────────────────────────────

interface TestGpu {
  name: string;
  color: string;
  values: (number | null)[];
}

const AXES = [
  { label: 'FP8', unit: 'TFLOPS' },
  { label: 'Memory', unit: 'GB' },
  { label: 'Bandwidth', unit: 'TB/s' },
  { label: 'TDP', unit: 'W' },
];

const SAMPLE_DATA: TestGpu[] = [
  { name: 'GPU-A', color: '#f00', values: [0.8, 0.6, 0.9, 0.5] },
  { name: 'GPU-B', color: '#0f0', values: [0.5, 0.9, 0.4, 0.7] },
];

function makeConfig(overrides?: Partial<RadarConfig<TestGpu>>): RadarConfig<TestGpu> {
  return {
    axes: AXES,
    getValue: (d, i) => d.values[i],
    getColor: (d) => d.color,
    getLabel: (d) => d.name,
    keyFn: (d) => d.name,
    ...overrides,
  };
}

// ── renderRadar ──────────────────────────────────────────────────────

describe('renderRadar', () => {
  it('creates a radar-center group', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig());

    // The function uses group.select (not selectAll), so check children directly
    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    expect(centerGroup).toBeDefined();
  });

  it('centers the radar group at width/2, height/2', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 300, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    expect(centerGroup).toBeDefined();
    expect(centerGroup!.attrs['transform']).toBe('translate(200,150)');
  });

  it('creates concentric grid circles (default 5 levels)', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    expect(centerGroup).toBeDefined();

    const gridCircles = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-grid');
    expect(gridCircles).toHaveLength(5);
  });

  it('creates correct number of grid circles with custom levels', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig({ levels: 3 }));

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const gridCircles = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-grid');
    expect(gridCircles).toHaveLength(3);
  });

  it('creates grid level labels', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const gridLabels = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-grid-label');
    expect(gridLabels).toHaveLength(5);
  });

  it('grid labels show percentage text', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const gridLabels = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-grid-label');

    const texts = gridLabels.map((l) => l.textContent);
    expect(texts).toContain('20%');
    expect(texts).toContain('40%');
    expect(texts).toContain('60%');
    expect(texts).toContain('80%');
    expect(texts).toContain('100%');
  });

  it('creates axis spokes equal to number of axes', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const spokes = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-spoke');
    expect(spokes).toHaveLength(AXES.length);
  });

  it('spoke lines start at origin (0,0)', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const spokes = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-spoke');

    for (const spoke of spokes) {
      expect(spoke.attrs['x1']).toBe(0);
      expect(spoke.attrs['y1']).toBe(0);
    }
  });

  it('creates axis labels for each axis', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const axisLabels = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-axis-label');
    expect(axisLabels).toHaveLength(AXES.length);

    const labelTexts = axisLabels.map((l) => l.textContent);
    expect(labelTexts).toContain('FP8');
    expect(labelTexts).toContain('Memory');
    expect(labelTexts).toContain('Bandwidth');
    expect(labelTexts).toContain('TDP');
  });

  it('creates polygons for each data item', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const polygons = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-polygon');
    expect(polygons).toHaveLength(2);
  });

  it('polygons have fill and stroke from getColor', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const polygons = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-polygon');

    expect(polygons[0].attrs['fill']).toBe('#f00');
    expect(polygons[0].attrs['stroke']).toBe('#f00');
    expect(polygons[1].attrs['fill']).toBe('#0f0');
    expect(polygons[1].attrs['stroke']).toBe('#0f0');
  });

  it('polygons have correct opacity values', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const polygons = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-polygon');

    for (const polygon of polygons) {
      expect(polygon.attrs['fill-opacity']).toBe(0.08);
      expect(polygon.attrs['stroke-width']).toBe(1.5);
      expect(polygon.attrs['stroke-opacity']).toBe(0.7);
    }
  });

  it('polygons have valid d attribute (closed path)', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const polygons = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-polygon');

    for (const polygon of polygons) {
      const d = String(polygon.attrs['d']);
      expect(d).toBeTruthy();
      expect(d.startsWith('M')).toBe(true);
    }
  });

  it('creates dots for each non-null data value', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig());

    // 2 GPUs x 4 axes = 8 dots (all values are non-null)
    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const dots = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-dot');
    expect(dots).toHaveLength(8);
  });

  it('dots have correct fill from their parent data color', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const dots = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-dot');

    // First 4 dots belong to GPU-A (#f00), next 4 to GPU-B (#0f0)
    for (let i = 0; i < 4; i++) {
      expect(dots[i].attrs['fill']).toBe('#f00');
    }
    for (let i = 4; i < 8; i++) {
      expect(dots[i].attrs['fill']).toBe('#0f0');
    }
  });

  it('dots have correct radius of 3.5', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const dots = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-dot');

    for (const dot of dots) {
      expect(dot.attrs['r']).toBe(3.5);
    }
  });

  it('dots have white stroke', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const dots = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-dot');

    for (const dot of dots) {
      expect(dot.attrs['stroke']).toBe('white');
      expect(dot.attrs['stroke-width']).toBe(1);
    }
  });

  it('dots have cursor pointer style', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const dots = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-dot');

    for (const dot of dots) {
      expect(dot.styles['cursor']).toBe('pointer');
    }
  });

  it('skips dots for null values', () => {
    const group = createMockGroup();
    const dataWithNulls: TestGpu[] = [
      { name: 'GPU-A', color: '#f00', values: [0.8, null, 0.9, null] },
    ];
    const config = makeConfig();
    renderRadar(group as any, dataWithNulls, 400, 400, config);

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const dots = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-dot');

    // Only 2 non-null values
    expect(dots).toHaveLength(2);
  });

  it('handles empty data', () => {
    const group = createMockGroup();
    renderRadar(group as any, [], 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    expect(centerGroup).toBeDefined();

    // No polygons or dots
    const polygons = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-polygon');
    const dots = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-dot');
    expect(polygons).toHaveLength(0);
    expect(dots).toHaveLength(0);

    // Grid and spokes should still exist
    const gridCircles = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-grid');
    expect(gridCircles).toHaveLength(5);
  });

  it('handles zero-size chart gracefully', () => {
    const group = createMockGroup();
    // With labelMargin=30 (default), size=0 means radius=(0-60)/2=-30 which is <=0
    const result = asMock(renderRadar(group as any, SAMPLE_DATA, 0, 0, makeConfig()));

    // Should return an empty dot selection
    expect(result.elements).toHaveLength(0);
  });

  it('handles very small chart (radius <= 0)', () => {
    const group = createMockGroup();
    // With labelMargin=30, chart needs to be > 60 for positive radius
    const result = asMock(renderRadar(group as any, SAMPLE_DATA, 50, 50, makeConfig()));

    // radius = (50 - 60) / 2 = -5, which is <= 0
    expect(result.elements).toHaveLength(0);
  });

  it('handles single data item', () => {
    const group = createMockGroup();
    renderRadar(group as any, [SAMPLE_DATA[0]], 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const polygons = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-polygon');
    const dots = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-dot');

    expect(polygons).toHaveLength(1);
    expect(dots).toHaveLength(4);
  });

  it('uses custom labelMargin', () => {
    const group = createMockGroup();
    // With labelMargin=0, radius = min(400,400)/2 = 200
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig({ labelMargin: 0 }));

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    expect(centerGroup).toBeDefined();

    // Just verify it renders without error
    const dots = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-dot');
    expect(dots).toHaveLength(8);
  });

  it('uses non-square dimensions correctly (min of width, height)', () => {
    const group = createMockGroup();
    // 600 wide, 200 tall -> size = 200
    renderRadar(group as any, SAMPLE_DATA, 600, 200, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    expect(centerGroup).toBeDefined();

    // Center should be at (300, 100)
    expect(centerGroup!.attrs['transform']).toBe('translate(300,100)');
  });

  it('outer grid circle has solid stroke (no dasharray)', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const gridCircles = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-grid');

    // The outermost grid circle (level 5) should have stroke-dasharray = 'none'
    const outerCircle = gridCircles[gridCircles.length - 1];
    expect(outerCircle.attrs['stroke-dasharray']).toBe('none');
  });

  it('inner grid circles have dashed stroke', () => {
    const group = createMockGroup();
    renderRadar(group as any, SAMPLE_DATA, 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const gridCircles = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-grid');

    // All except the last should have '2,3' dasharray
    for (let i = 0; i < gridCircles.length - 1; i++) {
      expect(gridCircles[i].attrs['stroke-dasharray']).toBe('2,3');
    }
  });

  it('polygon d attribute uses null values as 0 radius', () => {
    const group = createMockGroup();
    const dataWithNull: TestGpu[] = [
      { name: 'GPU-A', color: '#f00', values: [0.5, null, 0.5, null] },
    ];
    renderRadar(group as any, dataWithNull, 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const polygons = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-polygon');

    expect(polygons).toHaveLength(1);
    const d = String(polygons[0].attrs['d']);
    // Should still produce a valid closed path
    expect(d.startsWith('M')).toBe(true);
  });

  it('all values at 1.0 produce dots at maximum radius', () => {
    const group = createMockGroup();
    const maxData: TestGpu[] = [{ name: 'GPU-MAX', color: '#f00', values: [1.0, 1.0, 1.0, 1.0] }];
    renderRadar(group as any, maxData, 400, 400, makeConfig({ labelMargin: 30 }));

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const dots = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-dot');

    const radius = (Math.min(400, 400) - 30 * 2) / 2; // 170
    const numAxes = 4;
    const angleSlice = (Math.PI * 2) / numAxes;

    for (let i = 0; i < dots.length; i++) {
      const angle = angleSlice * i - Math.PI / 2;
      const expectedCx = Math.cos(angle) * radius;
      const expectedCy = Math.sin(angle) * radius;

      expect(dots[i].attrs['cx']).toBeCloseTo(expectedCx, 5);
      expect(dots[i].attrs['cy']).toBeCloseTo(expectedCy, 5);
    }
  });

  it('all values at 0.0 produce dots at origin', () => {
    const group = createMockGroup();
    const zeroData: TestGpu[] = [{ name: 'GPU-ZERO', color: '#f00', values: [0, 0, 0, 0] }];
    renderRadar(group as any, zeroData, 400, 400, makeConfig());

    const root = group.elements[0];
    const centerGroup = root.children.find((c) => c.attrs['class'] === 'radar-center');
    const dots = centerGroup!.children.filter((c) => c.attrs['class'] === 'radar-dot');

    for (const dot of dots) {
      expect(dot.attrs['cx']).toBeCloseTo(0, 5);
      expect(dot.attrs['cy']).toBeCloseTo(0, 5);
    }
  });
});
