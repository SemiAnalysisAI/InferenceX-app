import { describe, expect, it } from 'bun:test';

import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { DASHBOARD_ROUTES } from './dashboard-routes';

import { isValidTab, TAB_META } from './tab-meta';
import { isZhTab, TAB_LABELS_ZH, TAB_META_ZH, tabMetadataZh } from './tab-meta-zh';

const HAN_REGEX = /\p{Script=Han}/u;

describe('mirrored dashboard routes', () => {
  const mirroredRoutes = DASHBOARD_ROUTES.filter((route) => route.localeMirrored);

  it.each(mirroredRoutes)('mirrors a valid English tab "$key"', ({ key }) => {
    expect(isValidTab(key)).toBe(true);
    expect(TAB_META[key]).toBeDefined();
  });

  it.each(mirroredRoutes)('has complete Chinese content for "$key"', ({ key }) => {
    expect(TAB_META_ZH[key].title).toMatch(HAN_REGEX);
    expect(TAB_META_ZH[key].description).toMatch(HAN_REGEX);
    expect(TAB_LABELS_ZH[key]).toMatch(HAN_REGEX);
  });
});

describe('isZhTab', () => {
  it('accepts mirrored tabs and rejects unknown ones', () => {
    expect(isZhTab('inference')).toBe(true);
    expect(isZhTab('ai-chart')).toBe(true);
    expect(isZhTab('feedback')).toBe(true);
    expect(isZhTab('nonexistent')).toBe(false);
  });
});

describe('tabMetadataZh', () => {
  it('canonicalizes the inference tab to its own zh URL, not the zh landing page', () => {
    const meta = tabMetadataZh('inference');
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/zh/infx/inference`);
  });

  it('canonicalizes other tabs to their own zh URL with bidirectional hreflang', () => {
    const meta = tabMetadataZh('evaluation');
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/zh/infx/evaluation`);
    expect(meta.alternates?.languages).toEqual({
      en: `${SITE_URL}/infx/evaluation`,
      'zh-CN': `${SITE_URL}/zh/infx/evaluation`,
      'x-default': `${SITE_URL}/infx/evaluation`,
    });
  });

  it('sets the zh Open Graph locale and URL', () => {
    const meta = tabMetadataZh('gpu-specs');
    expect(meta.openGraph?.locale).toBe('zh_CN');
    expect(meta.openGraph?.url).toBe(`${SITE_URL}/zh/infx/gpu-specs`);
  });
});

describe('PowerX copy', () => {
  it('describes energy per token, the PowerX default unit, not per output token', () => {
    expect(TAB_META.powerx.description).toContain('energy per token');
    expect(TAB_META.powerx.description).not.toContain('output token');
    expect(TAB_META_ZH.powerx.description).toContain('每 Token 能耗');
    expect(TAB_META_ZH.powerx.description).not.toContain('输出 Token');
  });
});
