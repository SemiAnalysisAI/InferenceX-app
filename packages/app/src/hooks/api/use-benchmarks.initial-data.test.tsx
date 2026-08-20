// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';

const { mockFetchBenchmarks } = vi.hoisted(() => ({ mockFetchBenchmarks: vi.fn() }));
vi.mock('@/lib/api', () => ({ fetchBenchmarks: mockFetchBenchmarks }));

import { useBenchmarks } from './use-benchmarks';

const INITIAL_ROWS = [{ date: '2026-08-01', precision: 'fp8' }] as BenchmarkRow[];
let observed: BenchmarkRow[] | undefined;

function Probe({ sequence, initialData }: { sequence: string; initialData?: BenchmarkRow[] }) {
  const query = useBenchmarks(
    'DeepSeek-R1-0528',
    '',
    true,
    undefined,
    undefined,
    {
      type: 'calculator',
      sequence,
      ...(initialData ? { cacheScope: 'compare-initial:h100,h200' } : {}),
    },
    initialData,
  );
  observed = query.data;
  return null;
}

function FullProbe({
  model,
  date,
  initialData,
}: {
  model: string;
  date: string;
  initialData?: BenchmarkRow[];
}) {
  const query = useBenchmarks(
    model,
    date,
    true,
    undefined,
    undefined,
    undefined,
    initialData,
    'compare-pair:h100:h200',
  );
  observed = query.data;
  return null;
}

describe('useBenchmarks initial calculator data', () => {
  let root: Root | undefined;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = undefined;
    observed = undefined;
    vi.clearAllMocks();
  });

  it('skips the hydrated initial request but fetches a later selector key', async () => {
    mockFetchBenchmarks.mockResolvedValue([{ date: '2026-08-02', precision: 'bf16' }]);
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    const container = document.createElement('div');
    root = createRoot(container);

    await act(() => {
      root?.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(Probe, { sequence: '1k/1k', initialData: INITIAL_ROWS }),
        ),
      );
    });

    expect(observed).toBe(INITIAL_ROWS);
    expect(mockFetchBenchmarks).not.toHaveBeenCalled();

    await act(() => {
      root?.render(
        createElement(QueryClientProvider, { client }, createElement(Probe, { sequence: '8k/1k' })),
      );
    });

    expect(mockFetchBenchmarks).toHaveBeenCalledTimes(1);
    expect(mockFetchBenchmarks).toHaveBeenCalledWith(
      'DeepSeek-R1-0528',
      '',
      undefined,
      expect.any(AbortSignal),
      undefined,
      undefined,
      { type: 'calculator', sequence: '8k/1k' },
    );
  });

  it('isolates a hydrated pair-scoped full query and fetches later dates normally', async () => {
    mockFetchBenchmarks.mockResolvedValue([{ date: '2026-07-01', precision: 'fp8' }]);
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    root = createRoot(document.createElement('div'));

    await act(() => {
      root?.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(FullProbe, {
            model: 'DeepSeek-R1-0528',
            date: '',
            initialData: INITIAL_ROWS,
          }),
        ),
      );
    });

    expect(observed).toBe(INITIAL_ROWS);
    expect(mockFetchBenchmarks).not.toHaveBeenCalled();
    expect(
      client.getQueryData(['benchmarks', 'DeepSeek-R1-0528', '', 'latest', 'all', 'asof']),
    ).toBeUndefined();

    await act(() => {
      root?.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(FullProbe, {
            model: 'DeepSeek-R1-0528',
            date: '2026-07-01',
          }),
        ),
      );
    });

    expect(mockFetchBenchmarks).toHaveBeenCalledTimes(1);
  });

  it('fetches normally when a model override has no matching initial rows', async () => {
    mockFetchBenchmarks.mockResolvedValue([]);
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    root = createRoot(document.createElement('div'));

    await act(() => {
      root?.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(FullProbe, {
            model: 'Overridden-Model',
            date: '',
            initialData: undefined,
          }),
        ),
      );
    });

    expect(mockFetchBenchmarks).toHaveBeenCalledTimes(1);
    expect(mockFetchBenchmarks).toHaveBeenCalledWith(
      'Overridden-Model',
      '',
      undefined,
      expect.any(AbortSignal),
      undefined,
      undefined,
      undefined,
    );
  });
});
