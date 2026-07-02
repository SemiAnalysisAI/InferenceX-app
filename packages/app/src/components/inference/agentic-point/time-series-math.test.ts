import { describe, expect, it } from 'vitest';

import type { RequestRecord } from '@/hooks/api/use-request-timeline';

import {
  averageSequenceLengthInFlight,
  buildThroughputChartSeries,
  cumulativeAverage,
  cumulativeCompletedRequests,
  cumulativeDifferenceMonotonic,
  cumulativeTimeAverage,
  cumulativeUniqueInputTokens,
  inflightUniqueTokens,
  interpAt,
  rollingAverage,
  rollingRequestMetric,
  timeRollingAverage,
  toggleThroughputSeries,
} from './time-series-math';

const request = (
  endS: number,
  ttftMs: number | null,
  tpotMs: number | null,
  overrides: Partial<RequestRecord> = {},
): RequestRecord => ({
  cid: 'conversation',
  ti: endS,
  wid: 'worker',
  ad: 0,
  phase: 'profiling',
  credit: 0,
  start: 0,
  ack: null,
  end: endS * 1e9,
  ttftMs,
  tpotMs,
  isl: 100,
  osl: 10,
  cancelled: false,
  ...overrides,
});

describe('rollingRequestMetric', () => {
  it('computes a trailing P75 TTFT over the requested window', () => {
    const result = rollingRequestMetric(
      [request(1, 100, 10), request(2, 200, 20), request(3, 300, 30), request(4, 400, 40)],
      'ttft',
      'p75',
      3,
    );

    expect(result.raw.at(-1)).toEqual({ t: 4, value: 0.4 });
    expect(result.trend.map((point) => point.value)).toEqual([0.1, 0.175, 0.25, 0.35]);
    expect(result.cumulative.map((point) => point.value)).toEqual([0.1, 0.175, 0.25, 0.325]);
  });

  it('inverts the rolling TPOT percentile for interactivity', () => {
    const result = rollingRequestMetric(
      [request(1, 100, 10), request(2, 200, 20), request(3, 300, 30)],
      'interactivity',
      'p90',
      3,
    );

    expect(result.raw.map((point) => point.value)).toEqual([100, 50, 1000 / 30]);
    expect(result.trend.at(-1)?.value).toBeCloseTo(1000 / 28, 8);
    expect(result.cumulative.map((point) => point.value)).toEqual([100, 1000 / 19, 1000 / 28]);
  });

  it('computes E2E latency from request start through request end', () => {
    const result = rollingRequestMetric(
      [request(2, 100, 10, { start: 500_000_000 }), request(4, 200, 20, { start: 1_000_000_000 })],
      'e2e',
      'p90',
      50,
    );

    expect(result.raw).toEqual([
      { t: 2, value: 1.5 },
      { t: 4, value: 3 },
    ]);
    expect(result.trend.at(-1)?.value).toBeCloseTo(2.85, 8);
    expect(result.cumulative.at(-1)?.value).toBeCloseTo(2.85, 8);
  });

  it('drops cancelled, missing, and non-positive samples (phase is the caller’s concern)', () => {
    const result = rollingRequestMetric(
      [
        request(1, 100, 10),
        request(2, 200, 20, { phase: 'warmup' }), // kept — caller passes a phase-scoped timeline
        request(3, 300, 30, { cancelled: true }),
        request(4, null, null),
        request(5, 0, 0),
      ],
      'ttft',
      'p90',
    );

    expect(result.raw).toEqual([
      { t: 1, value: 0.1 },
      { t: 2, value: 0.2 },
    ]);
  });
});

