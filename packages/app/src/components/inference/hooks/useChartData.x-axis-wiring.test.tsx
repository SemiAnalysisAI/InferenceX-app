// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import { Model, Sequence } from '@/lib/data-mappings';
import { resolveScatterXAxisScale } from '@/components/inference/utils/x-axis-scale';
import { processOverlayChartData } from '@/components/inference/utils';
import { transformBenchmarkRows } from '@/lib/benchmark-transform';
import { buildReplayTimeline } from '@/components/inference/replay/buildReplayTimeline';

const mocks = vi.hoisted(() => ({
  rows: [] as BenchmarkRow[],
  loading: false,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueries: () => [],
  useQuery: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/hooks/api/use-benchmarks', () => ({
  benchmarkQueryOptions: vi.fn(),
  useBenchmarks: () => ({
    data: mocks.rows,
    isLoading: mocks.loading,
    error: null,
  }),
}));

import { useChartData, type XAxisMode } from './useChartData';

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

function prefillEnergyRow(conc: number, interactivity: number, medianTtft?: number): BenchmarkRow {
  return {
    ...row(conc, 0),
    hardware: 'b200',
    framework: 'dynamo-sglang',
    model: 'dsv4',
    precision: 'fp4',
    disagg: true,
    is_multinode: true,
    prefill_num_workers: 1,
    decode_num_workers: 1,
    isl: 8192,
    osl: 1024,
    metrics: {
      tput_per_gpu: 450,
      input_tput_per_gpu: 400,
      median_intvty: interactivity,
      median_e2el: 12,
      ...(medianTtft === undefined ? {} : { median_ttft: medianTtft }),
      prefill_avg_power_w: 380,
      prefill_joules_per_input_token: 0.2,
      power_valid: 1,
    },
    date: '2026-09-01',
  };
}

let container: HTMLDivElement;
let root: Root;
let result: ReturnType<typeof useChartData> | undefined;

function Probe({
  mode,
  energy = false,
  statistic = 'median',
  metric = energy ? 'y_measuredPrefillJPerInputToken' : 'y_inputTputPerGpu',
}: {
  mode?: XAxisMode;
  statistic?: 'mean' | 'median';
  energy?: boolean;
  metric?: string;
}) {
  result = useChartData(
    energy ? Model.DeepSeek_V4_Pro : Model.DeepSeek_R1,
    energy ? Sequence.EightK_OneK : Sequence.OneK_OneK,
    [energy ? 'fp4' : 'fp8'],
    metric,
    'p90_ttft',
    energy ? 'p90_ttft' : null,
    [],
    [],
    { startDate: '', endDate: '' },
    null,
    null,
    null,
    'normalized',
    undefined,
    true,
    undefined,
    'p90',
    null,
    undefined,
    undefined,
    mode,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    statistic,
  );
  return null;
}

