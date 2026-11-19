import { describe, expect, it } from 'vitest';
import { zeroAnchoredDomain } from './chart-domain';

// Every Y metric the chart plots today is positive-only, but the helper stays
// sign-agnostic (chart-domain.ts), so two signed samples keep the shapes it must
// still handle: an all-negative set and a mixed-sign set, sized like $/GPU-hr
// margins of the retained H100/H200/B200 C1 cells. VIDEOS_PER_DOLLAR is their
// hyperscaler-tier videos per $1 TCO (cypress/fixtures/api/video-history.json,
// asserted per point in metrics.test.ts).
const RENTAL_LOSSES = [-0.5382, -1.2753, -0.5649];
const ALLOCATED_HYPERSCALER = [-0.4391, 0.4047, -0.16];
// Videos per $1 TCO at the hyperscaler tier: H100, H200, B200.
const VIDEOS_PER_DOLLAR = [4.593, 4.896, 6.663];

describe('zeroAnchoredDomain', () => {
  it('pads positive-only data above zero', () => {
    const [lo, hi] = zeroAnchoredDomain(VIDEOS_PER_DOLLAR, 1.15);
    expect(lo).toBe(0);
    expect(hi).toBeCloseTo(6.663 * 1.15, 6);
  });
  it('caps all-negative data at break-even instead of a synthetic ceiling', () => {
    // Regression: `maxY * 1.15 || 1` read a zero ceiling as missing data and pinned the top at 1.
    const [lo, hi] = zeroAnchoredDomain(RENTAL_LOSSES, 1.15);
    expect(hi).toBe(0);
    expect(lo).toBeCloseTo(-1.2753 * 1.15, 6);
  });
  it('pads both ends of mixed data', () => {
    const [lo, hi] = zeroAnchoredDomain(ALLOCATED_HYPERSCALER, 1.15);
    expect(lo).toBeCloseTo(-0.4391 * 1.15, 6);
    expect(hi).toBeCloseTo(0.4047 * 1.15, 6);
  });
  it('falls back to a unit domain only without data, or when every value is zero', () => {
    expect(zeroAnchoredDomain([], 1.15)).toEqual([0, 1]);
    expect(zeroAnchoredDomain([0, 0], 1.15)).toEqual([0, 1]);
  });
});
