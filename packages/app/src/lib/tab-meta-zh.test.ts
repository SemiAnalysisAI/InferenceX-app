import { describe, expect, it } from 'vitest';

import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { DASHBOARD_ROUTES } from './dashboard-routes';

import { isValidTab, TAB_META } from './tab-meta';
import {
  isZhTab,
  LANDING_META_ZH,
  TAB_INTRO_ZH,
  TAB_LABELS_ZH,
  TAB_META_ZH,
  tabMetadataZh,
} from './tab-meta-zh';

const HAN_REGEX = /\p{Script=Han}/u;

describe('Chinese agentic inference positioning', () => {
  it('uses the category name for titles and AgentX for the scenario', () => {
    expect(LANDING_META_ZH.title).toContain('智能体推理基准测试');
    expect(LANDING_META_ZH.title).not.toContain('AgentX');
    expect(LANDING_META_ZH.description).toMatch(/AgentX.*场景/u);
    expect(LANDING_META_ZH.description).toContain('固定序列');
    expect(TAB_META_ZH.inference.title).toContain('智能体推理基准测试');
    expect(TAB_META_ZH.inference.title).not.toContain('AgentX');
    expect(TAB_META_ZH.inference.description).toMatch(/AgentX.*工作负载/u);
    expect(TAB_INTRO_ZH.inference).toContain('固定序列');
  });
});

describe('mirrored dashboard routes', () => {
  const mirroredRoutes = DASHBOARD_ROUTES.filter((route) => route.localeMirrored);

  it.each(mirroredRoutes)('mirrors a valid English tab "$key"', ({ key }) => {
    expect(isValidTab(key)).toBe(true);
    expect(TAB_META[key]).toBeDefined();
  });

  it.each(mirroredRoutes)('has complete Chinese content for "$key"', ({ key }) => {
    // Actual Chinese text, not an English placeholder that slipped through.
    expect(TAB_META_ZH[key].title).toMatch(HAN_REGEX);
    expect(TAB_META_ZH[key].description).toMatch(HAN_REGEX);
    expect(TAB_INTRO_ZH[key]).toMatch(HAN_REGEX);
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
