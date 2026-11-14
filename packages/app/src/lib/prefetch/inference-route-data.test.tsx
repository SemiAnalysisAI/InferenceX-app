// @vitest-environment jsdom
import { DISPLAY_MODEL_TO_DB, sequenceToIslOsl } from '@semianalysisai/inferencex-constants';
import { hashKey, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as NextNavigation from 'next/navigation';
import { setTimeout as sleep } from 'node:timers/promises';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { calculatorUrlSeed } from '@/components/calculator/url-seed';
import {
  throughputQueryOptions,
  useThroughputData,
} from '@/components/calculator/useThroughputData';
import { availabilityQueryOptions } from '@/hooks/api/use-availability';
import { benchmarkHistoryQueryOptions } from '@/hooks/api/use-benchmark-history';
import { benchmarkQueryOptions } from '@/hooks/api/use-benchmarks';
import { evaluationsQueryOptions, useEvaluations } from '@/hooks/api/use-evaluations';
import { trendHistoryQueryOptions } from '@/hooks/api/use-trend-history';
import { workflowInfoQueryOptions } from '@/hooks/api/use-workflow-info';
import { EphemeralUrlStateContext } from '@/hooks/useUrlState';
import type { AvailabilityRow } from '@/lib/api/api';
import { compactAvailability } from '@/lib/benchmarks/compact-availability';
import { Model, Sequence } from '@/lib/catalog/data-mappings';
import { DEFAULT_INFERENCE_MODEL_SLUG } from '@/lib/routing/inference-model-redirects';
import {
  getInferenceModelBySlug,
  inferenceModelSlugForModel,
} from '@/lib/routing/inference-model-slug';
import { setInferenceNavigationModel } from '@/lib/routing/inference-navigation-state';
import { readUrlParams, writeUrlParams } from '@/lib/routing/url-state';
import {
  GlobalFilterProvider,
  useGlobalFilterRun,
  useGlobalFilterSelection,
} from '@/providers/GlobalFilterContext';

import { prefetchInferenceRouteData, resolveInferenceRoute } from './inference-route-data';
import type * as UnofficialRunProvider from '@/providers/unofficial-run-provider';
import { warmInferenceRoute } from './inference-route-warm';

const mocks = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof NextNavigation>()),
  usePathname: () => mocks.pathname,
}));
vi.mock('@/providers/unofficial-run-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof UnofficialRunProvider>()),
  useUnofficialRun: () => ({ availableModelsAndSequences: [] }),
}));

// In the fixture, DeepSeek-V4-Pro runs 8k/1k on two dates and Kimi-K3 runs agentic traces.
const EARLIER_DATE = '2026-06-10';
const LATEST_DATE = '2026-06-12';
const AGENTIC_DATE = '2026-10-23';
const FIXED = sequenceToIslOsl(Sequence.EightK_OneK)!;

function availabilityRow(
  model: Model,
  date: string,
  sequence: { isl: number | null; osl: number | null; benchmark_type: string },
): AvailabilityRow {
  return {
    model: DISPLAY_MODEL_TO_DB[model]![0]!,
    precision: 'fp4',
    hardware: 'b200',
    framework: 'sglang',
    spec_method: 'none',
    disagg: false,
    date,
    ...sequence,
  };
}

const AVAILABILITY = compactAvailability([
  availabilityRow(Model.DeepSeek_V4_Pro, EARLIER_DATE, { ...FIXED, benchmark_type: 'fixed' }),
  availabilityRow(Model.DeepSeek_V4_Pro, LATEST_DATE, { ...FIXED, benchmark_type: 'fixed' }),
  availabilityRow(Model.Kimi_K3, AGENTIC_DATE, {
    isl: null,
    osl: null,
    benchmark_type: 'agentic_traces',
  }),
]);

function apiResponse(path: string): unknown {
  if (path === '/api/v1/availability/compact') return AVAILABILITY;
  if (path === '/api/v1/workflow-info') {
    return { runs: [], changelogs: [], configs: [], runConfigs: [] };
  }
  if (path === '/api/v1/evaluations/compact') return { configs: [], runs: [], rows: [] };
  if (path === '/api/v1/benchmarks/history/trends') {
    return { metricKeys: [], configs: [], runs: [], rows: [] };
  }
  return [];
}

