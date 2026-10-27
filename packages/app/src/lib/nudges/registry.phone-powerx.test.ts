// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { MOBILE_VIEWPORT_QUERY } from '@/hooks/useMediaQuery';
import { stubMatchMedia } from '@/test/match-media-stub';

import { isPhoneWidthPowerX, NUDGE_REGISTRY } from './registry';

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('dashboard toasts on a phone-width PowerX page', () => {
  it('is suppressed on /powerx and /zh/powerx under md only', () => {
    const media = stubMatchMedia({ [MOBILE_VIEWPORT_QUERY]: true });
    window.history.replaceState({}, '', '/powerx?i_metric=y_measuredAvgPower');
    expect(isPhoneWidthPowerX()).toBe(true);
    window.history.replaceState({}, '', '/zh/powerx');
    expect(isPhoneWidthPowerX()).toBe(true);
    // Other dashboard tabs keep their toasts at any width.
    window.history.replaceState({}, '', '/inference/qwen-3-5');
    expect(isPhoneWidthPowerX()).toBe(false);
    window.history.replaceState({}, '', '/');
    expect(isPhoneWidthPowerX()).toBe(false);
    // From md up PowerX shows them too.
    media.set(MOBILE_VIEWPORT_QUERY, false);
    window.history.replaceState({}, '', '/powerx');
    expect(isPhoneWidthPowerX()).toBe(false);
  });

  it('gates every dashboard toast through that check', () => {
    const media = stubMatchMedia({ [MOBILE_VIEWPORT_QUERY]: true });
    const toasts = NUDGE_REGISTRY.filter((n) => n.scope === 'dashboard' && n.type === 'toast');
    expect(toasts.map((n) => n.id)).toEqual([
      'reproducibility',
      'star-nudge',
      'export',
      'gradient-label',
      'filter-hint',
    ]);
    window.history.replaceState({}, '', '/powerx');
    for (const toast of toasts) {
      expect(
        toast.conditions?.some((condition) => !condition.check()),
        toast.id,
      ).toBe(true);
    }
    media.set(MOBILE_VIEWPORT_QUERY, false);
    window.history.replaceState({}, '', '/powerx');
    for (const toast of toasts.filter((n) => n.id !== 'filter-hint')) {
      expect(
        toast.conditions?.every((condition) => condition.check()),
        toast.id,
      ).toBe(true);
    }
  });
});