describe('timeRollingAverage', () => {
  it('integrates the step function over the trailing window', () => {
    const result = timeRollingAverage(
      [
        { t: 0, value: 10 },
        { t: 2, value: 20 },
        { t: 4, value: 40 },
      ],
      4,
    );

    // t=0: zero-length window → raw value. t=2: 10 held on [0,2) → 10.
    // t=4: 10 on [0,2) + 20 on [2,4) = 60 area / 4 s = 15.
    expect(result).toEqual([
      { t: 0, value: 10 },
      { t: 2, value: 10 },
      { t: 4, value: 15 },
    ]);
  });

  it('carries the pre-window step value into a clipped window', () => {
    const result = timeRollingAverage(
      [
        { t: 0, value: 10 },
        { t: 2, value: 20 },
        { t: 4, value: 40 },
      ],
      2,
    );

    // Window [2,4): value 20 held throughout (the t=0 sample sets the step
    // value at the window start via carry-forward of data[j-1]).
    expect(result.at(-1)).toEqual({ t: 4, value: 20 });
  });

  it('passes through empty input and non-positive windows', () => {
    expect(timeRollingAverage([], 30)).toEqual([]);
    const data = [{ t: 0, value: 1 }];
    expect(timeRollingAverage(data, 0)).toBe(data);
  });
});

describe('rollingAverage', () => {
  it('averages a centered window clipped at the edges', () => {
    const data = [1, 2, 3, 4].map((value, i) => ({ t: i, value }));
    expect(rollingAverage(data, 3).map((p) => p.value)).toEqual([1.5, 2, 3, 3.5]);
  });

  it('passes through window sizes of 1 or less', () => {
    const data = [{ t: 0, value: 5 }];
    expect(rollingAverage(data, 1)).toBe(data);
  });
});

describe('cumulativeAverage', () => {
  it('hides the startup interval without removing it from later averages', () => {
    const result = cumulativeAverage(
      [
        { t: 0, value: 300 },
        { t: 30, value: 0 },
        { t: 60, value: 0 },
        { t: 90, value: 100 },
      ],
      60,
    );

    expect(result).toEqual([
      { t: 60, value: 100 },
      { t: 90, value: 100 },
    ]);
  });

  it('preserves the original behavior when no burn-in is requested', () => {
    expect(
      cumulativeAverage([
        { t: 0, value: 10 },
        { t: 1, value: 20 },
      ]),
    ).toEqual([
      { t: 0, value: 10 },
      { t: 1, value: 15 },
    ]);
  });
});

describe('cumulativeTimeAverage', () => {
  it('computes a run-to-date time-weighted average for a step series', () => {
    expect(
      cumulativeTimeAverage([
        { t: 0, value: 100 },
        { t: 1, value: 300 },
        { t: 3, value: 100 },
        { t: 4, value: 0 },
      ]),
    ).toEqual([
      { t: 0, value: 100 },
      { t: 1, value: 100 },
      { t: 3, value: 700 / 3 },
      { t: 4, value: 200 },
    ]);
  });

  it('coalesces same-time request events to their final step value', () => {
    expect(
      cumulativeTimeAverage([
        { t: 0, value: 0 },
        { t: 0, value: 100 },
        { t: 2, value: 0 },
      ]),
    ).toEqual([
      { t: 0, value: 100 },
      { t: 2, value: 100 },
    ]);
  });
});

describe('cumulativeCompletedRequests', () => {
  it('sorts completions and excludes cancelled requests (phase is the caller’s concern)', () => {
    expect(
      cumulativeCompletedRequests([
        request(4, 100, 10),
        request(2, 100, 10),
        request(1, 100, 10, { phase: 'warmup' }), // kept — caller passes a phase-scoped timeline
        request(3, 100, 10, { cancelled: true }),
      ]),
    ).toEqual([
      { t: 0, value: 0 },
      { t: 1, value: 1 },
      { t: 2, value: 2 },
      { t: 4, value: 3 },
    ]);
  });

  it('returns no series when there are no successful completions', () => {
    expect(cumulativeCompletedRequests([request(1, 100, 10, { cancelled: true })])).toEqual([]);
  });
});

