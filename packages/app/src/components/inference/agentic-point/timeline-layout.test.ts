import { describe, expect, it } from 'vitest';

import { HEADER_HEIGHT, ROW_SPAN, visibleTimelineRowRange } from './timeline-layout';

describe('visibleTimelineRowRange', () => {
  it('bounds a huge timeline to viewport rows plus overscan', () => {
    const range = visibleTimelineRowRange(100_000, HEADER_HEIGHT + 50_000 * ROW_SPAN, 480);
    expect(range.start).toBe(49_996);
    expect(range.end - range.start).toBeLessThanOrEqual(28);
  });

  it('clamps the first and final viewport', () => {
    expect(visibleTimelineRowRange(10, 0, 100)).toEqual({ start: 0, end: 8 });
    expect(visibleTimelineRowRange(10, 10_000, 480)).toEqual({ start: 10, end: 10 });
  });
});
