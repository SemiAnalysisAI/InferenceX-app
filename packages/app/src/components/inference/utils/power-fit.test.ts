import { describe, expect, it } from 'vitest';
import type { InferenceData } from '../types';
import {
  buildPowerFits,
  MIN_FIT_POINTS,
  ordinaryLeastSquares,
  outputRatePerAllocatedGpu,
} from './power-fit';

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
  it('recovers an exact line and its observed range', () => {
    const fit = ordinaryLeastSquares([20, 50, 100, 260].map((x) => ({ x, y: 235 + 0.97 * x })));
    expect(fit!.intercept).toBeCloseTo(235, 9);
    expect(fit!.slope).toBeCloseTo(0.97, 9);
    expect(fit!.rSquared).toBeCloseTo(1, 12);
    expect(fit).toMatchObject({ n: 4, xMin: 20, xMax: 260 });
  });

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

  it('has no line without throughput variance and no R² without power variance', () => {
    expect(
      ordinaryLeastSquares([
        { x: 5, y: 1 },
        { x: 5, y: 2 },
      ]),
    ).toBeNull();
    expect(ordinaryLeastSquares([])).toBeNull();
    const flat = ordinaryLeastSquares([1, 2, 3].map((x) => ({ x, y: 400 })));
    expect(flat).toMatchObject({ slope: 0, intercept: 400, rSquared: null });
  });
});

describe('outputRatePerAllocatedGpu', () => {
  it('keeps aggregated per-GPU output and spreads disaggregated output over every GPU', () => {
    expect(outputRatePerAllocatedGpu(point({ output_tput_per_gpu: 42 }))).toBe(42);
    // Fixed-sequence disagg rows report output per decode GPU: 4 × 100 ÷ (4 + 4).
    expect(
      outputRatePerAllocatedGpu(
        point({ disagg: true, num_prefill_gpu: 4, num_decode_gpu: 4, output_tput_per_gpu: 100 }),
      ),
    ).toBe(50);
    expect(
      outputRatePerAllocatedGpu(
        point({ disagg: true, num_prefill_gpu: 4, num_decode_gpu: 16, output_tput_per_gpu: 25 }),
      ),
    ).toBe(20);
    // AgentX disagg throughput semantics are not verifiable in-app.
    expect(
      outputRatePerAllocatedGpu(
        point({
          disagg: true,
          benchmark_type: 'agentic_traces',
          num_prefill_gpu: 4,
          num_decode_gpu: 4,
        }),
      ),
    ).toBeUndefined();
    expect(outputRatePerAllocatedGpu(point({ output_tput_per_gpu: 0 }))).toBeUndefined();
  });
});

describe('buildPowerFits', () => {
  it('fits each source on its own observations', () => {
    const h200 = ladder([20, 60, 120, 260], (x) => 235 + 0.97 * x);
    const b200 = ladder([40, 200, 600, 930], (x) => 454 + 0.44 * x, {
      hwKey: 'b200_sglang',
      run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/35317697106/attempts/1',
    });
    const fits = buildPowerFits([...b200, ...h200]);
    expect(fits).toHaveLength(2);
    const byHw = Object.fromEntries(fits.map((fit) => [fit.observations[0].point.hwKey, fit]));
    expect(byHw.h200_sglang.fit!.intercept).toBeCloseTo(235, 9);
    expect(byHw.h200_sglang.fit!.slope).toBeCloseTo(0.97, 9);
    expect(byHw.b200_sglang.fit!.intercept).toBeCloseTo(454, 9);
    expect(byHw.b200_sglang.fit).toMatchObject({ n: 4, xMin: 40, xMax: 930 });
    // Rated TDP from the hardware registry, for reading P0 ÷ TDP.
    expect(byHw.h200_sglang.tdpWatts).toBe(700);
    expect(byHw.b200_sglang.tdpWatts).toBe(1000);
  });

  it(`requires ${MIN_FIT_POINTS} distinct throughputs and keeps the observations it could not fit`, () => {
    const two = ladder([20, 60], (x) => 235 + x);
    const [fit] = buildPowerFits(two);
    expect(fit).toMatchObject({ fit: null, reason: 'too-few-points' });
    expect(fit.observations.map((observation) => observation.x)).toEqual([20, 60]);
  });

  it('skips rows without measured power and sources with nothing measured', () => {
    const measured = ladder([20, 60, 120], (x) => 300 + x);
    const unmeasured = ladder([30, 90, 150], () => 0, {
      hwKey: 'b300_sglang',
      run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/31756025413/attempts/1',
    }).map(({ measuredAvgPower: _measured, ...rest }) => rest as InferenceData);
    const fits = buildPowerFits([...measured, ...unmeasured]);
    expect(fits).toHaveLength(1);
    expect(fits[0].observations).toHaveLength(3);
  });

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
