import { describe, expect, it } from 'vitest';
import type { InferenceData } from '../types';
import { equalServiceSourceKey } from './equal-service-comparison';
import { buildMatchedConcurrencyTable } from './matched-concurrency';

const metric = (y: number) => ({ y, roof: false });
function point(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    x: 100,
    y: 1,
    hwKey: 'b200_sglang',
    date: '2026-09-18',
    tp: 4,
    physicalChips: 4,
    precision: 'fp8',
    conc: 1,
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/35317697106/attempts/1',
    model: 'Qwen-3.5-397B-A17B',
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    decode_tp: 4,
    output_tput_per_gpu: 50,
    tpPerGpu: metric(50),
    tpPerMw: metric(50),
    costh: metric(1),
    costr: metric(1),
    costhi: metric(1),
    costri: metric(1),
    ...overrides,
  };
}
// PowerX Figure 6 values (B200 / MI355X, TP4, three-dispatch means).
const b200 = (conc: number, joules: number, watts: number, speed: number, id: number) =>
  point({
    id,
    conc,
    mean_tpot_intvty: speed,
    measuredJPerOutputToken: metric(joules),
    measuredAvgPower: metric(watts),
  });
const mi355x = (conc: number, joules: number, watts: number, speed: number, id: number) =>
  point({
    id,
    conc,
    hwKey: 'mi355x_sglang',
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/33348766792/attempts/2',
    mean_tpot_intvty: speed,
    measuredJPerOutputToken: metric(joules),
    measuredAvgPower: metric(watts),
  });
const baseline = [b200(1, 9.065, 402, 186.9, 1), b200(4, 3.87, 507, 141.2, 2)];
const comparator = [mi355x(1, 13.271, 412, 128.1, 11), mi355x(128, 1.311, 869, 22.1, 12)];
const options = {
  baseline: equalServiceSourceKey(baseline[0]),
  comparator: equalServiceSourceKey(comparator[0]),
  interactivityField: 'mean_tpot_intvty' as const,
};

describe('matched-concurrency table', () => {
  it('pairs observed rows by concurrency with one signed change convention', () => {
    const table = buildMatchedConcurrencyTable([...baseline, ...comparator], options);
    expect(table.reason).toBeUndefined();
    expect(table.rows.map((row) => row.concurrency)).toEqual([1, 4, 128]);
    const [first] = table.rows;
    expect(first.baseline).toMatchObject({
      status: 'observed',
      values: { joulesPerOutputToken: 9.065, meanWattsPerGpu: 402, interactivity: 186.9 },
    });
    expect(first.changePercent.joulesPerOutputToken).toBeCloseTo(46.4, 1);
    expect(first.changePercent.meanWattsPerGpu).toBeCloseTo(2.49, 2);
    expect(first.changePercent.interactivity).toBeCloseTo(-31.46, 2);
  });
});
