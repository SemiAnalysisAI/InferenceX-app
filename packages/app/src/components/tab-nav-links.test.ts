import { describe, expect, it } from 'vitest';

import { TAB_LINKS, isTabLinkValue } from '@/components/tab-nav-links';

describe('TAB_LINKS', () => {
  it('omits GPU Reliability from the visible tab navigation', () => {
    expect(TAB_LINKS.map((tab) => tab.href)).toEqual([
      '/inference',
      '/evaluation',
      '/historical',
      '/calculator',
      '/gpu-specs',
      '/gpu-metrics',
      '/submissions',
    ]);
  });
});

describe('isTabLinkValue', () => {
  it('returns false for the footer-only reliability route', () => {
    expect(isTabLinkValue('reliability')).toBe(false);
  });

  it('returns true for routes still shown in the nav', () => {
    expect(isTabLinkValue('gpu-specs')).toBe(true);
  });
});
