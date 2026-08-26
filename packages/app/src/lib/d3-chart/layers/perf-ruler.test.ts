import { describe, expect, it } from 'vitest';

import { createMockGroup, type MockSelection } from './test-helpers';
import {
  DEFAULT_LABEL_FONT_SIZE,
  EMPTY_PERF_RULER_STATE,
  MAX_PERF_RULERS,
  clampIsoX,
  clearPerfRulers,
  computeIsoXRulerGeometry,
  computePerfRulerLabelLayout,
  computePerfRulerLabelLayouts,
  deletePerfRuler,
  formatPerfRatio,
  intersectPathAtX,
  isPerfRulerCurveVisible,
  movePerfRulerIsoX,
  nextPerfRulerState,
  pathXExtent,
  perfRulerCurveSet,
  prunePerfRulers,
  renderPerfRulers,
  type PerfRulerEndInput,
  type PerfRulerGeometry,
  type PerfRulerLabelLayoutOptions,
  type PerfRulerPathLike,
  type PerfRulerRenderOptions,
  type PerfRulerState,
} from './perf-ruler';

// ── Fixtures ─────────────────────────────────────────

const ISO_X = 100;
const END_A: PerfRulerEndInput = { py: 50, rawY: 400 };
const END_B: PerfRulerEndInput = { py: 150, rawY: 197 };

function makeOpts(overrides?: Partial<PerfRulerRenderOptions>): PerfRulerRenderOptions {
  return {
    color: 'var(--primary)',
    ...overrides,
  };
}

/**
 * Synthetic polyline implementation of the SVGPathElement length API — jsdom
 * has no getTotalLength/getPointAtLength, so intersection tests drive the
 * binary search through this instead of a real path node.
 */
function polylinePath(vertices: { x: number; y: number }[]): PerfRulerPathLike {
  const lengths: number[] = [0];
  for (let i = 1; i < vertices.length; i++) {
    lengths.push(
      lengths[i - 1] +
        Math.hypot(vertices[i].x - vertices[i - 1].x, vertices[i].y - vertices[i - 1].y),
    );
  }
  const total = vertices.length > 0 ? (lengths.at(-1) ?? 0) : 0;
  return {
    getTotalLength: () => total,
    getPointAtLength(length: number) {
      const clamped = Math.min(Math.max(length, 0), total);
      for (let i = 1; i < vertices.length; i++) {
        if (clamped <= lengths[i]) {
          const segLen = lengths[i] - lengths[i - 1];
          const t = segLen === 0 ? 0 : (clamped - lengths[i - 1]) / segLen;
          return {
            x: vertices[i - 1].x + (vertices[i].x - vertices[i - 1].x) * t,
            y: vertices[i - 1].y + (vertices[i].y - vertices[i - 1].y) * t,
          };
        }
      }
      return vertices.at(-1) ?? { x: Number.NaN, y: Number.NaN };
    },
  };
}

// ── formatPerfRatio ──────────────────────────────────────────────────

describe('formatPerfRatio', () => {
  it('formats small multiples with two decimals', () => {
    expect(formatPerfRatio(2.0304)).toBe('2.03x');
    expect(formatPerfRatio(1)).toBe('1.00x');
  });

  it('drops to one decimal at 10x and none at 100x', () => {
    expect(formatPerfRatio(10.46)).toBe('10.5x');
    expect(formatPerfRatio(123.4)).toBe('123x');
  });

  it('returns empty string for non-finite or non-positive ratios', () => {
    expect(formatPerfRatio(Number.NaN)).toBe('');
    expect(formatPerfRatio(Number.POSITIVE_INFINITY)).toBe('');
    expect(formatPerfRatio(0)).toBe('');
    expect(formatPerfRatio(-2)).toBe('');
  });
});

// ── isPerfRulerCurveVisible ────────────────────────────────────────────────

describe('isPerfRulerCurveVisible', () => {
  it('treats legend-hidden curves (opacity 0) as invisible', () => {
    expect(isPerfRulerCurveVisible('0')).toBe(false);
    expect(isPerfRulerCurveVisible('0.0')).toBe(false);
    expect(isPerfRulerCurveVisible(' 0 ')).toBe(false);
  });

  it('keeps hover-dimmed and fully opaque curves measurable', () => {
    expect(isPerfRulerCurveVisible('0.15')).toBe(true);
    expect(isPerfRulerCurveVisible('1')).toBe(true);
  });

  it('treats missing, empty, or unparseable opacity as visible', () => {
    expect(isPerfRulerCurveVisible(null)).toBe(true);
    expect(isPerfRulerCurveVisible(undefined)).toBe(true);
    expect(isPerfRulerCurveVisible('')).toBe(true);
    expect(isPerfRulerCurveVisible('inherit')).toBe(true);
  });
});

