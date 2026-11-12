import { describe, expect, it } from 'vitest';

import { rangeTicks } from './range-ticks';

describe('rangeTicks', () => {
  it('labels the track start, then round steps inside the range', () => {
    expect(rangeTicks(6, 309)).toEqual([6, 50, 100, 150, 200, 250, 300]);
  });

  it('thins to coarser round steps for phones', () => {
    expect(rangeTicks(6, 309, 3)).toEqual([6, 100, 200, 300]);
  });

  it('drops a round step that would crowd the start label', () => {
    expect(rangeTicks(45, 300)).toEqual([45, 100, 150, 200, 250, 300]);
  });

  it('labels nothing on an empty range', () => {
    expect(rangeTicks(40, 40)).toEqual([]);
  });
});
