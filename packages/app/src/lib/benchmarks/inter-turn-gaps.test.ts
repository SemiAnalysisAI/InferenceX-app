import { describe, expect, it } from 'vitest';
import type { RequestRecord, RequestTimeline } from '@/hooks/api/use-request-timeline';
import { interTurnGaps } from './inter-turn-gaps';

const request = (
  ti: number,
  start: number,
  end: number,
  overrides: Partial<RequestRecord> = {},
): RequestRecord => ({
  cid: 'session',
  ri: 1,
  ti,
  start: start * 1e9,
  end: end * 1e9,
  phase: 'profiling',
  cancelled: false,
  wid: 'worker',
  ad: 0,
  credit: 0,
  ack: null,
  ttftMs: null,
  tpotMs: null,
  isl: null,
  osl: null,
  ...overrides,
});
const timeline = (requests: RequestRecord[]): RequestTimeline => ({
  version: 6,
  startNs: 0,
  endNs: 1e13,
  durationS: 10000,
  requests,
});

describe('observed inter-turn gaps', () => {
  it('separates replay and exact child sessions, keeps long gaps and sorts input', () => {
    const data = timeline([
      request(1, 2405, 2406),
      request(0, 0, 5),
      request(0, 0, 1, { ri: 2 }),
      request(1, 3, 4, { ri: 2 }),
      request(0, 0, 2, { cid: 'session::sa:1' }),
      request(1, 7, 8, { cid: 'session::sa:1' }),
      request(0, 0, 2, { phase: 'warmup', ri: 3 }),
      request(1, 2, 3, { phase: 'warmup', ri: 3 }),
    ]);
    const result = interTurnGaps(data);
    expect(result.profiling.toSorted((a, b) => a - b)).toEqual([2, 5, 2400]);
    expect(result.warmup).toEqual([0]);
  });
  it('does not bridge cancelled, missing, overlapping, cross-phase or unidentified turns', () => {
    const cases = [
      [request(0, 0, 1), request(1, 3, 4, { cancelled: true }), request(2, 6, 7)],
      [request(0, 0, 1), request(2, 3, 4)],
      [request(0, 0, 5), request(1, 3, 6)],
      [request(0, 0, 1, { phase: 'warmup' }), request(1, 3, 4)],
      [request(0, 0, 1, { ri: undefined }), request(1, 3, 4, { ri: undefined })],
      [request(0, 0, 1, { end: NaN }), request(1, 3, 4)],
    ];
    for (const records of cases) expect(interTurnGaps(timeline(records)).profiling).toEqual([]);
  });
});