// ── intersectPathAtX ─────────────────────────────────────────────────

describe('intersectPathAtX', () => {
  it('finds the mid-segment intersection on a single-segment path', () => {
    const path = polylinePath([
      { x: 0, y: 100 },
      { x: 100, y: 0 },
    ]);
    const hit = intersectPathAtX(path, 50);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(50, 0);
    expect(hit!.y).toBeCloseTo(50, 0);
  });

  it('interpolates within the correct segment of a multi-segment curve', () => {
    const path = polylinePath([
      { x: 0, y: 200 },
      { x: 100, y: 100 },
      { x: 300, y: 50 },
    ]);
    const hit = intersectPathAtX(path, 200);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(200, 0);
    expect(hit!.y).toBeCloseTo(75, 1);
  });

  it('hits interior vertices exactly', () => {
    const path = polylinePath([
      { x: 0, y: 200 },
      { x: 100, y: 100 },
      { x: 300, y: 50 },
    ]);
    const hit = intersectPathAtX(path, 100);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(100, 0);
    expect(hit!.y).toBeCloseTo(100, 0);
  });

  it('supports paths whose x decreases along their length', () => {
    const path = polylinePath([
      { x: 300, y: 10 },
      { x: 100, y: 110 },
    ]);
    const hit = intersectPathAtX(path, 200);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(200, 0);
    expect(hit!.y).toBeCloseTo(60, 0);
  });

  it('returns null when x lies outside the path x extent', () => {
    const path = polylinePath([
      { x: 100, y: 100 },
      { x: 300, y: 50 },
    ]);
    expect(intersectPathAtX(path, 50)).toBeNull();
    expect(intersectPathAtX(path, 350)).toBeNull();
  });

  it('still intersects at the endpoints (within half-pixel slack)', () => {
    const path = polylinePath([
      { x: 100, y: 100 },
      { x: 300, y: 50 },
    ]);
    const atStart = intersectPathAtX(path, 100);
    expect(atStart).not.toBeNull();
    expect(atStart!.y).toBeCloseTo(100, 0);
    const nearEnd = intersectPathAtX(path, 300.4);
    expect(nearEnd).not.toBeNull();
    expect(nearEnd!.y).toBeCloseTo(50, 0);
  });

  it('converges tightly on shallow curves approximated by many segments', () => {
    // y = 10000 / x sampled on [50, 500] — a hyperbola like a latency curve.
    const vertices = Array.from({ length: 91 }, (_v, i) => {
      const x = 50 + i * 5;
      return { x, y: 10000 / x };
    });
    const path = polylinePath(vertices);
    const hit = intersectPathAtX(path, 250);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(250, 0);
    expect(hit!.y).toBeCloseTo(40, 0);
  });

  it('returns a point on a vertical (constant-x) path instead of diverging', () => {
    const path = polylinePath([
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ]);
    const hit = intersectPathAtX(path, 50);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBe(50);
  });

  it('returns null for degenerate paths and non-finite x', () => {
    expect(intersectPathAtX(polylinePath([{ x: 10, y: 10 }]), 10)).toBeNull();
    expect(intersectPathAtX(polylinePath([]), 10)).toBeNull();
    const path = polylinePath([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(intersectPathAtX(path, Number.NaN)).toBeNull();
  });
});

// ── computeIsoXRulerGeometry ─────────────────────────────────────────

describe('computeIsoXRulerGeometry', () => {
  it('places the line at the iso-x, spanning the two intersection ys', () => {
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B);
    expect(geometry).not.toBeNull();
    expect(geometry!.x).toBe(100);
    expect(geometry!.y1).toBe(50);
    expect(geometry!.y2).toBe(150);
  });

  it('computes the ratio from raw y values, higher over lower', () => {
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B);
    expect(geometry!.ratio).toBeCloseTo(400 / 197, 10);
    expect(geometry!.ratioLabel).toBe('2.03x');
  });

  it('yields the same ratio regardless of end order (symmetric)', () => {
    const swapped = computeIsoXRulerGeometry(ISO_X, END_B, END_A);
    expect(swapped!.ratio).toBeCloseTo(400 / 197, 10);
    expect(swapped!.y1).toBe(50);
    expect(swapped!.y2).toBe(150);
  });

  it('handles the curves crossing at the iso-x (ratio 1, zero-height span)', () => {
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, { ...END_A });
    expect(geometry).not.toBeNull();
    expect(geometry!.ratio).toBe(1);
    expect(geometry!.ratioLabel).toBe('1.00x');
    expect(geometry!.y1).toBe(geometry!.y2);
  });

  it('returns null when either raw y is zero or negative', () => {
    expect(computeIsoXRulerGeometry(ISO_X, END_A, { ...END_B, rawY: 0 })).toBeNull();
    expect(computeIsoXRulerGeometry(ISO_X, { ...END_A, rawY: -5 }, END_B)).toBeNull();
  });

  it('returns null for non-finite inputs', () => {
    expect(computeIsoXRulerGeometry(Number.NaN, END_A, END_B)).toBeNull();
    expect(
      computeIsoXRulerGeometry(ISO_X, END_A, { ...END_B, py: Number.POSITIVE_INFINITY }),
    ).toBeNull();
    expect(computeIsoXRulerGeometry(ISO_X, END_A, { ...END_B, rawY: Number.NaN })).toBeNull();
  });
});

