// @test-environment jsdom
import { DISPLAY_MODEL_TO_DB, scenarioToIslOsl } from '@semianalysisai/inferencex-constants';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as NextNavigation from 'next/navigation';
import { setTimeout as sleep } from 'node:timers/promises';
import { act, startTransition, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, mock } from 'bun:test';
import { stubGlobal, unstubAllGlobals } from '@/test/helpers';

import {
  InferenceProvider,
  useInferenceActions,
  useInferenceData,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
import type { InferenceActionsContextType } from '@/components/inference/types';
import { EphemeralUrlStateContext } from '@/hooks/useUrlState';
import type { AvailabilityRow, BenchmarkRow } from '@/lib/api/api';
import { compactAvailability } from '@/lib/benchmarks/compact-availability';
import { Model, Precision, Scenario } from '@/lib/catalog/data-mappings';
import { loadSystemPowerModeler } from '@/lib/power/system-power-modeler';
import { GlobalFilterProvider } from '@/providers/GlobalFilterContext';
import * as UnofficialRunProvider from '@/providers/unofficial-run-provider';

const actualNavigation = { ...NextNavigation };
const actualUnofficialRun = { ...UnofficialRunProvider };
mock.module('next/navigation', () => ({
  ...actualNavigation,
  usePathname: () => '/infx/inference',
}));
mock.module('@/providers/unofficial-run-provider', () => ({
  ...actualUnofficialRun,
  useUnofficialRun: () => ({ availableModelsAndScenarios: [] }),
}));

// The chart waits for the lazily loaded power model, so load it before rendering the provider.
await loadSystemPowerModeler();

const DATE = '2026-06-12';
const MODELS = [Model.DeepSeek_V4_Pro, Model.Kimi_K3];
const PRECISIONS = [Precision.FP4, Precision.FP8];
// Both models run vLLM on the same three chips at both precisions, so a pick never changes which
// legend entries exist, only which hardware the new scope starts with.
const HARDWARE = ['b200', 'b300', 'h200'];
const ALL_KEYS = HARDWARE.map((hardware) => `${hardware}_vllm`);
const SOLO_KEY = 'b300_vllm';

const AVAILABILITY = compactAvailability(
  MODELS.flatMap((model) =>
    PRECISIONS.flatMap((precision) =>
      HARDWARE.map((hardware): AvailabilityRow => ({
        model: DISPLAY_MODEL_TO_DB[model]![0]!,
        precision,
        hardware,
        framework: 'vllm',
        spec_method: 'none',
        disagg: false,
        date: DATE,
        ...scenarioToIslOsl(Scenario.EightK_OneK)!,
        benchmark_type: 'fixed',
      })),
    ),
  ),
);

let nextRowId = 1;
const benchmarkRows = (model: Model): BenchmarkRow[] =>
  PRECISIONS.flatMap((precision) =>
    HARDWARE.flatMap((hardware) =>
      [16, 64].map(
        (conc) =>
          ({
            id: nextRowId++,
            hardware,
            framework: 'vllm',
            model: DISPLAY_MODEL_TO_DB[model]![0]!,
            precision,
            spec_method: 'none',
            disagg: false,
            is_multinode: false,
            prefill_tp: 8,
            prefill_ep: 1,
            prefill_dp_attention: false,
            prefill_num_workers: 0,
            decode_tp: 8,
            decode_ep: 1,
            decode_dp_attention: false,
            decode_num_workers: 0,
            num_prefill_gpu: 8,
            num_decode_gpu: 8,
            benchmark_type: 'single_turn',
            offload_mode: 'off',
            ...scenarioToIslOsl(Scenario.EightK_OneK)!,
            conc,
            image: 'example.invalid/inference:fixture',
            metrics: {
              tput_per_gpu: 900 / Math.sqrt(conc),
              input_tput_per_gpu: 50,
              median_intvty: 400 / conc,
              median_e2el: conc / 10,
              p90_ttft: 0.5,
            },
            date: DATE,
            run_url: null,
          }) as BenchmarkRow,
      ),
    ),
  );
const ROWS = new Map(MODELS.map((model) => [model as string, benchmarkRows(model)]));

const fetchMock = vi.fn((input: string) => {
  const url = new URL(input, 'http://localhost');
  if (url.pathname === '/api/v1/availability/compact') {
    return Promise.resolve(Response.json(AVAILABILITY));
  }
  if (url.pathname === '/api/v1/workflow-info') {
    return Promise.resolve(
      Response.json({ runs: [], changelogs: [], configs: [], runConfigs: [] }),
    );
  }
  if (url.pathname === '/api/v1/benchmarks') {
    return Promise.resolve(Response.json(ROWS.get(url.searchParams.get('model') ?? '') ?? []));
  }
  return Promise.resolve(Response.json([]));
});

let actions: InferenceActionsContextType | null = null;
let activeHwTypes = new Set<string>();
let bestPerSku = false;
let activePresetId: string | null = null;
let scopePickPending: boolean | undefined;
let selectedModel: Model | null = null;
let hwTypesWithData = new Set<string>();
let loading = true;
/** Every hardware selection the provider committed, in order. */
let committedHardware: string[][] = [];
/** Runs once, with the actions of the first commit that shows a scope pick as pending. */
let whilePending: ((pendingActions: InferenceActionsContextType) => void) | null = null;
let sawPending = false;

function Probe() {
  const probeActions = useInferenceActions();
  const filters = useInferenceFilters();
  const data = useInferenceData();
  actions = probeActions;
  activeHwTypes = filters.activeHwTypes;
  bestPerSku = filters.bestPerSku;
  activePresetId = filters.activePresetId;
  scopePickPending = filters.scopePickPending;
  selectedModel = filters.selectedModel;
  hwTypesWithData = data.hwTypesWithData;
  loading = data.loading;
  // Layout effects run after the pick's urgent commit and before its transition renders, which
  // is where a reader's click on the old legend lands.
  useLayoutEffect(() => {
    committedHardware.push([...filters.activeHwTypes].toSorted());
  }, [filters.activeHwTypes]);
  useLayoutEffect(() => {
    if (!filters.scopePickPending) return;
    sawPending = true;
    const run = whilePending;
    whilePending = null;
    run?.(probeActions);
  });
  return null;
}

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

/** Waits for the scope to load, then for its hardware reset and any updates that follow it. */
async function settle(until: () => boolean): Promise<void> {
  for (let pass = 0; pass < 50 && !until(); pass++) await act(() => sleep(0));
  for (let pass = 0; pass < 5; pass++) await act(() => sleep(0));
}

const chartReady = () => !loading && hwTypesWithData.size === HARDWARE.length;

async function mount() {
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <EphemeralUrlStateContext.Provider value>
          <GlobalFilterProvider
            initialModel={Model.DeepSeek_V4_Pro}
            initialScenario={Scenario.EightK_OneK}
            initialPrecisions={[Precision.FP4]}
          >
            <InferenceProvider activeTab="inference">
              <Probe />
            </InferenceProvider>
          </GlobalFilterProvider>
        </EphemeralUrlStateContext.Provider>
      </QueryClientProvider>,
    ),
  );
  await settle(() => chartReady() && activeHwTypes.size > 1);
}

