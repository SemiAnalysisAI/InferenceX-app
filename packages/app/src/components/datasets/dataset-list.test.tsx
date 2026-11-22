// @test-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { describe, expect, it, vi } from 'bun:test';

import type { DatasetRecord } from '@/hooks/api/use-datasets';
import { $, contains, eventually, intercept, isVisible, render } from '@/test/dom';

import { DatasetList } from './dataset-list';

const datasets: DatasetRecord[] = [
  {
    id: 'ds-1',
    slug: 'cc-traces-weka-full',
    label: 'cc-traces-weka (full)',
    variant: 'full',
    description: 'Every captured request, unmodified.',
    hf_url: 'https://huggingface.co/datasets/semianalysisai/cc-traces-weka-full',
    license: 'apache-2.0',
    conversation_count: 1234,
    summary: {
      totalIn: 5_000_000,
      totalOut: 250_000,
      cachedPct: 0.82,
      mainTurns: 9800,
      subagentGroups: 540,
    },
    ingested_at: '2026-06-20T00:00:00Z',
  },
  {
    id: 'ds-2',
    slug: 'cc-traces-weka-256k',
    label: 'cc-traces-weka (256k)',
    variant: '256k',
    description: 'Turns trimmed to a 256k context window.',
    hf_url: null,
    license: 'apache-2.0',
    conversation_count: 980,
    summary: {
      totalIn: 3_200_000,
      totalOut: 180_000,
      cachedPct: 0.79,
      mainTurns: 7600,
      subagentGroups: 410,
    },
    ingested_at: '2026-06-19T00:00:00Z',
  },
];

function mountList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(() => Promise.resolve()),
    bfcacheId: '',
  };
  render(
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value="/infx/agentx">
        <QueryClientProvider client={queryClient}>
          <DatasetList />
        </QueryClientProvider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );
}

const visibleText = (text: string) => expect(isVisible(contains(text))).toBe(true);

describe('DatasetList', () => {
  it('renders a card per dataset with its summary stats', async () => {
    const list = intercept('GET', '/api/v1/datasets', { body: datasets });
    mountList();
    await eventually(() => expect(list.calls).toHaveLength(1));
    await eventually(() => visibleText('cc-traces-weka (full)'));
    visibleText('cc-traces-weka (256k)');
    visibleText('1,234');
    visibleText('82%');
    visibleText('Request shape');
    visibleText('Token volume');
    expect(
      $(
        'a[href="/infx/agentx/cc-traces-weka-full"] section[aria-labelledby="cc-traces-weka-full-request-shape"]',
      ),
    ).not.toBeNull();
    expect($('a[href="/infx/agentx/cc-traces-weka-full"]')).not.toBeNull();
  });

  it('shows the empty state when no datasets are ingested', async () => {
    const empty = intercept('GET', '/api/v1/datasets', { body: [] });
    mountList();
    await eventually(() => expect(empty.calls).toHaveLength(1));
    await eventually(() => visibleText('No datasets ingested yet'));
  });

  it('shows the error state when the request fails', async () => {
    const failed = intercept('GET', '/api/v1/datasets', { status: 500, body: { error: 'boom' } });
    mountList();
    await eventually(() => expect(failed.calls).toHaveLength(1));
    await eventually(() => visibleText('Failed to load datasets'));
  });
});
