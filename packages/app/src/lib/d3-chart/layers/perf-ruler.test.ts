import { describe, expect, it } from 'vitest';

import { createMockGroup } from './test-helpers';
import {
  DEFAULT_MIN_SPAN_FOR_PERCENT,
  EMPTY_PERF_RULER_SELECTION,
  clampIsoX,
  computeIsoXRulerGeometry,
  formatPerfPercent,
  formatPerfRatio,
  intersectPathAtX,
  nextPerfRulerSelection,
  pathXExtent,
  renderPerfRuler,
  type PerfRulerCurveSelection,
  type PerfRulerEndInput,
  type PerfRulerPathLike,
  type PerfRulerRenderOptions,
} from './perf-ruler';

// ── Fixtures ─────────────────────────────────────────

const ISO_X = 100;
const END_A: PerfRulerEndInput = { py: 50, rawY: 400 };
const END_B: PerfRulerEndInput = { py: 150, rawY: 197 };

function makeOpts(overrides?: Partial<PerfRulerRenderOptions>): PerfRulerRenderOptions {
  return {
    color: 'var(--primary)',
    labelBg: 'var(--primary)',
    labelText: 'var(--primary-foreground)',
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

// ── formatPerfPercent ────────────────────────────────────────────────

describe('formatPerfPercent', () => {
  it('formats the relative gain rounded to whole percent', () => {
    expect(formatPerfPercent(2.0304)).toBe('+103%');
    expect(formatPerfPercent(1.5)).toBe('+50%');
  });

  it('formats an equal pair as +0%', () => {
    expect(formatPerfPercent(1)).toBe('+0%');
  });

  it('returns empty string for invalid ratios', () => {
    expect(formatPerfPercent(Number.NaN)).toBe('');
    expect(formatPerfPercent(0)).toBe('');
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
    expect(geometry!.percentLabel).toBe('+103%');
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
    expect(geometry!.percentLabel).toBe('+0%');
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

// ── renderPerfRuler ──────────────────────────────────────────────────

describe('renderPerfRuler', () => {
  it('draws the ruler line, two end caps, chip, label texts, and drag handle', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderPerfRuler(group as any, geometry, makeOpts());

    const ruler = group.selectAll('.perf-ruler');
    expect(ruler.elements).toHaveLength(1);
    const children = ruler.elements[0].children.map((c) => String(c.attrs['class']));
    expect(children).toContain('pr-line');
    expect(children).toContain('pr-cap pr-cap-top');
    expect(children).toContain('pr-cap pr-cap-bottom');
    expect(children).toContain('pr-bg');
    expect(children).toContain('pr-text pr-text-ratio');
    expect(children).toContain('pr-text pr-text-percent');
    expect(children).toContain('pr-drag');
  });

  it('positions the vertical line and caps at the iso-x', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderPerfRuler(group as any, geometry, makeOpts({ capHalfWidth: 6 }));

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
    renderPerfRuler(group as any, geometry, makeOpts());

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

  it('writes the ratio label and shows the percent line for a tall span', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    expect(Math.abs(geometry.y2 - geometry.y1)).toBeGreaterThanOrEqual(
      DEFAULT_MIN_SPAN_FOR_PERCENT,
    );
    renderPerfRuler(group as any, geometry, makeOpts());

    const ruler = group.selectAll('.perf-ruler');
    const byClass = (cls: string) =>
      ruler.elements[0].children.find((c) => String(c.attrs['class']) === cls)!;
    expect(byClass('pr-text pr-text-ratio').textContent).toBe('2.03x');
    const percent = byClass('pr-text pr-text-percent');
    expect(percent.textContent).toBe('+103%');
    expect(percent.styles['display']).toBe('');
  });

  it('hides the percent line when the span is too short to fit it cleanly', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, { ...END_B, py: END_A.py + 10 })!;
    renderPerfRuler(group as any, geometry, makeOpts());

    const ruler = group.selectAll('.perf-ruler');
    const percent = ruler.elements[0].children.find(
      (c) => String(c.attrs['class']) === 'pr-text pr-text-percent',
    )!;
    expect(percent.styles['display']).toBe('none');
    expect(percent.textContent).toBe('');
  });

  it('places the chip to the right of the line by default', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderPerfRuler(group as any, geometry, makeOpts({ chartWidth: 800 }));

    const ruler = group.selectAll('.perf-ruler');
    const bg = ruler.elements[0].children.find((c) => String(c.attrs['class']) === 'pr-bg')!;
    expect(Number(bg.attrs['x'])).toBeGreaterThan(geometry.x);
    expect(bg.attrs['fill']).toBe('var(--primary)');
  });

  it('flips the chip to the left near the right chart edge', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderPerfRuler(group as any, geometry, makeOpts({ chartWidth: 125 }));

    const ruler = group.selectAll('.perf-ruler');
    const bg = ruler.elements[0].children.find((c) => String(c.attrs['class']) === 'pr-bg')!;
    const bgX = Number(bg.attrs['x']);
    expect(bgX + Number(bg.attrs['width'])).toBeLessThan(geometry.x);
  });

  it('is idempotent: re-rendering keeps a single ruler group', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderPerfRuler(group as any, geometry, makeOpts());
    renderPerfRuler(group as any, { ...geometry, x: 200 }, makeOpts());

    const ruler = group.selectAll('.perf-ruler');
    expect(ruler.elements).toHaveLength(1);
    const line = ruler.elements[0].children.find((c) => String(c.attrs['class']) === 'pr-line')!;
    expect(line.attrs['x1']).toBe(200);
  });

  it('clears the ruler when geometry is null', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderPerfRuler(group as any, geometry, makeOpts());
    renderPerfRuler(group as any, null, makeOpts());

    const ruler = group.selectAll('.perf-ruler');
    expect(ruler.elements).toHaveLength(0);
  });

  it('renders nothing when called with null on an empty group', () => {
    const group = createMockGroup();
    renderPerfRuler(group as any, null, makeOpts());
    expect(group.selectAll('.perf-ruler').elements).toHaveLength(0);
  });

  it('disables pointer events so the ruler never blocks point clicks', () => {
    const group = createMockGroup();
    const geometry = computeIsoXRulerGeometry(ISO_X, END_A, END_B)!;
    renderPerfRuler(group as any, geometry, makeOpts());

    const ruler = group.selectAll('.perf-ruler');
    expect(ruler.elements[0].styles['pointer-events']).toBe('none');
  });
});

