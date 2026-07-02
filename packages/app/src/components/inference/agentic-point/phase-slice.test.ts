import { describe, expect, it } from 'vitest';

import type { RequestRecord, RequestTimeline } from '@/hooks/api/use-request-timeline';
import {
  phaseBoundaryNs,
  phaseBoundarySec,
  requestsForPhase,
  sliceServerSeriesByPhase,
  sliceTimelineByPhase,
  timelineHasWarmup,
  type ServerSeriesLike,
} from './phase-slice';

function req(overrides: Partial<RequestRecord>): RequestRecord {
  return {
    cid: 'c',
    ti: 0,
    wid: 'w',
    ad: 0,
    phase: 'profiling',
    credit: 0,
    start: 0,
    ack: null,
    end: 1,
    ttftMs: null,
    tpotMs: null,
    isl: null,
    osl: null,
    cancelled: false,
    ...overrides,
  };
}

function timeline(requests: RequestRecord[], startNs = 1_000): RequestTimeline {
  return { version: 3, startNs, endNs: startNs + 1, durationS: 1, requests };
}

function makeSeries(ts: number[]): ServerSeriesLike {
  const pts = ts.map((t) => ({ t, value: t * 10 }));
  return {
    kvCacheUsage: pts,
    prefixCacheHitRate: pts,
    queueDepth: ts.map((t) => ({ t, running: t, waiting: t + 1, total: 2 * t + 1 })),
    promptTokensBySource: { src: pts },
    prefillTps: pts,
    decodeTps: pts,
    prefixCacheHitsTps: pts,
    hostKvCacheUsage: pts,
    kvCacheUsageByEngine: [{ engineLabel: 'e0', points: pts }],
  };
}

describe('phaseBoundaryNs', () => {
  it('returns null when there are no profiling requests', () => {
    expect(phaseBoundaryNs(timeline([req({ phase: 'warmup', start: 5 })]))).toBeNull();
  });

  it('returns null when there are no warmup requests', () => {
    expect(phaseBoundaryNs(timeline([req({ phase: 'profiling', start: 5 })]))).toBeNull();
  });

  it('returns startNs + earliest profiling start when both phases present', () => {
    const t = timeline(
      [
        req({ phase: 'warmup', start: 0 }),
        req({ phase: 'profiling', start: 900 }),
        req({ phase: 'profiling', start: 700 }),
      ],
      1_000,
    );
    expect(phaseBoundaryNs(t)).toBe(1_700);
  });

  it('returns null for nullish timeline', () => {
    expect(phaseBoundaryNs(null)).toBeNull();
    expect(phaseBoundaryNs(undefined)).toBeNull();
  });
});

describe('phaseBoundarySec', () => {
  it('rebases through absolute ns by subtracting serverMetrics.startNs (origin gap)', () => {
    // timeline origin and server-metrics origin differ — the classic ~124s gap.
    const tl = timeline(
      [req({ phase: 'warmup', start: 0 }), req({ phase: 'profiling', start: 600 * 1e9 })],
      200 * 1e9, // timeline.startNs
    );
    // boundaryNs = 200e9 + 600e9 = 800e9 ; serverMetrics origin = 124e9 earlier
    const boundarySec = phaseBoundarySec({ startNs: 76 * 1e9 }, tl);
    // (800e9 - 76e9)/1e9 = 724
    expect(boundarySec).toBe(724);
  });

  it('clamps a negative mapping to 0', () => {
    const tl = timeline(
      [req({ phase: 'warmup', start: 0 }), req({ phase: 'profiling', start: 0 })],
      0,
    );
    expect(phaseBoundarySec({ startNs: 5 * 1e9 }, tl)).toBe(0);
  });

  it('returns null when serverMetrics missing or no split', () => {
    const tl = timeline(
      [req({ phase: 'warmup', start: 0 }), req({ phase: 'profiling', start: 1e9 })],
      0,
    );
    expect(phaseBoundarySec(null, tl)).toBeNull();
    expect(phaseBoundarySec({ startNs: 0 }, timeline([req({ phase: 'profiling' })]))).toBeNull();
  });
});

describe('timelineHasWarmup', () => {
  it('detects warmup presence', () => {
    expect(timelineHasWarmup(timeline([req({ phase: 'profiling' })]))).toBe(false);
    expect(timelineHasWarmup(timeline([req({ phase: 'warmup' })]))).toBe(true);
    expect(timelineHasWarmup(null)).toBe(false);
  });
});

