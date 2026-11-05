import { describe, expect, it } from 'vitest';

import { countLeq, countLt, cursorStatsAt } from './timeline-cursor-stats';

describe('countLeq / countLt', () => {
  const sorted = [1, 3, 3, 5, 9];

  it('counts values <= / < target with binary search', () => {
    expect(countLeq(sorted, 3)).toBe(3);
    expect(countLt(sorted, 3)).toBe(1);
    expect(countLeq(sorted, 0)).toBe(0);
    expect(countLt(sorted, 0)).toBe(0);
    expect(countLeq(sorted, 9)).toBe(5);
    expect(countLt(sorted, 9)).toBe(4);
    expect(countLeq(sorted, 100)).toBe(5);
  });

  it('handles empty arrays', () => {
    expect(countLeq([], 1)).toBe(0);
    expect(countLt([], 1)).toBe(0);
  });
});

describe('cursorStatsAt', () => {
  const times = {
    credits: [0, 1, 12],
    starts: [2, 5, 14],
    ends: [8, 10, 20],
  };

  it('counts running, waiting, and completed at an instant', () => {
    expect(cursorStatsAt(times, 3)).toEqual({
      running: 1,
      waiting: 1,
      completed: 0,
      inflight: 2,
    });
    expect(cursorStatsAt(times, 6)).toEqual({
      running: 2,
      waiting: 0,
      completed: 0,
      inflight: 2,
    });
    expect(cursorStatsAt(times, 13)).toEqual({
      running: 0,
      waiting: 1,
      completed: 2,
      inflight: 1,
    });
  });

  it('counts a request as still running at its exact end instant', () => {
    expect(cursorStatsAt(times, 8).running).toBe(2);
    expect(cursorStatsAt(times, 8).completed).toBe(1);
  });

  it('never returns negative counts on inconsistent columns', () => {
    expect(cursorStatsAt({ credits: [], starts: [0], ends: [] }, 5).waiting).toBe(0);
  });
});
