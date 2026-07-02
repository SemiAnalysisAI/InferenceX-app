import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { REQUEST_TIMELINE_VERSION, computeRequestTimeline } from './compute-request-timeline.js';

interface SyntheticRequest {
  cid: string;
  ti: number;
  srcTrace?: string;
  srcOuter?: number;
  srcInner?: number;
  srcKind?: string;
  wid?: string;
  ad?: number;
  phase?: string;
  credit: number;
  start: number;
  end: number;
  ack?: number | null;
  ttftMs?: number | null;
  tpotMs?: number | null;
  tpotKey?: 'inter_token_latency' | 'time_per_output_token';
  isl?: number | null;
  osl?: number | null;
  cancelled?: boolean;
}

function makeBlob(requests: SyntheticRequest[]) {
  const lines = requests.map((r) =>
    JSON.stringify({
      metadata: {
        conversation_id: r.cid,
        turn_index: r.ti,
        ...(r.srcTrace === undefined ? {} : { source_trace_id: r.srcTrace }),
        ...(r.srcOuter === undefined ? {} : { source_outer_idx: r.srcOuter }),
        ...(r.srcInner === undefined ? {} : { source_inner_idx: r.srcInner }),
        ...(r.srcKind === undefined ? {} : { source_kind: r.srcKind }),
        worker_id: r.wid ?? 'worker_default',
        agent_depth: r.ad ?? 0,
        benchmark_phase: r.phase ?? 'profiling',
        credit_issued_ns: r.credit,
        request_start_ns: r.start,
        ...(r.ack === undefined ? {} : { request_ack_ns: r.ack }),
        request_end_ns: r.end,
        was_cancelled: r.cancelled ?? false,
      },
      metrics: {
        time_to_first_token: r.ttftMs === null ? null : { value: r.ttftMs ?? 50, unit: 'ms' },
        [r.tpotKey ?? 'inter_token_latency']:
          r.tpotMs === null ? null : { value: r.tpotMs ?? 10, unit: 'ms' },
        input_sequence_length: { value: r.isl ?? 100, unit: 'tokens' },
        output_sequence_length: { value: r.osl ?? 10, unit: 'tokens' },
      },
    }),
  );
  return gzipSync(Buffer.from(lines.join('\n')));
}

describe('computeRequestTimeline', () => {
  it('returns null when the blob is null', () => {
    expect(computeRequestTimeline(null)).toBeNull();
  });

  it('returns null on a malformed (non-gzip) blob', () => {
    expect(computeRequestTimeline(Buffer.from('not-gzip'))).toBeNull();
  });

  it('returns null when the blob has no parseable records', () => {
    expect(computeRequestTimeline(gzipSync(Buffer.from('\n\n')))).toBeNull();
  });

  it('returns the current REQUEST_TIMELINE_VERSION in the bundle', () => {
    const tl = computeRequestTimeline(
      makeBlob([{ cid: 'a', ti: 0, credit: 1000, start: 2000, end: 3000 }]),
    );
    expect(tl?.version).toBe(REQUEST_TIMELINE_VERSION);
  });

  it('shifts ns timestamps to be relative to the earliest credit_issued', () => {
    // Two requests with absolute ns starting at 1_000_000_000.
    const tl = computeRequestTimeline(
      makeBlob([
        { cid: 'a', ti: 0, credit: 1_000_000_000, start: 1_001_000_000, end: 1_010_000_000 },
        { cid: 'a', ti: 1, credit: 1_020_000_000, start: 1_021_000_000, end: 1_030_000_000 },
      ]),
    );
    expect(tl?.startNs).toBe(1_000_000_000);
    expect(tl?.endNs).toBe(1_030_000_000);
    expect(tl?.durationS).toBeCloseTo(0.03, 6);
    expect(tl?.requests[0]?.credit).toBe(0);
    expect(tl?.requests[0]?.end).toBe(10_000_000);
    expect(tl?.requests[1]?.start).toBe(21_000_000);
  });

  it('sorts requests by start time, regardless of input order', () => {
    const tl = computeRequestTimeline(
      makeBlob([
        { cid: 'a', ti: 0, credit: 30, start: 50, end: 60 },
        { cid: 'a', ti: 1, credit: 0, start: 10, end: 20 },
        { cid: 'a', ti: 2, credit: 80, start: 90, end: 100 },
      ]),
    );
    expect(tl?.requests.map((r) => r.start)).toEqual([10, 50, 90]);
  });

  it('preserves conversation/worker grouping fields', () => {
    const tl = computeRequestTimeline(
      makeBlob([
        {
          cid: 'conv-A',
          ti: 5,
          wid: 'worker_abcd1234',
          ad: 2,
          phase: 'profiling',
          credit: 0,
          start: 10,
          end: 100,
        },
      ]),
    );
    const r = tl?.requests[0]!;
    expect(r.cid).toBe('conv-A');
    expect(r.ti).toBe(5);
    expect(r.wid).toBe('worker_abcd1234');
    expect(r.ad).toBe(2);
    expect(r.phase).toBe('profiling');
  });

  it('preserves raw source provenance fields when present', () => {
    const tl = computeRequestTimeline(
      makeBlob([
        {
          cid: 'trace::fa:003',
          ti: 3,
          srcTrace: 'trace',
          srcOuter: 204,
          srcInner: 16,
          srcKind: 'weka_flat',
          credit: 0,
          start: 10,
          end: 100,
        },
      ]),
    );
    expect(tl?.requests[0]).toMatchObject({
      cid: 'trace::fa:003',
      ti: 3,
      srcTrace: 'trace',
      srcOuter: 204,
      srcInner: 16,
      srcKind: 'weka_flat',
    });
  });

  it('preserves the cancelled flag and TTFT/TPOT/ISL/OSL metrics', () => {
    const tl = computeRequestTimeline(
      makeBlob([
        {
          cid: 'a',
          ti: 0,
          credit: 0,
          start: 10,
          end: 100,
          ttftMs: 25.5,
          tpotMs: 12.5,
          isl: 1024,
          osl: 256,
          cancelled: true,
        },
      ]),
    );
    const r = tl?.requests[0]!;
    expect(r.cancelled).toBe(true);
    expect(r.ttftMs).toBeCloseTo(25.5, 6);
    expect(r.tpotMs).toBeCloseTo(12.5, 6);
    expect(r.isl).toBe(1024);
    expect(r.osl).toBe(256);
  });

  it('accepts time_per_output_token as a TPOT alias', () => {
    const tl = computeRequestTimeline(
      makeBlob([
        {
          cid: 'a',
          ti: 0,
          credit: 0,
          start: 10,
          end: 100,
          tpotMs: 8.25,
          tpotKey: 'time_per_output_token',
        },
      ]),
    );
    expect(tl?.requests[0]?.tpotMs).toBeCloseTo(8.25, 6);
  });

  it('skips records missing both credit_issued_ns and request_start_ns', () => {
    // Build a record with only request_end_ns — the helper rejects it.
    const broken = gzipSync(
      Buffer.from(
        JSON.stringify({
          metadata: { conversation_id: 'a', turn_index: 0, request_end_ns: 1234 },
          metrics: {},
        }),
      ),
    );
    expect(computeRequestTimeline(broken)).toBeNull();
  });
});
