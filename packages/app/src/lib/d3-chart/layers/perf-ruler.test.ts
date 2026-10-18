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
  parsePerfRulers,
  pathXExtent,
  perfRulerCurveSet,
  prunePerfRulers,
  renderPerfRulers,
  serializePerfRulers,
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
});

// ── computePerfRulerLabelLayouts ──────────────────────────────────

describe('computePerfRulerLabelLayouts', () => {
  const GEOMETRY = { x: 100, y1: 50, y2: 150, ratioLabel: '2.03x' };
  const OPTS = { chartWidth: 800, chartHeight: 400 };

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

  it('keeps the below-midpoint collision fallback inside a short chart', () => {
    // midY = 60 in a 100px chart: the above placement clips the top, and the
    // naive below-midpoint fallback (midY + 46 = 106) would leave the plot.
    const geometry = { x: 100, y1: 40, y2: 80, ratioLabel: '2.03x' };
    const fontSize = DEFAULT_LABEL_FONT_SIZE;
    const layouts = computePerfRulerLabelLayouts([geometry, { ...geometry }], {
      chartWidth: 800,
      chartHeight: 100,
    });
    for (const layout of layouts) {
      expect(layout!.labelY + fontSize / 2).toBeLessThanOrEqual(100 - 4);
      expect(layout!.labelY - fontSize / 2).toBeGreaterThanOrEqual(4);
      expect(layout!.deleteY).toBe(layout!.labelY);
    }
  });

  it('clamps downward nudges at the chart bottom, accepting residual overlap', () => {
    // Three identical rulers near the top of a short chart: labels stack
    // DOWNWARD, and the third label's second nudge (118 + 42 = 160) would
    // escape a 140px chart without the clamp.
    const geometry = { x: 100, y1: 10, y2: 50, ratioLabel: '2.03x' };
    const fontSize = DEFAULT_LABEL_FONT_SIZE;
    const chartHeight = 140;
    const layouts = computePerfRulerLabelLayouts([geometry, { ...geometry }, { ...geometry }], {
      chartWidth: 800,
      chartHeight,
    });
    for (const layout of layouts) {
      expect(layout!.labelY + fontSize / 2).toBeLessThanOrEqual(chartHeight - 4);
      expect(layout!.labelY - fontSize / 2).toBeGreaterThanOrEqual(4);
      expect(layout!.deleteY).toBe(layout!.labelY);
    }
    // The first two still resolve their collision; the third accepts overlap
    // at the clamped bottom rather than leaving the plot.
    expect(layouts[1]!.labelY).toBeGreaterThan(layouts[0]!.labelY);
    expect(layouts[2]!.labelY).toBe(chartHeight - 4 - fontSize / 2);
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

  it('stores the CLAMPED iso-x when completion lands outside the pair overlap', () => {
    const calls: [string, string, number][] = [];
    const drafted = nextPerfRulerState(EMPTY, { curve: 'curve-a', isoX: 500 });
    const state = nextPerfRulerState(drafted, { curve: 'curve-b', isoX: 510 }, (a, b, isoX) => {
      calls.push([a, b, isoX]);
      return 120; // curve B's span ends at 120 — clamp pulls the ruler back in.
    });
    // The clamp sees the DRAFT's iso-x (measurements complete at the draft).
    expect(calls).toEqual([['curve-a', 'curve-b', 500]]);
    expect(state.rulers).toEqual([{ id: 1, curveA: 'curve-a', curveB: 'curve-b', isoX: 120 }]);
    expect(state.draft).toBeNull();
  });

  it('rejects completion and keeps the draft anchored when the pair has NO overlap', () => {
    const drafted = nextPerfRulerState(EMPTY, { curve: 'curve-a', isoX: 40 });
    const state = nextPerfRulerState(drafted, { curve: 'curve-b', isoX: 55 }, () => null);
    // No measurement was appended, no id burned, the draft survives — the
    // user can pick a different second curve. Same reference: React bails.
    expect(state).toBe(drafted);
    expect(state.rulers).toEqual([]);
    expect(state.draft).toEqual({ curve: 'curve-a', isoX: 40 });
  });

  it('does not consult the clamp for draft-start or draft-move clicks', () => {
    let calls = 0;
    const clamp = () => {
      calls++;
      return null;
    };
    const drafted = nextPerfRulerState(EMPTY, { curve: 'curve-a', isoX: 40 }, clamp);
    expect(drafted.draft).toEqual({ curve: 'curve-a', isoX: 40 });
    const moved = nextPerfRulerState(drafted, { curve: 'curve-a', isoX: 60 }, clamp);
    expect(moved.draft).toEqual({ curve: 'curve-a', isoX: 60 });
    expect(calls).toBe(0);
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
});

describe('perfRulerCurveSet', () => {
  it('collects every curve across rulers and the draft', () => {
    let state = complete(EMPTY_PERF_RULER_STATE, 'a', 'b', 40);
    state = nextPerfRulerState(state, { curve: 'c', isoX: 90 });
    expect([...perfRulerCurveSet(state)].sort()).toEqual(['a', 'b', 'c']);
  });
});

// ── serializePerfRulers / parsePerfRulers (share links) ─────────────

describe('serializePerfRulers / parsePerfRulers', () => {
  const OFFICIAL_A = 'roofline-b200_trt_fp8';
  const OFFICIAL_B = 'roofline-mi355x_sglang_fp4';
  // Overlay curves carry the unofficial run index; power-envelope curves are
  // split per date with the encoded date appended (`%2F` from a slash).
  const OVERLAY = 'overlay-roofline-h100_vllm_fp8_run1__2026-09%2F11';

  it('round-trips completed rulers, including overlay and date-scoped curve ids', () => {
    const state = complete(
      complete(EMPTY_PERF_RULER_STATE, OFFICIAL_A, OFFICIAL_B, 41.5),
      OFFICIAL_A,
      OVERLAY,
      120,
    );
    const encoded = serializePerfRulers(state);
    expect(encoded).toBe(`41.5|${OFFICIAL_A}|${OFFICIAL_B};120|${OFFICIAL_A}|${OVERLAY}`);
    const parsed = parsePerfRulers(encoded);
    expect(parsed.rulers).toEqual([
      { id: 1, curveA: OFFICIAL_A, curveB: OFFICIAL_B, isoX: 41.5 },
      { id: 2, curveA: OFFICIAL_A, curveB: OVERLAY, isoX: 120 },
    ]);
    expect(parsed.draft).toBeNull();
    expect(parsed.nextId).toBe(3);
  });

  it('round-trips run-specific date-comparison curve ids that contain ~', () => {
    // GPUGraph series ids stamp the comparison entry onto point.date, so a
    // run-qualified selection yields `roofline-<date>~r<runId>_<hw>_<prec>`.
    const RUN_A = 'roofline-2026-09-09~r27489075807_b200_fp8';
    const RUN_B = 'roofline-2026-09-09~r27489075808_b200_fp8';
    const state = complete(EMPTY_PERF_RULER_STATE, RUN_A, RUN_B, 55.25);
    const encoded = serializePerfRulers(state);
    expect(encoded).toBe(`55.25|${RUN_A}|${RUN_B}`);
    expect(parsePerfRulers(encoded).rulers).toEqual([
      { id: 1, curveA: RUN_A, curveB: RUN_B, isoX: 55.25 },
    ]);
  });
});

// ── pathXExtent ─────────────────────────────────────────────

describe('pathXExtent', () => {
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
