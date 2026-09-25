import { describe, expect, it } from 'vitest';
import type { InferenceData } from '../types';
import { buildPowerFits, ordinaryLeastSquares } from './power-fit';

const metric = (y: number) => ({ y, roof: false });
function point(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    x: 100,
    y: 1,
    hwKey: 'h200_sglang',
    date: '2026-09-18',
    tp: 8,
    physicalChips: 8,
    precision: 'fp8',
    conc: 1,
    run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/28719990565/attempts/1',
    model: 'Qwen-3.5-397B-A17B',
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    decode_tp: 8,
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
const ladder = (throughputs: number[], watts: (x: number) => number, base = {}) =>
  throughputs.map((x, index) =>
    point({
      id: index + 1,
      conc: 2 ** index,
      output_tput_per_gpu: x,
      measuredAvgPower: metric(watts(x)),
      ...base,
    }),
  );

describe('ordinaryLeastSquares', () => {
  it('reports R² below one for scattered observations', () => {
    const fit = ordinaryLeastSquares([
      { x: 1, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 7 },
    ]);
    // Least squares: slope 2.5, intercept -1, residuals (0.5, -1, 0.5) → SSres 1.5, SStot 14.
    expect(fit!.slope).toBeCloseTo(2.5, 12);
    expect(fit!.intercept).toBeCloseTo(-1, 12);
    expect(fit!.rSquared).toBeCloseTo(1 - 1.5 / 14, 12);
  });
});

describe('buildPowerFits', () => {
  it('fits disaggregated sources on output per allocated GPU', () => {
    const gb200 = ladder([100, 300, 500], () => 0, {
      hwKey: 'gb200_dynamo-sglang',
      disagg: true,
      num_prefill_gpu: 4,
      num_decode_gpu: 4,
    }).map((entry) => ({
      ...entry,
      measuredAvgPower: metric(307 + 0.7 * (entry.output_tput_per_gpu! / 2)),
    }));
    const [fit] = buildPowerFits(gb200);
    expect(fit.observations.map((observation) => observation.x)).toEqual([50, 150, 250]);
    expect(fit.fit!.intercept).toBeCloseTo(307, 9);
    expect(fit.fit!.slope).toBeCloseTo(0.7, 9);
  });
});
