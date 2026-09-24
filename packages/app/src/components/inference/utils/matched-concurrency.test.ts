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

  it('marks a load one source did not measure instead of borrowing a neighbour', () => {
    const table = buildMatchedConcurrencyTable([...baseline, ...comparator], options);
    const c4 = table.rows.find((row) => row.concurrency === 4)!;
    expect(c4.baseline.status).toBe('observed');
    expect(c4.comparator.status).toBe('missing');
    expect(c4.changePercent).toEqual({
      joulesPerOutputToken: null,
      meanWattsPerGpu: null,
      interactivity: null,
    });
    const c128 = table.rows.find((row) => row.concurrency === 128)!;
    expect(c128.baseline.status).toBe('missing');
  });

  it('keeps a missing metric null while still comparing the metrics both sides measured', () => {
    const noEnergy = mi355x(1, 13.271, 412, 128.1, 11);
    delete noEnergy.measuredJPerOutputToken;
    const table = buildMatchedConcurrencyTable([baseline[0], noEnergy], options);
    expect(table.rows[0].comparator).toMatchObject({
      status: 'observed',
      values: { joulesPerOutputToken: null },
    });
    expect(table.rows[0].changePercent.joulesPerOutputToken).toBeNull();
    expect(table.rows[0].changePercent.meanWattsPerGpu).toBeCloseTo(2.49, 2);
  });

  it('refuses to pick between conflicting observations of one source at one load', () => {
    const repeat = b200(1, 9.5, 410, 180, 3);
    const table = buildMatchedConcurrencyTable([...baseline, repeat, ...comparator], options);
    const c1 = table.rows[0];
    expect(c1.baseline.status).toBe('ambiguous');
    expect(c1.baseline.status === 'ambiguous' && c1.baseline.points.map((p) => p.id)).toEqual([
      1, 3,
    ]);
    expect(c1.changePercent.joulesPerOutputToken).toBeNull();
    const duplicate = { ...baseline[0], id: 4 };
    const agreed = buildMatchedConcurrencyTable([...baseline, duplicate, ...comparator], options);
    expect(agreed.rows[0].baseline.status).toBe('observed');
  });

  it('ignores power-comparison clones, hidden rows and non-positive loads', () => {
    const clone = {
      ...b200(8, 1, 1000, 100, 5),
      powerVariant: { kind: 'basis', id: 'gpu-provisioned' },
    } as InferenceData;
    const hidden = { ...b200(16, 2, 600, 80, 6), hidden: true };
    const zero = b200(0, 2, 600, 80, 7);
    const table = buildMatchedConcurrencyTable(
      [...baseline, clone, hidden, zero, ...comparator],
      options,
    );
    expect(table.rows.map((row) => row.concurrency)).toEqual([1, 4, 128]);
  });

  it('reports why no table exists for one or unknown sources', () => {
    expect(
      buildMatchedConcurrencyTable(baseline, { ...options, comparator: options.baseline }),
    ).toMatchObject({ reason: 'same-source', rows: [] });
    expect(
      buildMatchedConcurrencyTable(baseline, { ...options, comparator: 'missing' }),
    ).toMatchObject({ reason: 'unknown-source', rows: [] });
  });

  it('reads streaming speed from the selected statistic field', () => {
    const median = buildMatchedConcurrencyTable(
      [
        { ...baseline[0], median_intvty: 190 },
        { ...comparator[0], median_intvty: 133 },
      ],
      { ...options, interactivityField: 'median_intvty' },
    );
    expect(median.rows[0].baseline).toMatchObject({ values: { interactivity: 190 } });
    expect(median.rows[0].changePercent.interactivity).toBeCloseTo(-30, 1);
  });
});