// ── computePerfRulerLabelLayout ──────────────────────────────────────────────────

describe('computePerfRulerLabelLayout', () => {
  const GEOMETRY = { x: 100, y1: 50, y2: 150, ratioLabel: '2.03x' };

  it('places the label up-right of the line midpoint by default', () => {
    const layout = computePerfRulerLabelLayout(GEOMETRY, { chartWidth: 800, chartHeight: 400 });
    expect(layout.side).toBe(1);
    expect(layout.textAnchor).toBe('start');
    expect(layout.labelX).toBeGreaterThan(GEOMETRY.x);
    expect(layout.labelY).toBeLessThan((GEOMETRY.y1 + GEOMETRY.y2) / 2);
  });

  it('flips to the left side near the right chart edge', () => {
    const layout = computePerfRulerLabelLayout(GEOMETRY, { chartWidth: 125, chartHeight: 400 });
    expect(layout.side).toBe(-1);
    expect(layout.textAnchor).toBe('end');
    expect(layout.labelX).toBeLessThan(GEOMETRY.x);
  });

  it('drops below the midpoint when the label would clip the top', () => {
    const top = { x: 100, y1: 10, y2: 30, ratioLabel: '2.03x' };
    const layout = computePerfRulerLabelLayout(top, { chartWidth: 800, chartHeight: 400 });
    expect(layout.labelY).toBeGreaterThan((top.y1 + top.y2) / 2);
  });

  it('clamps the label inside the chart when above and below both clip', () => {
    const top = { x: 100, y1: 10, y2: 30, ratioLabel: '2.03x' };
    const layout = computePerfRulerLabelLayout(top, { chartWidth: 800, chartHeight: 70 });
    const fontSize = DEFAULT_LABEL_FONT_SIZE;
    expect(layout.labelY - fontSize / 2).toBeGreaterThanOrEqual(4);
    expect(layout.labelY + fontSize / 2).toBeLessThanOrEqual(70);
  });

  it('ends the arrow curve horizontally next to the line midpoint', () => {
    const layout = computePerfRulerLabelLayout(GEOMETRY, { chartWidth: 800, chartHeight: 400 });
    const midY = (GEOMETRY.y1 + GEOMETRY.y2) / 2;
    // Quadratic curve: M sx sy Q cx cy ex ey — the end point sits a few px
    // right of the line at the midpoint height, tangent horizontal.
    const numbers = layout.arrowPath.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const [sx, sy, cx, cy, ex, ey] = numbers;
    expect(sx).toBeGreaterThan(GEOMETRY.x);
    expect(sy).toBeLessThan(midY);
    expect(cy).toBe(midY);
    expect(cx).toBe(sx);
    expect(ey).toBe(midY);
    expect(ex).toBeGreaterThan(GEOMETRY.x);
    expect(ex).toBeLessThan(sx);
  });

  it('points the arrowhead tip at the line, just off the stroke', () => {
    const layout = computePerfRulerLabelLayout(GEOMETRY, { chartWidth: 800, chartHeight: 400 });
    const midY = (GEOMETRY.y1 + GEOMETRY.y2) / 2;
    const numbers = layout.arrowHeadPath.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const [tipX, tipY] = numbers;
    expect(tipY).toBe(midY);
    expect(Math.abs(tipX - GEOMETRY.x)).toBeLessThanOrEqual(6);
    expect(layout.arrowHeadPath.endsWith('Z')).toBe(true);
  });

  it('respects a custom font size when checking the top clip', () => {
    const nearTop = { x: 100, y1: 40, y2: 60, ratioLabel: '2.03x' };
    const small = computePerfRulerLabelLayout(nearTop, { fontSize: 12 });
    // 50 - 46 = 4 above the top — fits a 12px label (4 - 6 < 4 fails)…
    // both sizes clip here, so both drop below; a taller chart midpoint
    // stays above for both.
    const tall = { x: 100, y1: 100, y2: 200, ratioLabel: '2.03x' };
    expect(computePerfRulerLabelLayout(tall, { fontSize: 12 }).labelY).toBeLessThan(150);
    expect(small.labelY).toBeGreaterThan(50);
  });

  it('anchors the × delete button just past the label, at the label height', () => {
    const right = computePerfRulerLabelLayout(GEOMETRY, { chartWidth: 800, chartHeight: 400 });
    expect(right.side).toBe(1);
    expect(right.deleteX).toBeGreaterThan(right.labelX);
    expect(right.deleteY).toBe(right.labelY);
    const left = computePerfRulerLabelLayout(GEOMETRY, { chartWidth: 125, chartHeight: 400 });
    expect(left.side).toBe(-1);
    expect(left.deleteX).toBeLessThan(left.labelX);
    expect(left.deleteY).toBe(left.labelY);
  });
});

