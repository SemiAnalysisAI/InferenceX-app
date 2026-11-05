import { describe, expect, it } from 'vitest';

import {
  CONTEXT_CAP,
  FIRST_FRAME,
  type Frame,
  LAST_FRAME,
  nextFrame,
  REPLAY,
  REPLAY_ROWS,
  visibleTokens,
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

describe('replay frames', () => {
  it('walks every step through cache, prefill and decode, then loops', () => {
    const seen: Frame[] = [];
    let frame = FIRST_FRAME;
    do {
      seen.push(frame);
      frame = nextFrame(frame);
    } while (frame !== FIRST_FRAME);
    expect(seen).toHaveLength(REPLAY.length * 3);
    expect(seen.at(-1)).toEqual(LAST_FRAME);
    expect(seen.slice(0, 4).map((f) => `${f.step}:${f.phase}`)).toEqual([
      '0:cached',
      '0:prefill',
      '0:decode',
      '1:cached',
    ]);
  });

  it('reveals the active request one segment per phase and hides later ones', () => {
    const [row] = REPLAY[1].rows;
    expect(visibleTokens(row, { step: 0, phase: 'decode' })).toBeNull();
    expect(visibleTokens(row, { step: 1, phase: 'cached' })).toEqual({
      cached: row.cached,
      fresh: 0,
      output: 0,
    });
    expect(visibleTokens(row, { step: 1, phase: 'prefill' })).toMatchObject({
      fresh: row.fresh,
      output: 0,
    });
    expect(visibleTokens(row, { step: 2, phase: 'cached' })).toBe(row);
  });
});