describe('averageSequenceLengthInFlight', () => {
  it('computes the event-time average across overlapping profiling requests', () => {
    expect(
      averageSequenceLengthInFlight(
        [
          request(4, 100, 10, { start: 0, end: 4_000_000_000, isl: 100 }),
          request(3, 100, 10, { start: 1_000_000_000, end: 3_000_000_000, isl: 300 }),
        ],
        'isl',
      ),
    ).toEqual([
      { t: 0, value: 100 },
      { t: 1, value: 200 },
      { t: 3, value: 100 },
      { t: 4, value: 0 },
    ]);
  });

  it('excludes cancelled and missing sequence lengths (phase is the caller’s concern)', () => {
    // Only the null-osl and cancelled rows are dropped; the warmup row is kept
    // (the caller passes a phase-scoped timeline), so it produces a step series.
    expect(
      averageSequenceLengthInFlight(
        [
          request(1, 100, 10, { osl: null }),
          request(2, 100, 10, { osl: 20, cancelled: true }),
          request(3, 100, 10, { osl: 30, phase: 'warmup', start: 0, end: 3_000_000_000 }),
        ],
        'osl',
      ),
    ).toEqual([
      { t: 0, value: 30 },
      { t: 3, value: 0 },
    ]);
  });
});

describe('toggleThroughputSeries', () => {
  it('allows either series to be hidden when both are selected', () => {
    expect([...toggleThroughputSeries(new Set(['input', 'decode']), 'input')]).toEqual(['decode']);
    expect([...toggleThroughputSeries(new Set(['input', 'decode']), 'decode')]).toEqual(['input']);
  });

  it('does not allow the final visible series to be hidden', () => {
    const selected = new Set<'input' | 'decode'>(['decode']);
    expect(toggleThroughputSeries(selected, 'decode')).toBe(selected);
  });

  it('allows the hidden series to be restored', () => {
    expect([...toggleThroughputSeries(new Set(['decode']), 'input')]).toEqual(['decode', 'input']);
  });

  it('only includes the total running average when both series are visible', () => {
    const input = [{ t: 0, value: 10 }];
    const decode = [{ t: 0, value: 20 }];

    expect(
      buildThroughputChartSeries(input, decode, new Set(['input', 'decode'])).map(
        ({ name }) => name,
      ),
    ).toEqual(['Input (avg n=50)', 'Decode (avg n=50)', 'Total running avg (60s burn-in)']);
    expect(
      buildThroughputChartSeries(input, decode, new Set(['input'])).map(({ name }) => name),
    ).toEqual(['Input (avg n=50)']);
    expect(
      buildThroughputChartSeries(input, decode, new Set(['decode'])).map(({ name }) => name),
    ).toEqual(['Decode (avg n=50)']);
  });
});