// ── computePerfRulerLabelLayouts ──────────────────────────────────

describe('computePerfRulerLabelLayouts', () => {
  const GEOMETRY = { x: 100, y1: 50, y2: 150, ratioLabel: '2.03x' };
  const OPTS = { chartWidth: 800, chartHeight: 400 };

  it('matches the single-label layout when there is no collision', () => {
    const [only] = computePerfRulerLabelLayouts([GEOMETRY], OPTS);
    expect(only).toEqual(computePerfRulerLabelLayout(GEOMETRY, OPTS));
  });

  it('passes null geometries through, keeping array positions aligned', () => {
    const layouts = computePerfRulerLabelLayouts([null, GEOMETRY, null], OPTS);
    expect(layouts).toHaveLength(3);
    expect(layouts[0]).toBeNull();
    expect(layouts[1]).not.toBeNull();
    expect(layouts[2]).toBeNull();
  });

  it('nudges the second of two colliding labels vertically apart', () => {
    const [first, second] = computePerfRulerLabelLayouts([GEOMETRY, { ...GEOMETRY }], OPTS);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.labelY).not.toBe(first!.labelY);
    expect(Math.abs(second!.labelY - first!.labelY)).toBeGreaterThanOrEqual(
      DEFAULT_LABEL_FONT_SIZE + 8,
    );
    // The nudged label's arrow and × follow it.
    expect(second!.deleteY).toBe(second!.labelY);
    expect(second!.arrowPath).not.toBe(first!.arrowPath);
  });

  it('leaves far-apart labels untouched', () => {
    const other = { x: 500, y1: 250, y2: 350, ratioLabel: '1.50x' };
    const [first, second] = computePerfRulerLabelLayouts([GEOMETRY, other], OPTS);
    expect(first).toEqual(computePerfRulerLabelLayout(GEOMETRY, OPTS));
    expect(second).toEqual(computePerfRulerLabelLayout(other, OPTS));
  });
});

// ── renderPerfRulers ───────────────────────────────────────────────────

/** Render one ruler (id 1) with its layout computed like the caller does. */
function renderSingle(
  group: MockSelection,
  geometry: PerfRulerGeometry | null,
  opts?: Partial<PerfRulerRenderOptions>,
  layoutOpts?: PerfRulerLabelLayoutOptions,
): void {
  const entries = [];
  if (geometry) {
    const [layout] = computePerfRulerLabelLayouts([geometry], layoutOpts);
    entries.push({ id: 1, geometry, layout: layout! });
  }
  renderPerfRulers(group as any, entries, makeOpts(opts));
}

