import { describe, expect, it } from 'vitest';

import {
  LOCKED_RENT_TIERS,
  lockedTierLabel,
  lockedTierValue,
  parseLockedTierValue,
} from '@/components/ui/locked-rent-tiers';

describe('locked rent tiers', () => {
  it('lists the five unpublished rental terms from shortest to longest commit', () => {
    expect(LOCKED_RENT_TIERS.map((tier) => tier.label)).toEqual([
      'Rent - On Demand',
      'Rent - 1 Month Commit',
      'Rent - 6 Month Commit',
      'Rent - 1 Year Commit',
      'Rent - 2 Year Commit',
    ]);
  });

  it('round-trips a bare tier value', () => {
    const value = lockedTierValue('rent_1_year');
    expect(value).toBe('locked:rent_1_year');
    expect(parseLockedTierValue(value)?.id).toBe('rent_1_year');
  });

  it('round-trips a tier value scoped to a metric key', () => {
    const value = lockedTierValue('rent_6_month', 'costr');
    expect(value).toBe('locked:rent_6_month:costr');
    expect(parseLockedTierValue(value)?.id).toBe('rent_6_month');
  });

  it('returns null for real metric keys and cost providers', () => {
    expect(parseLockedTierValue('y_costr')).toBeNull();
    expect(parseLockedTierValue('costh')).toBeNull();
    expect(parseLockedTierValue('custom')).toBeNull();
    expect(parseLockedTierValue('locked:not_a_tier')).toBeNull();
  });

  it('localizes labels', () => {
    const tier = LOCKED_RENT_TIERS[0];
    expect(lockedTierLabel(tier, 'en')).toBe('Rent - On Demand');
    expect(lockedTierLabel(tier, 'zh')).toBe('租赁 - 按需');
  });
});