const fetchMock = vi.fn((input: string) =>
  Promise.resolve(Response.json(apiResponse(new URL(input, 'http://localhost').pathname))),
);

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } },
  });
}

/** Keys of the queries that ran. Disabled observers also add cache entries, which never fetch. */
function cachedHashes(client: QueryClient): string[] {
  return client
    .getQueryCache()
    .getAll()
    .filter(({ state }) => state.dataUpdateCount + state.errorUpdateCount > 0)
    .map((query) => query.queryHash)
    .toSorted();
}

function hashes(...keys: readonly (readonly unknown[])[]): string[] {
  return keys.map((key) => hashKey(key)).toSorted();
}

async function warm(path: string): Promise<QueryClient> {
  const url = new URL(path, 'http://localhost');
  const route = resolveInferenceRoute(url.pathname, url.searchParams);
  expect(route).not.toBeNull();
  const client = freshClient();
  await warmInferenceRoute(client, route!);
  await vi.waitFor(() => expect(client.isFetching()).toBe(0));
  return client;
}

/** The main benchmarks key `InferenceProvider` pages read for `model` at `queryDate`. */
function inferenceChartKey(model: Model, queryDate: string) {
  return benchmarkQueryOptions(
    model,
    queryDate,
    true,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    true,
  ).queryKey;
}

const availabilityKey = availabilityQueryOptions().queryKey;

let root: Root | null = null;

/** Mounts `children` under a provider the way the page does, then lets every query settle. */
async function renderPage(
  client: QueryClient,
  pathname: string,
  children: ReactNode,
): Promise<void> {
  mocks.pathname = pathname;
  const container = document.createElement('div');
  root = createRoot(container);
  act(() =>
    root!.render(
      <QueryClientProvider client={client}>
        <EphemeralUrlStateContext.Provider value>{children}</EphemeralUrlStateContext.Provider>
      </QueryClientProvider>,
    ),
  );
  // Each settled query re-renders the page, which can start the next wave.
  let previous = '';
  for (let pass = 0; pass < 50; pass++) {
    await act(() => sleep(0));
    const current = cachedHashes(client).join('|');
    if (client.isFetching() === 0 && current === previous) break;
    previous = current;
  }
  expect(client.isFetching()).toBe(0);
}

function EvaluationProbe() {
  useEvaluations();
  return null;
}

/** Calls `useThroughputData` with the selection `ThroughputCalculatorInner` passes it. */
function ThroughputProbe() {
  const { selectedModel, effectiveSequence, effectivePrecisions } = useGlobalFilterSelection();
  const { selectedRunDate } = useGlobalFilterRun();
  useThroughputData(selectedModel, effectiveSequence, effectivePrecisions, selectedRunDate);
  return null;
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  vi.unstubAllGlobals();
  setInferenceNavigationModel(undefined);
  writeUrlParams({ g_model: undefined });
  readUrlParams();
});

describe('resolveInferenceRoute', () => {
  const deepSeekSlug = inferenceModelSlugForModel(Model.DeepSeek_V4_Pro)!;

  it.each([
    [`/infx/inference/${deepSeekSlug}`, 'inference'],
    ['/infx/inference', 'inference'],
    ['/infx/historical', 'historical'],
    ['/infx/calculator', 'calculator'],
    ['/infx/first-token', 'first-token'],
    ['/infx/cache-reuse', 'cache-reuse'],
    ['/infx/fleet', 'fleet'],
    ['/infx/profit-estimator', 'profit-estimator'],
    ['/infx/evaluation', 'evaluation'],
  ])('handles %s as the %s page', (path, page) => {
    expect(resolveInferenceRoute(path, new URLSearchParams())?.page).toBe(page);
    expect(prefetchInferenceRouteData(freshClient(), path, new URLSearchParams())).toBe(true);
  });

  it('follows the bare Inference redirect to the featured model', () => {
    expect(resolveInferenceRoute('/infx/inference', new URLSearchParams())?.pathname).toBe(
      `/infx/inference/${DEFAULT_INFERENCE_MODEL_SLUG}`,
    );
    expect(
      resolveInferenceRoute('/infx/inference', new URLSearchParams({ g_model: Model.Kimi_K3 }))
        ?.pathname,
    ).toBe('/infx/inference');
  });

  it.each([
    '/infx/gpu-specs',
    '/infx/submissions',
    '/infx/inference/agentic',
    '/infx/inference/logs/1',
    '/infx/historical/not-a-model',
    '/infx/profit-estimator-per-gigawatt',
    '/opx',
    '/',
  ])('leaves %s to other prefetchers', (path) => {
    expect(resolveInferenceRoute(path, new URLSearchParams())).toBeNull();
    expect(prefetchInferenceRouteData(freshClient(), path, new URLSearchParams())).toBe(false);
  });
});

