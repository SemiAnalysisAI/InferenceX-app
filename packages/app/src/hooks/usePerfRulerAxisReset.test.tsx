// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import { EMPTY_PERF_RULER_STATE, type PerfRulerState } from '@/lib/d3-chart/layers/perf-ruler';

import { perfRulerAxisMetricKey, usePerfRulerAxisReset } from './usePerfRulerAxisReset';

const PLACED: PerfRulerState = {
  rulers: [{ id: 1, curveA: 'roofline-a', curveB: 'roofline-b', isoX: 42 }],
  draft: { curve: 'roofline-c', isoX: 7 },
  nextId: 2,
};

interface Snapshot {
  state: PerfRulerState;
  renders: number;
}

interface Harness {
  snapshot: Snapshot;
  rerender: (axisMetricKey: string) => void;
  place: () => void;
  unmount: () => void;
}

/**
 * Mounts a component that owns real perf-ruler state and runs the hook, so
 * the test observes exactly what a chart component would: the state the
 * draw pass reads after the axis key changes.
 */
function mountHarness(initialKey: string): Harness {
  const snapshot: Snapshot = { state: EMPTY_PERF_RULER_STATE, renders: 0 };
  let axisMetricKey = initialKey;
  let setState: ((next: PerfRulerState) => void) | null = null;

  function TestComponent() {
    const [perfRulerState, setPerfRulerState] = useState<PerfRulerState>(EMPTY_PERF_RULER_STATE);
    setState = setPerfRulerState;
    usePerfRulerAxisReset(axisMetricKey, setPerfRulerState);
    snapshot.state = perfRulerState;
    snapshot.renders += 1;
    return null;
  }

  const container = document.createElement('div');
  document.body.append(container);
  const root: Root = createRoot(container);
  const render = () => {
    act(() => {
      root.render(<TestComponent />);
    });
  };
  render();

  return {
    snapshot,
    rerender: (next) => {
      axisMetricKey = next;
      render();
    },
    place: () => {
      act(() => {
        setState?.(PLACED);
      });
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('usePerfRulerAxisReset', () => {
  it('leaves rulers alone while the axis metrics are unchanged', () => {
    const key = perfRulerAxisMetricKey('p90_e2el', 'y_totalTokensPerDollarTco');
    const h = mountHarness(key);
    h.place();
    expect(h.snapshot.state).toBe(PLACED);

    // Unrelated re-renders (legend toggles, zoom, date changes) pass the
    // same key and must not disturb placed rulers or the draft.
    h.rerender(key);
    h.rerender(key);
    expect(h.snapshot.state).toBe(PLACED);
    h.unmount();
  });

  it('clears rulers and the draft when the y-axis metric changes', () => {
    const h = mountHarness(perfRulerAxisMetricKey('p90_e2el', 'y_totalTokensPerDollarTco'));
    h.place();
    h.rerender(perfRulerAxisMetricKey('p90_e2el', 'y_tpPerGpu'));
    expect(h.snapshot.state.rulers).toEqual([]);
    expect(h.snapshot.state.draft).toBeNull();
    // Ids keep counting so a ruler placed after the switch never reuses a
    // key the D3 join may still hold.
    expect(h.snapshot.state.nextId).toBe(PLACED.nextId);
    h.unmount();
  });

  it('clears rulers when the x-axis metric or percentile changes', () => {
    const h = mountHarness(perfRulerAxisMetricKey('p90_e2el', 'y_totalTokensPerDollarTco'));
    h.place();
    h.rerender(perfRulerAxisMetricKey('p90_ttft', 'y_totalTokensPerDollarTco'));
    expect(h.snapshot.state.rulers).toEqual([]);
    expect(h.snapshot.state.draft).toBeNull();

    h.place();
    h.rerender(perfRulerAxisMetricKey('median_ttft', 'y_totalTokensPerDollarTco'));
    expect(h.snapshot.state.rulers).toEqual([]);
    expect(h.snapshot.state.draft).toBeNull();
    h.unmount();
  });

  it('keeps the empty state referentially stable across an axis change', () => {
    const h = mountHarness(perfRulerAxisMetricKey('p90_e2el', 'y_totalTokensPerDollarTco'));
    const before = h.snapshot.state;
    h.rerender(perfRulerAxisMetricKey('p90_e2el', 'y_tpPerGpu'));
    expect(h.snapshot.state).toBe(before);
    h.unmount();
  });

  it('distinguishes axis pairs that would collide under naive concatenation', () => {
    expect(perfRulerAxisMetricKey('ab', 'c')).not.toBe(perfRulerAxisMetricKey('a', 'bc'));
  });
});