describe('renderPerfRulers', () => {
  it('draws the ruler line, end caps, arrow, big ratio label, drag handle, and ×', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderSingle(group, geometry);

    const ruler = group.selectAll('.perf-ruler');
    expect(ruler.elements).toHaveLength(1);
    const children = ruler.elements[0].children.map((c) => String(c.attrs['class']));
    expect(children).toContain('pr-line');
    expect(children).toContain('pr-cap pr-cap-top');
    expect(children).toContain('pr-cap pr-cap-bottom');
    expect(children).toContain('pr-arrow');
    expect(children).toContain('pr-arrow-head');
    expect(children).toContain('pr-text pr-text-ratio');
    expect(children).toContain('pr-drag');
    expect(children).toContain('pr-delete no-export');
    // The chip rect and secondary percent line are gone in the big-label
    // design.
    expect(children).not.toContain('pr-bg');
    expect(children).not.toContain('pr-text pr-text-percent');
  });

  it('positions the vertical line and caps at the iso-x', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderSingle(group, geometry, { capHalfWidth: 6 });

    const ruler = group.selectAll('.perf-ruler');
    const byClass = (cls: string) =>
      ruler.elements[0].children.find((c) => String(c.attrs['class']) === cls)!;
    const line = byClass('pr-line');
    expect(line.attrs['x1']).toBe(100);
    expect(line.attrs['x2']).toBe(100);
    expect(line.attrs['y1']).toBe(50);
    expect(line.attrs['y2']).toBe(150);
    expect(line.attrs['stroke']).toBe('var(--primary)');

    const capTop = byClass('pr-cap pr-cap-top');
    expect(capTop.attrs['x1']).toBe(94);
    expect(capTop.attrs['x2']).toBe(106);
    expect(capTop.attrs['y1']).toBe(50);
    expect(capTop.attrs['y2']).toBe(50);

    const capBottom = byClass('pr-cap pr-cap-bottom');
    expect(capBottom.attrs['y1']).toBe(150);
    expect(capBottom.attrs['y2']).toBe(150);
  });

  it('overlays an invisible wide drag handle spanning the ruler line', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderSingle(group, geometry);

    const ruler = group.selectAll('.perf-ruler');
    const drag = ruler.elements[0].children.find((c) => String(c.attrs['class']) === 'pr-drag')!;
    expect(drag.attrs['x1']).toBe(100);
    expect(drag.attrs['x2']).toBe(100);
    expect(drag.attrs['y1']).toBe(50);
    expect(drag.attrs['y2']).toBe(150);
    expect(drag.attrs['stroke']).toBe('transparent');
    expect(Number(drag.attrs['stroke-width'])).toBeGreaterThanOrEqual(12);
    // Its own pointer-events overrides the group-level 'none' so the handle
    // stays draggable while the visible marks never block clicks.
    expect(drag.styles['pointer-events']).toBe('stroke');
    expect(drag.styles['cursor']).toBe('ew-resize');
  });

  it('writes the big ratio label in the accent color with a readability halo', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderSingle(group, geometry, undefined, { chartWidth: 800, chartHeight: 400 });

    const ruler = group.selectAll('.perf-ruler');
    const byClass = (cls: string) =>
      ruler.elements[0].children.find((c) => String(c.attrs['class']) === cls)!;
    const label = byClass('pr-text pr-text-ratio');
    expect(label.textContent).toBe('2.03x');
    expect(label.attrs['font-size']).toBe(`${DEFAULT_LABEL_FONT_SIZE}px`);
    expect(label.attrs['font-weight']).toBe('800');
    expect(label.attrs['fill']).toBe('var(--primary)');
    // Halo: background-colored stroke painted UNDER the glyph fill.
    expect(label.attrs['paint-order']).toBe('stroke');
    expect(label.attrs['stroke']).toBe('var(--background)');
    expect(Number(label.attrs['stroke-width'])).toBeGreaterThan(0);
  });

  it('honors a custom halo color and font size', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderSingle(group, geometry, { halo: 'white', labelFontSize: 40 });

    const ruler = group.selectAll('.perf-ruler');
    const label = ruler.elements[0].children.find(
      (c) => String(c.attrs['class']) === 'pr-text pr-text-ratio',
    )!;
    expect(label.attrs['stroke']).toBe('white');
    expect(label.attrs['font-size']).toBe('40px');
  });

  it('draws the arrow curve and filled head in the accent color', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderSingle(group, geometry, undefined, { chartWidth: 800, chartHeight: 400 });

    const ruler = group.selectAll('.perf-ruler');
    const byClass = (cls: string) =>
      ruler.elements[0].children.find((c) => String(c.attrs['class']) === cls)!;
    const layout = computePerfRulerLabelLayout(geometry, { chartWidth: 800, chartHeight: 400 });
    const arrow = byClass('pr-arrow');
    expect(arrow.attrs['d']).toBe(layout.arrowPath);
    expect(arrow.attrs['stroke']).toBe('var(--primary)');
    expect(arrow.attrs['fill']).toBe('none');
    const head = byClass('pr-arrow-head');
    expect(head.attrs['d']).toBe(layout.arrowHeadPath);
    expect(head.attrs['fill']).toBe('var(--primary)');
  });

  it('places the label right of the line by default', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderSingle(group, geometry, undefined, { chartWidth: 800 });

    const ruler = group.selectAll('.perf-ruler');
    const label = ruler.elements[0].children.find(
      (c) => String(c.attrs['class']) === 'pr-text pr-text-ratio',
    )!;
    expect(Number(label.attrs['x'])).toBeGreaterThan(geometry.x);
    expect(label.attrs['text-anchor']).toBe('start');
  });

  it('flips the label to the left near the right chart edge', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderSingle(group, geometry, undefined, { chartWidth: 125 });

    const ruler = group.selectAll('.perf-ruler');
    const label = ruler.elements[0].children.find(
      (c) => String(c.attrs['class']) === 'pr-text pr-text-ratio',
    )!;
    expect(Number(label.attrs['x'])).toBeLessThan(geometry.x);
    expect(label.attrs['text-anchor']).toBe('end');
  });

  it('is idempotent: re-rendering keeps a single ruler group', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderSingle(group, geometry);
    renderSingle(group, { ...geometry, x: 200 });

    const ruler = group.selectAll('.perf-ruler');
    expect(ruler.elements).toHaveLength(1);
    const line = ruler.elements[0].children.find((c) => String(c.attrs['class']) === 'pr-line')!;
    expect(line.attrs['x1']).toBe(200);
  });

  it('renders one group per ruler and removes exited rulers', () => {
    const group = createMockGroup();
    const geometryA = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    const geometryB = computeIsoXRulerGeometry(300, { py: 40, rawY: 900 }, { py: 90, rawY: 300 })!;
    const layouts = computePerfRulerLabelLayouts([geometryA, geometryB], { chartWidth: 800 });
    const entries = [
      { id: 1, geometry: geometryA, layout: layouts[0]! },
      { id: 2, geometry: geometryB, layout: layouts[1]! },
    ];
    renderPerfRulers(group as any, entries, makeOpts());
    expect(group.selectAll('.perf-ruler').elements).toHaveLength(2);

    renderPerfRulers(group as any, entries.slice(0, 1), makeOpts());
    expect(group.selectAll('.perf-ruler').elements).toHaveLength(1);
  });

  it('clears all rulers when the entry list is empty', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderSingle(group, geometry);
    renderSingle(group, null);

    const ruler = group.selectAll('.perf-ruler');
    expect(ruler.elements).toHaveLength(0);
  });

  it('renders nothing when called with no entries on an empty group', () => {
    const group = createMockGroup();
    renderSingle(group, null);
    expect(group.selectAll('.perf-ruler').elements).toHaveLength(0);
  });

  it('disables pointer events so the ruler never blocks point clicks', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderSingle(group, geometry);

    const ruler = group.selectAll('.perf-ruler');
    expect(ruler.elements[0].styles['pointer-events']).toBe('none');
    // …while the big label opts back in so it can reveal the × on hover.
    const label = ruler.elements[0].children.find(
      (c) => String(c.attrs['class']) === 'pr-text pr-text-ratio',
    )!;
    expect(label.styles['pointer-events']).toBe('auto');
  });

  it('hides the × delete button by default and marks it no-export', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderSingle(group, geometry);

    const ruler = group.selectAll('.perf-ruler');
    const del = ruler.elements[0].children.find(
      (c) => String(c.attrs['class']) === 'pr-delete no-export',
    )!;
    // Hidden until hover; excluded from PNG exports via `no-export`.
    expect(del.styles['display']).toBe('none');
    expect(del.styles['pointer-events']).toBe('all');
    expect(del.styles['cursor']).toBe('pointer');
    const classes = String(del.attrs['class']).split(/\s+/u);
    expect(classes).toContain('pr-delete');
    expect(classes).toContain('no-export');
    // Circular chip + × glyph in contrast colors.
    const bg = del.children.find((c) => String(c.attrs['class']) === 'pr-delete-bg')!;
    expect(bg.tag).toBe('circle');
    expect(Number(bg.attrs['r'])).toBeGreaterThanOrEqual(9);
    expect(bg.attrs['fill']).toBe('var(--primary)');
    const x = del.children.find((c) => String(c.attrs['class']) === 'pr-delete-x')!;
    expect(x.textContent).toBe('×');
    expect(x.attrs['fill']).toBe('var(--background)');
  });

  it('invokes onDelete with the ruler id when the × is clicked', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    const deleted: number[] = [];
    let stopped = 0;
    renderSingle(group, geometry, { onDelete: (id) => deleted.push(id) });

    const ruler = group.selectAll('.perf-ruler');
    const del = ruler.elements[0].children.find(
      (c) => String(c.attrs['class']) === 'pr-delete no-export',
    )!;
    const click = del.handlers?.['click'];
    expect(click).toBeTypeOf('function');
    click!({ stopPropagation: () => stopped++ }, del.datum);
    expect(deleted).toEqual([1]);
    // The click must not fall through to the chart underneath.
    expect(stopped).toBe(1);
  });

  it('registers hover handlers that reveal the × per ruler group', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderSingle(group, geometry);

    const ruler = group.selectAll('.perf-ruler');
    expect(ruler.elements[0].handlers?.['mouseenter']).toBeTypeOf('function');
    expect(ruler.elements[0].handlers?.['mouseleave']).toBeTypeOf('function');
  });
});

