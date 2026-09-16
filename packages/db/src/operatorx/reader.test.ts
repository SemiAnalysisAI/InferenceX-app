import { describe, it, expect } from 'vitest';
import { gemmTflops, readOperatorXBundle, object } from './reader';
import { makeOperatorXBundle } from './test-fixture';

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
