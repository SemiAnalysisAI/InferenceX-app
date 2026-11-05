import { describe, expect, it } from 'vitest';
import { buildDatasetFromNeutral, buildRunSummary } from './reader';
import {
  makeSwapDoc,
  makeSwapRequestedCase,
  swapCaseId,
  swapMatrix,
  swapMeta,
} from './swap-test-fixture';
import { makeRawMatrix, makeRawShard } from './test-fixture';

describe('swap_blocks results', () => {
  it('assembles verified copies through GiB and exposes the run without EP cases', () => {
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
      if (corruption === 'provenance') (doc.runtime as Record<string, unknown>).source_sha = null;
      if (corruption === 'duplicate') doc.cases.push(doc.cases[0]);
      expect(() => buildDatasetFromNeutral(swapMatrix, [doc], swapMeta)).toThrow(/invalid/);
    },
  );

  it('keeps the measuring revision instead of requiring the snapshot revision', () => {
    const doc = makeSwapDoc();
    doc.runtime.source_sha = 'f'.repeat(40);
    const dataset = buildDatasetFromNeutral(swapMatrix, [doc], swapMeta);
    expect(dataset.run.source_sha).toBe('abc123');
    expect(dataset.swap_blocks?.[0].runtime.source_sha).toBe('f'.repeat(40));
  });

  it('rejects the retired execution-only swap matrix', () => {
    const matrix = { include: [{ backend: 'swap-blocks', sku: 'h200-dgxc' }] };
    expect(() => buildDatasetFromNeutral(matrix, [makeSwapDoc()], swapMeta)).toThrow(
      'invalid CollectiveX matrix',
    );
  });
});

describe('swap_blocks cases in a unified cases.json', () => {
  it('skips ladder-free swap cases in EP coverage and keeps unanswered ones pending', () => {
    const shard = makeRawShard();
    const identity = shard.identity as {
      case_id: string;
      case_factors: { sku: string; case: Record<string, unknown> };
    };
    const ep = makeRawMatrix([
      {
        caseId: identity.case_id,
        sku: identity.case_factors.sku,
        case: identity.case_factors.case,
      },
    ]);
    const matrix = {
      ...ep,
      requested_cases: [
        ...(ep.requested_cases as unknown[]),
        makeSwapRequestedCase('h200-dgxc', 'contiguous'),
        makeSwapRequestedCase('h200-dgxc', 'random'),
        makeSwapRequestedCase('mi300x', 'contiguous'),
      ],
    };

    const dataset = buildDatasetFromNeutral(matrix, [shard, makeSwapDoc()], swapMeta);

    expect(dataset.coverage.map((row) => row.case_id)).toEqual([identity.case_id]);
    expect(dataset.series).toHaveLength(1);
    expect(dataset.swap_blocks?.map((result) => result.sku)).toEqual(['h200-dgxc']);
    expect(dataset.run).toMatchObject({
      requested_cases: 4,
      measured_cases: 2,
      terminal_cases: 2,
      swap_requested_cases: 3,
      swap_measured_cases: 1,
      // mi300x is requested but has no result, so it is not a covered pool.
      covered_skus: ['h200-dgxc'],
    });
  });

  it('assembles a snapshot with requested cases and no results', () => {
    const dataset = buildDatasetFromNeutral(
      { version: 1, requested_cases: [makeSwapRequestedCase()] },
      [],
      swapMeta,
    );
    expect(dataset.swap_blocks).toEqual([]);
    expect(buildRunSummary(dataset)).toMatchObject({
      requested_cases: 1,
      measured_cases: 0,
      swap_cases: { requested: 1, measured: 0 },
    });
  });
});

it('keeps identical measurements from separate GPU pools and rejects ambiguous provenance', () => {
  const matrix = {
    version: 1,
    requested_cases: [makeSwapRequestedCase('h200-dgxc'), makeSwapRequestedCase('mi355x')],
  };
  const docs = ['h200-dgxc', 'mi355x'].map((sku) => makeSwapDoc(sku));
  const dataset = buildDatasetFromNeutral(matrix, docs, swapMeta);
  expect(dataset.swap_blocks?.map((r) => [r.sku, r.points[0].latency_us.p50])).toEqual([
    ['h200-dgxc', 2],
    ['mi355x', 2],
  ]);
  expect(new Set(dataset.swap_blocks?.map((r) => r.result_id)).size).toBe(2);

  const unlabeled = makeSwapDoc();
  delete (unlabeled.runtime as { sku?: string }).sku;
  expect(() => buildDatasetFromNeutral(matrix, [unlabeled], swapMeta)).toThrow('GPU pool');
  expect(() => buildDatasetFromNeutral(matrix, [makeSwapDoc('unknown')], swapMeta)).toThrow(
    'GPU pool',
  );
  const unrequested = { ...makeSwapDoc(), case_id: swapCaseId('h200-dgxc', 'random') };
  expect(() => buildDatasetFromNeutral(matrix, [unrequested], swapMeta)).toThrow('requested case');
  expect(() => buildDatasetFromNeutral(matrix, [makeSwapDoc(), makeSwapDoc()], swapMeta)).toThrow(
    'requested case',
  );
});
