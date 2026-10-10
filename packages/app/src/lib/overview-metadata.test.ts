import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';
import { describe, expect, it } from 'vitest';

import { ZH_OG_LOCALE } from './i18n';
import { OVERVIEW_HARDWARE, overviewHardwareLabel } from './overview-data';
import { buildOverviewMetadata } from './overview-route.server';

describe('buildOverviewMetadata', () => {
  it.each(['en', 'zh'] as const)('includes the configured platforms in %s metadata', (locale) => {
    const metadata = buildOverviewMetadata(locale);

    for (const hardware of OVERVIEW_HARDWARE) {
      expect(metadata.description).toContain(overviewHardwareLabel(hardware));
    }
    if (locale === 'zh') {
      expect(metadata.title).toMatch(/\p{Script=Han}/u);
      expect(metadata.description).toMatch(/\p{Script=Han}/u);
    }
    expect(metadata.openGraph?.description).toBe(metadata.description);
    expect(metadata.twitter?.description).toBe(metadata.description);
  });

  it('uses the English canonical URL and matching OpenGraph title', () => {
    const metadata = buildOverviewMetadata('en');

    expect(metadata.alternates).toMatchObject({ canonical: `${SITE_URL}/overview` });
    expect(metadata.openGraph).toMatchObject({
      title: `${metadata.title} | ${SITE_NAME}`,
      url: `${SITE_URL}/overview`,
      type: 'website',
    });
    expect(metadata.openGraph).not.toHaveProperty('locale');
  });

  it('uses the Chinese canonical URL, matching OpenGraph title, and locale', () => {
    const metadata = buildOverviewMetadata('zh');

    expect(metadata.alternates).toMatchObject({ canonical: `${SITE_URL}/zh/overview` });
    expect(metadata.openGraph).toMatchObject({
      title: `${metadata.title} | ${SITE_NAME}`,
      url: `${SITE_URL}/zh/overview`,
      type: 'website',
      locale: ZH_OG_LOCALE,
    });
  });
});
