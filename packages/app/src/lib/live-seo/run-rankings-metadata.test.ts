import type { Metadata } from 'next';
import { describe, expect, it, vi } from 'vitest';

import {
  OG_IMAGE,
  SITE_NAME,
  SUPPORTERS_LINE,
  SUPPORTERS_LINE_ZH,
} from '@semianalysisai/inferencex-constants';

import { generateMetadata as rankingMeta } from '@/app/rankings/[slug]/page';
import { metadata as rankingIndexMeta } from '@/app/rankings/page';
import { generateMetadata as runMeta } from '@/app/run/[slug]/page';
import { generateMetadata as runIndexMeta } from '@/app/run/page';
import { generateMetadata as rankingMetaZh } from '@/app/zh/rankings/[slug]/page';
import { metadata as rankingIndexMetaZh } from '@/app/zh/rankings/page';
import { generateMetadata as runMetaZh } from '@/app/zh/run/[slug]/page';
import { generateMetadata as runIndexMetaZh } from '@/app/zh/run/page';
import { getAllRankingPageEntries } from '@/lib/live-seo/rankings';
import { getAllRunPageEntries } from '@/lib/live-seo/run-pages';
import { META_DESCRIPTION_MAX, META_TITLE_MAX } from '@/lib/seo/meta-text';

const hoisted = vi.hoisted(() => ({ withData: true }));

vi.mock('@/lib/live-seo/run-rankings-data.server', () => ({
  getAvailableRunEntries: () => Promise.resolve([]),
  getRunPageData: () =>
    Promise.resolve(
      hoisted.withData
        ? {
            hasData: true,
            configCount: 1234,
            primaryTier: 50,
            tierLadder: [{ tier: 50, throughputPerGpu: 123_456.78, costPerMtok: 12.345 }],
          }
        : null,
    ),
  getRankingPageData: () =>
    Promise.resolve(
      hoisted.withData
        ? {
            rows: Array.from({ length: 24 }, () => ({
              hardwareLabel: 'GB300 NVL72 (Dynamo TRT-LLM disaggregated)',
              throughputPerGpu: 123_456.78,
              costPerMtok: 12.345,
            })),
          }
        : null,
    ),
}));

const SUFFIX = ` | ${SITE_NAME}`;

function titleText(meta: Metadata): string {
  const { title } = meta;
  if (typeof title === 'string') return title;
  if (title && typeof title === 'object' && 'absolute' in title && title.absolute) {
    expect(title.absolute.endsWith(SUFFIX)).toBe(true);
    return title.absolute.slice(0, -SUFFIX.length);
  }
  throw new Error('missing title');
}

function expectSocial(meta: Metadata, locale: 'en' | 'zh') {
  const title = titleText(meta);
  expect(title.length).toBeLessThanOrEqual(META_TITLE_MAX);
  const description = meta.description ?? '';
  expect(description.length).toBeGreaterThan(0);
  expect(description.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX[locale]);
  expect(description).not.toContain(locale === 'zh' ? SUPPORTERS_LINE_ZH : SUPPORTERS_LINE);
  expect(meta.openGraph).toMatchObject({ images: [expect.objectContaining({ url: OG_IMAGE })] });
  expect(meta.twitter).toMatchObject({
    card: 'summary_large_image',
    images: [expect.objectContaining({ url: OG_IMAGE })],
  });
}

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe('run and rankings metadata', () => {
  it('index pages emit og:image, the large card, and fit the length targets', () => {
    expectSocial(runIndexMeta(), 'en');
    expectSocial(runIndexMetaZh(), 'zh');
    expectSocial(rankingIndexMeta, 'en');
    expectSocial(rankingIndexMetaZh, 'zh');
  });

  for (const withData of [true, false]) {
    it(`every run page fits the targets with og:image (data: ${withData})`, async () => {
      hoisted.withData = withData;
      for (const entry of getAllRunPageEntries()) {
        expectSocial(await runMeta(params(entry.slug)), 'en');
        expectSocial(await runMetaZh(params(entry.slug)), 'zh');
      }
    });

    it(`every ranking page fits the targets with og:image (data: ${withData})`, async () => {
      hoisted.withData = withData;
      for (const entry of getAllRankingPageEntries()) {
        expectSocial(await rankingMeta(params(entry.slug)), 'en');
        expectSocial(await rankingMetaZh(params(entry.slug)), 'zh');
      }
    });
  }
});
