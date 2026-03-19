import { describe, it, expect, vi } from 'vitest';

import type { AggDataEntry, InferenceData } from '@/components/inference/types';
import { createChartDataPoint } from '@/lib/chart-utils';
import { computeEnergyFields } from '@/lib/utils';

vi.mock('@/lib/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/constants')>();
  return {
    ...actual,
    HARDWARE_CONFIG: {
      ...actual.HARDWARE_CONFIG,
      h100: {
        name: 'H100',
        label: 'H100',
        suffix: '',
        gpu: 'H100',
        color: '#00ff00',
      },
      b200: {
        name: 'B200',
        label: 'B200',
        suffix: '',
        gpu: 'B200',
        color: '#0000ff',
      },
    },
    getHardwareConfig: vi.fn((key: string) => {
      const configs: Record<
        string,
        { name: string; label: string; suffix: string; gpu: string; color: string }
      > = {
        h100: { name: 'H100', label: 'H100', suffix: '', gpu: 'H100', color: '#00ff00' },
        b200: { name: 'B200', label: 'B200', suffix: '', gpu: 'B200', color: '#0000ff' },
      };
      return (
        configs[key] ?? {
          name: 'Unknown',
          label: 'Unknown',
          suffix: '',
          gpu: 'Unknown',
          color: '#888',
        }
      );
    }),
    getGpuSpecs: vi.fn((key: string) => {
      const specs: Record<string, { power: number; costh: number; costn: number; costr: number }> =
        {
          h100: { power: 1.73, costh: 2.8, costn: 1.4, costr: 0.7 },
          b200: { power: 2.17, costh: 3.5, costn: 1.75, costr: 0.88 },
        };
      const base = key.split(/[-_]/)[0];
      return specs[base] ?? { power: 1.73, costh: 2.8, costn: 1.4, costr: 0.7 };
    }),
  };
});

// ---------------------------------------------------------------------------
// minimal fixture factory
// ---------------------------------------------------------------------------
function makeEntry(overrides: Partial<AggDataEntry> = {}): AggDataEntry {
  return {
    hw: 'H100',
    hwKey: 'h100' as any,
    tp: 8,
    conc: 128,
    model: 'llama-3.1-405b',
    framework: 'trt',
    precision: 'fp8',
    tput_per_gpu: 5000,
    output_tput_per_gpu: 4000,
    input_tput_per_gpu: 1000,
    mean_ttft: 0.5,
    median_ttft: 0.4,
    std_ttft: 0.1,
    p99_ttft: 0.8,
    mean_tpot: 0.02,
    mean_intvty: 45,
    median_tpot: 0.02,
    median_intvty: 44,
    std_tpot: 0.005,
    std_intvty: 5,
    p99_tpot: 0.03,
    p99_intvty: 60,
    mean_itl: 0.01,
    median_itl: 0.01,
    std_itl: 0.002,
    p99_itl: 0.015,
    mean_e2el: 5,
    median_e2el: 4.8,
    std_e2el: 0.5,
    p99_e2el: 6,
    disagg: false,
    num_prefill_gpu: 0,
    num_decode_gpu: 0,
    spec_decoding: 'none',
    date: '2024-01-15',
    ...overrides,
  };
}

function makeInferenceData(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    date: '2024-01-15',
    x: 1,
    y: 5000,
    tp: 8,
    conc: 128,
    hwKey: 'h100',
    precision: 'fp8',
    tpPerGpu: { y: 5000, roof: false },
    tpPerMw: { y: 50, roof: false },
    costh: { y: 1, roof: false },
    costn: { y: 1, roof: false },
    costr: { y: 1, roof: false },
    costhi: { y: 1, roof: false },
    costni: { y: 1, roof: false },
    costri: { y: 1, roof: false },
    ...overrides,
  };
}