/** Picks a model the way the model selector does, with the provider update in a transition. */
function pickModel(model: Model) {
  startTransition(() => actions!.setSelectedModel(model));
}

beforeEach(() => {
  stubGlobal('fetch', fetchMock);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  window.history.replaceState(null, '', '/infx/inference');
  committedHardware = [];
  whilePending = null;
  sawPending = false;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  client.clear();
  unstubAllGlobals();
});

describe('hardware actions while a scope pick is rendering', () => {
  it('ignores a legend click on the old legend, and the new model opens on its defaults', async () => {
    await mount();
    expect([...activeHwTypes].toSorted()).toEqual(ALL_KEYS);
    committedHardware = [];

    whilePending = (pendingActions) => {
      pendingActions.toggleHwType(SOLO_KEY);
      pendingActions.removeHwType('h200_vllm');
      pendingActions.setBestPerSku(true);
    };
    act(() => pickModel(Model.Kimi_K3));
    await settle(() => selectedModel === Model.Kimi_K3 && chartReady());

    expect(sawPending).toBe(true);
    expect(scopePickPending).toBe(false);
    expect(selectedModel).toBe(Model.Kimi_K3);
    expect([...activeHwTypes].toSorted()).toEqual(ALL_KEYS);
    // Main applied the click and the reset undid it. Nothing may show the click at any point.
    expect(committedHardware.every((keys) => keys.length === ALL_KEYS.length)).toBe(true);
  });

  it('stops waiting once a pick lands without changing the scope', async () => {
    await mount();

    act(() => pickModel(Model.DeepSeek_V4_Pro));
    await settle(() => true);
    expect(sawPending).toBe(true);
    expect(scopePickPending).toBe(false);
    act(() => actions!.toggleHwType(SOLO_KEY));
    expect([...activeHwTypes]).toEqual([SOLO_KEY]);

    sawPending = false;
    act(() => {
      pickModel(Model.Kimi_K3);
      pickModel(Model.DeepSeek_V4_Pro);
    });
    await settle(() => true);
    expect(sawPending).toBe(true);
    expect(scopePickPending).toBe(false);
    expect(selectedModel).toBe(Model.DeepSeek_V4_Pro);
    const before = [...activeHwTypes].toSorted();
    act(() => actions!.toggleHwType(SOLO_KEY));
    expect([...activeHwTypes].toSorted()).not.toEqual(before);
  });
});

describe('hardware actions with no scope pick pending', () => {
  it('applies best per SKU', async () => {
    await mount();
    act(() => actions!.toggleHwType(SOLO_KEY));
    expect([...activeHwTypes]).toEqual([SOLO_KEY]);

    act(() => actions!.setBestPerSku(true));

    expect(bestPerSku).toBe(true);
    expect([...activeHwTypes].toSorted()).toEqual(ALL_KEYS);
  });

  it('applies a preset named in the URL', async () => {
    window.history.replaceState(null, '', '/infx/inference?preset=kimi-k3-launch');
    await mount();
    await settle(() => selectedModel === Model.Kimi_K3 && chartReady());

    expect(activePresetId).toBe('kimi-k3-launch');
    expect(selectedModel).toBe(Model.Kimi_K3);
    expect(window.location.search).toBe('');
  });
});