describe('warmInferenceRoute on a fresh dashboard mount', () => {
  it('warms /infx/evaluation with the keys its provider and page hooks request', async () => {
    const pageClient = freshClient();
    await renderPage(
      pageClient,
      '/infx/evaluation',
      <GlobalFilterProvider>
        <EvaluationProbe />
      </GlobalFilterProvider>,
    );

    const warmed = await warm('/infx/evaluation');
    expect(cachedHashes(warmed)).toEqual(cachedHashes(pageClient));
    expect(cachedHashes(warmed)).toEqual(
      hashes(
        availabilityKey,
        evaluationsQueryOptions().queryKey,
        workflowInfoQueryOptions(LATEST_DATE).queryKey,
      ),
    );
  });

  it('warms /infx/calculator with the provisional and dated calculator keys the page requests', async () => {
    const pageClient = freshClient();
    const seed = calculatorUrlSeed('/infx/calculator', '', undefined);
    await renderPage(
      pageClient,
      '/infx/calculator',
      <GlobalFilterProvider
        initialModel={seed.model}
        initialSequence={seed.sequence}
        initialPrecisions={seed.precisions}
        initialRunDate={seed.runDate}
        initialRunId={seed.runId}
      >
        <ThroughputProbe />
      </GlobalFilterProvider>,
    );

    const warmed = await warm('/infx/calculator');
    expect(cachedHashes(warmed)).toEqual(cachedHashes(pageClient));
    expect(cachedHashes(warmed)).toEqual(
      hashes(
        availabilityKey,
        throughputQueryOptions(Model.DeepSeek_V4_Pro, Sequence.EightK_OneK, '').queryKey,
        throughputQueryOptions(Model.DeepSeek_V4_Pro, Sequence.EightK_OneK, LATEST_DATE).queryKey,
        workflowInfoQueryOptions(LATEST_DATE).queryKey,
      ),
    );
  });

  it('warms /infx/inference/<slug> with the latest chart rows and run workflow', async () => {
    const slug = inferenceModelSlugForModel(Model.DeepSeek_V4_Pro);
    const warmed = await warm(`/infx/inference/${slug}`);
    expect(cachedHashes(warmed)).toEqual(
      hashes(
        availabilityKey,
        inferenceChartKey(Model.DeepSeek_V4_Pro, ''),
        workflowInfoQueryOptions(LATEST_DATE).queryKey,
      ),
    );
  });

  it('warms bare /infx/inference for the model its redirect lands on', async () => {
    const model = getInferenceModelBySlug(DEFAULT_INFERENCE_MODEL_SLUG)!.model;
    const warmed = await warm('/infx/inference');
    // The featured model has no fixture runs, so there is no run date to load workflow info for.
    expect(cachedHashes(warmed)).toEqual(hashes(availabilityKey, inferenceChartKey(model, '')));
  });

  it('warms the dated chart rows for a pinned earlier run instead of the latest rows', async () => {
    const slug = inferenceModelSlugForModel(Model.DeepSeek_V4_Pro);
    const warmed = await warm(`/infx/inference/${slug}?g_rundate=${EARLIER_DATE}`);
    expect(cachedHashes(warmed)).toEqual(
      hashes(
        availabilityKey,
        inferenceChartKey(Model.DeepSeek_V4_Pro, EARLIER_DATE),
        workflowInfoQueryOptions(EARLIER_DATE).queryKey,
      ),
    );
  });

  it('warms /infx/historical with its trend history for the resolved sequence', async () => {
    const warmed = await warm('/infx/historical');
    expect(cachedHashes(warmed)).toEqual(
      hashes(
        availabilityKey,
        inferenceChartKey(Model.DeepSeek_V4_Pro, ''),
        workflowInfoQueryOptions(LATEST_DATE).queryKey,
        trendHistoryQueryOptions(Model.DeepSeek_V4_Pro, FIXED.isl, FIXED.osl).queryKey,
      ),
    );
  });

  it('warms /infx/fleet with the calculator keys and the fleet history', async () => {
    const warmed = await warm('/infx/fleet');
    expect(cachedHashes(warmed)).toEqual(
      hashes(
        availabilityKey,
        throughputQueryOptions(Model.DeepSeek_V4_Pro, Sequence.EightK_OneK, '').queryKey,
        throughputQueryOptions(Model.DeepSeek_V4_Pro, Sequence.EightK_OneK, LATEST_DATE).queryKey,
        workflowInfoQueryOptions(LATEST_DATE).queryKey,
        benchmarkHistoryQueryOptions(Model.DeepSeek_V4_Pro, FIXED.isl, FIXED.osl, {
          view: 'calculator',
        }).queryKey,
      ),
    );
  });

  it('warms /infx/profit-estimator with agentic-trace keys for its default model', async () => {
    const warmed = await warm('/infx/profit-estimator');
    expect(cachedHashes(warmed)).toEqual(
      hashes(
        availabilityKey,
        throughputQueryOptions(Model.Kimi_K3, Sequence.AgenticTraces, '').queryKey,
        throughputQueryOptions(Model.Kimi_K3, Sequence.AgenticTraces, AGENTIC_DATE).queryKey,
        workflowInfoQueryOptions(AGENTIC_DATE).queryKey,
      ),
    );
  });

  it('applies a remembered model the way the calculator provider does', async () => {
    writeUrlParams({ g_model: Model.Kimi_K3 });
    readUrlParams();
    const warmed = await warm('/infx/calculator');
    expect(cachedHashes(warmed)).toContain(
      hashKey(throughputQueryOptions(Model.Kimi_K3, Sequence.EightK_OneK, '').queryKey),
    );
    // Profit routes drop remembered params, so the estimator keeps its route default.
    const profit = await warm('/infx/profit-estimator');
    expect(cachedHashes(profit)).toContain(
      hashKey(throughputQueryOptions(Model.Kimi_K3, Sequence.AgenticTraces, '').queryKey),
    );
  });

  it('warms only availability when overlay runs can reshape the selection', async () => {
    const warmed = await warm('/infx/calculator?unofficialruns=123');
    expect(cachedHashes(warmed)).toEqual(hashes(availabilityKey));
  });
});

