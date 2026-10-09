import { describe, expect, it } from 'vitest';
import { parseAgenticMemory } from './agentic-memory';
import vllm from './fixtures/agentic-memory-vllm.json';
import sglang from './fixtures/agentic-memory-sglang.json';

const profile =
  '(Worker_TP0 pid=123) Free memory on device (264.19/267.69 GiB) on startup. Actual usage is 205.08 GiB for weight, 3.75 GiB for peak activation, 1.63 GiB for non-torch memory, and 0.14 GiB for CUDAGraph memory. Current kv cache memory in use is 43.85 GiB.';
const parse = (text: string, framework = 'vllm', truncated = false) =>
  parseAgenticMemory(framework, [{ file: 'server.log', text, truncated }]);

describe('AgentX memory accounting', () => {
  it('reproduces the four actual B300 vLLM startup reports', () => {
    const ranks = parse(vllm.lines.join('\n'));
    expect(ranks).toHaveLength(4);
    for (const r of ranks) {
      expect(r.totalGiB).toBe(267.69);
      expect(r.gib.weights).toBe(205.08);
      expect(r.gib.kvPool).toBe(43.85);
      expect(r.gib.activations).toBe(3.75);
    }
  });
  it('preserves actual SGLang partial reporting instead of copying TP0 to other ranks', () => {
    const ranks = parse(sglang.lines.join('\n'), 'sglang');
    expect(ranks).toHaveLength(8);
    const rank0 = ranks.find((r) => r.rank === 'TP0')!;
    expect(rank0.gib.weights).toBeCloseTo(106.84);
    expect(rank0.gib.graphs).toBeCloseTo(0.31);
    expect(ranks.find((r) => r.rank === 'TP1')!.gib.graphs).toBe(0.19);
    expect(ranks.every((r) => r.gib.kvPool === null && r.totalGiB === null)).toBe(true);
  });
  it('uses actual vLLM bytes, not recommendation, free memory or tokens', () => {
    const [r] = parse(profile);
    expect(r!.gib).toEqual({
      weights: 205.08,
      kvPool: 43.85,
      activations: 3.75,
      nonTorch: 1.63,
      graphs: 0.14,
    });
    expect(r!.totalGiB).toBe(267.69);
    expect(r!.percent.weights).toBeCloseTo(76.610985);
    expect(parse('Available KV cache memory: 100 GiB\nGPU KV cache size: 999999 tokens')).toEqual(
      [],
    );
  });
  it('preserves zeros and strips ANSI', () => {
    const [r] = parse(`\u001B[32m${profile.replace('0.14 GiB', '0.00 GiB')}\u001B[0m`);
    expect(r!.gib.graphs).toBe(0);
    expect(r!.percent.graphs).toBe(0);
  });
  it('deduplicates identical profiles but refuses conflicting reprints', () => {
    expect(parse(`${profile}\n${profile}`)[0]!.gib.kvPool).toBe(43.85);
    expect(parse(`${profile}\n${profile.replace('43.85', '44.85')}`)[0]!.gib.kvPool).toBeNull();
  });
  it('does not combine ranks, hosts or worker lifetimes', () => {
    expect(parse(`${profile}\n${profile.replace('pid=123', 'pid=124')}`)).toHaveLength(2);
    expect(
      parseAgenticMemory(
        'vllm',
        ['a.log', 'b.log'].map((file) => ({ file, text: profile, truncated: false })),
      ),
    ).toHaveLength(2);
  });
  it('ignores a truncated final report and unsupported frameworks', () => {
    expect(parse(profile, 'vllm', true)).toEqual([]);
    expect(parse(profile, 'trtllm')).toEqual([]);
    expect(parse('')).toEqual([]);
  });
  it('sums SGLang target/draft deltas and distinct graph phases, never inventing HBM', () => {
    const [r] = parse(
      [
        '[2026-08-13 TP0] Load weight end. type=Main, avail mem=161.06 GB, mem usage=104.24 GB.',
        '[2026-08-13 TP0] Load weight end. type=Draft, avail mem=158.45 GB, mem usage=2.60 GB.',
        '[2026-08-13 TP0] Capture target verify CUDA graph end. elapsed=84 s, mem usage=0.19 GB',
        '[2026-08-13 TP0] Capture draft decode CUDA graph end. elapsed=7 s, mem usage=0.08 GB',
        '[2026-08-13 TP0] DSV4 memory calculation: available_bytes=126.57 GB',
      ].join('\n'),
      'sglang',
    );
    expect(r!.gib.weights).toBeCloseTo(106.84);
    expect(r!.gib.graphs).toBeCloseTo(0.27);
    expect(r!.weightBasis).toBe('load-delta');
    expect(r!.gib.kvPool).toBeNull();
    expect(r!.totalGiB).toBeNull();
    expect(r!.percent.weights).toBeNull();
  });
  it('handles MLA KV size and separate K/V buffers without counting virtual bounds', () => {
    const [r] = parse(
      [
        '[2026-08-13 DP0 TP1] Full KV Cache is allocated. dtype: fp8, #tokens: 100, K size: 20.00 GB, V size: 10.00 GB',
        '[2026-08-13 DP0 TP1] SWA KV Cache is allocated. dtype: fp8, #tokens: 10, KV size: 2.50 GB',
        '[2026-08-13 DP0 TP1] KV Cache VA upper bound. KV size: 999.00 GB',
      ].join('\n'),
      'sglang',
    );
    expect(r!.rank).toBe('DP0 TP1');
    expect(r!.gib.kvPool).toBe(32.5);
  });
  it('refuses ambiguous unlabeled SGLang allocations instead of doubling them', () => {
    const line = '[2026-08-13 TP0] KV Cache is allocated. KV size: 5.00 GB';
    const [r] = parse(`${line}\n${line}`, 'sglang');
    expect(r!.gib.kvPool).toBeNull();
    expect(r!.conflicts).toContain('kvPool');
  });
});
