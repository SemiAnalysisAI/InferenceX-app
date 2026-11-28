// @test-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, mock } from 'bun:test';

import type { BenchmarkRow } from '@/lib/api/api';
import { Model, Scenario } from '@/lib/catalog/data-mappings';

const mockFetchBenchmarks = vi.fn();
const actual = { ...(await import('@/lib/api/api')) };
mock.module('@/lib/api/api', () => ({
  ...actual,
  fetchBenchmarks: mockFetchBenchmarks,
}));

import { useChartData } from './useChartData';
import { loadSystemPowerModeler } from '@/lib/power/system-power-modeler';

// The chart waits for the lazily loaded power model, so load it before rendering the hook.
await loadSystemPowerModeler();

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function row(id: number, isl: number, osl: number, conc: number): BenchmarkRow {
  return {
    id,
    hardware: 'h200',
    framework: 'trt',
    model: 'dsr1',
    precision: 'fp8',
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
    isl,
    osl,
    conc,
    image: 'example.invalid/inference:fixture',
    metrics: {
      tput_per_gpu: 450,
      input_tput_per_gpu: 50,
      median_intvty: 12.5,
      median_e2el: 2.3,
      p90_ttft: 0.5,
    },
    date: '2026-03-01',
    run_url: null,
  } as BenchmarkRow;
}

// The latest key holds every sequence. 8k/1k is the provisional default, 1k/1k the resolved one.
const DEFAULT_SCENARIO_CONC = 64;
const RESOLVED_SCENARIO_CONC = 8;
const LATEST_ROWS = [
  row(1, 8192, 1024, DEFAULT_SCENARIO_CONC),
  row(2, 1024, 1024, RESOLVED_SCENARIO_CONC),
];

type ChartDataResult = ReturnType<typeof useChartData>;
const renders: ChartDataResult[] = [];

/** Mirrors InferenceProvider's wiring before and after availability resolves the sequence. */
function Probe({ scenarioResolved }: { scenarioResolved: boolean }) {
  renders.push(
    useChartData(
      Model.DeepSeek_R1,
      scenarioResolved ? Scenario.OneK_OneK : Scenario.EightK_OneK,
      ['fp8'],
      'y_tpPerGpu',
      null,
      null,
      [],
      [],
      { startDate: '', endDate: '' },
      null,
      null,
      null,
      'normalized',
      undefined,
      scenarioResolved,
      undefined,
      'p90',
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      !scenarioResolved,
    ),
  );
  return null;
}

let root: Root;
let client: QueryClient;

function render(scenarioResolved: boolean) {
  root.render(
    createElement(QueryClientProvider, { client }, createElement(Probe, { scenarioResolved })),
  );
}

beforeEach(() => {
  renders.length = 0;
  mockFetchBenchmarks.mockResolvedValue(LATEST_ROWS);
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
  client.clear();
  vi.clearAllMocks();
});

describe('useChartData while the sequence is unresolved', () => {
  it('fetches the latest rows but renders none of them for the provisional sequence', async () => {
    act(() => render(false));
    await act(() => client.getQueryCache().find({ queryKey: ['benchmarks'] })?.promise);

    expect(mockFetchBenchmarks).toHaveBeenCalledOnce();
    expect(renders.flatMap((result) => result.selectionPoints.map((point) => point.conc))).toEqual(
      [],
    );
    expect(renders.at(-1)!.loading).toBe(true);

    act(() => render(true));

    const resolved = renders.at(-1)!;
    expect(mockFetchBenchmarks).toHaveBeenCalledOnce();
    expect(resolved.loading).toBe(false);
    expect(resolved.selectionPoints.map((point) => point.conc)).toEqual([RESOLVED_SCENARIO_CONC]);
  });
});
