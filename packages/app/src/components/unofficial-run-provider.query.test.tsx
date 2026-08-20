// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLIENT_SEARCH_CHANGE_EVENT } from '@/lib/client-navigation';

import {
  UnofficialRunProvider,
  useUnofficialRun,
  type UnofficialRunContextType,
} from './unofficial-run-provider';

vi.mock('@/components/ui/unofficial-banner', () => ({ UnofficialBanner: () => null }));

interface PendingRequest {
  url: string;
  signal: AbortSignal;
  resolve: (response: Response) => void;
}

const requests: PendingRequest[] = [];

function runInfo(id: number) {
  return {
    id,
    name: `run ${id}`,
    branch: `branch-${id}`,
    sha: String(id),
    createdAt: '2026-08-20T00:00:00Z',
    url: `https://github.com/o/r/actions/runs/${id}`,
    conclusion: 'success',
    status: 'completed',
    isNonMainBranch: true,
  };
}

let latestRunIds: number[] = [];
let dismissLatest: ((runId: string) => void) | null = null;
let clearLatest: (() => void) | null = null;
let latestContextValue: UnofficialRunContextType | null = null;
let rerenderProvider: (() => void) | null = null;

function Probe() {
  const value = useUnofficialRun();
  latestContextValue = value;
  latestRunIds = value.unofficialRunInfos.map((run) => run.id);
  dismissLatest = value.dismissRun;
  clearLatest = value.clearUnofficialRun;
  return null;
}

function ProviderHarness() {
  const [, setRevision] = useState(0);
  rerenderProvider = () => setRevision((revision) => revision + 1);
  return createElement(UnofficialRunProvider, null, createElement(Probe));
}

function installPendingFetch(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const { promise, resolve } = Promise.withResolvers<Response>();
    requests.push({
      url: String(input),
      signal: init?.signal as AbortSignal,
      resolve,
    });
    return promise;
  });
}

function mountProvider(): Root {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(createElement(QueryClientProvider, { client }, createElement(ProviderHarness)));
  });
  return root;
}

async function flush(): Promise<void> {
  await act(async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    window.setTimeout(resolve, 0);
    await promise;
  });
}

function hasRunIds(expected: number[]): boolean {
  return (
    latestRunIds.length === expected.length &&
    expected.every((runId, index) => latestRunIds[index] === runId)
  );
}

async function waitForRunIds(expected: number[]): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    if (hasRunIds(expected)) return;
    await flush();
  }
  expect(latestRunIds).toEqual(expected);
}

afterEach(() => {
  requests.length = 0;
  latestRunIds = [];
  clearLatest = null;
  dismissLatest = null;
  latestContextValue = null;
  rerenderProvider = null;
  window.history.replaceState({}, '', '/inference');
  vi.restoreAllMocks();
});

describe('UnofficialRunProvider query lifecycle', () => {
  it('preserves the context value identity when provider fields are unchanged', () => {
    const root = mountProvider();
    const initialValue = latestContextValue;

    act(() => rerenderProvider?.());

    expect(latestContextValue).toBe(initialValue);
    act(() => root.unmount());
  });

  it('aborts the old key and ignores its response after a URL race', async () => {
    installPendingFetch();
    window.history.replaceState({}, '', '/inference?unofficialrun=1');
    const root = mountProvider();
    await flush();
    expect(requests[0].url).toContain('runId=1');

    act(() => {
      window.history.pushState({}, '', '/inference?unofficialruns=2');
      window.dispatchEvent(new CustomEvent(CLIENT_SEARCH_CHANGE_EVENT));
    });
    await flush();
    expect(requests[0].signal.aborted).toBe(true);
    expect(requests[1].url).toContain('runId=2');

    requests[1].resolve({
      ok: true,
      json: () => Promise.resolve({ runInfos: [runInfo(2)], benchmarks: [], evaluations: [] }),
    } as Response);
    await flush();
    requests[0].resolve({
      ok: true,
      json: () => Promise.resolve({ runInfos: [runInfo(1)], benchmarks: [], evaluations: [] }),
    } as Response);
    await flush();
    expect(latestRunIds).toEqual([2]);
    act(() => root.unmount());
  });

  it('dismisses one run with pushState while retaining the other run data', async () => {
    installPendingFetch();
    window.history.replaceState({}, '', '/inference?unofficialruns=1,2');
    const root = mountProvider();
    await flush();
    requests[0].resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          runInfos: [runInfo(1), runInfo(2)],
          benchmarks: [],
          evaluations: [],
        }),
    } as Response);
    await waitForRunIds([1, 2]);

    act(() => dismissLatest?.('1'));
    await flush();
    expect(window.location.search).toBe('?unofficialruns=2');
    expect(latestRunIds).toEqual([2]);

    act(() => clearLatest?.());
    await flush();
    expect(window.location.search).toBe('');
    expect(latestRunIds).toEqual([]);
    act(() => root.unmount());
  });
});
