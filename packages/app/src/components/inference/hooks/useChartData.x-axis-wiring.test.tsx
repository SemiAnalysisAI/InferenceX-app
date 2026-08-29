// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { Model, Sequence } from '@/lib/data-mappings';
import { resolveScatterXAxisScale } from '@/components/inference/utils/x-axis-scale';
import { buildReplayTimeline } from '@/components/inference/replay/buildReplayTimeline';

const mocks = vi.hoisted(() => ({
  rows: [] as BenchmarkRow[],
}));

vi.mock('@tanstack/react-query', () => ({ useQueries: () => [] }));
vi.mock('@/hooks/api/use-benchmarks', () => ({
  benchmarkQueryOptions: vi.fn(),
  useBenchmarks: () => ({
    data: mocks.rows,
    isLoading: false,
    error: null,
  }),
}));

import { useChartData } from './useChartData';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function row(conc: number, p90Ttft: number): BenchmarkRow {
  return {
    id: conc,
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
    isl: 1024,
    osl: 1024,
    conc,
    image: 'example.invalid/inference:fixture',
    metrics: {
      tput_per_gpu: 450,
      input_tput_per_gpu: 50,
      median_intvty: 12.5,
      median_e2el: 2.3,
      p90_ttft: p90Ttft,
    },
    date: '2026-03-01',
    run_url: null,
  } as BenchmarkRow;
}

let container: HTMLDivElement;
let root: Root;
let result: ReturnType<typeof useChartData> | undefined;

function Probe() {
  result = useChartData(
    Model.DeepSeek_R1,
    Sequence.OneK_OneK,
    ['fp8'],
    'y_inputTputPerGpu',
    'p90_ttft',
    null,
    [],
    [],
    { startDate: '', endDate: '' },
    null,
    null,
    null,
    'normalized',
  );
  return null;
}

beforeEach(() => {
  mocks.rows = [row(8, 0.5), row(16, 20)];
  result = undefined;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useChartData x-axis scale wiring', () => {
  it('publishes the resolved TTFT field for both live and Replay auto-scale paths', () => {
    act(() => root.render(<Probe />));

    const graph = result?.graphs.find(
      (candidate) => candidate.chartDefinition.chartType === 'interactivity',
    );
    expect(graph).toBeDefined();
    if (!graph) throw new Error('useChartData did not produce the interactivity graph');
    expect(graph.data.map((point) => point.x).toSorted((a, b) => a - b)).toEqual([0.5, 20]);

    const resolvedField = graph.chartDefinition.x_scale_field;
    expect(resolvedField).toBe('p90_ttft');

    const liveExtent = [
      Math.min(...graph.data.map((point) => point.x)),
      Math.max(...graph.data.map((point) => point.x)),
    ] as const;
    const replay = buildReplayTimeline(
      mocks.rows,
      graph.chartDefinition,
      'y_inputTputPerGpu',
      'p90_ttft',
      ['fp8'],
    );
    expect(replay.domain.x).toEqual([0.5, 20]);

    for (const [path, extent] of [
      ['live', liveExtent],
      ['replay', replay.domain.x],
    ] as const) {
      expect(
        resolveScatterXAxisScale({
          extent,
          selectedYAxisMetric: 'y_inputTputPerGpu',
          xAxisField: resolvedField ?? '',
          scaleType: 'auto',
        }),
        path,
      ).toBe('log');
    }
  });
});
