import { describe, it, expect } from 'vitest';
import { gemmTflops, readOperatorXBundle, object } from './reader';
import {
  makeOperatorXBundle,
  makeOperatorXAttentionBundle,
  makeOperatorXMoeBundle,
} from './test-fixture';

describe('OperatorX dense GEMM reader', () => {
  it('computes 2 TFLOPS for one billion multiply-adds in 1 ms on one GPU', () => {
    const result = readOperatorXBundle(makeOperatorXBundle());
    expect(result.points[0]).toMatchObject({ tflops: 2, latency_us: 1000, status: 'ok', m: 1000 });
    expect(result.run).toMatchObject({
      requested: 1,
      measured: 1,
      unsupported: 0,
      failed: 0,
      missing: 0,
    });
  });
  it('uses a newer unsupported attempt without falling back to an older measurement', () => {
    const bundle = makeOperatorXBundle();
    bundle.run.run_attempt = 2;
    const newer = structuredClone(bundle.shards[0]);
    newer.attempt = 2;
    const doc = object(newer.docs[0]);
    object(object(doc.run).env).OPERATORX_GITHUB_RUN_ATTEMPT = '2';
    const row = object((doc.rows as unknown[])[0]);
    row.status = 'unsupported';
    row.metrics = {};
    row.message = 'dtype unsupported';
    bundle.shards.push(newer);
    expect(readOperatorXBundle(bundle)).toMatchObject({
      run: { measured: 0, unsupported: 1 },
      points: [{ attempt: 2, tflops: null, message: 'dtype unsupported' }],
    });
  });
  it('keeps coverage for absent results and preserves older shards on partial rerun', () => {
    const bundle = makeOperatorXBundle();
    bundle.run.run_attempt = 2;
    const cells = object(bundle.manifest).include as unknown[];
    cells.push({ ...object(cells[0]), id: 'b' });
    const result = readOperatorXBundle(bundle);
    expect(result.run).toMatchObject({ requested: 2, measured: 1, missing: 1 });
    expect(result.points.map((p) => [p.attempt, p.tflops])).toEqual([
      [1, 2],
      [null, null],
    ]);
  });
  it.each(['run_id', 'source_sha'])('rejects a manifest %s mismatch', (key) => {
    const bundle = makeOperatorXBundle();
    object(bundle.manifest)[key] = 'wrong';
    expect(() => readOperatorXBundle(bundle)).toThrow('provenance');
  });
  it('rejects duplicate result rows instead of inflating coverage', () => {
    const bundle = makeOperatorXBundle();
    const rows = object(bundle.shards[0].docs[0]).rows as unknown[];
    rows.push(rows[0]);
    expect(() => readOperatorXBundle(bundle)).toThrow('duplicate');
  });
  it.each([0, -1, NaN, Infinity])('rejects unusable successful latency %s', (latency) => {
    const bundle = makeOperatorXBundle();
    const row = object((object(bundle.shards[0].docs[0]).rows as unknown[])[0]);
    row.metrics = { latency_us: latency };
    expect(() => readOperatorXBundle(bundle)).toThrow('latency');
  });
  it('never presents empty GEMMs as throughput measurements', () => {
    expect(gemmTflops(0, 1000, 1000, 1)).toBeNull();
  });
});

it('retains a failed case and its diagnostic without turning latency into a measurement', () => {
  const bundle = makeOperatorXBundle();
  const row = object((object(bundle.shards[0].docs[0]).rows as unknown[])[0]);
  row.status = 'error';
  row.message = 'CUDA out of memory';
  row.metrics = { latency_us: 1000 };
  const result = readOperatorXBundle(bundle);
  expect(result.run).toMatchObject({ measured: 0, failed: 1 });
  expect(result.points[0]).toMatchObject({
    status: 'error',
    message: 'CUDA out of memory',
    latency_us: null,
    tflops: null,
  });
});

it('rejects a shard with a foreign cluster rather than labeling it H100', () => {
  const bundle = makeOperatorXBundle();
  object(object(bundle.shards[0].docs[0]).run).cluster = 'h200_dgxc_8x';
  expect(() => readOperatorXBundle(bundle)).toThrow('provenance');
});

