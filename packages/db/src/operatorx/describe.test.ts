import { describe, expect, it } from 'vitest';

import { touchedExperts, usefulBytes, usefulFlops } from './describe';

const operand = (dtype: string, group: number[], isStatic: boolean) => ({
  dtype,
  scale: { dtype: 'ue8m0', group, static: isStatic },
});

/** DeepSeek-V4.1-Flash routed MoE case as stored by OperatorX, before any `parallel` split. */
function v41Flash(
  tokens: number,
  parallel?: Record<string, number | undefined>,
): Record<string, unknown> {
  return {
    activation: { kind: 'silu', limit: 10 },
    experts: {
      a1: operand('e4m3', [1, 32], false),
      a2: operand('e4m3', [1, 32], false),
      inter: 2304,
      num: 384,
      top_k: 6,
      w1: operand('e2m1', [1, 32], true),
      w2: operand('e2m1', [1, 32], true),
    },
    hidden: 5120,
    ...(parallel ? { parallel } : {}),
    routing: { distribution: 'natural', seed: 0 },
    shared: {
      a1: operand('e4m3', [1, 32], false),
      count: 1,
      inter: 2304,
      w1: operand('e4m3', [32, 32], true),
      w2: operand('e4m3', [32, 32], true),
    },
    tokens,
  };
}

const gemm = (parallel?: Record<string, number>) => ({
  m: 128,
  n: 4096,
  k: 7168,
  a: { dtype: 'e4m3', input: 'bf16' },
  b: { dtype: 'e4m3' },
  out: 'bf16',
  ...(parallel ? { parallel } : {}),
});

describe('OperatorX useful FLOPs and bytes', () => {
  it('keeps the single-device MoE counts unchanged', () => {
    // Values the comparison projection stored for T=8 before sharding was accounted for.
    expect(usefulFlops('moe', v41Flash(8))).toBe(3_995_074_560);
    expect(usefulBytes('moe', v41Flash(8))).toBeCloseTo(894_111_531.7199546, 3);
  });

  it.each<{ tp: number; ep?: number }>([{ tp: 2 }, { tp: 8 }, { ep: 4, tp: 4 }, { ep: 8, tp: 8 }])(
    'gives each of the tp devices 1/tp of the node work for %o',
    (parallel) => {
      const whole = v41Flash(256);
      const split = v41Flash(256, { ...parallel });
      expect(usefulFlops('moe', split)).toBeCloseTo(usefulFlops('moe', whole)! / parallel.tp, 3);
      expect(usefulBytes('moe', split)).toBeCloseTo(usefulBytes('moe', whole)! / parallel.tp, 3);
    },
  );

  it('counts every dp group batch, then divides over tp x dp devices', () => {
    // `tokens` is each dp group's batch, so 8 dp groups route 8 x 256 tokens through the node.
    const split = v41Flash(256, { dp: 8, ep: 8 });
    const node = v41Flash(256 * 8);
    expect(usefulFlops('moe', split)).toBeCloseTo(usefulFlops('moe', node)! / 8, 3);
    expect(usefulBytes('moe', split)).toBeCloseTo(usefulBytes('moe', node)! / 8, 3);
  });

  it('keeps the measured B300 EP8/TP8 case under the 8 TB/s bandwidth roof', () => {
    // B300 run 36460294156: T=256, ep=8, tp=8 measured at 260.096 us. Counting the whole
    // node implied 27.4 TB/s on one 8 TB/s device, which drew it above the roofline.
    const latencyUs = 260.09601354599;
    const tbs = usefulBytes('moe', v41Flash(256, { ep: 8, tp: 8 }))! / (latencyUs * 1e6);
    expect(tbs).toBeGreaterThan(3);
    expect(tbs).toBeLessThan(8);
  });

  it('divides tensor-parallel GEMM counts by tp', () => {
    expect(usefulFlops('gemm', gemm({ tp: 4 }))).toBe(usefulFlops('gemm', gemm())! / 4);
    expect(usefulBytes('gemm', gemm({ tp: 4 }))).toBe(usefulBytes('gemm', gemm())! / 4);
  });

  it.each<Record<string, unknown>>([{ tp: 0 }, { tp: 2.5 }, { dp: -1 }, { tp: '2' }])(
    'returns no count for a malformed split %o',
    (parallel) => {
      const args = { ...v41Flash(8), parallel };
      expect(usefulFlops('moe', args)).toBeNull();
      expect(usefulBytes('moe', args)).toBeNull();
    },
  );

  it('returns no count for an unsupported op', () => {
    expect(usefulFlops('attention', { tokens: 8 })).toBeNull();
    expect(usefulBytes('attention', { tokens: 8 })).toBeNull();
  });
});

