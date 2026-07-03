import { describe, expect, it } from 'vitest';

import { sparseLogTicks } from './axis';

describe('sparseLogTicks', () => {
  it('uses sparse 1-2-5 ticks for a typical latency domain', () => {
    expect(sparseLogTicks([48, 225], 5)).toEqual([50, 100, 200]);
  });

  it('caps wide domains without restoring dense minor ticks', () => {
    expect(sparseLogTicks([0.1, 1000], 5)).toEqual([0.1, 1, 10, 100, 1000]);
  });

  it('falls back to a small geometric set for a narrow domain', () => {
    expect(sparseLogTicks([52, 65], 4)).toEqual([52, 58, 65]);
  });

  it('handles reversed and invalid domains', () => {
    expect(sparseLogTicks([225, 48], 5)).toEqual([50, 100, 200]);
    expect(sparseLogTicks([0, Number.NaN], 5)).toEqual([]);
  });
});
