// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as d3 from 'd3';

import { useChartZoom, type UseChartZoomResult } from './useChartZoom';

// Lightweight renderHook — TLR isn't installed, so we mount a 1-component root
// and capture the latest hook return value in a ref-style object.
function renderHook<T>(hook: () => T): { result: { current: T }; unmount: () => void; root: Root } {
  const result = { current: undefined as unknown as T };
  function TestComponent() {
    result.current = hook();
    return null;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(TestComponent));
  });
  return {
    result,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
    root,
  };
}

function setup(defaultZoomK?: number) {
  const svgEl = d3.create('svg:svg').node()! as SVGSVGElement;
  document.body.append(svgEl);
  const svgRef = { current: svgEl };
  const rendered = renderHook<UseChartZoomResult>(() =>
    useChartZoom({
      resetEventName: 'test_zoom_reset',
      scaleExtent: [0.5, 20],
      svgRef,
      defaultZoomK,
    }),
  );
  return {
    svgEl,
    svgSelection: d3.select(svgEl) as d3.Selection<SVGSVGElement, unknown, null, undefined>,
    hook: rendered.result,
    cleanup: () => {
      rendered.unmount();
      svgEl.remove();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('setupZoom input handling', () => {
  it('requires Shift for wheel zoom and leaves browser zoom and context menus alone', () => {
    const { svgSelection, hook, cleanup } = setup();
    try {
      const zoom = hook.current.setupZoom(svgSelection, 800, 600);
      const filter = zoom.filter();
      for (const [type, shiftKey, ctrlKey, button, expected] of [
        ['wheel', false, false, 0, false],
        ['wheel', true, false, 0, true],
        ['wheel', false, true, 0, false],
        ['wheel', true, true, 0, false],
        ['mousedown', false, false, 0, true],
        ['mousedown', false, false, 2, false],
        ['mousedown', false, true, 0, false],
      ] as const) {
        expect(
          filter.call(svgSelection.node()!, { type, shiftKey, ctrlKey, button }, undefined),
          JSON.stringify({ type, shiftKey, ctrlKey, button }),
        ).toBe(expected);
      }
    } finally {
      cleanup();
    }
  });

  it('uses the installed wheel delta callback for direction, macOS axis swaps and scroll units', () => {
    const { svgSelection, hook, cleanup } = setup();
    try {
      const zoom = hook.current.setupZoom(svgSelection, 800, 600);
      // D3 passes a WheelEvent; @types/d3-zoom types the getter as a generic ValueFn.
      const wheelDelta = zoom.wheelDelta() as (event: WheelEvent) => number;
      for (const [deltaY, deltaX, deltaMode, expected] of [
        [100, 0, 0, -0.2],
        [-100, 0, 0, 0.2],
        [0, -120, 0, 0.24],
        [50, 120, 0, -0.1],
        [3, 0, 1, -0.15],
        [1, 0, 2, -1],
      ]) {
        expect(
          wheelDelta(new WheelEvent('wheel', { deltaY, deltaX, deltaMode })),
          JSON.stringify({ deltaY, deltaX, deltaMode }),
        ).toBeCloseTo(expected);
      }
    } finally {
      cleanup();
    }
  });
});

describe('setupZoom transform replay', () => {
  it('does not emit a zoom event when the stored transform is identity', () => {
    const { svgSelection, hook, cleanup } = setup();
    const onZoom = vi.fn();

    hook.current.setupZoom(svgSelection, 800, 600, { onZoom });

    // Drawing just happened at base scales; replaying identity would force the
    // chart's zoom handler through a full axes + grid + layers pass for
    // pixel-identical output.
    expect(onZoom).not.toHaveBeenCalled();
    cleanup();
  });

  it('replays a non-identity stored transform on re-setup (zoom preservation)', () => {
    const { svgSelection, hook, cleanup } = setup();
    const firstOnZoom = vi.fn();
    const zoom = hook.current.setupZoom(svgSelection, 800, 600, { onZoom: firstOnZoom });

    // User zooms in: 2x around an offset.
    const userTransform = d3.zoomIdentity.translate(-100, -50).scale(2);
    svgSelection.call(zoom.transform as any, userTransform);
    expect(firstOnZoom).toHaveBeenCalledTimes(1);
    expect(hook.current.zoomTransformRef.current.k).toBe(2);

    // Chart rebuilds (data change) and re-runs setupZoom: the stored zoom must
    // be replayed exactly once so the freshly drawn DOM matches the zoom state.
    const secondOnZoom = vi.fn();
    hook.current.setupZoom(svgSelection, 800, 600, { onZoom: secondOnZoom });

    expect(secondOnZoom).toHaveBeenCalledTimes(1);
    const replayed = secondOnZoom.mock.calls[0][0].transform;
    expect(replayed.k).toBe(2);
    expect(replayed.x).toBe(-100);
    expect(replayed.y).toBe(-50);
    cleanup();
  });

  it('keeps zoomTransformRef in sync after the replay', () => {
    const { svgSelection, hook, cleanup } = setup();
    const zoom = hook.current.setupZoom(svgSelection, 800, 600, {});
    svgSelection.call(zoom.transform as any, d3.zoomIdentity.scale(4));

    hook.current.setupZoom(svgSelection, 800, 600, {});

    expect(hook.current.zoomTransformRef.current.k).toBe(4);
    cleanup();
  });

  it('replays when the node state disagrees with the stored ref (defensive sync)', () => {
    const { svgEl, svgSelection, hook, cleanup } = setup();
    const onZoom = vi.fn();

    // Stored ref says identity but someone left a stale transform on the node.
    (svgEl as unknown as { __zoom: d3.ZoomTransform }).__zoom = d3.zoomIdentity.scale(3);
    hook.current.setupZoom(svgSelection, 800, 600, { onZoom });

    // The replay normalizes the node back to the stored (identity) transform.
    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(d3.zoomTransform(svgEl).k).toBe(1);
    cleanup();
  });

  it('replays a non-identity defaultZoomK on first setup', () => {
    const { svgSelection, hook, cleanup } = setup(1.5);
    const onZoom = vi.fn();

    hook.current.setupZoom(svgSelection, 800, 600, { onZoom });

    // Charts that declare a default zoom level still get their initial
    // transform applied — only the no-op identity replay is skipped.
    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom.mock.calls[0][0].transform.k).toBe(1.5);
    cleanup();
  });
});
