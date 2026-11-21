// @test-environment jsdom
import { DISPLAY_MODEL_TO_DB, sequenceToIslOsl } from '@semianalysisai/inferencex-constants';
import { hashKey, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as NextNavigation from 'next/navigation';
import { setTimeout as sleep } from 'node:timers/promises';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, mock } from 'bun:test';
import { stubGlobal, unstubAllGlobals } from '@/test/helpers';

import {
  throughputQueryOptions,
  useThroughputData,
  useWarmThroughputChange,
} from '@/components/calculator/useThroughputData';
import { InferenceProvider } from '@/components/inference/InferenceContext';
import { warmInferenceSelection } from '@/components/inference/selection-warm';
import ChartControls from '@/components/inference/ui/ChartControls';
import {
  ModelSelector,
  PrecisionSelector,
  ScenarioSelector,
} from '@/components/ui/chart-selectors';
import { OPTION_HOVER_DWELL_MS } from '@/components/ui/option-intent';
import { benchmarkQueryOptions } from '@/hooks/api/use-benchmarks';
import { sequenceTrendHistoryQueryOptions } from '@/hooks/api/use-trend-history';
import { workflowInfoQueryOptions } from '@/hooks/api/use-workflow-info';
import { EphemeralUrlStateContext } from '@/hooks/useUrlState';
import type { AvailabilityRow } from '@/lib/api/api';
import { compactAvailability } from '@/lib/benchmarks/compact-availability';
import { Model, Precision, Sequence } from '@/lib/catalog/data-mappings';
import {
  CLIENT_PATHNAME_CHANGE_EVENT,
  type ClientPathnameChangeDetail,
} from '@/lib/routing/client-navigation';
import { inferenceModelPath, inferenceModelSlugForModel } from '@/lib/routing/inference-model-slug';
import { setInferenceNavigationModel } from '@/lib/routing/inference-navigation-state';
import { readUrlParams, writeUrlParams } from '@/lib/routing/url-state';
import {
  GlobalFilterProvider,
  useGlobalFilterActions,
  useGlobalFilterAvailability,
  useGlobalFilterRun,
  useGlobalFilterSelection,
} from '@/providers/GlobalFilterContext';
import * as UnofficialRunProvider from '@/providers/unofficial-run-provider';

const mocks = { pathname: '/' };

// Snapshots of the real exports, taken before mock.module swaps them in place.
const actualNavigation = { ...NextNavigation };
const actualUnofficialRun = { ...UnofficialRunProvider };
mock.module('next/navigation', () => ({
  ...actualNavigation,
  usePathname: () => mocks.pathname,
}));
mock.module('@/providers/unofficial-run-provider', () => ({
  ...actualUnofficialRun,
  useUnofficialRun: () => ({ availableModelsAndSequences: [] }),
}));

// DeepSeek-V4-Pro runs 8k/1k at FP4 on two dates, 8k/1k at FP8 on a later date and 1k/1k on its
// own date. Kimi-K3 runs only agentic traces.
const EARLIER_DATE = '2026-06-10';
const ONE_K_DATE = '2026-06-11';
const LATEST_DATE = '2026-06-12';
const FP8_DATE = '2026-06-14';
const AGENTIC_DATE = '2026-10-23';
const EIGHT_K = { ...sequenceToIslOsl(Sequence.EightK_OneK)!, benchmark_type: 'fixed' };
const ONE_K = { ...sequenceToIslOsl(Sequence.OneK_OneK)!, benchmark_type: 'fixed' };
const AGENTIC = { isl: null, osl: null, benchmark_type: 'agentic_traces' };

function availabilityRow(
  model: Model,
  precision: string,
  date: string,
  sequence: { isl: number | null; osl: number | null; benchmark_type: string },
): AvailabilityRow {
  return {
    model: DISPLAY_MODEL_TO_DB[model]![0]!,
    precision,
    hardware: 'b200',
    framework: 'sglang',
    spec_method: 'none',
    disagg: false,
    date,
    ...sequence,
  };
}

const AVAILABILITY = compactAvailability([
  availabilityRow(Model.DeepSeek_V4_Pro, 'fp4', EARLIER_DATE, EIGHT_K),
  availabilityRow(Model.DeepSeek_V4_Pro, 'fp4', LATEST_DATE, EIGHT_K),
  availabilityRow(Model.DeepSeek_V4_Pro, 'fp8', FP8_DATE, EIGHT_K),
  availabilityRow(Model.DeepSeek_V4_Pro, 'fp4', ONE_K_DATE, ONE_K),
  availabilityRow(Model.Kimi_K3, 'fp4', AGENTIC_DATE, AGENTIC),
]);

