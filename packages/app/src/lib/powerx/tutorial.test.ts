import { describe, expect, it } from 'vitest';

import { SITE_URL } from '@semianalysisai/inferencex-constants';

import { getPowerXTutorial, powerxTutorialMetadata } from './tutorial';

describe('powerxTutorialMetadata', () => {
  it('lets both locales be indexed with a self canonical and the hreflang pair', () => {
    for (const locale of ['en', 'zh'] as const) {
      const meta = powerxTutorialMetadata(getPowerXTutorial(locale).meta, locale);
      const path = locale === 'zh' ? '/zh/powerx/tutorial' : '/powerx/tutorial';
      expect(meta.robots).toBeUndefined();
      expect(meta.alternates?.canonical).toBe(`${SITE_URL}${path}`);
      expect(meta.alternates?.languages).toMatchObject({
        en: `${SITE_URL}/powerx/tutorial`,
        'zh-CN': `${SITE_URL}/zh/powerx/tutorial`,
      });
      expect(meta.openGraph?.url).toBe(`${SITE_URL}${path}`);
    }
  });
});