// ── nextPerfRulerState ───────────────────────────────────────

/** Complete one measurement (two clicks) on a state, for test setup. */
function complete(state: PerfRulerState, a: string, b: string, isoX: number): PerfRulerState {
  return nextPerfRulerState(nextPerfRulerState(state, { curve: a, isoX }), {
    curve: b,
    isoX: isoX + 1,
  });
}

describe('nextPerfRulerState', () => {
  const EMPTY = EMPTY_PERF_RULER_STATE;

  it('starts an in-progress draft on the first click', () => {
    const state = nextPerfRulerState(EMPTY, { curve: 'curve-a', isoX: 40 });
    expect(state.rulers).toEqual([]);
    expect(state.draft).toEqual({ curve: 'curve-a', isoX: 40 });
  });

  it('moves the draft iso-x when the draft curve is clicked again', () => {
    let state = nextPerfRulerState(EMPTY, { curve: 'curve-a', isoX: 40 });
    state = nextPerfRulerState(state, { curve: 'curve-a', isoX: 72 });
    expect(state.draft).toEqual({ curve: 'curve-a', isoX: 72 });
    expect(state.rulers).toEqual([]);
  });

  it('completes a measurement at the DRAFT iso-x when a second curve is clicked', () => {
    let state = nextPerfRulerState(EMPTY, { curve: 'curve-a', isoX: 40 });
    state = nextPerfRulerState(state, { curve: 'curve-b', isoX: 55 });
    expect(state.rulers).toEqual([{ id: 1, curveA: 'curve-a', curveB: 'curve-b', isoX: 40 }]);
    expect(state.draft).toBeNull();
    expect(state.nextId).toBe(2);
  });

  it('starts a NEW ruler on the next click after a completed measurement', () => {
    let state = complete(EMPTY, 'curve-a', 'curve-b', 40);
    // Clicking curve-a again does NOT retarget ruler 1 — it drafts ruler 2.
    state = nextPerfRulerState(state, { curve: 'curve-a', isoX: 90 });
    expect(state.rulers).toHaveLength(1);
    expect(state.rulers[0].isoX).toBe(40);
    expect(state.draft).toEqual({ curve: 'curve-a', isoX: 90 });
    // …and completing it appends a second measurement with a fresh id.
    state = nextPerfRulerState(state, { curve: 'curve-c', isoX: 95 });
    expect(state.rulers.map((r) => r.id)).toEqual([1, 2]);
    expect(state.rulers[1]).toEqual({ id: 2, curveA: 'curve-a', curveB: 'curve-c', isoX: 90 });
  });

  it('accumulates measurements up to the cap, then drops the OLDEST', () => {
    let state = EMPTY;
    for (let i = 0; i < MAX_PERF_RULERS + 2; i++) {
      state = complete(state, `a${i}`, `b${i}`, i * 10);
    }
    expect(state.rulers).toHaveLength(MAX_PERF_RULERS);
    // The two oldest (a0/b0, a1/b1) were dropped; ids keep counting up.
    expect(state.rulers[0].curveA).toBe('a2');
    expect(state.rulers.at(-1)!.curveA).toBe(`a${MAX_PERF_RULERS + 1}`);
    expect(state.nextId).toBe(MAX_PERF_RULERS + 3);
  });

  it('returns the same reference for no-op clicks', () => {
    expect(nextPerfRulerState(EMPTY, { curve: 'curve-a', isoX: Number.NaN })).toBe(EMPTY);
    const drafted = nextPerfRulerState(EMPTY, { curve: 'curve-a', isoX: 40 });
    expect(nextPerfRulerState(drafted, { curve: 'curve-a', isoX: 40 })).toBe(drafted);
    expect(nextPerfRulerState(drafted, { curve: 'curve-b', isoX: Number.NaN })).toBe(drafted);
  });
});