function apiResponse(path: string): unknown {
  if (path === '/api/v1/availability/compact') return AVAILABILITY;
  if (path === '/api/v1/workflow-info') {
    return { runs: [], changelogs: [], configs: [], runConfigs: [] };
  }
  return [];
}

const fetchMock = vi.fn((input: string) =>
  Promise.resolve(Response.json(apiResponse(new URL(input, 'http://localhost').pathname))),
);

/** Hashes of the queries that ran. Disabled observers also add cache entries, which never fetch. */
function ranHashes(client: QueryClient): string[] {
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

/** The latest-rows key an `InferenceProvider` chart reads for `model`. */
function inferenceChartKey(model: Model) {
  return benchmarkQueryOptions(
    model,
    '',
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

let root: Root | null = null;
let container: HTMLDivElement;
let client: QueryClient;
let pageKey: readonly unknown[] = [];

async function settle(): Promise<void> {
  let previous = '';
  for (let pass = 0; pass < 50; pass++) {
    await act(() => sleep(0));
    const current = ranHashes(client).join('|');
    if (client.isFetching() === 0 && current === previous) break;
    previous = current;
  }
  expect(client.isFetching()).toBe(0);
}

async function render(pathname: string, page: ReactNode): Promise<void> {
  mocks.pathname = pathname;
  window.history.replaceState(null, '', pathname);
  act(() =>
    root!.render(
      <QueryClientProvider client={client}>
        <EphemeralUrlStateContext.Provider value>{page}</EphemeralUrlStateContext.Provider>
      </QueryClientProvider>,
    ),
  );
  await settle();
}

/** The keys `act` adds to the cache, with the requests it makes. */
async function newKeys(action: () => unknown): Promise<{ keys: string[]; requests: number }> {
  const before = new Set(ranHashes(client));
  const calls = fetchMock.mock.calls.length;
  await act(async () => {
    await action();
  });
  await settle();
  return {
    keys: ranHashes(client).filter((hash) => !before.has(hash)),
    requests: fetchMock.mock.calls.length - calls,
  };
}

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const option = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-slot="select-item"]')].find((element) =>
    element.textContent?.includes(label),
  )!;
const hover = (element: HTMLElement) =>
  element.dispatchEvent(new Event('pointerover', { bubbles: true }));
const leave = (element: HTMLElement) =>
  element.dispatchEvent(new Event('pointerout', { bubbles: true }));
/** Hovers `element` long enough to count as resting on it. */
const rest = async (element: HTMLElement) => {
  hover(element);
  await sleep(OPTION_HOVER_DWELL_MS + 20);
};
const keyDown = (element: HTMLElement, key: string) =>
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
/** Stands in for Next.js, whose history patch updates `usePathname` on a router rewrite. */
const followPathname = (event: Event) => {
  mocks.pathname = (event as CustomEvent<ClientPathnameChangeDetail>).detail.pathname;
};
const setSaveData = (saveData: boolean) =>
  Object.defineProperty(navigator, 'connection', { value: { saveData }, configurable: true });

/** Wires the real selectors as the calculator displays do, around the real throughput hook. */
function CalculatorPage() {
  const { selectedModel, effectiveSequence, effectivePrecisions } = useGlobalFilterSelection();
  const { selectedRunDate } = useGlobalFilterRun();
  const { setSelectedModel, setSelectedSequence, setSelectedPrecisions } = useGlobalFilterActions();
  const { availableModels, availableSequences, availablePrecisions } =
    useGlobalFilterAvailability();
  const warm = useWarmThroughputChange();
  useThroughputData(selectedModel, effectiveSequence, effectivePrecisions, selectedRunDate);
  pageKey = throughputQueryOptions(selectedModel, effectiveSequence, selectedRunDate).queryKey;
  return (
    <>
      <ModelSelector
        value={selectedModel}
        onChange={setSelectedModel}
        onOptionIntent={(model) => warm({ model })}
        availableModels={availableModels}
        data-testid="model-selector"
      />
      <ScenarioSelector
        value={effectiveSequence}
        onChange={setSelectedSequence}
        onOptionIntent={(sequence) => warm({ sequence })}
        availableSequences={availableSequences}
        model={selectedModel}
        data-testid="scenario-selector"
      />
      <PrecisionSelector
        value={effectivePrecisions}
        onChange={setSelectedPrecisions}
        onOptionIntent={(precisions) => warm({ precisions })}
        availablePrecisions={availablePrecisions}
        data-testid="precision-selector"
      />
    </>
  );
}

const calculatorPage = (
  <GlobalFilterProvider
    initialModel={Model.DeepSeek_V4_Pro}
    initialSequence={Sequence.EightK_OneK}
    initialPrecisions={[Precision.FP4]}
  >
    <CalculatorPage />
  </GlobalFilterProvider>
);

beforeEach(() => {
  stubGlobal('fetch', fetchMock);
  stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  fetchMock.mockClear();
  setSaveData(false);
  client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root!.unmount());
  root = null;
  container.remove();
  client.clear();
  unstubAllGlobals();
  setInferenceNavigationModel(undefined);
  writeUrlParams({ g_model: undefined });
  readUrlParams();
});