describe('attention coverage', () => {
  it('preserves mixed operator identities and computes attention TFLOPS from query heads and QK/V dimensions', () => {
    const dataset = readOperatorXBundle(makeOperatorXAttentionBundle());
    expect(dataset.version).toBe(3);
    expect(dataset.run).toMatchObject({ requested: 3, measured: 3 });
    expect(dataset.points[1]).toMatchObject({
      type: 'attention_mha',
      m: null,
      dtype_a: null,
      latency_us: 12.5,
      tflops: 42.94967296,
      attention: {
        batch_size: 8,
        num_heads: 32,
        num_heads_kv: 8,
        head_dim_qk: 128,
        head_dim_v: 128,
        causal: true,
      },
    });
    expect(dataset.points[2]).toMatchObject({
      type: 'attention_mla',
      latency_us: 5.5,
      attention: {
        num_heads: 128,
        head_dim_qk: 192,
        head_dim_v: 128,
        kv_lora_rank: 512,
        dtype_k: 'bf16',
        dtype_v: 'bf16',
      },
    });
    expect(dataset.points[2].tflops).toBeCloseTo(488.0644654545, 8);
  });
  it('includes unsupported backend pairs and missing attention in coverage', () => {
    const bundle = makeOperatorXAttentionBundle();
    const rows = object(bundle.shards[0].docs[0]).rows as Record<string, unknown>[];
    rows[1].status = 'unsupported';
    rows[1].metrics = {};
    rows.pop();
    const dataset = readOperatorXBundle(bundle);
    expect(dataset.run).toMatchObject({ requested: 3, measured: 1, unsupported: 1, missing: 1 });
    expect(dataset.points[1]).toMatchObject({
      status: 'unsupported',
      latency_us: null,
      tflops: null,
    });
    expect(dataset.points[2]).toMatchObject({ status: 'missing', latency_us: null, tflops: null });
  });
  it('rejects duplicate attention results', () => {
    const bundle = makeOperatorXAttentionBundle();
    const rows = object(bundle.shards[0].docs[0]).rows as unknown[];
    rows.push(rows[1]);
    expect(() => readOperatorXBundle(bundle)).toThrow('duplicate');
  });
  it('rejects a malformed attention dimension before rendering it', () => {
    const bundle = makeOperatorXAttentionBundle();
    const cells = object(bundle.manifest).include as unknown[];
    const cases = object(cells[0]).cases as unknown[];
    object(object(object(cases[1]).shape).args).seq_len_q = 'one';
    expect(() => readOperatorXBundle(bundle)).toThrow('dimension');
  });
});

describe('attention useful matmul throughput', () => {
  // B=2, Hq=4, Hkv=2, Dqk=Dv=8: 256 FLOPs per visible Q/K pair, at 1 µs.
  it.each([
    ['dense rectangular', 2, 4, false, 0.002048], // 8 pairs
    ['causal square with diagonal', 4, 4, true, 0.00256], // 1+2+3+4 pairs
    ['causal rectangular prefill', 2, 4, true, 0.001792], // 3+4 pairs
    ['causal decode', 1, 4, true, 0.001024], // all 4 KV positions
    ['causal queries longer than KV', 4, 2, true, 0.000768], // 0+0+1+2 pairs
    ['empty queries', 0, 4, false, null],
  ])('%s', (_label, q, k, causal, expected) => {
    const bundle = makeOperatorXAttentionBundle();
    const row = object((object(bundle.shards[0].docs[0]).rows as unknown[])[1]);
    Object.assign(object(object(row.op).args), {
      batch_size: 2,
      num_heads: 4,
      num_heads_kv: 2,
      head_dim: 8,
      seq_len_q: q,
      seq_len_kv: k,
      causal,
    });
    row.metrics = { latency_us: 1 };
    expect(readOperatorXBundle(bundle).points[1].tflops).toBe(expected);
  });
  it('does not compute throughput from a failed attention measurement', () => {
    const bundle = makeOperatorXAttentionBundle();
    const row = object((object(bundle.shards[0].docs[0]).rows as unknown[])[1]);
    row.status = 'error';
    expect(readOperatorXBundle(bundle).points[1]).toMatchObject({
      status: 'error',
      latency_us: null,
      tflops: null,
    });
  });
});

describe('routed MoE throughput', () => {
  it('derives local expert/intermediate dimensions and does not divide work by EP twice', () => {
    const result = readOperatorXBundle(makeOperatorXMoeBundle());
    expect(result.run).toMatchObject({ requested: 4, measured: 4 });
    expect(result.points[3]).toMatchObject({
      type: 'moe_gemm',
      m: null,
      attention: null,
      latency_us: 100,
      tflops: 32.21225472,
      moe: { num_tokens: 128, local_experts: 8, local_intermediate: 1024, top_k: 4 },
    });
  });
  it('counts a shared expert with its own TP slice', () => {
    const bundle = makeOperatorXMoeBundle();
    const row = object((object(bundle.shards[1].docs[0]).rows as unknown[])[0]);
    Object.assign(object(object(row.op).args), {
      n_shared_experts: 1,
      shared_tensor_parallel_size: 4,
    });
    expect(readOperatorXBundle(bundle).points[3].tflops).toBe(36.23878656);
  });
  it('rejects indivisible expert shards', () => {
    const bundle = makeOperatorXMoeBundle();
    const row = object((object(bundle.shards[1].docs[0]).rows as unknown[])[0]);
    object(object(row.op).args).expert_parallel_size = 3;
    expect(() => readOperatorXBundle(bundle)).toThrow('MoE shard');
  });
  it('retains unsupported and missing MoE without manufacturing throughput', () => {
    const bundle = makeOperatorXMoeBundle();
    const rows = object(bundle.shards[1].docs[0]).rows as Record<string, unknown>[];
    rows[0].status = 'unsupported';
    expect(readOperatorXBundle(bundle).points[3]).toMatchObject({
      status: 'unsupported',
      tflops: null,
    });
    rows.pop();
    expect(readOperatorXBundle(bundle).points[3]).toMatchObject({
      status: 'missing',
      tflops: null,
    });
  });
});
