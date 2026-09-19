// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { track } from '@/lib/analytics';
import { perfRulerAxisMetricKey } from '@/hooks/usePerfRulerAxisReset';
import {
  EMPTY_PERF_RULER_STATE,
  nextPerfRulerState,
  serializePerfRulers,
} from '@/lib/d3-chart/layers/perf-ruler';

import {
  type PerfRulerStore,
  PerfRulerStoreContext,
  persistedPerfRulerAxisKey,
  usePerfRulerStore,
  usePerfRulerStoreValue,
} from './perf-ruler-store';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

// `graphs` is always [interactivity, e2e]; ChartDisplay renders the e2e
// graph as chart-0 for every non-interactivity x mode.
const graphs = (e2eXField: string) => [
  { chartDefinition: { chartType: 'interactivity', x_scale_field: 'p90_intvty' } },
  { chartDefinition: { chartType: 'e2e', x_scale_field: e2eXField } },
];

describe('persisted perf-ruler store', () => {
  let container: HTMLDivElement;
  let root: Root;

  const CURVE_A = 'roofline-b200_trt_fp8';
  const CURVE_B = 'roofline-mi355x_sglang_fp4';
  const OVERLAY = 'overlay-roofline-h100_vllm_fp8_run1';
  const AXIS = perfRulerAxisMetricKey('p90_e2el', 'y_totalTokensPerDollarTco');

  interface Harness {
    store: () => PerfRulerStore;
    rerender: (axisMetricKey: string | null) => void;
  }

  /**
   * Hosts the store hook the way `InferenceProvider` does and reads it back
   * through `usePerfRulerStore`, so the test observes what a chart mounted
   * under the provider observes.
   */
  function mountStore(
    initialSerialized: string | undefined,
    axisMetricKey: string | null,
  ): Harness {
    let latest!: PerfRulerStore;
    let axisKey = axisMetricKey;
    const Consumer = () => {
      latest = usePerfRulerStore()!;
      return null;
    };
    function Host() {
      const store = usePerfRulerStoreValue('chart-0', initialSerialized, axisKey);
      return createElement(
        PerfRulerStoreContext.Provider,
        { value: store },
        createElement(Consumer),
      );
    }
    const render = () => act(() => root.render(createElement(Host)));
    render();
    return {
      store: () => latest,
      rerender: (next) => {
        axisKey = next;
        render();
      },
    };
  }

  beforeEach(() => {
    vi.mocked(track).mockClear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('is absent outside the provider so charts fall back to local state', () => {
    let seen: PerfRulerStore | undefined | null = null;
    const Consumer = () => {
      seen = usePerfRulerStore();
      return null;
    };
    act(() => root.render(createElement(Consumer)));
    expect(seen).toBeUndefined();
  });

  it('parses the share link into pending rulers and commits nothing until curves exist', () => {
    const h = mountStore(`41.5|${CURVE_A}|${CURVE_B};120|${CURVE_A}|${OVERLAY}`, null);
    expect(h.store().chartId).toBe('chart-0');
    expect(h.store().state).toBe(EMPTY_PERF_RULER_STATE);
    expect(h.store().pending).toEqual([
      { id: 1, curveA: CURVE_A, curveB: CURVE_B, isoX: 41.5 },
      { id: 2, curveA: CURVE_A, curveB: OVERLAY, isoX: 120 },
    ]);
    expect(serializePerfRulers(h.store().state)).toBe('');
    expect(track).not.toHaveBeenCalled();
  });

  it('starts with no pending rulers when the link carries none or only garbage', () => {
    expect(mountStore(undefined, null).store().pending).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    expect(mountStore('not-a-ruler', null).store().pending).toBeNull();
  });

  it('commits resolved rulers with fresh ids, keeps the rest pending, and reports the link once', () => {
    const h = mountStore(`41.5|${CURVE_A}|${CURVE_B};120|${CURVE_A}|${OVERLAY}`, AXIS);
    // A ruler placed by hand before the link's curves resolved keeps its id.
    act(() => {
      h.store().setState((prev) => nextPerfRulerState(prev, { curve: 'x', isoX: 5 }));
      h.store().setState((prev) => nextPerfRulerState(prev, { curve: 'y', isoX: 5 }));
    });
    expect(h.store().state.rulers.map((ruler) => ruler.id)).toEqual([1]);

    const [official, overlay] = h.store().pending!;
    act(() => h.store().commitPending([{ ...official, isoX: 42 }], [overlay]));
    expect(h.store().state.rulers).toEqual([
      { id: 1, curveA: 'x', curveB: 'y', isoX: 5 },
      { id: 2, curveA: CURVE_A, curveB: CURVE_B, isoX: 42 },
    ]);
    expect(h.store().state.nextId).toBe(3);
    expect(h.store().pending).toEqual([overlay]);
    // One opened link is one restore: the event carries the number of
    // rulers the link held, even though the curves resolve in two passes.
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('interactivity_perf_ruler_shared_load', { count: 2 });
    expect(serializePerfRulers(h.store().state)).toBe(`5|x|y;42|${CURVE_A}|${CURVE_B}`);

    act(() => h.store().commitPending([overlay], null));
    expect(h.store().pending).toBeNull();
    expect(h.store().state.rulers.map((ruler) => ruler.curveB)).toEqual(['y', CURVE_B, OVERLAY]);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('does not report a restore when only unmeasurable rulers were dropped', () => {
    const h = mountStore(`41.5|${CURVE_A}|${CURVE_B}`, AXIS);
    act(() => h.store().commitPending([], null));
    expect(h.store().pending).toBeNull();
    expect(h.store().state).toBe(EMPTY_PERF_RULER_STATE);
    expect(track).not.toHaveBeenCalled();
  });

  it('keeps share-link rulers through the first chart definition but resets on an axis change', () => {
    const h = mountStore(`41.5|${CURVE_A}|${CURVE_B}`, null);
    // The first data arriving (null → key) is not an axis change.
    h.rerender(AXIS);
    expect(h.store().pending).toHaveLength(1);
    // Loading a new data set (key → null → same key) is not one either.
    h.rerender(null);
    h.rerender(AXIS);
    expect(h.store().pending).toHaveLength(1);

    act(() => h.store().commitPending(h.store().pending!, null));
    act(() => h.store().setState((prev) => nextPerfRulerState(prev, { curve: 'x', isoX: 5 })));
    expect(h.store().state.rulers).toHaveLength(1);
    expect(h.store().state.draft).not.toBeNull();

    // Placed on the old axes: committed rulers, the draft, and anything still
    // pending are gone once the y metric changes.
    h.rerender(perfRulerAxisMetricKey('p90_e2el', 'y_tpPerGpu'));
    expect(h.store().state.rulers).toEqual([]);
    expect(h.store().state.draft).toBeNull();
    expect(h.store().state.nextId).toBe(2);
    expect(h.store().pending).toBeNull();
    expect(serializePerfRulers(h.store().state)).toBe('');
  });

  it('discards pending rulers on an axis change even before any commit', () => {
    const h = mountStore(`41.5|${CURVE_A}|${CURVE_B}`, AXIS);
    h.rerender(perfRulerAxisMetricKey('p90_ttft', 'y_totalTokensPerDollarTco'));
    expect(h.store().pending).toBeNull();
  });

  it('discardPending drops the link rulers without touching committed ones', () => {
    const h = mountStore(`41.5|${CURVE_A}|${CURVE_B};9|${CURVE_A}|${OVERLAY}`, AXIS);
    const [official, overlay] = h.store().pending!;
    act(() => h.store().commitPending([official], [overlay]));
    const committed = h.store().state;
    act(() => h.store().discardPending());
    expect(h.store().pending).toBeNull();
    expect(h.store().state).toBe(committed);
  });

  describe('persistedPerfRulerAxisKey (axis identity of the rendered chart)', () => {
    const Y = 'y_totalTokensPerDollarTco';

    it('is null until a graph exists', () => {
      expect(persistedPerfRulerAxisKey([], 'interactivity', Y)).toBeNull();
    });

    it('follows the graph the x mode renders, not graphs[0]', () => {
      const interactivity = persistedPerfRulerAxisKey(graphs('p90_e2el'), 'interactivity', Y);
      const e2e = persistedPerfRulerAxisKey(graphs('p90_e2el'), 'e2e', Y);
      const ttft = persistedPerfRulerAxisKey(graphs('p90_ttft'), 'ttft', Y);
      expect(new Set([interactivity, e2e, ttft]).size).toBe(3);
      // A stable mode and data set keep the identity, so rulers survive
      // reloads, legend toggles, and date changes.
      expect(persistedPerfRulerAxisKey(graphs('p90_e2el'), 'e2e', Y)).toBe(e2e);
    });

    it('changes with the percentile and the y metric', () => {
      const base = persistedPerfRulerAxisKey(graphs('p90_e2el'), 'e2e', Y);
      expect(persistedPerfRulerAxisKey(graphs('p99_e2el'), 'e2e', Y)).not.toBe(base);
      expect(persistedPerfRulerAxisKey(graphs('p90_e2el'), 'e2e', 'y_tpPerGpu')).not.toBe(base);
    });

    it('treats a derived agentic x mode as its own axis even when the e2e field is unchanged', () => {
      // ChartDisplay overrides the e2e graph's x field for derived modes
      // locally; the provider's definition still says p90_e2el.
      expect(
        persistedPerfRulerAxisKey(graphs('p90_e2el'), 'e2e-normalized-interactivity', Y),
      ).not.toBe(persistedPerfRulerAxisKey(graphs('p90_e2el'), 'e2e', Y));
    });

    it('falls back to the first graph when no graph matches the mode', () => {
      // Mirrors ChartDisplay's `visibleGraphs` fallback: with only an
      // interactivity graph, chart-0 renders it in every mode.
      const only = [graphs('p90_e2el')[0]];
      const key = persistedPerfRulerAxisKey(only, 'e2e', Y);
      expect(key).not.toBeNull();
      expect(persistedPerfRulerAxisKey(only, 'e2e', 'y_tpPerGpu')).not.toBe(key);
    });
  });

  it('keeps the store identity stable across unrelated rerenders', () => {
    const h = mountStore(`41.5|${CURVE_A}|${CURVE_B}`, AXIS);
    const before = h.store();
    h.rerender(AXIS);
    expect(h.store()).toBe(before);
    expect(h.store().setState).toBe(before.setState);
  });
});
