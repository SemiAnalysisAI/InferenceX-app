import { describe, expect, it } from 'vitest';
import type { InferenceData } from '../types';
import {
  buildEqualServiceComparison,
  equalServiceSourceKey,
  getEqualServiceSources,
} from './equal-service-comparison';

const metric = (y: number) => ({ y, roof: false });
function point(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    x: 20,
    y: 500,
    hwKey: 'b200_sglang',
    date: '2026-09-23',
    tp: 4,
    physicalChips: 4,
    precision: 'fp8',
    conc: 8,
    run_url: 'https://example.invalid/runs/1',
    model: 'qwen3.5',
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    decode_tp: 4,
    mean_intvty: 20,
    output_tput_per_gpu: 50,
    measuredAvgPower: metric(400),
    measuredJPerOutputToken: metric(10),
    tpPerGpu: metric(50),
    tpPerMw: metric(50),
    costh: metric(1),
    costr: metric(1),
    costhi: metric(1),
    costri: metric(1),
    ...overrides,
  };
}
const a = [
  point({ id: 1 }),
  point({
    id: 2,
    mean_intvty: 60,
    conc: 1,
    measuredAvgPower: metric(800),
    output_tput_per_gpu: 150,
    measuredJPerOutputToken: metric(30),
  }),
];
const b = [
  point({
    id: 3,
    hwKey: 'b300_sglang',
    run_url: 'https://example.invalid/runs/2',
    measuredAvgPower: metric(800),
    output_tput_per_gpu: 100,
    measuredJPerOutputToken: metric(8),
  }),
  point({
    id: 4,
    hwKey: 'b300_sglang',
    run_url: 'https://example.invalid/runs/2',
    mean_intvty: 60,
    conc: 1,
    measuredAvgPower: metric(1000),
    output_tput_per_gpu: 200,
    measuredJPerOutputToken: metric(16),
  }),
];
const options = {
  baseline: equalServiceSourceKey(a[0]),
  comparator: equalServiceSourceKey(b[0]),
  target: 40,
  xField: 'mean_intvty' as const,
};

describe('equal-service comparison', () => {
  it('interpolates each raw quantity first, retains endpoints, and uses one percentage sign convention', () => {
    const result = buildEqualServiceComparison([...a, ...b], options);
    expect(result.metrics.meanWattsPerGpu).toMatchObject({
      baseline: { value: 600, interpolated: true },
      comparator: { value: 900 },
      changePercent: 50,
    });
    expect(result.metrics.outputTokensPerSecond).toMatchObject({
      baseline: { value: 400 },
      comparator: { value: 600 },
      changePercent: 50,
    });
    expect(result.metrics.joulesPerOutputToken).toMatchObject({
      baseline: { value: 20 },
      comparator: { value: 12 },
      changePercent: -40,
    });
    expect(
      result.metrics.meanWattsPerGpu.baseline?.endpoints.map(({ point: p }) => [
        p.id,
        p.conc,
        p.run_url,
      ]),
    ).toEqual([
      [1, 8, a[0].run_url],
      [2, 1, a[1].run_url],
    ]);
    // Interpolating the endpoint percentages instead would incorrectly give 62.5%.
    expect(result.metrics.meanWattsPerGpu.changePercent).not.toBe(62.5);
  });

  it('does not skip a missing interior measurement or turn it into zero', () => {
    const gap = point({ id: 5, mean_intvty: 40, measuredAvgPower: undefined });
    const result = buildEqualServiceComparison([...a, gap, ...b], { ...options, target: 50 });
    expect(result.metrics.meanWattsPerGpu).toMatchObject({
      baseline: null,
      changePercent: null,
      reason: 'missing-metric',
    });
    expect(result.metrics.outputTokensPerSecond.changePercent).not.toBeNull();
  });

  it('scales aggregate output by physical chips, but PD output by decode GPUs only', () => {
    const aggregate = point({ physicalChips: 8, tp: 2 });
    const pd = point({
      hwKey: 'gb200',
      disagg: true,
      physicalChips: 8,
      num_prefill_gpu: 4,
      num_decode_gpu: 4,
    });
    const result = buildEqualServiceComparison([aggregate, pd], {
      ...options,
      baseline: equalServiceSourceKey(aggregate),
      comparator: equalServiceSourceKey(pd),
      target: 20,
    });
    expect(result.metrics.outputTokensPerSecond).toMatchObject({
      baseline: { value: 400 },
      comparator: { value: 200 },
      changePercent: -50,
    });
    const invalid = { ...pd, num_decode_gpu: 0 };
    expect(
      buildEqualServiceComparison([aggregate, invalid], {
        ...options,
        baseline: equalServiceSourceKey(aggregate),
        comparator: equalServiceSourceKey(invalid),
        target: 20,
      }).metrics.outputTokensPerSecond.reason,
    ).toBe('missing-metric');
  });

  it('labels sources by hardware and date, adding only the details that tell them apart', () => {
    const sources = getEqualServiceSources([
      point({ id: 1 }),
      point({ id: 2, physicalChips: 8, decode_tp: 8 }),
      point({ id: 3, run_url: 'https://example.invalid/runs/3' }),
      point({ id: 4, hwKey: 'b300_sglang', run_url: 'https://example.invalid/runs/2' }),
    ]);
    expect(sources.map((source) => source.label)).toEqual([
      'B200 (SGLang) · 2026-09-23 · Single-node · GPU4 · TP4 · EP? · Run #1',
      'B200 (SGLang) · 2026-09-23 · Single-node · GPU8 · TP8 · EP?',
      'B200 (SGLang) · 2026-09-23 · Single-node · GPU4 · TP4 · EP? · Run #3',
      'B300 (SGLang) · 2026-09-23',
    ]);
  });
});
