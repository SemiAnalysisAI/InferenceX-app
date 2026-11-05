// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BenchmarkRow } from '@/lib/api/api';
import { Model, Sequence } from '@/lib/catalog/data-mappings';

const { mockFetchBenchmarks } = vi.hoisted(() => ({ mockFetchBenchmarks: vi.fn() }));
vi.mock(import('@/lib/api/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  fetchBenchmarks: mockFetchBenchmarks,
}));
vi.mock(import('@/lib/benchmarks/supplemental-benchmarks'), async (importOriginal) => ({
  ...(await importOriginal()),
  withSupplementalBenchmarks: (rows: BenchmarkRow[]) => rows,
}));

import { useChartData } from './useChartData';

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
const DEFAULT_SEQUENCE_CONC = 64;
const RESOLVED_SEQUENCE_CONC = 8;
const LATEST_ROWS = [
  row(1, 8192, 1024, DEFAULT_SEQUENCE_CONC),
  row(2, 1024, 1024, RESOLVED_SEQUENCE_CONC),
];

type ChartDataResult = ReturnType<typeof useChartData>;
const renders: ChartDataResult[] = [];

/** Mirrors InferenceProvider's wiring before and after availability resolves the sequence. */
function Probe({ sequenceResolved }: { sequenceResolved: boolean }) {
  renders.push(
    useChartData(
      Model.DeepSeek_R1,
      sequenceResolved ? Sequence.OneK_OneK : Sequence.EightK_OneK,
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
      sequenceResolved,
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
      !sequenceResolved,
    ),
  );
  return null;
}

let root: Root;
let client: QueryClient;

function render(sequenceResolved: boolean) {
  root.render(
    createElement(QueryClientProvider, { client }, createElement(Probe, { sequenceResolved })),
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
    expect(resolved.selectionPoints.map((point) => point.conc)).toEqual([RESOLVED_SEQUENCE_CONC]);
  });
});
