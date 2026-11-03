// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type DatasetDetail, useDataset, useDatasetConversations } from './use-datasets';

function ConversationProbe({ search }: { search: string }) {
  useDatasetConversations({ slug: 'trace', search });
  return null;
}

async function flushQueries(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useDatasetConversations cache lifecycle', () => {
  it('collects an inactive search key after the bounded conversation gc window', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(Response.json({ total: 0, items: [] }, { status: 200 })),
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(ConversationProbe, { search: 'alpha' }),
        ),
      ),
    );
    await flushQueries();
    act(() =>
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(ConversationProbe, { search: 'beta' }),
        ),
      ),
    );
    await flushQueries();

    const oldKey = ['dataset-conversations', 'trace', 'alpha', 50, 0, 'tokens'] as const;
    expect(client.getQueryData(oldKey)).toEqual({ total: 0, items: [] });

    act(() => vi.advanceTimersByTime(5 * 60 * 1000 - 1));
    expect(client.getQueryData(oldKey)).toEqual({ total: 0, items: [] });

    act(() => vi.advanceTimersByTime(1));
    expect(client.getQueryData(oldKey)).toBeUndefined();

    act(() => root.unmount());
    client.clear();
  });
});

describe('useDataset server seed', () => {
  it('renders the server-resolved record without fetching it again', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const record = { slug: 'trace', label: 'Trace dataset', chart_data: {} } as DatasetDetail;
    let seen: DatasetDetail | null | undefined;
    function Probe() {
      seen = useDataset('trace', record).data;
      return null;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const root = createRoot(document.createElement('div'));
    act(() => root.render(createElement(QueryClientProvider, { client }, createElement(Probe))));
    await flushQueries();
    expect(seen).toBe(record);
    expect(fetchSpy).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