describe('cumulativeUniqueInputTokens', () => {
  it('cumulates only the freshly-computed buckets, ignoring cache tiers', () => {
    const out = cumulativeUniqueInputTokens({
      local_compute: [
        { t: 0, value: 100 },
        { t: 1, value: 50 },
      ],
      local_cache_hit: [
        { t: 0, value: 900 },
        { t: 1, value: 950 },
      ],
      external_kv_transfer: [
        { t: 0, value: 5000 },
        { t: 1, value: 6000 },
      ],
    });
    expect(out).toEqual([
      { t: 0, value: 100 },
      { t: 1, value: 150 },
    ]);
  });

  it('recognizes the sglang compute/cache labels the builder emits', () => {
    const out = cumulativeUniqueInputTokens({
      'compute (miss)': [
        { t: 0, value: 10 },
        { t: 2, value: 20 },
      ],
      'cache hit (HBM)': [{ t: 0, value: 999 }],
      'cache hit (CPU offload)': [{ t: 2, value: 999 }],
    });
    expect(out).toEqual([
      { t: 0, value: 10 },
      { t: 2, value: 30 },
    ]);
  });

  it('sums multiple non-cache buckets at the same timestamp', () => {
    const out = cumulativeUniqueInputTokens({
      local_compute: [{ t: 0, value: 100 }],
      miss: [{ t: 0, value: 25 }],
    });
    expect(out).toEqual([{ t: 0, value: 125 }]);
  });

  it('is monotonic non-decreasing (no clamp needed — values are rates ≥ 0)', () => {
    const out = cumulativeUniqueInputTokens({
      local_compute: [
        { t: 0, value: 300 },
        { t: 1, value: 0 },
        { t: 2, value: 10 },
      ],
    });
    expect(out.map((p) => p.value)).toEqual([300, 300, 310]);
  });

  it('returns [] when there is no breakdown so the caller can fall back', () => {
    expect(cumulativeUniqueInputTokens(undefined)).toEqual([]);
    expect(cumulativeUniqueInputTokens({})).toEqual([]);
  });

  it('returns [] when every bucket is a cache tier (no computed signal)', () => {
    expect(
      cumulativeUniqueInputTokens({
        local_cache_hit: [{ t: 0, value: 100 }],
        'cache hit': [{ t: 0, value: 100 }],
      }),
    ).toEqual([]);
  });
});

describe('inflightUniqueTokens', () => {
  it('sums active ISLs across cids as a step series (ends before starts on ties)', () => {
    const out = inflightUniqueTokens([
      { cid: 'a', start: 0, end: 2e9, isl: 100 },
      { cid: 'a', start: 2e9, end: 4e9, isl: 150 }, // turn handoff at t=2
      { cid: 'b', start: 1e9, end: 3e9, isl: 200 },
    ]);
    expect(out).toEqual([
      { t: 0, value: 0 },
      { t: 0, value: 100 },
      { t: 1, value: 300 },
      { t: 2, value: 200 }, // end of a's turn 1 processed first — no double count
      { t: 2, value: 350 },
      { t: 3, value: 150 },
      { t: 4, value: 0 },
    ]);
  });

  it('counts one in-flight ISL per cid even when its requests overlap', () => {
    const out = inflightUniqueTokens([
      { cid: 'a', start: 0, end: 3e9, isl: 100 },
      { cid: 'a', start: 1e9, end: 2e9, isl: 50 },
    ]);
    expect(out).toEqual([
      { t: 0, value: 0 },
      { t: 0, value: 100 },
      { t: 1, value: 100 }, // nested request folded into the cid's max ISL
      { t: 2, value: 0 },
      { t: 3, value: 0 },
    ]);
  });

  it('skips requests without a positive ISL and empty input', () => {
    expect(inflightUniqueTokens([])).toEqual([]);
    expect(inflightUniqueTokens([{ cid: 'a', start: 0, end: 1e9, isl: null }])).toEqual([]);
    expect(inflightUniqueTokens([{ cid: 'a', start: 0, end: 1e9, isl: 0 }])).toEqual([]);
  });
});

describe('cumulativeDifferenceMonotonic', () => {
  it('unions timestamps and clamps the difference to its running max', () => {
    expect(
      cumulativeDifferenceMonotonic(
        [
          { t: 0, value: 10 },
          { t: 1, value: 10 },
        ],
        [
          { t: 0, value: 5 },
          { t: 2, value: 20 }, // drives the raw diff negative — clamp holds
        ],
      ),
    ).toEqual([
      { t: 0, value: 5 },
      { t: 1, value: 15 },
      { t: 2, value: 15 },
    ]);
  });
});

describe('interpAt', () => {
  it('linearly interpolates between samples and clamps outside the range', () => {
    const data = [
      { t: 0, value: 0 },
      { t: 10, value: 100 },
    ];
    expect(interpAt(data, 5)).toBe(50);
    expect(interpAt(data, -1)).toBe(0);
    expect(interpAt(data, 11)).toBe(100);
    expect(interpAt([], 5)).toBeNull();
  });
});
