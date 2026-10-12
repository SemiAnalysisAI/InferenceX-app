import { describe, expect, it } from 'vitest';
import {
  buildHashMetrics,
  createHashMetricsAccumulator,
  type HashMetric,
  type HashSourceRow,
} from '@/lib/agentic-workload-explorer/hash-metrics';

interface OrderedHashRow extends HashSourceRow {
  timestamp: string;
}

function totals(metrics: Iterable<HashMetric>) {
  let hashCached = 0;
  let hashTotal = 0;
  for (const metric of metrics) {
    hashCached += metric.cacheRead;
    hashTotal += metric.cacheRead + metric.cacheWrite;
  }
  return { hashCached, hashTotal };
}

describe('createHashMetricsAccumulator', () => {
  it('matches one complete ordered trie walk across page boundaries', () => {
    // The two same-timestamp rows are in stable ID order and deliberately split
    // across pages. Reversing them changes the theoretical cache bound, so the
    // fixture also protects the (timestamp, id) ordering expected from paging.
    const orderedRows: OrderedHashRow[] = [
      {
        requestId: 'first',
        timestamp: '2026-07-01T00:00:00.000Z',
        hashIds: ['root', 'shared', 'alpha'],
        hashTokenCount: 150,
      },
      {
        requestId: 'no-hashes-null',
        timestamp: '2026-07-01T00:00:01.000Z',
        hashIds: null,
        hashTokenCount: null,
      },
      {
        requestId: 'no-hashes-empty',
        timestamp: '2026-07-01T00:00:02.000Z',
        hashIds: [],
        hashTokenCount: 0,
      },
      {
        requestId: 'same-timestamp-a',
        timestamp: '2026-07-01T00:00:03.000Z',
        hashIds: ['root', 'delta'],
        hashTokenCount: 100,
      },
      {
        requestId: 'same-timestamp-b',
        timestamp: '2026-07-01T00:00:03.000Z',
        hashIds: ['root', 'delta', 'tail'],
        hashTokenCount: 129,
      },
      {
        requestId: 'shared-prefix-on-later-page',
        timestamp: '2026-07-01T00:00:04.000Z',
        hashIds: ['root', 'shared', 'beta'],
        hashTokenCount: 145,
      },
    ];
    const pages = [orderedRows.slice(0, 2), orderedRows.slice(2, 4), orderedRows.slice(4)];

    const complete = buildHashMetrics(orderedRows);
    expect(complete.blockSize).toBe(64);
    expect(totals(complete.byRequestId.values())).toEqual({ hashCached: 320, hashTotal: 524 });

    const accumulator = createHashMetricsAccumulator(64);
    const incrementalMetrics = new Map<string, HashMetric>();
    for (const page of pages) {
      for (const row of page) {
        incrementalMetrics.set(row.requestId, accumulator.add(row));
      }
    }

    expect(accumulator.totals()).toEqual({ hashCached: 320, hashTotal: 524 });
    expect(accumulator.totals()).toEqual(totals(complete.byRequestId.values()));
    expect(incrementalMetrics).toEqual(complete.byRequestId);
    expect(incrementalMetrics.get('first')).toMatchObject({ cacheRead: 0, cacheWrite: 150 });
    expect(incrementalMetrics.get('same-timestamp-a')).toMatchObject({
      cacheRead: 64,
      cacheWrite: 36,
    });
    expect(incrementalMetrics.get('same-timestamp-b')).toMatchObject({
      cacheRead: 128,
      cacheWrite: 1,
    });
    expect(incrementalMetrics.get('shared-prefix-on-later-page')).toMatchObject({
      cacheRead: 128,
      cacheWrite: 17,
    });
  });
});