const zipf = (s: number) => ({ distribution: { kind: 'zipf', s }, seed: 0 });

describe('OperatorX touched experts by routing distribution', () => {
  it('keeps the uniform estimate for natural routing and a missing routing block', () => {
    const uniform = 384 * (1 - (1 - 6 / 384) ** 256);
    expect(touchedExperts(384, 6, 256, { distribution: 'natural', seed: 0 })).toBeCloseTo(
      uniform,
      9,
    );
    expect(touchedExperts(384, 6, 256, undefined)).toBeCloseTo(uniform, 9);
  });

  it('spreads balanced routing over min(E, T x k) experts', () => {
    expect(touchedExperts(384, 6, 8, { distribution: 'balanced' })).toBe(48);
    expect(touchedExperts(384, 6, 256, { distribution: 'balanced' })).toBe(384);
  });

  it('counts the single-hot expert once plus k-1 uniform picks from the rest', () => {
    expect(touchedExperts(256, 8, 1, { distribution: 'single_hot' })).toBeCloseTo(8, 9);
    const rest = 255 * (1 - (1 - 7 / 255) ** 64);
    expect(touchedExperts(256, 8, 64, { distribution: 'single_hot' })).toBeCloseTo(1 + rest, 9);
  });

  // Means of 20 seeded simulations of upstream's sampler (torch.multinomial without
  // replacement, p ~ 1/rank^s). The estimate may err high by up to 2%, never low.
  it.each([
    { e: 512, k: 10, t: 256, s: 1.2, simulated: 355.9 },
    { e: 512, k: 10, t: 8, s: 1.2, simulated: 47.1 },
    { e: 384, k: 6, t: 256, s: 1, simulated: 290.1 },
    { e: 256, k: 8, t: 64, s: 1.5, simulated: 96 },
    { e: 384, k: 6, t: 2048, s: 1.2, simulated: 380.5 },
  ])('matches simulated zipf routing for E=$e top$k T=$t s=$s', ({ e, k, t, s, simulated }) => {
    const estimate = touchedExperts(e, k, t, zipf(s))!;
    expect(estimate).toBeGreaterThanOrEqual(simulated * 0.995);
    expect(estimate).toBeLessThanOrEqual(simulated * 1.02);
  });

  it('touches exactly k experts for one zipf token', () => {
    expect(touchedExperts(256, 8, 1, zipf(1.2))).toBeCloseTo(8, 6);
  });

  it('returns no count for a malformed zipf distribution', () => {
    expect(touchedExperts(384, 6, 8, { distribution: { kind: 'zipf' } })).toBeNull();
    expect(touchedExperts(384, 6, 8, { distribution: { kind: 'pareto', s: 1 } })).toBeNull();
  });

  it('counts far fewer experts for the Qwen3.5 zipf s=1.2 case than uniform routing', () => {
    // Uniform routing assumed ~509 of 512 experts touched at T=256; zipf s=1.2 touches
    // ~356, so the old count overstated bytes and drew the point 9% above the roofline.
    const uniform = touchedExperts(512, 10, 256, { distribution: 'natural' })!;
    const skewed = touchedExperts(512, 10, 256, zipf(1.2))!;
    expect(skewed / uniform).toBeLessThan(0.72);
  });
});
