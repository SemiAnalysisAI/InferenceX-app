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

/**
 * Build a 1000x600 chart container with the given points and return them in
 * order. When `plot` is set, an inner `d3-chart-svg` with that box stands in
 * for the clipped plot area.
 */
function renderChart(
  points: PointSpec[],
  plot?: { left: number; top: number; width: number; height: number },
): Element[] {
  document.body.innerHTML = '<div data-testid="scatter-graph"></div>';
  const chart = document.querySelector('[data-testid="scatter-graph"]')!;
  stubBox(chart, 0, 0, 1000, 600);
  if (plot) {
    const svg = document.createElement('div');
    svg.dataset.testid = 'd3-chart-svg';
    chart.append(svg);
    stubBox(svg, plot.left, plot.top, plot.width, plot.height);
  }

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

  it('ignores points that zooming has pushed outside the clipped plot area', () => {
    // Outside the plot the chart's clip path hides a point, but its bounding
    // box stays perfectly ordinary — only the plot bounds rule it out.
    renderChart([{ left: 900, top: 60 }], { left: 100, top: 100, width: 600, height: 400 });
    expect(resolveAgenticPointAnchor()).toBeNull();
  });

  it('still anchors to points that remain inside the plot area', () => {
    const [inside] = renderChart(
      [
        { left: 380, top: 280 },
        { left: 950, top: 60 },
      ],
      {
        left: 100,
        top: 100,
        width: 600,
        height: 400,
      },
    );
    expect(resolveAgenticPointAnchor()).toBe(inside);
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
