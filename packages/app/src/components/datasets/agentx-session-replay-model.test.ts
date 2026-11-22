import { describe, expect, it } from 'bun:test';

import {
  CONTEXT_CAP,
  DISPLAY_ROWS,
  DURATION_MS,
  frameAt,
  NOTES,
  REPLAY,
  REPLAY_ROWS,
  REST_FRAME,
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

describe('replay timeline', () => {
  it('shows four notes in one play and speeds up through the look-alike main turns', () => {
    const notes: string[] = [];
    for (let time = 0; time <= DURATION_MS; time += 10) {
      const note = NOTES[frameAt(time).step];
      if (note !== notes.at(-1)) notes.push(note);
    }
    expect(notes).toEqual(['mainTurns', 'warmStart', 'fanOut', 'subagentsReturn', 'mainTurns']);
    expect(TIMELINE.slice(6).map((timing) => timing.end - timing.start)).toEqual([
      900, 800, 700, 600, 500, 500, 500, 500, 500, 500,
    ]);
    expect(frameAt(0)).toEqual({ ...REST_FRAME, phase: 'out' });
    expect(frameAt(DURATION_MS)).toBe(REST_FRAME);
  });

  it('shows each number once its bar segment starts, always for the step being drawn', () => {
    const [row] = REPLAY[1].rows;
    const { start, prefill, decode } = TIMELINE[1];
    expect(frameAt(start)).toMatchObject({ cached: row.cached, fresh: null, output: null });
    expect(frameAt(prefill)).toMatchObject({ fresh: row.fresh, output: null });
    expect(frameAt(decode).output).toBe(row.output);
    expect(frameAt(TIMELINE[0].start).hit).toBeNull();
    // A fan-out step reports its three parallel requests together.
    expect(frameAt(TIMELINE[3].decode)).toMatchObject({ cached: 0, fresh: 28_500, output: 820 });
    // A quick main turn sets every number at once.
    const [quick] = REPLAY[8].rows;
    expect(frameAt(TIMELINE[8].start)).toMatchObject({ fresh: quick.fresh, output: quick.output });
  });

  it("draws a subagent's second request under its first and carries each bar from its agent", () => {
    expect(DISPLAY_ROWS.slice(3, 9).map((row) => row.lane)).toEqual([0, 0, 1, 1, 2, 2]);
    // The main agent resumes below the six subagent rows, 7 rows under its previous request.
    expect(DISPLAY_ROWS.slice(0, 10).map((row) => row.carry)).toEqual([
      0, 1, 1, 0, 1, 0, 1, 0, 1, 7,
    ]);
    for (const [index, row] of DISPLAY_ROWS.entries()) {
      const from = DISPLAY_ROWS[index - row.carry];
      if (row.carry) expect(row.cached).toBe(from.cached + from.fresh + from.output);
    }
  });
});
