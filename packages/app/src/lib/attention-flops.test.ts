import { describe, expect, it } from 'vitest';

import {
  attentionFlopsPerComputedToken,
  sumComputedTokens,
  sumContexts,
  type AttentionCostSpec,
  type RequestLengthMoments,
} from './attention-flops';

/** Build exact moments from raw (ISL, OSL) pairs. */
function momentsOf(pairs: [number, number][]): RequestLengthMoments {
  return {
    n: pairs.length,
    sumIsl: pairs.reduce((s, [p]) => s + p, 0),
    sumIslSq: pairs.reduce((s, [p]) => s + p * p, 0),
    sumOsl: pairs.reduce((s, [, o]) => s + o, 0),
    sumOslSq: pairs.reduce((s, [, o]) => s + o * o, 0),
    sumIslOsl: pairs.reduce((s, [p, o]) => s + p * o, 0),
  };
}

/**
 * Brute-force reference: enumerate every computed token's context. A request
 * (P, O) at rate r computes its suffix at contexts r·P+1 … P, then decodes at
 * P+1 … P+O. Use rates where r·P is an integer so enumeration is exact.
 */
function bruteForceContexts(pairs: [number, number][], rate: number): number[] {
  const contexts: number[] = [];
  for (const [p, o] of pairs) {
    const cached = rate * p;
    for (let t = cached + 1; t <= p + o; t++) contexts.push(t);
  }
  return contexts;
}

describe('sumContexts / sumComputedTokens', () => {
  it('matches brute-force enumeration at rate 0', () => {
    const pairs: [number, number][] = [
      [4, 2],
      [10, 3],
      [1, 1],
    ];
    const contexts = bruteForceContexts(pairs, 0);
    const m = momentsOf(pairs);
    expect(sumContexts(m, 0)).toBe(contexts.reduce((a, b) => a + b, 0));
    expect(sumComputedTokens(m, 0)).toBe(contexts.length);
  });

  it('matches brute-force enumeration at rate 0.5 (integer cached prefixes)', () => {
    const pairs: [number, number][] = [
      [4, 2],
      [10, 3],
      [100, 7],
    ];
    const contexts = bruteForceContexts(pairs, 0.5);
    const m = momentsOf(pairs);
    expect(sumContexts(m, 0.5)).toBe(contexts.reduce((a, b) => a + b, 0));
    expect(sumComputedTokens(m, 0.5)).toBe(contexts.length);
  });

  it('reduces to decode-only sums at rate 1', () => {
    const pairs: [number, number][] = [
      [4, 2],
      [10, 3],
    ];
    const contexts = bruteForceContexts(pairs, 1);
    const m = momentsOf(pairs);
    expect(sumContexts(m, 1)).toBe(contexts.reduce((a, b) => a + b, 0));
    expect(sumComputedTokens(m, 1)).toBe(contexts.length);
  });
});

describe('attentionFlopsPerComputedToken', () => {
  const pairs: [number, number][] = [
    [4, 2],
    [10, 3],
  ];
  const m = momentsOf(pairs);

  it('prices a pure linear spec exactly (per-context coefficient)', () => {
    const spec: AttentionCostSpec = {
      groups: [{ label: 'dense', layers: 5, linPerCtx: 1000 }],
    };
    const contexts = bruteForceContexts(pairs, 0.5);
    const expected = (5 * 1000 * contexts.reduce((a, b) => a + b, 0)) / contexts.length;
    expect(attentionFlopsPerComputedToken(spec, m, 0.5)).toBeCloseTo(expected, 8);
  });

  it('prices a constant spec independently of context', () => {
    const spec: AttentionCostSpec = {
      groups: [{ label: 'linear-attn', layers: 3, constPerToken: 7 }],
    };
    expect(attentionFlopsPerComputedToken(spec, m, 0)).toBeCloseTo(21, 10);
    expect(attentionFlopsPerComputedToken(spec, m, 0.5)).toBeCloseTo(21, 10);
  });

  it('saturates capped terms at cap × tokens when every context exceeds the cap', () => {
    // Single request with a long prompt: all computed contexts are > 2.
    const big = momentsOf([[100, 10]]);
    const spec: AttentionCostSpec = {
      groups: [{ label: 'window', layers: 2, capped: { coeff: 10, cap: 2 } }],
    };
    const nTokens = sumComputedTokens(big, 0);
    expect(attentionFlopsPerComputedToken(spec, big, 0)).toBeCloseTo(
      (2 * 10 * 2 * nTokens) / nTokens,
      10,
    );
  });

  it('falls back to Σctx for capped terms when every context is under the cap', () => {
    const spec: AttentionCostSpec = {
      groups: [{ label: 'budget', layers: 1, capped: { coeff: 4, cap: 1_000_000 } }],
    };
    const contexts = bruteForceContexts(pairs, 0);
    const expected = (4 * contexts.reduce((a, b) => a + b, 0)) / contexts.length;
    expect(attentionFlopsPerComputedToken(spec, m, 0)).toBeCloseTo(expected, 8);
  });

  it('combines linear + capped + constant groups additively', () => {
    const spec: AttentionCostSpec = {
      groups: [
        { label: 'a', layers: 2, linPerCtx: 3 },
        { label: 'b', layers: 1, capped: { coeff: 5, cap: 4 } },
        { label: 'c', layers: 4, constPerToken: 11 },
      ],
    };
    const nTokens = sumComputedTokens(m, 0);
    const ctx = sumContexts(m, 0);
    const expected = (2 * 3 * ctx + 5 * Math.min(4 * nTokens, ctx) + 4 * 11 * nTokens) / nTokens;
    expect(attentionFlopsPerComputedToken(spec, m, 0)).toBeCloseTo(expected, 8);
  });

  it('returns null for invalid rates, empty moments, and zero computed tokens', () => {
    const spec: AttentionCostSpec = { groups: [{ label: 'x', layers: 1, linPerCtx: 1 }] };
    expect(attentionFlopsPerComputedToken(spec, m, -0.1)).toBeNull();
    expect(attentionFlopsPerComputedToken(spec, m, 1.1)).toBeNull();
    expect(attentionFlopsPerComputedToken(spec, m, Number.NaN)).toBeNull();
    expect(attentionFlopsPerComputedToken(spec, momentsOf([]), 0.5)).toBeNull();
    // rate 1 with zero output tokens → nothing is computed.
    expect(attentionFlopsPerComputedToken(spec, momentsOf([[10, 0]]), 1)).toBeNull();
  });
});
