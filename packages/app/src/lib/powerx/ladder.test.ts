import { describe, expect, it } from 'vitest';

import { buildLadder } from './ladder';

describe('buildLadder', () => {
  it('keeps the Bianca board together at the start of an NVL72 ladder', () => {
    const ladder = buildLadder('gb200', 700)!;
    const categories = ladder.segments.map((segment) => segment.category);
    expect(categories.slice(0, 3)).toEqual(['gpu', 'cpu', 'memory']);
    expect(ladder.board?.categories).toEqual(['gpu', 'cpu', 'memory']);
    const boardWatts = ladder.segments.slice(0, 3).reduce((sum, segment) => sum + segment.watts, 0);
    expect(ladder.board?.watts).toBeCloseTo(boardWatts, 9);
    const rest = ladder.segments.slice(3).map((segment) => segment.watts);
    expect(rest).toEqual(rest.toSorted((a, b) => b - a));
  });

  it('leaves eight-GPU chassis without a board and sorts every modeled part by size', () => {
    for (const hardware of ['b200', 'mi355x'] as const) {
      const ladder = buildLadder(hardware, 700)!;
      expect(ladder.board).toBeNull();
      const modeled = ladder.segments.slice(1).map((segment) => segment.watts);
      expect(modeled).toEqual(modeled.toSorted((a, b) => b - a));
    }
  });
});