// ===========================================================================
// createChartDataPoint — energy fields
// ===========================================================================
describe('createChartDataPoint — energy fields (Joules per token)', () => {
  it('calculates jTotal = (power_kW * 1000) / tput_per_gpu', () => {
    const entry = makeEntry({ tput_per_gpu: 5000 });
    const point = createChartDataPoint(
      '2024-01-15',
      entry,
      'median_intvty',
      'tput_per_gpu',
      'h100',
    );

    // H100 power = 1.73 kW → 1730 W
    // J/tok = 1730 / 5000 = 0.346
    expect(point.jTotal).toBeDefined();
    expect(point.jTotal!.y).toBeCloseTo(0.346, 3);
    expect(point.jTotal!.roof).toBe(false);
  });

  it('calculates jOutput = (power_kW * 1000) / output_tput_per_gpu', () => {
    const entry = makeEntry({ output_tput_per_gpu: 4000 });
    const point = createChartDataPoint(
      '2024-01-15',
      entry,
      'median_intvty',
      'tput_per_gpu',
      'h100',
    );

    // J/tok = 1730 / 4000 = 0.4325
    expect(point.jOutput).toBeDefined();
    expect(point.jOutput!.y).toBeCloseTo(0.4325, 4);
  });

  it('calculates jInput = (power_kW * 1000) / input_tput_per_gpu', () => {
    const entry = makeEntry({ input_tput_per_gpu: 1000 });
    const point = createChartDataPoint(
      '2024-01-15',
      entry,
      'median_intvty',
      'tput_per_gpu',
      'h100',
    );

    // J/tok = 1730 / 1000 = 1.73
    expect(point.jInput).toBeDefined();
    expect(point.jInput!.y).toBeCloseTo(1.73, 2);
  });

  it('omits jOutput when output_tput_per_gpu is 0', () => {
    const entry = makeEntry({ output_tput_per_gpu: 0 });
    const point = createChartDataPoint(
      '2024-01-15',
      entry,
      'median_intvty',
      'tput_per_gpu',
      'h100',
    );

    expect(point.jOutput).toBeUndefined();
  });

  it('omits jInput when input_tput_per_gpu is 0', () => {
    const entry = makeEntry({ input_tput_per_gpu: 0 });
    const point = createChartDataPoint(
      '2024-01-15',
      entry,
      'median_intvty',
      'tput_per_gpu',
      'h100',
    );

    expect(point.jInput).toBeUndefined();
  });

  it('sets jTotal to 0 when tput_per_gpu is 0 (zero throughput)', () => {
    const entry = makeEntry({ tput_per_gpu: 0 });
    const point = createChartDataPoint(
      '2024-01-15',
      entry,
      'median_intvty',
      'tput_per_gpu',
      'h100',
    );

    expect(point.jTotal!.y).toBe(0);
  });

  it('produces higher J/tok for lower throughput (inverse relationship)', () => {
    const entryHigh = makeEntry({ tput_per_gpu: 10000 });
    const entryLow = makeEntry({ tput_per_gpu: 2000 });
    const pointHigh = createChartDataPoint(
      '2024-01-15',
      entryHigh,
      'median_intvty',
      'tput_per_gpu',
      'h100',
    );
    const pointLow = createChartDataPoint(
      '2024-01-15',
      entryLow,
      'median_intvty',
      'tput_per_gpu',
      'h100',
    );

    // Lower throughput should have higher J/tok
    expect(pointLow.jTotal!.y).toBeGreaterThan(pointHigh.jTotal!.y);
  });

  it('uses correct power for different hardware (B200 vs H100)', () => {
    const entry = makeEntry({ tput_per_gpu: 5000 });
    const pointH100 = createChartDataPoint(
      '2024-01-15',
      entry,
      'median_intvty',
      'tput_per_gpu',
      'h100',
    );
    const pointB200 = createChartDataPoint(
      '2024-01-15',
      entry,
      'median_intvty',
      'tput_per_gpu',
      'b200',
    );

    // B200 power = 2.17 kW → 2170 W; J/tok = 2170 / 5000 = 0.434
    // H100 power = 1.73 kW → 1730 W; J/tok = 1730 / 5000 = 0.346
    expect(pointB200.jTotal!.y).toBeGreaterThan(pointH100.jTotal!.y);
    expect(pointB200.jTotal!.y).toBeCloseTo(0.434, 3);
  });
});

// ===========================================================================
// computeEnergyFields — runtime fallback for historical data
// ===========================================================================
describe('computeEnergyFields', () => {
  it('computes jTotal for data missing energy fields', () => {
    const data = [makeInferenceData({ tpPerGpu: { y: 5000, roof: false } })];
    const result = computeEnergyFields(data);

    // power = 1.73 kW → 1730 W; J/tok = 1730 / 5000 = 0.346
    expect(result[0].jTotal).toBeDefined();
    expect(result[0].jTotal!.y).toBeCloseTo(0.346, 3);
  });

  it('computes jOutput and jInput when throughput data is available', () => {
    const data = [
      makeInferenceData({
        tpPerGpu: { y: 5000, roof: false },
        outputTputPerGpu: { y: 4000, roof: false },
        inputTputPerGpu: { y: 1000, roof: false },
      }),
    ];
    const result = computeEnergyFields(data);

    expect(result[0].jOutput).toBeDefined();
    expect(result[0].jOutput!.y).toBeCloseTo(0.4325, 4);
    expect(result[0].jInput).toBeDefined();
    expect(result[0].jInput!.y).toBeCloseTo(1.73, 2);
  });

  it('does not overwrite existing energy fields', () => {
    const data = [
      makeInferenceData({
        jTotal: { y: 99.99, roof: true },
      }),
    ];
    const result = computeEnergyFields(data);

    expect(result[0].jTotal!.y).toBe(99.99);
    expect(result[0].jTotal!.roof).toBe(true);
  });

  it('does not add jOutput/jInput when throughput data is unavailable', () => {
    const data = [
      makeInferenceData({
        tpPerGpu: { y: 5000, roof: false },
        // No outputTputPerGpu or inputTputPerGpu
      }),
    ];
    const result = computeEnergyFields(data);

    expect(result[0].jTotal).toBeDefined();
    expect(result[0].jOutput).toBeUndefined();
    expect(result[0].jInput).toBeUndefined();
  });

  it('handles empty array', () => {
    const result = computeEnergyFields([]);
    expect(result).toEqual([]);
  });

  it('processes multiple data points independently', () => {
    const data = [
      makeInferenceData({ tpPerGpu: { y: 5000, roof: false } }),
      makeInferenceData({ tpPerGpu: { y: 10000, roof: false } }),
    ];
    const result = computeEnergyFields(data);

    // 1730 / 5000 = 0.346, 1730 / 10000 = 0.173
    expect(result[0].jTotal!.y).toBeCloseTo(0.346, 3);
    expect(result[1].jTotal!.y).toBeCloseTo(0.173, 3);
  });

  it('sets jTotal to 0 when throughput is 0', () => {
    const data = [makeInferenceData({ tpPerGpu: { y: 0, roof: false } })];
    const result = computeEnergyFields(data);

    expect(result[0].jTotal!.y).toBe(0);
  });
});
