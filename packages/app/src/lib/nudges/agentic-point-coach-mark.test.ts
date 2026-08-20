// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AGENTIC_POINT_ACTION_SELECTOR,
  AGENTIC_POINT_SELECTOR,
  resolveAgenticPointAnchor,
} from './agentic-point-coach-mark';

// jsdom gives every element a zero-size box, so the resolver's on-screen check
// would reject everything. Stub the geometry each test cares about instead.
function stubRect(element: Element, left: number, top: number, size = 12): void {
  element.getBoundingClientRect = () =>
    ({
      left,
      top,
      width: size,
      height: size,
      right: left + size,
      bottom: top + size,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

interface PointSpec {
  left: number;
  top: number;
  benchmarkType?: string;
  hasTrace?: boolean;
  hidden?: boolean;
  overlay?: boolean;
  /** Add the marker child the real chart renders inside every `.dot-group`. */
  withShape?: boolean;
}

function stubBox(element: Element, left: number, top: number, width: number, height: number) {
  element.getBoundingClientRect = () =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

interface ChartSvgSpec {
  /** The `<svg>` box — includes the axis gutters, so bigger than the plot. */
  box: { left: number; top: number; width: number; height: number };
  /** `.chart-root` translate, i.e. the left/top chart margins. */
  margin: { left: number; top: number };
  /** The clipPath rect `setupChart` sizes to the plot area. */
  clip: { width: number; height: number };
}

/**
 * The chart SVG skeleton `setupChart` builds: a root group translated by the
 * margins plus a clip rect covering the plot area only. Built for real (rather
 * than stubbing a single box) because the gap between the SVG box and the clip
 * region is exactly what the clipping tests are about.
 */
function appendChartSvg(chart: Element, spec: ChartSvgSpec): void {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.dataset.testid = 'd3-chart-svg';
  stubBox(svg, spec.box.left, spec.box.top, spec.box.width, spec.box.height);

  const defs = document.createElementNS(SVG_NS, 'defs');
  const clipPath = document.createElementNS(SVG_NS, 'clipPath');
  const clipRect = document.createElementNS(SVG_NS, 'rect');
  clipRect.setAttribute('width', String(spec.clip.width));
  clipRect.setAttribute('height', String(spec.clip.height));
  clipPath.append(clipRect);
  defs.append(clipPath);
  svg.append(defs);

  const root = document.createElementNS(SVG_NS, 'g');
  root.setAttribute('class', 'chart-root');
  root.setAttribute('transform', `translate(${spec.margin.left},${spec.margin.top})`);
  svg.append(root);

  chart.append(svg);
}

/**
 * Build a 1000x600 chart container with the given points and return them in
 * order. When `svgSpec` is set, a real chart SVG skeleton is added so the
 * resolver can work out the clip region.
 */
function renderChart(points: PointSpec[], svgSpec?: ChartSvgSpec): Element[] {
  document.body.innerHTML = '<div data-testid="scatter-graph"></div>';
  const chart = document.querySelector('[data-testid="scatter-graph"]')!;
  stubBox(chart, 0, 0, 1000, 600);
  if (svgSpec) appendChartSvg(chart, svgSpec);

  return points.map((spec) => {
    const element = document.createElement('div');
    element.className = spec.overlay ? 'unofficial-overlay-pt' : 'dot-group';
    if (!spec.overlay) {
      element.dataset.benchmarkType = spec.benchmarkType ?? 'agentic_traces';
    }
    if (spec.hasTrace) element.dataset.hasTrace = 'true';
    if (spec.hidden) element.style.opacity = '0';
    if (spec.withShape) {
      const shape = document.createElement('div');
      shape.className = 'visible-shape';
      element.append(shape);
      stubRect(shape, spec.left + 2, spec.top + 2, 8);
    }
    chart.append(element);
    stubRect(element, spec.left, spec.top);
    return element;
  });
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('AGENTIC_POINT_SELECTOR', () => {
  it('matches only official agentic points inside the scatter chart', () => {
    renderChart([
      { left: 100, top: 100 },
      { left: 200, top: 100, benchmarkType: 'single_turn' },
      { left: 300, top: 100, overlay: true },
    ]);
    const matched = [...document.querySelectorAll<HTMLElement>(AGENTIC_POINT_SELECTOR)];

    expect(matched).toHaveLength(1);
    expect(matched[0].dataset.benchmarkType).toBe('agentic_traces');
  });

  it('does not reach into the GPU comparison charts', () => {
    document.body.innerHTML =
      '<div data-testid="gpu-graph">' +
      '<div class="dot-group" data-benchmark-type="agentic_traces"></div>' +
      '</div>';
    expect(document.querySelectorAll(AGENTIC_POINT_SELECTOR)).toHaveLength(0);
  });
});

describe('AGENTIC_POINT_ACTION_SELECTOR', () => {
  it('treats a click on an official OR an overlay point as taking the action', () => {
    const [official, overlay] = renderChart([
      { left: 100, top: 100 },
      { left: 200, top: 100, overlay: true },
    ]);

    expect(official.closest(AGENTIC_POINT_ACTION_SELECTOR)).toBe(official);
    expect(overlay.closest(AGENTIC_POINT_ACTION_SELECTOR)).toBe(overlay);
  });
});

describe('resolveAgenticPointAnchor', () => {
  it('returns null when the chart has not rendered', () => {
    document.body.innerHTML = '';
    expect(resolveAgenticPointAnchor()).toBeNull();
  });

  it('returns null when the chart has rendered but has no agentic points', () => {
    renderChart([{ left: 100, top: 100, benchmarkType: 'single_turn' }]);
    expect(resolveAgenticPointAnchor()).toBeNull();
  });

  it('picks the agentic point nearest the chart centre', () => {
    // Chart centre is (500, 300) — the middle point is closest.
    const [, middle] = renderChart([
      { left: 60, top: 60 },
      { left: 480, top: 280 },
      { left: 900, top: 540 },
    ]);
    expect(resolveAgenticPointAnchor()).toBe(middle);
  });

  it('prefers a point with stored telemetry over a closer one without', () => {
    const [, withTrace] = renderChart([
      { left: 490, top: 290 },
      { left: 300, top: 200, hasTrace: true },
    ]);
    expect(resolveAgenticPointAnchor()).toBe(withTrace);
  });

  it('falls back to any agentic point while the trace lookup is still pending', () => {
    const [only] = renderChart([{ left: 480, top: 280 }]);
    expect(resolveAgenticPointAnchor()).toBe(only);
  });

  it('skips points hidden by a legend or precision filter', () => {
    const [, visible] = renderChart([
      { left: 500, top: 300, hidden: true },
      { left: 200, top: 150 },
    ]);
    expect(resolveAgenticPointAnchor()).toBe(visible);
  });

  it('never anchors to an unofficial-run overlay marker', () => {
    // Overlay runs have no stored trace, so their tooltip offers no
    // "View charts" link — pointing at one would teach a dead end.
    renderChart([{ left: 500, top: 300, overlay: true }]);
    expect(resolveAgenticPointAnchor()).toBeNull();
  });

  it('points at the marker inside the group, not the label-inflated group box', () => {
    // A `.dot-group` box also spans the hit area and the C=/DEP label above the
    // dot, so its centre can sit well off the dot itself.
    const [group] = renderChart([{ left: 480, top: 280, withShape: true }]);
    const shape = group.querySelector('.visible-shape');

    expect(shape).not.toBeNull();
    expect(resolveAgenticPointAnchor()).toBe(shape);
  });

  it('falls back to the group when it has no marker child yet', () => {
    const [group] = renderChart([{ left: 480, top: 280 }]);
    expect(resolveAgenticPointAnchor()).toBe(group);
  });

  // The scatter's real geometry: a 900x520 SVG with 60px left / 24px top
  // margins, clipped to the 830x436 plot inside them. The left 60px and the
  // bottom 60px of the SVG are axis gutters — inside the SVG box, outside the
  // clip.
  const CHART_SVG = {
    box: { left: 40, top: 40, width: 900, height: 520 },
    margin: { left: 60, top: 24 },
    clip: { width: 830, height: 436 },
  };

  it('ignores points that zooming has pushed outside the clipped plot area', () => {
    // Outside the plot the chart's clip path hides a point, but its bounding
    // box stays perfectly ordinary — only the clip region rules it out.
    renderChart([{ left: 960, top: 300 }], CHART_SVG);
    expect(resolveAgenticPointAnchor()).toBeNull();
  });

  it.each([
    ['left gutter, over the y-axis labels', { left: 70, top: 300 }],
    ['bottom gutter, under the x-axis labels', { left: 500, top: 505 }],
  ])('ignores a zoomed point parked in the %s', (_label, spec) => {
    // Regression: this used to be checked against the SVG's own box, which
    // includes the 60px axis margins — so a point sitting over the axis labels
    // was painted away by the clip path yet still accepted, aiming the pointer
    // at something invisible.
    renderChart([spec], CHART_SVG);
    const svgBox = document.querySelector('[data-testid="d3-chart-svg"]')!.getBoundingClientRect();
    // Guard the guard: the point really is inside the SVG, so this is not
    // vacuously passing because it fell off the element altogether.
    expect(spec.left).toBeGreaterThan(svgBox.left);
    expect(spec.left).toBeLessThan(svgBox.right);
    expect(spec.top).toBeGreaterThan(svgBox.top);
    expect(spec.top).toBeLessThan(svgBox.bottom);

    expect(resolveAgenticPointAnchor()).toBeNull();
  });

  it('still anchors to points that remain inside the plot area', () => {
    const [inside] = renderChart(
      [
        { left: 400, top: 300 },
        { left: 960, top: 300 },
      ],
      CHART_SVG,
    );
    expect(resolveAgenticPointAnchor()).toBe(inside);
  });

  it('falls back to the SVG box when the chart clips nothing', () => {
    // clipContent: false leaves no clipPath, so nothing is painted away and
    // the SVG box is the honest visibility test — not a reason to reject every
    // point.
    const [only] = renderChart([{ left: 70, top: 300 }]);
    expect(resolveAgenticPointAnchor()).toBe(only);
  });

  it('bails out cheaply while the whole chart is below the fold', () => {
    // The chart usually starts off-screen, and this runs on every scroll
    // event — so an off-screen chart must be rejected without measuring points.
    const [only] = renderChart([{ left: 480, top: 280 }]);
    const chart = document.querySelector('[data-testid="scatter-graph"]')!;
    stubBox(chart, 0, 5000, 1000, 600);
    const measure = vi.spyOn(only, 'getBoundingClientRect');

    expect(resolveAgenticPointAnchor()).toBeNull();
    expect(measure, 'no per-point layout reads').not.toHaveBeenCalled();
  });

  it('returns null when every point is scrolled out of the viewport', () => {
    renderChart([
      { left: 400, top: -900 },
      { left: 400, top: 4000 },
    ]);
    expect(resolveAgenticPointAnchor()).toBeNull();
  });
});
