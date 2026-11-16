import { describe, expect, it } from 'vitest';

import { scrollMore } from './use-scroll-fade';

describe('scrollMore', () => {
  it('names the edges of a sideways scroller that hide content', () => {
    expect(scrollMore(0, 325, 379)).toBe('end');
    expect(scrollMore(20, 325, 379)).toBe('start end');
    expect(scrollMore(54, 325, 379)).toBe('start');
  });

  it('names no edge when everything fits, within a pixel of rounding', () => {
    expect(scrollMore(0, 325, 325)).toBe('');
    expect(scrollMore(0.6, 325, 325.8)).toBe('');
  });
});