describe('sliceServerSeriesByPhase', () => {
  it('is an identity passthrough (full duration) when boundary is null', () => {
    const s = makeSeries([0, 1, 2]);
    const out = sliceServerSeriesByPhase(s, 'profiling', null, 99);
    expect(out.series).toBe(s);
    expect(out.durationS).toBe(99);
  });

  it('warmup keeps t < boundary, no rebase, durationS = boundary', () => {
    const s = makeSeries([0, 1, 2, 3, 4]);
    const out = sliceServerSeriesByPhase(s, 'warmup', 2, 5);
    expect(out.series.kvCacheUsage.map((p) => p.t)).toEqual([0, 1]); // excludes t===2
    expect(out.durationS).toBe(2);
  });

  it('profiling keeps t >= boundary and rebases to start at 0', () => {
    const s = makeSeries([0, 1, 2, 3, 4]);
    const out = sliceServerSeriesByPhase(s, 'profiling', 2, 5);
    expect(out.series.kvCacheUsage.map((p) => p.t)).toEqual([0, 1, 2]); // 2,3,4 -> 0,1,2
    expect(out.series.kvCacheUsage.map((p) => p.value)).toEqual([20, 30, 40]); // values preserved
    expect(out.durationS).toBe(3); // 5 - 2
  });

  it('slices queueDepth, promptTokensBySource, and kvCacheUsageByEngine; preserves queue fields', () => {
    const s = makeSeries([0, 1, 2, 3]);
    const out = sliceServerSeriesByPhase(s, 'profiling', 2, 4);
    expect(out.series.queueDepth).toEqual([
      { t: 0, running: 2, waiting: 3, total: 5 },
      { t: 1, running: 3, waiting: 4, total: 7 },
    ]);
    expect(out.series.promptTokensBySource.src.map((p) => p.t)).toEqual([0, 1]);
    expect(out.series.kvCacheUsageByEngine[0]!.points.map((p) => p.t)).toEqual([0, 1]);
    expect(out.series.kvCacheUsageByEngine[0]!.engineLabel).toBe('e0');
  });

  it('does not mutate the input series', () => {
    const s = makeSeries([0, 1, 2]);
    const before = s.kvCacheUsage.map((p) => p.t);
    sliceServerSeriesByPhase(s, 'profiling', 1, 3);
    expect(s.kvCacheUsage.map((p) => p.t)).toEqual(before);
  });
});

describe('requestsForPhase', () => {
  const rs = [
    req({ phase: 'warmup', isl: 1 }),
    req({ phase: 'profiling', isl: 2 }),
    req({ phase: 'unknown', isl: 3 }),
  ];

  it('profiling selects only profiling rows', () => {
    expect(requestsForPhase(rs, 'profiling').map((r) => r.isl)).toEqual([2]);
  });

  it('warmup selects everything that is not profiling', () => {
    expect(requestsForPhase(rs, 'warmup').map((r) => r.isl)).toEqual([1, 3]);
  });
});

describe('sliceTimelineByPhase', () => {
  // startNs origin = 1000; warmup request at offset 0..50, profiling at 100..300.
  const tl = timeline(
    [
      req({ phase: 'warmup', credit: 0, start: 0, ack: 10, end: 50, isl: 1 }),
      req({ phase: 'profiling', credit: 90, start: 100, ack: 120, end: 300, isl: 2 }),
    ],
    1_000,
  );
  // tl.durationS default = 1 from helper; override for window math.
  const tlDur: RequestTimeline = { ...tl, durationS: 3 };

  it('returns the input unchanged for a single-phase timeline', () => {
    const single = timeline([req({ phase: 'profiling', start: 5 })]);
    expect(sliceTimelineByPhase(single, 'profiling')).toBe(single);
  });

  it('warmup keeps pre-boundary requests, no rebase, startNs unchanged', () => {
    const out = sliceTimelineByPhase(tlDur, 'warmup');
    expect(out.requests.map((r) => r.isl)).toEqual([1]);
    expect(out.requests[0]!.start).toBe(0); // not rebased
    expect(out.startNs).toBe(1_000);
  });

  it('profiling keeps post-boundary requests and rebases offsets + startNs', () => {
    const out = sliceTimelineByPhase(tlDur, 'profiling');
    expect(out.requests.map((r) => r.isl)).toEqual([2]);
    // boundary offset = 100 → rebased: start 100→0, end 300→200, ack 120→20, credit 90→-10
    expect(out.requests[0]!.start).toBe(0);
    expect(out.requests[0]!.end).toBe(200);
    expect(out.requests[0]!.ack).toBe(20);
    // startNs shifts forward by the boundary offset so absolute time is preserved
    expect(out.startNs).toBe(1_100);
  });
});
