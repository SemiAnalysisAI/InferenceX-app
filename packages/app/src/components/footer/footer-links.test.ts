import { describe, expect, it } from 'vitest';

import { FOOTER_RELIABILITY_LINK } from '@/components/footer/footer-links';

describe('FOOTER_RELIABILITY_LINK', () => {
  it('points to the GPU Reliability page from the footer', () => {
    expect(FOOTER_RELIABILITY_LINK).toEqual({
      href: '/reliability',
      label: 'GPU Reliability',
      testId: 'footer-link-reliability',
      event: 'footer_reliability_clicked',
    });
  });
});
