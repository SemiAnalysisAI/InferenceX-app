import { describe, expect, it } from 'vitest';

import type { BenchmarkRow } from '@/lib/api';
import type { ChartDefinition } from '@/components/inference/types';

import { buildReplayTimeline, computeStepDomain } from '../buildReplayTimeline';

const ALL_HW = () => true;

const interactivityChartDef: ChartDefinition = {
  chartType: 'interactivity',
  heading: 'vs. Interactivity',
  x: 'median_intvty',
  x_label: 'Interactivity (tok/s/user)',
  y: 'tput_per_gpu',
  y_label: 'Token Throughput per GPU',
  y_tpPerGpu_title: 'Token Throughput per GPU',
} as unknown as ChartDefinition;

const baseRow = (overrides: Partial<BenchmarkRow>): BenchmarkRow =>
  ({
    hardware: 'h100',
    framework: 'trt',
    model: 'DeepSeek-R1-0528',
    precision: 'fp4',
    spec_method: 'none',
    disagg: false,
    is_multinode: false,
    prefill_tp: 0,
    prefill_ep: 0,
    prefill_dp_attention: false,
    prefill_num_workers: 0,
    decode_tp: 8,
    decode_ep: 0,
    decode_dp_attention: false,
    decode_num_workers: 0,
    num_prefill_gpu: 0,
    num_decode_gpu: 8,
    isl: 8192,
    osl: 1024,
    conc: 32,
    image: null,
    metrics: {
      tput_per_gpu: 1000,
      median_intvty: 50,
      median_ttft: 0.1,
      p99_ttft: 0.2,
    },
    date: '2025-01-01',
    run_url: null,
    ...overrides,
  }) as BenchmarkRow;

