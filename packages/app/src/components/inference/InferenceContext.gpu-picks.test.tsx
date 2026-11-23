// @test-environment jsdom
import { DISPLAY_MODEL_TO_DB, sequenceToIslOsl } from '@semianalysisai/inferencex-constants';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as NextNavigation from 'next/navigation';
import { setTimeout as sleep } from 'node:timers/promises';
import { act } from 'react';
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
import type { AvailabilityRow } from '@/lib/api/api';
import { compactAvailability } from '@/lib/benchmarks/compact-availability';
import { Model, Precision, Sequence } from '@/lib/catalog/data-mappings';
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
  useUnofficialRun: () => ({ availableModelsAndSequences: [] }),
}));

// 8k/1k asks before comparing vLLM with SGLang on one chip. On 1k/1k, DeepSeek V4 Pro keeps one
// engine per chip among MTP runs, with no consent to ask for.
const row = (sequence: Sequence, framework: string, specMethod: string): AvailabilityRow => ({
  model: DISPLAY_MODEL_TO_DB[Model.DeepSeek_V4_Pro]![0]!,
  precision: 'fp4',
  hardware: 'b300',
  framework,
  spec_method: specMethod,
  disagg: false,
  date: '2026-06-12',
  ...sequenceToIslOsl(sequence)!,
  benchmark_type: 'fixed',
});
const AVAILABILITY = compactAvailability([
  row(Sequence.EightK_OneK, 'vllm', 'none'),
  row(Sequence.EightK_OneK, 'sglang', 'none'),
  row(Sequence.OneK_OneK, 'vllm', 'mtp'),
  row(Sequence.OneK_OneK, 'trt', 'mtp'),
]);

const fetchMock = vi.fn((input: string) => {
  const path = new URL(input, 'http://localhost').pathname;
  if (path === '/api/v1/availability/compact') return Promise.resolve(Response.json(AVAILABILITY));
  if (path === '/api/v1/workflow-info') {
    return Promise.resolve(
      Response.json({ runs: [], changelogs: [], configs: [], runConfigs: [] }),
    );
  }
  return Promise.resolve(Response.json([]));
});

let actions: InferenceActionsContextType | null = null;
let selectedGPUs: string[] = [];
let availableGPUs: string[] = [];

function Probe() {
  actions = useInferenceActions();
  selectedGPUs = useInferenceFilters().selectedGPUs;
  availableGPUs = useInferenceData().availableGPUs.map((gpu) => gpu.value);
  return null;
}

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

async function settle(until: () => boolean): Promise<void> {
  for (let pass = 0; pass < 50 && !until(); pass++) await act(() => sleep(0));
}

async function mount(sequence: Sequence) {
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <EphemeralUrlStateContext.Provider value>
          <GlobalFilterProvider
            initialModel={Model.DeepSeek_V4_Pro}
            initialSequence={sequence}
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
  await settle(() => availableGPUs.length === 2);
}

function pick(gpus: string[]): boolean {
  let applied = false;
  act(() => {
    applied = actions!.setSelectedGPUs(gpus);
  });
  return applied;
}

beforeEach(() => {
  stubGlobal('fetch', fetchMock);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  window.history.replaceState(null, '', '/infx/inference');
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  client.clear();
  unstubAllGlobals();
});

// A false result keeps the GPU select from showing picks the app does not commit as given.
describe('setSelectedGPUs result', () => {
  it('accepts a pick it commits as given', async () => {
    await mount(Sequence.EightK_OneK);
    expect(pick(['b300_vllm'])).toBe(true);
    expect(selectedGPUs).toEqual(['b300_vllm']);
  });

  it('rejects a pick that waits for engine-comparison consent', async () => {
    await mount(Sequence.EightK_OneK);
    pick(['b300_vllm']);
    expect(pick(['b300_vllm', 'b300_sglang'])).toBe(false);
    expect(selectedGPUs).toEqual(['b300_vllm']);
  });

  it('rejects a pick blocked by another engine on the same chip', async () => {
    await mount(Sequence.OneK_OneK);
    pick(['b300_vllm_mtp']);
    expect(pick(['b300_vllm_mtp', 'b300_trt_mtp'])).toBe(false);
    expect(selectedGPUs).toEqual(['b300_vllm_mtp']);
  });

  it('rejects a pick the engine rules rewrite', async () => {
    await mount(Sequence.OneK_OneK);
    // Two engines on one chip at once: the clear-all policy keeps neither.
    expect(pick(['b300_vllm_mtp', 'b300_trt_mtp'])).toBe(false);
    expect(selectedGPUs).toEqual([]);
  });
});
