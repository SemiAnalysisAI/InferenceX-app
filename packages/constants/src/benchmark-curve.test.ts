import { describe, expect, it } from 'vitest';
import { benchmarkCurveScope, type BenchmarkCurveInput } from './benchmark-curve';

const agg: BenchmarkCurveInput = {
  model: 'glm5.2',
  hardware: 'gb300',
  framework: 'dynamo-trt',
  precision: 'fp4',
  benchmark_type: 'agentic_traces',
  isl: null,
  osl: null,
  spec_method: 'mtp',
  disagg: false,
  offload_mode: 'off',
};

describe('benchmarkCurveScope', () => {
  it('replaces AgentX curves across topology, speculative decoding and offload choices', () => {
    expect(benchmarkCurveScope(agg)).toBe(
      benchmarkCurveScope({
        ...agg,
        disagg: true,
        spec_method: 'none',
        offload_mode: 'on',
      }),
    );
  });
  it.each([
    { model: 'dsv4' },
    { hardware: 'gb200' },
    { framework: 'sglang' },
    { precision: 'fp8' },
    { benchmark_type: 'single_turn', isl: 1024, osl: 1024 },
  ])('keeps a separate replacement scope for %j', (change) => {
    expect(benchmarkCurveScope(agg)).not.toBe(benchmarkCurveScope({ ...agg, ...change }));
  });
  it.each([{ disagg: true }, { offload_mode: 'on' }, { spec_method: 'none' }, { isl: 8192 }])(
    'preserves fixed-sequence distinctions for %j',
    (change) => {
      const fixed = { ...agg, benchmark_type: 'single_turn', isl: 1024, osl: 1024 };
      expect(benchmarkCurveScope(fixed)).not.toBe(benchmarkCurveScope({ ...fixed, ...change }));
    },
  );
});
