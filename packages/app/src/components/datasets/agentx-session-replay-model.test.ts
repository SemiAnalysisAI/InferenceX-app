import { describe, expect, it } from 'vitest';

import {
  carryDistance,
  CONTEXT_CAP,
  DISPLAY_ROWS,
  DURATION_MS,
  frameAt,
  LEAD_OUT_MS,
  nextChange,
  REPLAY,
  REPLAY_ROWS,
  REST_FRAME,
  sessionCacheHit,
  TIMELINE,
  WARM_PREFIX,
} from './agentx-session-replay-model';

function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

describe('session replay script', () => {
  it('serves each request the full previous context of its own lane from cache', () => {
    const lastTotal = new Map<number | null, number>([[null, WARM_PREFIX]]);
    for (const row of REPLAY_ROWS) {
      expect(row.cached).toBe(lastTotal.get(row.lane) ?? 0);
      lastTotal.set(row.lane, row.cached + row.fresh + row.output);
    }
  });

  it('matches the published v1.0 profile quoted in the footnote', () => {
    expect(REPLAY_ROWS).toHaveLength(20);
    expect(Math.round(median(REPLAY_ROWS.map((row) => row.cached + row.fresh)) / 1000)).toBe(142);
    expect(median(REPLAY_ROWS.map((row) => row.output))).toBe(444);
    const fanOuts = REPLAY.filter((step) => step.note === 'fanOut');
    expect(fanOuts).toHaveLength(1);
    expect(fanOuts[0].rows).toHaveLength(3);
  });

  it('keeps every request inside the plotted context axis', () => {
    for (const row of REPLAY_ROWS) {
      expect(row.cached + row.fresh + row.output).toBeLessThanOrEqual(CONTEXT_CAP);
    }
  });
});

describe('replay layout', () => {
  it("puts each subagent's second request directly under its first", () => {
    const lanes = DISPLAY_ROWS.map((row) => (row.lane === null ? 'main' : `sub${row.lane + 1}`));
    expect(lanes.slice(0, 3)).toEqual(['main', 'main', 'main']);
    expect(lanes.slice(3, 9)).toEqual(['sub1', 'sub1', 'sub2', 'sub2', 'sub3', 'sub3']);
    expect(new Set(lanes.slice(9))).toEqual(new Set(['main']));
    expect(
      DISPLAY_ROWS.toSorted((a, b) => a.step - b.step || (a.lane ?? 0) - (b.lane ?? 0)),
    ).toEqual(REPLAY_ROWS);
  });

  it("carries a cached prefix down from the same agent's previous request", () => {
    const distances = DISPLAY_ROWS.map((_, index) => carryDistance(DISPLAY_ROWS, index));
    // The warm prefix and each subagent's first request have nothing above them to carry.
    expect(distances.slice(0, 9)).toEqual([0, 1, 1, 0, 1, 0, 1, 0, 1]);
    // The main agent resumes below the six subagent rows, so its context comes from 7 rows up.
    expect(distances[9]).toBe(7);
    expect(distances.slice(10)).toEqual(Array.from({ length: 10 }, () => 1));
    for (const [index, distance] of distances.entries()) {
      if (distance === 0) continue;
      const from = DISPLAY_ROWS[index - distance];
      expect(DISPLAY_ROWS[index].cached).toBe(from.cached + from.fresh + from.output);
    }
  });
});

describe('replay timeline', () => {
  it('is the finished chart outside a play and fades it out before drawing', () => {
    expect(frameAt(-1)).toBe(REST_FRAME);
    expect(frameAt(DURATION_MS)).toBe(REST_FRAME);
    expect(frameAt(Number.NaN)).toBe(REST_FRAME);
    expect(frameAt(0)).toEqual({ ...REST_FRAME, phase: 'out' });
    expect(frameAt(LEAD_OUT_MS)).toMatchObject({ phase: 'play', step: 0, caption: 'warmStart' });
    expect(REST_FRAME).toMatchObject({
      step: REPLAY.length - 1,
      caption: 'mainTurns',
      cached: REPLAY_ROWS.at(-1)?.cached,
      hit: sessionCacheHit(REPLAY_ROWS, REPLAY.length - 1),
    });
  });

  it('draws each step cache first, then prefill, then output, with no gap between steps', () => {
    expect(TIMELINE[0].start).toBe(LEAD_OUT_MS);
    for (const [step, timing] of TIMELINE.entries()) {
      expect(timing.start).toBeLessThan(timing.prefill);
      expect(timing.prefill).toBeLessThan(timing.decode);
      expect(timing.decode).toBeLessThan(timing.end);
      expect(timing.end).toBe(TIMELINE[step + 1]?.start ?? DURATION_MS);
    }
  });

  it('changes the caption four times and speeds up through the look-alike main turns', () => {
    const captions: string[] = [];
    for (let time = 0; time <= DURATION_MS; time += 10) {
      const { caption } = frameAt(time);
      if (caption !== captions.at(-1)) captions.push(caption);
    }
    expect(captions).toEqual(['mainTurns', 'warmStart', 'fanOut', 'subagentsReturn', 'mainTurns']);

    const run = TIMELINE.slice(6).map((timing) => timing.end - timing.start);
    expect(run).toEqual([900, 800, 700, 600, 500, 500, 500, 500, 500, 500]);
  });

  it('shows a number only once its bar segment starts, always for the step being drawn', () => {
    // A slow step fills in one number at a time.
    const [row] = REPLAY[1].rows;
    const { start, prefill, decode } = TIMELINE[1];
    expect(frameAt(start)).toMatchObject({
      step: 1,
      cached: row.cached,
      fresh: null,
      output: null,
      hit: sessionCacheHit(REPLAY_ROWS, 0),
    });
    expect(frameAt(prefill - 1).fresh).toBeNull();
    expect(frameAt(prefill)).toMatchObject({
      fresh: row.fresh,
      output: null,
      hit: sessionCacheHit(REPLAY_ROWS, 1),
    });
    expect(frameAt(decode - 1).output).toBeNull();
    expect(frameAt(decode).output).toBe(row.output);
    // Before the first request's input is drawn there is no cache hit to report.
    expect(frameAt(TIMELINE[0].start).hit).toBeNull();
    // A fan-out step reports its three parallel requests together.
    expect(frameAt(TIMELINE[3].decode)).toMatchObject({ cached: 0, fresh: 28_500, output: 820 });
    // The quick run sets all four numbers once per request.
    const [quick] = REPLAY[8].rows;
    expect(frameAt(TIMELINE[8].start)).toMatchObject({
      cached: quick.cached,
      fresh: quick.fresh,
      output: quick.output,
      hit: sessionCacheHit(REPLAY_ROWS, 8),
    });
  });

  it('reports every moment the frame changes, and nothing in between', () => {
    const changes: number[] = [];
    for (let time = nextChange(0); time !== null; time = nextChange(time)) changes.push(time);
    expect(changes.at(-1)).toBe(DURATION_MS);
    // Lead-out end (= step 0 start), then 3 moments for each of the 6 slow steps and 1 for
    // each of the 10 quick ones, then the end.
    expect(changes).toHaveLength(6 * 3 + 10 + 1);
    let previous = frameAt(0);
    for (const time of changes) {
      expect(frameAt(time - 1)).toEqual(previous);
      expect(frameAt(time)).not.toEqual(previous);
      previous = frameAt(time);
    }
    expect(nextChange(DURATION_MS)).toBeNull();
  });
});