// ── movePerfRulerIsoX / deletePerfRuler / clearPerfRulers ───────────────

describe('movePerfRulerIsoX', () => {
  const state = complete(EMPTY_PERF_RULER_STATE, 'curve-a', 'curve-b', 40);

  it('moves only the targeted ruler', () => {
    const two = complete(state, 'curve-c', 'curve-d', 80);
    const moved = movePerfRulerIsoX(two, 1, 60);
    expect(moved.rulers[0].isoX).toBe(60);
    expect(moved.rulers[1].isoX).toBe(80);
  });

  it('returns the same reference for unknown ids, equal values, and non-finite x', () => {
    expect(movePerfRulerIsoX(state, 99, 60)).toBe(state);
    expect(movePerfRulerIsoX(state, 1, 40)).toBe(state);
    expect(movePerfRulerIsoX(state, 1, Number.NaN)).toBe(state);
  });
});

describe('deletePerfRuler', () => {
  it('deletes just the targeted ruler by id', () => {
    const two = complete(complete(EMPTY_PERF_RULER_STATE, 'a', 'b', 40), 'c', 'd', 80);
    const afterDelete = deletePerfRuler(two, 1);
    expect(afterDelete.rulers.map((r) => r.id)).toEqual([2]);
    // Ids are never reused after a delete.
    expect(afterDelete.nextId).toBe(3);
  });

  it('returns the same reference when the id is not found', () => {
    const one = complete(EMPTY_PERF_RULER_STATE, 'a', 'b', 40);
    expect(deletePerfRuler(one, 99)).toBe(one);
  });
});