// ── nextPerfRulerSelection ───────────────────────────────────

describe('nextPerfRulerSelection', () => {
  const EMPTY = EMPTY_PERF_RULER_SELECTION;

  it('selects curve A and sets the iso-x on the first click', () => {
    expect(nextPerfRulerSelection(EMPTY, { curve: 'curve-a', isoX: 40 })).toEqual({
      curves: ['curve-a'],
      isoX: 40,
    });
  });

  it('selects curve B on a different curve, keeping the existing iso-x', () => {
    const prev: PerfRulerCurveSelection = { curves: ['curve-a'], isoX: 40 };
    expect(nextPerfRulerSelection(prev, { curve: 'curve-b', isoX: 55 })).toEqual({
      curves: ['curve-a', 'curve-b'],
      isoX: 40,
    });
  });

  it('moves the iso-x when the only selected curve is clicked again', () => {
    const prev: PerfRulerCurveSelection = { curves: ['curve-a'], isoX: 40 };
    expect(nextPerfRulerSelection(prev, { curve: 'curve-a', isoX: 72 })).toEqual({
      curves: ['curve-a'],
      isoX: 72,
    });
  });

  it('moves the iso-x when either curve of a complete measurement is clicked', () => {
    const prev: PerfRulerCurveSelection = { curves: ['curve-a', 'curve-b'], isoX: 40 };
    expect(nextPerfRulerSelection(prev, { curve: 'curve-a', isoX: 72 })).toEqual({
      curves: ['curve-a', 'curve-b'],
      isoX: 72,
    });
    expect(nextPerfRulerSelection(prev, { curve: 'curve-b', isoX: 13 })).toEqual({
      curves: ['curve-a', 'curve-b'],
      isoX: 13,
    });
  });

  it('starts a new measurement when a third curve is clicked', () => {
    const prev: PerfRulerCurveSelection = { curves: ['curve-a', 'curve-b'], isoX: 40 };
    expect(nextPerfRulerSelection(prev, { curve: 'curve-c', isoX: 90 })).toEqual({
      curves: ['curve-c'],
      isoX: 90,
    });
  });

  it('returns the same reference when a selected-curve click does not move the iso-x', () => {
    const prev: PerfRulerCurveSelection = { curves: ['curve-a', 'curve-b'], isoX: 40 };
    expect(nextPerfRulerSelection(prev, { curve: 'curve-a', isoX: 40 })).toBe(prev);
  });

  it('ignores clicks with a non-finite iso-x (same reference back)', () => {
    const prev: PerfRulerCurveSelection = { curves: ['curve-a'], isoX: 40 };
    expect(nextPerfRulerSelection(prev, { curve: 'curve-b', isoX: Number.NaN })).toBe(prev);
    expect(nextPerfRulerSelection(EMPTY, { curve: 'curve-a', isoX: Number.NaN })).toBe(EMPTY);
  });

  it('falls back to the click x for curve B when the previous iso-x is missing', () => {
    const prev: PerfRulerCurveSelection = { curves: ['curve-a'], isoX: null };
    expect(nextPerfRulerSelection(prev, { curve: 'curve-b', isoX: 55 })).toEqual({
      curves: ['curve-a', 'curve-b'],
      isoX: 55,
    });
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
