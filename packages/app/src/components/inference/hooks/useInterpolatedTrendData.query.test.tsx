// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Model, Sequence } from '@/lib/data-mappings';

const { mockFetchBenchmarkHistory } = vi.hoisted(() => ({
  mockFetchBenchmarkHistory: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ fetchBenchmarkHistory: mockFetchBenchmarkHistory }));

import { useInterpolatedTrendData } from './useInterpolatedTrendData';

let observed:
  | {
      error?: Error | null;
      refetch?: () => Promise<unknown>;
    }
  | undefined;

function Probe() {
  observed = useInterpolatedTrendData({
    selectedModel: Model.DeepSeek_R1,
    selectedSequence: Sequence.OneK_OneK,
    selectedPrecisions: ['fp8'],
    selectedYAxisMetric: 'y_tpPerGpu',
    targetInteractivity: 40,
    availableDates: [],
    enabled: true,
  });
  return null;
}

describe('useInterpolatedTrendData query state', () => {
  let root: Root | undefined;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = undefined;
    observed = undefined;
    vi.clearAllMocks();
  });

  it('propagates a history failure and exposes a refetch that can recover', async () => {
    mockFetchBenchmarkHistory.mockRejectedValueOnce(new Error('secondary history failed'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    root = createRoot(document.createElement('div'));

    await act(() => {
      root?.render(createElement(QueryClientProvider, { client }, createElement(Probe)));
    });

    await vi.waitFor(() => expect(observed?.error?.message).toBe('secondary history failed'));
    expect(observed?.refetch).toBeTypeOf('function');

    mockFetchBenchmarkHistory.mockResolvedValueOnce([]);
    await act(async () => {
      await observed?.refetch?.();
    });

    await vi.waitFor(() => expect(observed?.error).toBeNull());
  });
});