beforeEach(() => {
  mocks.rows = [row(8, 0.5), row(16, 20)];
  mocks.loading = false;
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
  it.each([
    ['interactivity', 'interactivity', 'mean_tpot_intvty', 25, 'Mean Interactivity'],
    ['ttft', 'e2e', 'mean_ttft', 8, 'Mean Time To First Token'],
    ['e2e', 'e2e', 'mean_e2el', 30, 'Mean End-to-end Latency'],
  ] as const)(
    'keeps official, overlay and replay mean %s numerically aligned',
    (mode, chartType, field, expectedX, label) => {
      mocks.rows[0].metrics = {
        ...mocks.rows[0].metrics,
        mean_tpot: 0.04,
        mean_intvty: 777,
        mean_ttft: 8,
        mean_e2el: 30,
      };
      mocks.rows[1].metrics = { ...mocks.rows[1].metrics, mean_intvty: 888 };
      act(() => root.render(<Probe mode={mode} statistic="mean" metric="y_tpPerGpu" />));
      const graph = result!.graphs.find((g) => g.chartDefinition.chartType === chartType)!;
      expect(graph.chartDefinition.x_scale_field).toBe(field);
      expect(graph.chartDefinition.x_label).toContain(label);
      expect(graph.chartDefinition.heading).toContain(label);
      expect(graph.data.map((point) => point.x)).toEqual([expectedX]);
      expect(graph.data[0].mean_intvty).toBe(777);
      const { chartData } = transformBenchmarkRows(mocks.rows);
      const overlay = processOverlayChartData(
        chartData[chartType === 'interactivity' ? 0 : 1],
        chartType,
        'y_tpPerGpu',
        null,
        {
          selectedXAxisMode: mode,
          fixedSequenceStatistic: 'mean',
        },
      );
      expect(overlay.map((point) => point.x)).toEqual([expectedX]);
      const replay = buildReplayTimeline(mocks.rows, graph.chartDefinition, 'y_tpPerGpu', null, [
        'fp8',
      ]);
      expect(replay.configs.map((series) => series.template.x)).toEqual([expectedX]);
    },
  );

  it('uses observed concurrency, preserves every point and removes preference directions', () => {
    act(() => root.render(<Probe mode="concurrency" />));
    for (const graph of result!.graphs) {
      expect(graph.data.map((point) => point.x)).toEqual([8, 16]);
      expect(graph.chartDefinition.x_scale_field).toBe('conc');
      expect(graph.chartDefinition.x_label).toBe('Concurrency');
      expect(graph.chartDefinition.x_labelZh).toBe('并发数');
      expect(graph.chartDefinition.y_inputTputPerGpu_roofline).toBeUndefined();
      expect(graph.clippedData).toEqual([]);
    }
  });

  it.each([
    ['interactivity', 'interactivity', 'median_intvty'],
    ['ttft', 'e2e', 'median_ttft'],
  ] as const)(
    'preserves resolved empty %s graphs for unofficial-only data after loading',
    (mode, chartType, xField) => {
      mocks.rows = [];
      act(() => root.render(<Probe mode={mode} energy />));

      expect(result?.loading).toBe(false);
      const graph = result?.graphs.find(
        (candidate) => candidate.chartDefinition.chartType === chartType,
      );
      expect(graph).toMatchObject({
        data: [],
        clippedData: [],
        chartDefinition: { x_scale_field: xField },
      });
    },
  );

  it('keeps graphs absent while the first benchmark request is loading', () => {
    mocks.rows = [];
    mocks.loading = true;
    act(() => root.render(<Probe mode="ttft" energy />));

    expect(result?.loading).toBe(true);
    expect(result?.graphs).toEqual([]);
  });

  it('keeps Interactivity when switching prefill watts to input-token energy with a stale P90 override', () => {
    mocks.rows = [prefillEnergyRow(32, 68, 1.5), prefillEnergyRow(64, 55, 2)];
    act(() =>
      root.render(<Probe mode="interactivity" energy metric="y_measuredPrefillAvgPower" />),
    );
    const powerGraph = result?.graphs.find(
      (candidate) => candidate.chartDefinition.chartType === 'interactivity',
    );
    expect(powerGraph?.data.map((point) => point.x)).toEqual([68, 55]);

    act(() => root.render(<Probe mode="interactivity" energy />));
    const energyGraph = result?.graphs.find(
      (candidate) => candidate.chartDefinition.chartType === 'interactivity',
    );
    expect(energyGraph?.data.map((point) => [point.x, point.y])).toEqual([
      [68, 0.2],
      [55, 0.2],
    ]);
    expect(energyGraph?.chartDefinition).toMatchObject({
      x_scale_field: 'median_intvty',
      x_label: 'Median Interactivity (tok/s/user)',
      heading: 'vs. Median Interactivity',
      y_measuredPrefillJPerInputToken_roofline: 'lower_right',
    });
    if (!energyGraph) throw new Error('useChartData did not produce the interactivity graph');
    const replay = buildReplayTimeline(
      mocks.rows,
      energyGraph.chartDefinition,
      'y_measuredPrefillJPerInputToken',
      'p90_ttft',
      ['fp4'],
    );
    expect(replay.domain.x).toEqual([55, 68]);
    expect(replay.configs.map((config) => config.template.x)).toEqual([68, 55]);
  });

  it('uses measured median TTFT in explicit TTFT mode and omits rows without it', () => {
    mocks.rows = [prefillEnergyRow(32, 68, 1.5), prefillEnergyRow(64, 55)];
    act(() => root.render(<Probe mode="ttft" energy />));
    const graph = result?.graphs.find((candidate) => candidate.chartDefinition.chartType === 'e2e');
    expect(graph?.data.map((point) => [point.conc, point.x, point.y])).toEqual([[32, 1.5, 0.2]]);
    expect(graph?.clippedData).toEqual([]);
    expect(graph?.chartDefinition).toMatchObject({
      x_scale_field: 'median_ttft',
      x_label: 'Median Time To First Token (s)',
      heading: 'vs. Median Time To First Token',
      y_measuredPrefillJPerInputToken_roofline: 'lower_left',
    });
    if (!graph) throw new Error('useChartData did not produce the TTFT graph');
    const replay = buildReplayTimeline(
      mocks.rows,
      graph.chartDefinition,
      'y_measuredPrefillJPerInputToken',
      'p90_ttft',
      ['fp4'],
    );
    expect(replay.configs.map((config) => [config.template.conc, config.template.x])).toEqual([
      [32, 1.5],
    ]);
  });

  it('uses measured E2E latency when E2E mode supersedes the legacy P90 override', () => {
    mocks.rows = [prefillEnergyRow(32, 68, 1.5), prefillEnergyRow(64, 55)];
    act(() => root.render(<Probe mode="e2e" energy />));
    const graph = result?.graphs.find((candidate) => candidate.chartDefinition.chartType === 'e2e');
    expect(graph?.data.map((point) => point.x)).toEqual([12, 12]);
    expect(graph?.chartDefinition).toMatchObject({
      x_scale_field: 'median_e2el',
      x_label: 'Median End-to-end Latency (s)',
      heading: 'vs. Median End-to-end Latency',
    });
  });

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
