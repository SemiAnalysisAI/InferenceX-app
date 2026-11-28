// @test-environment jsdom
import { DISPLAY_MODEL_TO_DB, scenarioToIslOsl } from '@semianalysisai/inferencex-constants';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as NextNavigation from 'next/navigation';
import { setTimeout as sleep } from 'node:timers/promises';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, mock } from 'bun:test';
import { stubGlobal, unstubAllGlobals } from '@/test/helpers';

import { InferenceProvider, useInferenceActions } from '@/components/inference/InferenceContext';
import { EngineComparisonConflictNotice } from '@/components/inference/ui/engine-comparison-conflict-notice';
import type { InferenceActionsContextType } from '@/components/inference/types';
import { EphemeralUrlStateContext } from '@/hooks/useUrlState';
import type { AvailabilityRow } from '@/lib/api/api';
import { compactAvailability } from '@/lib/benchmarks/compact-availability';
import { Model, Precision, Scenario } from '@/lib/catalog/data-mappings';
import {
  GlobalFilterProvider,
  useGlobalFilterActions,
  useGlobalFilterSelection,
} from '@/providers/GlobalFilterContext';
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

// DeepSeek-V4-Pro runs vLLM and SGLang on B300 for 1k/1k, which shares a graph across engines,
// and for 8k/1k, which keeps one engine family per SKU.
const AVAILABILITY = compactAvailability(
  [Scenario.OneK_OneK, Scenario.EightK_OneK].flatMap((scenario) =>
    ['vllm', 'sglang'].map((framework): AvailabilityRow => ({
      model: DISPLAY_MODEL_TO_DB[Model.DeepSeek_V4_Pro]![0]!,
      precision: 'fp4',
      hardware: 'b300',
      framework,
      spec_method: 'none',
      disagg: false,
      date: '2026-06-12',
      ...scenarioToIslOsl(scenario)!,
      benchmark_type: 'fixed',
    })),
  ),
);

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
let setScenario: ((scenario: Scenario) => void) | null = null;
let scenario: Scenario | null = null;

function Probe() {
  actions = useInferenceActions();
  setScenario = useGlobalFilterActions().setSelectedScenario;
  scenario = useGlobalFilterSelection().effectiveScenario;
  return <EngineComparisonConflictNotice />;
}

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

async function settle(until: () => boolean): Promise<void> {
  for (let pass = 0; pass < 50 && !until(); pass++) await act(() => sleep(0));
}

const notice = () => document.querySelector('[data-testid="engine-comparison-conflict-notice"]');

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

describe('engine conflict notice for a reader GPU comparison', () => {
  it('explains the drop when a sequence switch splits GPUs the reader picked', async () => {
    act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <EphemeralUrlStateContext.Provider value>
            <GlobalFilterProvider
              initialModel={Model.DeepSeek_V4_Pro}
              initialScenario={Scenario.OneK_OneK}
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
    await settle(() => scenario === Scenario.OneK_OneK && fetchMock.mock.calls.length > 0);

    act(() => actions!.setSelectedGPUs(['b300_vllm', 'b300_sglang']));
    await settle(() => false);
    expect(notice()).toBeNull();

    act(() => setScenario!(Scenario.EightK_OneK));
    await settle(() => notice() !== null);
    expect(notice()?.textContent).toContain('SGLang');
  });
});
