// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockFetchReliability } = vi.hoisted(() => ({
  mockFetchReliability: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ fetchReliability: mockFetchReliability }));
vi.mock('@/hooks/useUrlState', () => ({
  useUrlState: () => ({
    getUrlParam: () => undefined,
    setUrlParams: vi.fn(),
  }),
}));

import { ReliabilityProvider, useReliabilityContext } from './ReliabilityContext';

let observed:
  | {
      error?: string | null;
      refetch?: () => Promise<unknown>;
    }
  | undefined;

function Probe() {
  observed = useReliabilityContext();
  return null;
}

describe('ReliabilityProvider query state', () => {
  let root: Root | undefined;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = undefined;
    observed = undefined;
    vi.clearAllMocks();
  });

  it('exposes a refetch that clears a reliability error after recovery', async () => {
    mockFetchReliability.mockRejectedValueOnce(new Error('reliability failed'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    root = createRoot(document.createElement('div'));

    await act(() => {
      root?.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(ReliabilityProvider, null, createElement(Probe)),
        ),
      );
    });

    await vi.waitFor(() => expect(observed?.error).toBe('reliability failed'));
    expect(observed?.refetch).toBeTypeOf('function');

    mockFetchReliability.mockResolvedValueOnce([]);
    await act(async () => {
      await observed?.refetch?.();
    });

    await vi.waitFor(() => expect(observed?.error).toBeNull());
  });
});