describe('selector option intent on a calculator page', () => {
  it('warms nothing when a menu opens', async () => {
    await render('/infx/calculator', calculatorPage);
    expect(await newKeys(() => byTestId('model-selector').click())).toEqual({
      keys: [],
      requests: 0,
    });
    expect(await newKeys(() => byTestId('precision-selector').click())).toEqual({
      keys: [],
      requests: 0,
    });
  });

  it('warms exactly the keys a model pick requests, so the pick fetches nothing', async () => {
    await render('/infx/calculator', calculatorPage);
    act(() => byTestId('model-selector').click());

    const warmed = await newKeys(() => rest(option('Kimi K3')));
    expect(warmed.keys).toEqual(
      hashes(
        throughputQueryOptions(Model.Kimi_K3, Sequence.AgenticTraces, AGENTIC_DATE).queryKey,
        workflowInfoQueryOptions(AGENTIC_DATE).queryKey,
      ),
    );

    expect(await newKeys(() => option('Kimi K3').click())).toEqual({ keys: [], requests: 0 });
    expect(warmed.keys).toContain(hashKey(pageKey));
  });

  it('warms the dated keys adding a precision moves to', async () => {
    await render('/infx/calculator', calculatorPage);
    act(() => byTestId('precision-selector').click());

    const warmed = await newKeys(() => rest(option('FP8')));
    expect(warmed.keys).toEqual(
      hashes(
        throughputQueryOptions(Model.DeepSeek_V4_Pro, Sequence.EightK_OneK, FP8_DATE).queryKey,
        workflowInfoQueryOptions(FP8_DATE).queryKey,
      ),
    );

    expect(await newKeys(() => option('FP8').click())).toEqual({ keys: [], requests: 0 });
    expect(warmed.keys).toContain(hashKey(pageKey));
  });

  it('warms a scenario on keyboard navigation but not on the focus opening places', async () => {
    await render('/infx/calculator', calculatorPage);
    expect(await newKeys(() => byTestId('scenario-selector').click())).toEqual({
      keys: [],
      requests: 0,
    });
    expect(document.activeElement).toBe(option('8K / 1K'));

    const scenarios = [...document.querySelectorAll('[data-select-option]')];
    const towardOneK = scenarios.indexOf(option('1K / 1K')) === 0 ? 'Home' : 'End';
    const warmed = await newKeys(() => keyDown(option('8K / 1K'), towardOneK));
    expect(document.activeElement).toBe(option('1K / 1K'));
    expect(warmed.keys).toEqual(
      hashes(
        throughputQueryOptions(Model.DeepSeek_V4_Pro, Sequence.OneK_OneK, ONE_K_DATE).queryKey,
        workflowInfoQueryOptions(ONE_K_DATE).queryKey,
      ),
    );

    expect(await newKeys(() => keyDown(option('1K / 1K'), 'Enter'))).toEqual({
      keys: [],
      requests: 0,
    });
    expect(warmed.keys).toContain(hashKey(pageKey));
  });

  it('ignores hover with Save-Data on but still warms on keyboard focus', async () => {
    setSaveData(true);
    await render('/infx/calculator', calculatorPage);
    act(() => byTestId('model-selector').click());

    expect(await newKeys(() => rest(option('Kimi K3')))).toEqual({ keys: [], requests: 0 });

    const search = document.querySelector<HTMLInputElement>('[data-slot="select-content"] input')!;
    const warmed = await newKeys(() => keyDown(search, 'ArrowDown'));
    expect(document.activeElement).toBe(option('Kimi K3'));
    expect(warmed.keys).toEqual(
      hashes(
        throughputQueryOptions(Model.Kimi_K3, Sequence.AgenticTraces, AGENTIC_DATE).queryKey,
        workflowInfoQueryOptions(AGENTIC_DATE).queryKey,
      ),
    );
  });

  it('warms nothing when the pointer passes over options without resting', async () => {
    await render('/infx/calculator', calculatorPage);
    act(() => byTestId('model-selector').click());
    const passed = await newKeys(async () => {
      for (const label of ['Kimi K3', 'DeepSeek']) {
        hover(option(label));
        await sleep(OPTION_HOVER_DWELL_MS / 3);
        leave(option(label));
      }
      await sleep(OPTION_HOVER_DWELL_MS + 20);
    });
    expect(passed).toEqual({ keys: [], requests: 0 });
  });
});