describe('clearPerfRulers', () => {
  it('clears all rulers and the draft, preserving the id counter', () => {
    let state = complete(EMPTY_PERF_RULER_STATE, 'a', 'b', 40);
    state = nextPerfRulerState(state, { curve: 'c', isoX: 90 });
    const cleared = clearPerfRulers(state);
    expect(cleared.rulers).toEqual([]);
    expect(cleared.draft).toBeNull();
    expect(cleared.nextId).toBe(state.nextId);
  });

  it('returns the same reference when already empty', () => {
    expect(clearPerfRulers(EMPTY_PERF_RULER_STATE)).toBe(EMPTY_PERF_RULER_STATE);
  });
});

// ── prunePerfRulers / perfRulerCurveSet ─────────────────────────────

describe('prunePerfRulers', () => {
  it('removes only rulers whose curves left the data (per ruler)', () => {
    const two = complete(complete(EMPTY_PERF_RULER_STATE, 'a', 'gone', 40), 'c', 'd', 80);
    const pruned = prunePerfRulers(two, (curve) => curve !== 'gone');
    expect(pruned.rulers.map((r) => r.id)).toEqual([2]);
  });

  it('drops the draft when its curve is gone', () => {
    const drafted = nextPerfRulerState(EMPTY_PERF_RULER_STATE, { curve: 'gone', isoX: 40 });
    const pruned = prunePerfRulers(drafted, () => false);
    expect(pruned.draft).toBeNull();
  });

  it('returns the same reference when every curve still exists', () => {
    const one = complete(EMPTY_PERF_RULER_STATE, 'a', 'b', 40);
    expect(prunePerfRulers(one, () => true)).toBe(one);
  });
});

describe('perfRulerCurveSet', () => {
  it('collects every curve across rulers and the draft', () => {
    let state = complete(EMPTY_PERF_RULER_STATE, 'a', 'b', 40);
    state = nextPerfRulerState(state, { curve: 'c', isoX: 90 });
    expect([...perfRulerCurveSet(state)].sort()).toEqual(['a', 'b', 'c']);
  });

  it('is empty for the empty state', () => {
    expect(perfRulerCurveSet(EMPTY_PERF_RULER_STATE).size).toBe(0);
  });
});

// ── pathXExtent ─────────────────────────────────────────────

describe('pathXExtent', () => {
  it('returns the min/max x of the path endpoints', () => {
    const path = polylinePath([
      { x: 100, y: 100 },
      { x: 300, y: 50 },
    ]);
    expect(pathXExtent(path)).toEqual({ min: 100, max: 300 });
  });

  it('supports paths whose x decreases along their length', () => {
    const path = polylinePath([
      { x: 300, y: 10 },
      { x: 100, y: 110 },
    ]);
    expect(pathXExtent(path)).toEqual({ min: 100, max: 300 });
  });

  it('returns null for degenerate paths', () => {
    expect(pathXExtent(polylinePath([]))).toBeNull();
    expect(pathXExtent(polylinePath([{ x: 10, y: 10 }]))).toBeNull();
  });
});

// ── clampIsoX ───────────────────────────────────────────────

describe('clampIsoX', () => {
  const A = { min: 100, max: 300 };
  const B = { min: 200, max: 500 };

  it('clamps to the overlapping range of two curves', () => {
    expect(clampIsoX(150, A, B)).toBe(200);
    expect(clampIsoX(250, A, B)).toBe(250);
    expect(clampIsoX(450, A, B)).toBe(300);
  });

  it('clamps to a single curve when the second is absent', () => {
    expect(clampIsoX(50, A)).toBe(100);
    expect(clampIsoX(350, A, null)).toBe(300);
    expect(clampIsoX(200, A)).toBe(200);
  });

  it('returns null when the ranges do not overlap', () => {
    expect(clampIsoX(250, { min: 100, max: 150 }, { min: 200, max: 300 })).toBeNull();
  });

  it('returns null for a non-finite x', () => {
    expect(clampIsoX(Number.NaN, A, B)).toBeNull();
  });
});
