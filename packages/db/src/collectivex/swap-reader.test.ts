import { describe, expect, it } from 'vitest';
import { buildDatasetFromNeutral, buildRunSummary, isMatrixDoc, matrixVersion } from './reader';
import { makeSwapDoc, swapMatrix, swapMeta } from './swap-test-fixture';

describe('standalone swap_blocks artifacts', () => {
  it('assembles verified copies through GiB and exposes the run without EP cases', () => {
    expect(isMatrixDoc(swapMatrix)).toBe(true);
    expect(matrixVersion(swapMatrix)).toBe(1);
    const dataset = buildDatasetFromNeutral(
      swapMatrix,
      [makeSwapDoc(), { log: 'unrelated' }],
      swapMeta,
    );
    expect(dataset.series).toEqual([]);
    expect(dataset.coverage).toEqual([]);
    expect(dataset.swap_blocks?.[0]).toMatchObject({
      sku: 'h200-dgxc',
      skipped_points: 1,
      max_payload_bytes: 1073741824,
      runtime: { device: 'NVIDIA H200' },
    });
    expect(dataset.swap_blocks?.[0].points[1]).toMatchObject({
      block_bytes: 1073741824,
      payload_gbps_at_latency_percentile: { p50: 32.768, p90: 16.384, p95: 8.192, p99: 4.096 },
    });
    expect(buildRunSummary(dataset)).toMatchObject({
      requested_cases: 1,
      measured_cases: 1,
      requested_points: 3,
      swap_cases: { requested: 1, measured: 1 },
      kv_cases: { requested: 0, measured: 0 },
      covered_skus: ['h200-dgxc'],
    });
  });
  it.each(['correctness', 'payload', 'latency', 'samples', 'provenance', 'duplicate'])(
    'rejects %s corruption instead of plotting success',
    (corruption) => {
      const doc = makeSwapDoc();
      if (corruption === 'correctness') doc.cases[0].correctness_passed = false;
      if (corruption === 'payload') doc.cases[0].payload_bytes = 2048;
      if (corruption === 'latency') doc.cases[0].latency.percentiles_us.p50 = NaN;
      if (corruption === 'samples') doc.cases[0].latency.sample_count = 0;
      if (corruption === 'provenance') doc.runtime.source_sha = 'other';
      if (corruption === 'duplicate') doc.cases.push(doc.cases[0]);
      expect(() => buildDatasetFromNeutral(swapMatrix, [doc], swapMeta)).toThrow(/invalid/);
    },
  );
  it('does not misclassify arbitrary execution matrices', () => {
    const matrix = { include: [{ backend: 'other', sku: 'h200-dgxc' }] };
    expect(isMatrixDoc(matrix)).toBe(false);
    expect(matrixVersion(matrix)).toBeNull();
    expect(() => buildDatasetFromNeutral(matrix, [], swapMeta)).toThrow(
      'invalid CollectiveX matrix',
    );
  });
});
