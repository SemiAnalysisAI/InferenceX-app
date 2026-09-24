import { describe, expect, it } from 'vitest';
import { formatApiPrice, H3_API_REFERENCE } from './api-reference';

describe('H3 API price reference', () => {
  it('is a dated, sourced list price inside its own listed range', () => {
    const { pricePerVideoSecondUsd, rangeUsd, capturedOn, label } = H3_API_REFERENCE;
    expect(pricePerVideoSecondUsd).toBe(0.08);
    expect(rangeUsd).toEqual([0.08, 0.13]);
    expect(pricePerVideoSecondUsd).toBeGreaterThanOrEqual(rangeUsd[0]);
    expect(pricePerVideoSecondUsd).toBeLessThanOrEqual(rangeUsd[1]);
    expect(capturedOn).toBe('2026-09-24');
    expect(Number.isNaN(Date.parse(capturedOn))).toBe(false);
    // The source text must name the official price page and what it leaves unstated, in both locales.
    expect(label.en).toContain('pay-as-you-go pricing page');
    expect(label.en).toContain('no effective date');
    expect(label.zh).toContain('按量付费价格页');
    expect(label.zh).toContain('未标注生效日期');
  });
  it('formats USD per video-second to the input step, keeping a fourth decimal when typed', () => {
    expect(formatApiPrice(0.08)).toBe('$0.080');
    expect(formatApiPrice(0.05)).toBe('$0.050');
    expect(formatApiPrice(0.0345)).toBe('$0.0345');
  });
});
