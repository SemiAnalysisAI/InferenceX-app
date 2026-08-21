import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';
import { describe, expect, it } from 'vitest';

import { ZH_OG_LOCALE } from './i18n';
import { buildOverviewMetadata } from './overview-route.server';

const EXPECTED_DESCRIPTIONS = {
  en: 'Compare hyperscaler cost per million total tokens across B200, MI355X, B300, GB200 NVL72, and GB300 NVL72 for the AgentX long-context, multi-turn coding scenario and fixed-sequence scenarios where data is available.',
  zh: '在具备对应数据的模型上，分别按 AgentX 长上下文多轮编码场景与固定序列场景，对比 B200、MI355X、B300、GB200 NVL72 与 GB300 NVL72 的每百万总 token 超大规模云成本。',
} as const;

describe('buildOverviewMetadata', () => {
  it.each(['en', 'zh'] as const)('locks the curated Overview platform wording in %s', (locale) => {
    const metadata = buildOverviewMetadata(locale);

    expect(metadata.description).toBe(EXPECTED_DESCRIPTIONS[locale]);
  });

  it('preserves the English title, canonical URL, and OpenGraph identity', () => {
    const metadata = buildOverviewMetadata('en');

    expect(metadata.title).toBe('Agentic Inference Costs');
    expect(metadata.alternates).toMatchObject({ canonical: `${SITE_URL}/overview` });
    expect(metadata.openGraph).toMatchObject({
      title: `Agentic Inference Costs | ${SITE_NAME}`,
      url: `${SITE_URL}/overview`,
      type: 'website',
    });
    expect(metadata.openGraph).not.toHaveProperty('locale');
  });

  it('preserves the Chinese title, canonical URL, and OpenGraph locale', () => {
    const metadata = buildOverviewMetadata('zh');

    expect(metadata.title).toBe('智能体推理成本');
    expect(metadata.alternates).toMatchObject({ canonical: `${SITE_URL}/zh/overview` });
    expect(metadata.openGraph).toMatchObject({
      title: `智能体推理成本 | ${SITE_NAME}`,
      url: `${SITE_URL}/zh/overview`,
      type: 'website',
      locale: ZH_OG_LOCALE,
    });
  });
});
