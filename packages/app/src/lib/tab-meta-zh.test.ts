import { describe, expect, it } from 'vitest';

import { SITE_URL } from '@semianalysisai/inferencex-constants';

import { isValidTab, TAB_META } from './tab-meta';
import {
  isZhTab,
  TAB_INTRO_ZH,
  TAB_LABELS_ZH,
  TAB_META_ZH,
  tabMetadataZh,
  ZH_TAB_KEYS,
} from './tab-meta-zh';

const HAN_REGEX = /\p{Script=Han}/u;

describe('ZH_TAB_KEYS', () => {
  it.each(ZH_TAB_KEYS)('mirrors a valid English tab "%s"', (tab) => {
    expect(isValidTab(tab)).toBe(true);
    expect(TAB_META[tab]).toBeDefined();
  });

  it.each(ZH_TAB_KEYS)('has complete Chinese meta, intro, and label for "%s"', (tab) => {
    // Actual Chinese text, not an English placeholder that slipped through.
    expect(TAB_META_ZH[tab].title).toMatch(HAN_REGEX);
    expect(TAB_META_ZH[tab].description).toMatch(HAN_REGEX);
    expect(TAB_INTRO_ZH[tab]).toMatch(HAN_REGEX);
    expect(TAB_LABELS_ZH[tab]).toMatch(HAN_REGEX);
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
  it('canonicalizes the inference tab to the zh homepage, mirroring English', () => {
    const meta = tabMetadataZh('inference');
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/zh`);
  });

  it('canonicalizes other tabs to their own zh URL with bidirectional hreflang', () => {
    const meta = tabMetadataZh('evaluation');
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/zh/evaluation`);
    expect(meta.alternates?.languages).toEqual({
      en: `${SITE_URL}/evaluation`,
      'zh-CN': `${SITE_URL}/zh/evaluation`,
      'x-default': `${SITE_URL}/evaluation`,
    });
  });

  it('sets the zh Open Graph locale and URL', () => {
    const meta = tabMetadataZh('gpu-specs');
    expect(meta.openGraph?.locale).toBe('zh_CN');
    expect(meta.openGraph?.url).toBe(`${SITE_URL}/zh/gpu-specs`);
  });
});