describe('buildReplayTimeline', () => {
  it('returns empty timeline for empty input', () => {
    const t = buildReplayTimeline([], interactivityChartDef, 'y_tpPerGpu', null, ['fp4']);
    expect(t.dates).toEqual([]);
    expect(t.configs).toEqual([]);
  });

  it('drops rows whose precision is not selected', () => {
    const rows = [baseRow({ precision: 'fp4' }), baseRow({ precision: 'fp8', date: '2025-01-02' })];
    const t = buildReplayTimeline(rows, interactivityChartDef, 'y_tpPerGpu', null, ['fp4']);
    expect(t.configs).toHaveLength(1);
    expect(t.dates).toEqual(['2025-01-01']);
  });

  it('groups rows by config_id and emits stepValues aligned to dates', () => {
    const rows = [
      baseRow({ date: '2025-03-01', metrics: { tput_per_gpu: 3000, median_intvty: 70 } }),
      baseRow({ date: '2025-01-01', metrics: { tput_per_gpu: 1000, median_intvty: 50 } }),
      baseRow({ date: '2025-02-01', metrics: { tput_per_gpu: 2000, median_intvty: 60 } }),
    ];
    const t = buildReplayTimeline(rows, interactivityChartDef, 'y_tpPerGpu', null, ['fp4']);
    expect(t.configs).toHaveLength(1);
    const series = t.configs[0];
    expect(t.dates).toEqual(['2025-01-01', '2025-02-01', '2025-03-01']);
    expect(series.stepValues).toHaveLength(3);
    expect(series.stepValues.map((s) => s.visible)).toEqual([true, true, true]);
    expect(series.stepValues.map((s) => s.y)).toEqual([1000, 2000, 3000]);
  });

  it('marks pre-appearance steps invisible and applies sticky-last after the final observation', () => {
    const rows = [
      baseRow({ date: '2025-01-01', metrics: { tput_per_gpu: 1000, median_intvty: 50 }, conc: 8 }),
      baseRow({ date: '2025-03-01', metrics: { tput_per_gpu: 1500, median_intvty: 55 }, conc: 8 }),
      baseRow({ date: '2025-02-01', metrics: { tput_per_gpu: 2000, median_intvty: 60 }, conc: 16 }),
    ];
    const t = buildReplayTimeline(rows, interactivityChartDef, 'y_tpPerGpu', null, ['fp4']);
    expect(t.dates).toEqual(['2025-01-01', '2025-02-01', '2025-03-01']);
    const c8 = t.configs.find((c) => c.configId.includes('|8|'));
    const c16 = t.configs.find((c) => c.configId.includes('|16|'));
    expect(c8?.stepValues.map((s) => s.visible)).toEqual([true, true, true]);
    expect(c8?.stepValues[1].y).toBe(1000); // sticky-last between step 0 and step 2
    expect(c16?.stepValues.map((s) => s.visible)).toEqual([false, true, true]);
    expect(c16?.stepValues[2].y).toBe(2000); // sticky-last after final observation
  });

  it('computeStepDomain returns a tight bounding box that grows as configs appear', () => {
    const rows = [
      baseRow({ date: '2025-01-01', metrics: { tput_per_gpu: 100, median_intvty: 10 }, conc: 8 }),
      baseRow({ date: '2025-02-01', metrics: { tput_per_gpu: 200, median_intvty: 20 }, conc: 8 }),
      baseRow({
        date: '2025-02-01',
        metrics: { tput_per_gpu: 5000, median_intvty: 200 },
        conc: 16,
      }),
    ];
    const t = buildReplayTimeline(rows, interactivityChartDef, 'y_tpPerGpu', null, ['fp4']);
    const d0 = computeStepDomain(t, 0, ALL_HW);
    const d1 = computeStepDomain(t, 1, ALL_HW);
    // Step 0: only the conc=8 config is visible. safeDomain pads degenerate
    // single-point domains, so we just check that the bounds fit a reasonable
    // window around the observation.
    expect(d0.x[0]).toBeLessThanOrEqual(10);
    expect(d0.x[1]).toBeGreaterThanOrEqual(10);
    expect(d0.x[1]).toBeLessThan(50);
    expect(d0.y[1]).toBeGreaterThanOrEqual(100);
    expect(d0.y[1]).toBeLessThan(500);
    // Step 1: both configs visible, so the domain stretches to fit the new one.
    expect(d1.x[1]).toBeGreaterThanOrEqual(200);
    expect(d1.y[1]).toBeGreaterThanOrEqual(5000);
  });

  it('computeStepDomain respects hwFilter and shrinks to selected hardware only', () => {
    const rows = [
      // h100 with low values
      baseRow({
        hardware: 'h100',
        framework: 'trt',
        date: '2025-01-01',
        metrics: { tput_per_gpu: 100, median_intvty: 10 },
      }),
      // mi355x with way smaller values
      baseRow({
        hardware: 'mi355x',
        framework: 'sglang',
        date: '2025-01-01',
        metrics: { tput_per_gpu: 50, median_intvty: 5 },
      }),
      // big-domain GPU on the same step
      baseRow({
        hardware: 'b200',
        framework: 'trt',
        date: '2025-01-01',
        metrics: { tput_per_gpu: 5000, median_intvty: 400 },
      }),
    ];
    const t = buildReplayTimeline(rows, interactivityChartDef, 'y_tpPerGpu', null, ['fp4']);
    const everything = computeStepDomain(t, 0, ALL_HW);
    const mi355xOnly = computeStepDomain(t, 0, (hw) => hw.startsWith('mi355x'));
    expect(everything.x[1]).toBeGreaterThanOrEqual(400);
    expect(mi355xOnly.x[1]).toBeLessThan(50); // padded around 5
  });

  it('separates configs that differ in concurrency or tp', () => {
    const rows = [
      baseRow({ conc: 32 }),
      baseRow({ conc: 64, date: '2025-01-02' }),
      baseRow({
        decode_tp: 4,
        date: '2025-01-03',
        metrics: { tput_per_gpu: 500, median_intvty: 30 },
      }),
    ];
    const t = buildReplayTimeline(rows, interactivityChartDef, 'y_tpPerGpu', null, ['fp4']);
    expect(t.configs.length).toBeGreaterThanOrEqual(2);
  });

  it('computes a global x/y domain spanning all observations', () => {
    const rows = [
      baseRow({ date: '2025-01-01', metrics: { tput_per_gpu: 100, median_intvty: 10 } }),
      baseRow({ date: '2025-02-01', metrics: { tput_per_gpu: 5000, median_intvty: 200 } }),
    ];
    const t = buildReplayTimeline(rows, interactivityChartDef, 'y_tpPerGpu', null, ['fp4']);
    expect(t.domain.x[0]).toBeLessThanOrEqual(10);
    expect(t.domain.x[1]).toBeGreaterThanOrEqual(200);
    expect(t.domain.y[0]).toBeLessThanOrEqual(100);
    expect(t.domain.y[1]).toBeGreaterThanOrEqual(5000);
  });

  it('drops rows with non-positive metric values', () => {
    const rows = [
      baseRow({ metrics: { tput_per_gpu: 0, median_intvty: 50 } }),
      baseRow({ date: '2025-01-02', metrics: { tput_per_gpu: 1000, median_intvty: 0 } }),
      baseRow({ date: '2025-01-03', metrics: { tput_per_gpu: 1000, median_intvty: 50 } }),
    ];
    const t = buildReplayTimeline(rows, interactivityChartDef, 'y_tpPerGpu', null, ['fp4']);
    expect(t.dates).toEqual(['2025-01-03']);
  });
});
