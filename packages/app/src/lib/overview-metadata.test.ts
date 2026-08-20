import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';
import { describe, expect, it } from 'vitest';

import { ZH_OG_LOCALE } from './i18n';
import { OVERVIEW_HARDWARE, overviewHardwareLabel } from './overview-data';
import { buildOverviewMetadata } from './overview-route.server';

const CURATED_LABELS = OVERVIEW_HARDWARE.map((hardware) => overviewHardwareLabel(hardware));
const NON_OVERVIEW_LABELS = ['h100', 'h200', 'mi300x', 'mi325x', 'rtx6000pro'].map((hardware) =>
  overviewHardwareLabel(hardware),
);

describe('buildOverviewMetadata', () => {
  it.each(['en', 'zh'] as const)('names only the curated Overview platforms in %s', (locale) => {
    const metadata = buildOverviewMetadata(locale);
    const description = metadata.description;

    expect(typeof description).toBe('string');
    for (const label of CURATED_LABELS) expect(description).toContain(label);
    for (const label of NON_OVERVIEW_LABELS) expect(description).not.toContain(label);
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
