import { describe, expect, it } from 'vitest';

import { nearestScrubCandidate } from './powerx-scrub';

describe('nearestScrubCandidate', () => {
  const candidates = [
    { point: 'a', x: 10, y: 10, overlay: false },
    { point: 'b', x: 100, y: 50, overlay: false },
    { point: 'c', x: 100, y: 60, overlay: true },
    { point: 'd', x: Number.NaN, y: 0, overlay: false },
  ];

  it('snaps to the point nearest the finger in plot pixels, official or overlay', () => {
    expect(nearestScrubCandidate(candidates, 0, 0)?.point).toBe('a');
    expect(nearestScrubCandidate(candidates, 100, 52)?.point).toBe('b');
    expect(nearestScrubCandidate(candidates, 100, 58)?.point).toBe('c');
    expect(nearestScrubCandidate(candidates, 400, 400)?.point).toBe('c');
  });

  it('keeps the earlier candidate on a tie and skips unplaced points', () => {
    expect(nearestScrubCandidate(candidates, 100, 55)?.point).toBe('b');
    expect(nearestScrubCandidate([candidates[3]], 0, 0)).toBeNull();
    expect(nearestScrubCandidate([], 0, 0)).toBeNull();
  });
});
