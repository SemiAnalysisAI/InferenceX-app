// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AvailabilityRow } from '@/lib/api';
import type { Model, Sequence } from '@/lib/data-mappings';

// Controllable URL-param source (stable identity, like the real memoized hook).
const urlParams = vi.hoisted(() => ({ current: {} as Record<string, string | null> }));
const getUrlParam = vi.hoisted(() => (key: string) => urlParams.current[key] ?? null);
vi.mock('@/hooks/useUrlState', () => ({
  useUrlState: () => ({ getUrlParam }),
}));

import { useGpuComparisonState } from './useGpuComparisonState';

interface Args {
  availabilityRows: AvailabilityRow[] | undefined;
  availableDates: string[];
  selectedModel: Model;
  effectiveSequence: Sequence;
  effectivePrecisions: string[];
}

function renderHook<T>(
  hook: (props: Args) => T,
  initial: Args,
): { result: { current: T }; rerender: (props: Args) => void; unmount: () => void } {
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
    rerender: (next: Args) => {
      props = next;
      render();
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

// Fixture rows for model DeepSeek-V4-Pro (DB key "dsv4"), sequence 8k/1k
// (isl 8192 / osl 1024), precision fp8. hardware+framework map to known GPU keys:
//   b200 + vllm   -> b200_vllm    (sortIdx 3)
//   h100 + vllm   -> h100_vllm    (sortIdx 7)
const row = (o: Partial<AvailabilityRow>): AvailabilityRow => ({
  model: 'dsv4',
  isl: 8192,
  osl: 1024,
  precision: 'fp8',
  hardware: 'h100',
  framework: 'vllm',
  spec_method: 'none',
  disagg: false,
  date: '2026-06-01',
  ...o,
});

const baseArgs: Args = {
  availabilityRows: [
    row({ hardware: 'h100', framework: 'vllm', date: '2026-06-01' }),
    row({ hardware: 'b200', framework: 'vllm', date: '2026-06-02' }),
    row({ hardware: 'b200', framework: 'vllm', date: '2026-06-03' }),
    // Wrong precision — excluded from availableGPUs / dateRange.
    row({ hardware: 'h200', framework: 'sglang', precision: 'fp4', date: '2026-06-04' }),
    // Wrong sequence — excluded.
    row({ hardware: 'h200', framework: 'sglang', isl: 1024, osl: 1024, date: '2026-06-05' }),
  ],
  availableDates: ['2026-06-01', '2026-06-02', '2026-06-03'],
  selectedModel: 'DeepSeek-V4-Pro' as Model,
  effectiveSequence: '8k/1k' as Sequence,
  effectivePrecisions: ['fp8'],
};

describe('useGpuComparisonState', () => {
  beforeEach(() => {
    urlParams.current = {};
  });
  afterEach(() => vi.clearAllMocks());

  it('initializes selection empty when no URL params present', () => {
    const { result, unmount } = renderHook((a) => useGpuComparisonState(a), baseArgs);
    expect(result.current.selectedGPUs).toEqual([]);
    expect(result.current.selectedDates).toEqual([]);
    expect(result.current.selectedDateRange).toEqual({ startDate: '', endDate: '' });
    expect(result.current.isCheckingAvailableDates).toBe(false);
    expect(result.current.showDateRangeDialog).toBe(false);
    unmount();
  });

  it('hydrates selectedGPUs / selectedDates / selectedDateRange from URL params', () => {
    urlParams.current = {
      i_gpus: 'b200_vllm,h100_vllm',
      i_dates: '2026-06-02,2026-06-03',
      i_dstart: '2026-06-01',
      i_dend: '2026-06-03',
    };
    const { result, unmount } = renderHook((a) => useGpuComparisonState(a), baseArgs);
    expect(result.current.selectedGPUs).toEqual(['b200_vllm', 'h100_vllm']);
    expect(result.current.selectedDates).toEqual(['2026-06-02', '2026-06-03']);
    expect(result.current.selectedDateRange).toEqual({
      startDate: '2026-06-01',
      endDate: '2026-06-03',
    });
    unmount();
  });

  it('only sets a date range when BOTH endpoints are present', () => {
    urlParams.current = { i_dstart: '2026-06-01' }; // no i_dend
    const { result, unmount } = renderHook((a) => useGpuComparisonState(a), baseArgs);
    expect(result.current.selectedDateRange).toEqual({ startDate: '', endDate: '' });
    unmount();
  });

  it('computes availableGPUs filtered to model+seq+precision and sorted by registry order', () => {
    const { result, unmount } = renderHook((a) => useGpuComparisonState(a), baseArgs);
    const values = result.current.availableGPUs.map((g) => g.value);
    // b200_vllm (sortIdx 3) precedes h100_vllm (sortIdx 7); fp4 + wrong-seq rows excluded.
    expect(values).toEqual(['b200_vllm', 'h100_vllm']);
    expect(result.current.availableGPUs[0]).toHaveProperty('label');
    unmount();
  });

  it('dbModelKeys resolves the DB keys for the selected model', () => {
    const { result, unmount } = renderHook((a) => useGpuComparisonState(a), baseArgs);
    expect(result.current.dbModelKeys).toEqual(['dsv4']);
    unmount();
  });

  it('dateRangeAvailableDates returns all availableDates when no GPU is selected', () => {
    const { result, unmount } = renderHook((a) => useGpuComparisonState(a), baseArgs);
    expect(result.current.dateRangeAvailableDates).toEqual(baseArgs.availableDates);
    unmount();
  });

  it('dateRangeAvailableDates narrows to dates where the selected GPU has data', () => {
    urlParams.current = { i_gpus: 'b200_vllm' };
    const { result, unmount } = renderHook((a) => useGpuComparisonState(a), baseArgs);
    // b200_vllm fp8 8k/1k rows are dated 06-02 and 06-03 only.
    expect(result.current.dateRangeAvailableDates).toEqual(['2026-06-02', '2026-06-03']);
    unmount();
  });

  it('falls back to availableDates when the selected GPU narrows to nothing', () => {
    urlParams.current = { i_gpus: 'mi300x_vllm' }; // no matching rows
    const { result, unmount } = renderHook((a) => useGpuComparisonState(a), baseArgs);
    expect(result.current.dateRangeAvailableDates).toEqual(baseArgs.availableDates);
    unmount();
  });

  it('returns empty availableGPUs while availabilityRows is undefined (loading)', () => {
    const { result, unmount } = renderHook((a) => useGpuComparisonState(a), {
      ...baseArgs,
      availabilityRows: undefined,
    });
    expect(result.current.availableGPUs).toEqual([]);
    unmount();
  });

  it('keeps derived memos referentially stable across a no-op rerender', () => {
    const { result, rerender, unmount } = renderHook((a) => useGpuComparisonState(a), baseArgs);
    const gpus = result.current.availableGPUs;
    const dates = result.current.dateRangeAvailableDates;
    rerender(baseArgs);
    expect(result.current.availableGPUs).toBe(gpus);
    expect(result.current.dateRangeAvailableDates).toBe(dates);
    unmount();
  });
});
