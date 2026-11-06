import { describe, expect, it } from 'vitest';

import { rangeTicks } from './range-ticks';

describe('rangeTicks', () => {
  it('labels a slider range with round steps inside it', () => {
    expect(rangeTicks(6, 309)).toEqual([50, 100, 150, 200, 250, 300]);
  });

  it('thins to coarser round steps for phones', () => {
    expect(rangeTicks(6, 309, 3)).toEqual([100, 200, 300]);
  });

  it('labels nothing on an empty range', () => {
    expect(rangeTicks(40, 40)).toEqual([]);
  });
});