describe('warmInferenceRoute under a mounted dashboard filter provider', () => {
  it('warms only the latest chart rows for the live model', async () => {
    window.history.replaceState(null, '', '/infx/evaluation');
    setInferenceNavigationModel(Model.Kimi_K3);
    const warmed = await warm('/infx/historical');
    expect(cachedHashes(warmed)).toEqual(
      hashes(availabilityKey, inferenceChartKey(Model.Kimi_K3, '')),
    );
  });

  it('uses the model a target Inference path names', async () => {
    window.history.replaceState(null, '', '/infx/evaluation');
    setInferenceNavigationModel(Model.Kimi_K3);
    const warmed = await warm(
      `/infx/inference/${inferenceModelSlugForModel(Model.DeepSeek_V4_Pro)}`,
    );
    expect(cachedHashes(warmed)).toEqual(
      hashes(availabilityKey, inferenceChartKey(Model.DeepSeek_V4_Pro, '')),
    );
  });
});

describe('prefetchInferenceRouteData', () => {
  it('starts warming without waiting and never rejects', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')));
    const client = freshClient();
    expect(prefetchInferenceRouteData(client, '/infx/calculator', new URLSearchParams())).toBe(
      true,
    );
    await vi.waitFor(() => expect(client.getQueryState(availabilityKey)?.status).toBe('error'));
  });
});