describe('selector option intent on the inference page', () => {
  const deepSeekPath = inferenceModelPath(inferenceModelSlugForModel(Model.DeepSeek_V4_Pro)!);
  beforeEach(() => {
    window.addEventListener(CLIENT_PATHNAME_CHANGE_EVENT, followPathname);
    stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
  });
  afterEach(() => window.removeEventListener(CLIENT_PATHNAME_CHANGE_EVENT, followPathname));

  const inferencePage = (
    <GlobalFilterProvider>
      <InferenceProvider activeTab="inference">
        <ChartControls />
      </InferenceProvider>
    </GlobalFilterProvider>
  );

  it('warms the chart rows and run workflow a model pick requests, so the pick fetches nothing', async () => {
    await render(deepSeekPath, inferencePage);
    expect(await newKeys(() => byTestId('model-selector').click())).toEqual({
      keys: [],
      requests: 0,
    });

    const warmed = await newKeys(() => rest(option('Kimi K3')));
    expect(warmed.keys).toEqual(
      hashes(inferenceChartKey(Model.Kimi_K3), workflowInfoQueryOptions(AGENTIC_DATE).queryKey),
    );

    expect(await newKeys(() => option('Kimi K3').click())).toEqual({ keys: [], requests: 0 });
    expect(mocks.pathname).toBe(inferenceModelPath(inferenceModelSlugForModel(Model.Kimi_K3)!));
  });

  it('warms the workflow of the run date a precision pick moves to', async () => {
    await render(deepSeekPath, inferencePage);
    act(() => byTestId('precision-multiselect').click());
    // The route's default precisions include FP8, whose latest run is the newest.
    expect(option('FP8').getAttribute('aria-selected')).toBe('true');

    const warmed = await newKeys(() => rest(option('FP8')));
    expect(warmed.keys).toEqual(hashes(workflowInfoQueryOptions(LATEST_DATE).queryKey));
    expect(await newKeys(() => option('FP8').click())).toEqual({ keys: [], requests: 0 });
  });
});

describe('warmInferenceSelection', () => {
  it('adds the trend history Historical Trends loads for the previewed model and sequence', () => {
    const prefetch = vi.spyOn(client, 'prefetchQuery').mockResolvedValue();
    warmInferenceSelection(
      client,
      {
        request: {
          model: Model.Kimi_K3,
          selectedSequence: Sequence.AgenticTraces,
          sequenceExplicit: true,
          selectedPrecisions: [Precision.FP4],
          precisionExplicit: true,
          requestedRunDate: '',
          requestedRunDateExplicit: false,
          requestedRunId: '',
        },
        selection: {
          effectiveSequence: Sequence.AgenticTraces,
          sequenceResolved: true,
          effectivePrecisions: [Precision.FP4],
          availableDates: [AGENTIC_DATE],
          effectiveRunDate: AGENTIC_DATE,
        },
      },
      { activeTab: 'historical', isActive: true },
    );
    expect(prefetch.mock.calls.map(([options]) => hashKey(options.queryKey)).toSorted()).toEqual(
      hashes(
        sequenceTrendHistoryQueryOptions(Model.Kimi_K3, Sequence.AgenticTraces).queryKey,
        inferenceChartKey(Model.Kimi_K3),
      ),
    );
  });
});
