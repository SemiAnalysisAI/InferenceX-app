// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import type { HardwareConfig, InferenceData } from '@/components/inference/types';
import type { Model, Sequence } from '@/lib/data-mappings';

import { useTrackedConfigsState } from './useTrackedConfigsState';

// Minimal renderHook with re-renderable props (TLR isn't installed).
function renderHook<P, T>(
  hook: (props: P) => T,
  initial: P,
): { result: { current: T }; rerender: (props: P) => void; unmount: () => void } {
  const result = { current: undefined as unknown as T };
  let props = initial;
  function TestComponent() {
    result.current = hook(props);
    return null;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root: Root = createRoot(container);
  const render = () =>
    act(() => {
      root.render(createElement(TestComponent));
    });
  render();
  return {
    result,
    rerender: (next: P) => {
      props = next;
      render();
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const point = (overrides: Partial<InferenceData> = {}): InferenceData =>
  ({
    hwKey: 'h100',
    precision: 'fp8',
    tp: 8,
    conc: 16,
    ...overrides,
  }) as InferenceData;

interface Args {
  hardwareConfig: HardwareConfig;
  selectedModel: Model;
  effectiveSequence: Sequence;
  effectivePrecisions: string[];
  selectedYAxisMetric: string;
}

const baseArgs: Args = {
  hardwareConfig: {} as HardwareConfig,
  selectedModel: 'DeepSeek-V4-Pro' as Model,
  effectiveSequence: '8k/1k' as Sequence,
  effectivePrecisions: ['fp8'],
  selectedYAxisMetric: 'y_tpPerGpu',
};

describe('useTrackedConfigsState', () => {
  it('adds a config with a computed id, label, and color', () => {
    const { result, unmount } = renderHook((a: Args) => useTrackedConfigsState(a), baseArgs);
    act(() => result.current.addTrackedConfig(point(), 'interactivity'));
    expect(result.current.trackedConfigs).toHaveLength(1);
    const c = result.current.trackedConfigs[0];
    expect(c.id).toBe('h100|fp8|8|16');
    // No hwConfig entry → falls back to hwKey-based label with upper-cased precision.
    expect(c.label).toBe('h100 — TP8 conc=16 FP8');
    expect(c.color).toBe('#4e79a7'); // TABLEAU_10[0]
    expect(c.chartType).toBe('interactivity');
    unmount();
  });

  it('builds a disaggregated id incorporating prefill/decode GPU counts', () => {
    const { result, unmount } = renderHook((a: Args) => useTrackedConfigsState(a), baseArgs);
    act(() =>
      result.current.addTrackedConfig(
        point({ disagg: true, num_prefill_gpu: 2, num_decode_gpu: 4 }),
        'e2e',
      ),
    );
    expect(result.current.trackedConfigs[0].id).toBe('h100|fp8|8|16|disagg|2|4');
    unmount();
  });

  it('toggles the same config off when added twice', () => {
    const { result, unmount } = renderHook((a: Args) => useTrackedConfigsState(a), baseArgs);
    act(() => result.current.addTrackedConfig(point(), 'interactivity'));
    act(() => result.current.addTrackedConfig(point(), 'interactivity'));
    expect(result.current.trackedConfigs).toHaveLength(0);
    unmount();
  });

  it('caps the pinned set at 6 configs', () => {
    const { result, unmount } = renderHook((a: Args) => useTrackedConfigsState(a), baseArgs);
    act(() => {
      for (let i = 0; i < 8; i++) {
        result.current.addTrackedConfig(point({ conc: i }), 'interactivity');
      }
    });
    expect(result.current.trackedConfigs).toHaveLength(6);
    unmount();
  });

  it('removes a config by id', () => {
    const { result, unmount } = renderHook((a: Args) => useTrackedConfigsState(a), baseArgs);
    act(() => result.current.addTrackedConfig(point(), 'interactivity'));
    const id = result.current.trackedConfigs[0].id;
    act(() => result.current.removeTrackedConfig(id));
    expect(result.current.trackedConfigs).toHaveLength(0);
    unmount();
  });

  it('clearTrackedConfigs empties the set', () => {
    const { result, unmount } = renderHook((a: Args) => useTrackedConfigsState(a), baseArgs);
    act(() => result.current.addTrackedConfig(point(), 'interactivity'));
    act(() => result.current.addTrackedConfig(point({ conc: 32 }), 'interactivity'));
    act(() => result.current.clearTrackedConfigs());
    expect(result.current.trackedConfigs).toHaveLength(0);
    unmount();
  });

  it('auto-clears when a top-level selector (y-metric) changes', () => {
    const { result, rerender, unmount } = renderHook(
      (a: Args) => useTrackedConfigsState(a),
      baseArgs,
    );
    act(() => result.current.addTrackedConfig(point(), 'interactivity'));
    expect(result.current.trackedConfigs).toHaveLength(1);
    rerender({ ...baseArgs, selectedYAxisMetric: 'y_costh' });
    expect(result.current.trackedConfigs).toHaveLength(0);
    unmount();
  });

  it('does NOT auto-clear on an unrelated rerender with identical selectors', () => {
    const { result, rerender, unmount } = renderHook(
      (a: Args) => useTrackedConfigsState(a),
      baseArgs,
    );
    act(() => result.current.addTrackedConfig(point(), 'interactivity'));
    // Same selector values → the auto-clear effect must not re-fire.
    rerender({ ...baseArgs, effectivePrecisions: baseArgs.effectivePrecisions });
    expect(result.current.trackedConfigs).toHaveLength(1);
    unmount();
  });
});
