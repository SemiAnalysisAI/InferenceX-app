import { describe, expect, it } from 'vitest';
import { formatApiPrice, H3_API_REFERENCE } from './api-reference';

describe('H3 API price reference', () => {
  it('is a dated, sourced list price inside its own listed range', () => {
    const { pricePerVideoSecondUsd, rangeUsd, capturedOn, label } = H3_API_REFERENCE;
    expect(pricePerVideoSecondUsd).toBe(0.034);
    expect(rangeUsd).toEqual([0.034, 0.047]);
    expect(pricePerVideoSecondUsd).toBeGreaterThanOrEqual(rangeUsd[0]);
    expect(pricePerVideoSecondUsd).toBeLessThanOrEqual(rangeUsd[1]);
    expect(capturedOn).toBe('2026-09-19');
    expect(Number.isNaN(Date.parse(capturedOn))).toBe(false);
    // The source text must keep saying what was not verified, in both locales.
    expect(label.en).toContain('MiniMax Design');
    expect(label.en).toContain('not verified');
    expect(label.zh).toContain('MiniMax Design');
    expect(label.zh).toContain('未在按量付费页面核实');
  });
  it('formats USD per video-second to the input step, keeping a fourth decimal when typed', () => {
    expect(formatApiPrice(0.034)).toBe('$0.034');
    expect(formatApiPrice(0.05)).toBe('$0.050');
    expect(formatApiPrice(0.0345)).toBe('$0.0345');
  });
});
