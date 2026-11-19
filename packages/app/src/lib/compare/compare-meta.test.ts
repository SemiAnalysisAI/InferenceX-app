import { describe, expect, it } from 'vitest';

import {
  HW_REGISTRY,
  OG_IMAGE,
  SITE_URL,
  SUPPORTERS_LINE,
  SUPPORTERS_LINE_ZH,
} from '@semianalysisai/inferencex-constants';

import { buildPerDollarMetadata } from '@/app/compare-per-dollar/[slug]/page';
import { metadata as perDollarIndex } from '@/app/compare-per-dollar/page';
import { metadata as precisionIndex } from '@/app/compare-precision/page';
import { metadata as specDecodeIndex } from '@/app/compare-spec-decode/page';
import { metadata as compareIndex } from '@/app/compare/page';
import { metadata as perDollarIndexZh } from '@/app/zh/compare-per-dollar/page';
import { metadata as precisionIndexZh } from '@/app/zh/compare-precision/page';
import { metadata as specDecodeIndexZh } from '@/app/zh/compare-spec-decode/page';
import { metadata as compareIndexZh } from '@/app/zh/compare/page';
import { buildPerDollarMetadataZh } from '@/app/zh/compare-per-dollar/[slug]/page';
import {
  canonicalCompareSlug,
  COMPARE_MODEL_SLUGS,
  compareDisplayLabel,
  compareModelSeoName,
  compareSeoTitle,
} from '@/lib/compare/compare-slug';
import { compareSeoTitleZh } from '@/lib/compare/compare-ssr-zh';
import { META_DESCRIPTION_MAX, META_TITLE_MAX } from '@/lib/seo/meta-text';

import {
  compareSocialImages,
  perDollarMetaDescription,
  perDollarMetaTitle,
  precisionMetaDescription,
  precisionMetaTitle,
  specDecodeMetaDescription,
  specDecodeMetaTitle,
} from './compare-meta';
import {
  perDollarMetaDescriptionZh,
  perDollarMetaTitleZh,
  precisionMetaDescriptionZh,
  precisionMetaTitleZh,
  specDecodeMetaDescriptionZh,
  specDecodeMetaTitleZh,
} from './compare-meta-zh';

const [longA, longB] = Object.keys(HW_REGISTRY).toSorted(
  (x, y) => (HW_REGISTRY[y]?.label.length ?? 0) - (HW_REGISTRY[x]?.label.length ?? 0),
);
const longGpu = HW_REGISTRY[longA]!.label;
const longPairEn = compareDisplayLabel(longA, longB);
const longPairZh = `${HW_REGISTRY[longA]!.label} 与 ${HW_REGISTRY[longB]!.label}`;
const LONG_METHOD = 'EAGLE-3 Multi-Token Prediction';

function expectBounds(title: string, description: string, locale: 'en' | 'zh') {
  expect(title.length, title).toBeLessThanOrEqual(META_TITLE_MAX);
  expect(description.length, description).toBeLessThanOrEqual(META_DESCRIPTION_MAX[locale]);
  expect(description).not.toContain(locale === 'zh' ? SUPPORTERS_LINE_ZH : SUPPORTERS_LINE);
}

describe('compare family title/description builders', () => {
  for (const model of COMPARE_MODEL_SLUGS) {
    const name = compareModelSeoName(model);
    it(`fit the length targets for ${model.slug} with the longest GPU labels`, () => {
      expectBounds(compareSeoTitle(longPairEn, name), 'x', 'en');
      expectBounds(compareSeoTitleZh(longPairZh, name), 'x', 'zh');
      expectBounds(
        perDollarMetaTitle(longPairEn, model.label),
        perDollarMetaDescription(longPairEn, model.label),
        'en',
      );
      expectBounds(
        perDollarMetaTitleZh(longPairZh, model.label),
        perDollarMetaDescriptionZh(longPairZh, model.label),
        'zh',
      );
      expectBounds(
        precisionMetaTitle(model.label, longGpu, 'FP4', 'BF16'),
        precisionMetaDescription(model.label, longGpu, 'FP4', 'BF16'),
        'en',
      );
      expectBounds(
        precisionMetaTitleZh(model.label, longGpu, 'FP4', 'BF16'),
        precisionMetaDescriptionZh(model.label, longGpu, 'FP4', 'BF16'),
        'zh',
      );
      expectBounds(
        specDecodeMetaTitle(model.label, longGpu, 'FP8', LONG_METHOD),
        specDecodeMetaDescription(model.label, longGpu, 'FP8', LONG_METHOD),
        'en',
      );
      expectBounds(
        specDecodeMetaTitleZh(model.label, longGpu, 'FP8', LONG_METHOD),
        specDecodeMetaDescriptionZh(model.label, longGpu, 'FP8', LONG_METHOD),
        'zh',
      );
    });
  }

  it('lead with the model/GPU tokens and keep the metric when it fits', () => {
    expect(perDollarMetaTitle('B200 vs B300', 'GLM 5')).toBe(
      'B200 vs B300: GLM 5 Performance per Dollar',
    );
    expect(perDollarMetaTitleZh('B200 与 B300', 'GLM 5')).toBe('B200 与 B300：GLM 5 每美元性能');
    expect(precisionMetaTitle('GLM 5', 'B200', 'FP4', 'FP8')).toBe(
      'GLM 5 on B200: FP4 vs FP8 Precision',
    );
    expect(specDecodeMetaTitle('GLM 5', 'B200', 'FP8', 'MTP')).toBe(
      'GLM 5 on B200 FP8: MTP vs Off',
    );
    expect(perDollarMetaDescription('B200 vs B300', 'GLM 5').startsWith('B200 vs B300')).toBe(true);
  });

  it('points social images at the per-pair opengraph-image route', () => {
    expect(compareSocialImages('/zh/compare/x', 'alt')).toEqual([
      { url: `${SITE_URL}/zh/compare/x/opengraph-image`, width: 1200, height: 630, alt: 'alt' },
    ]);
  });
});

describe('compare-per-dollar page metadata', () => {
  const [model] = COMPARE_MODEL_SLUGS;
  const slug = canonicalCompareSlug(model!.slug, 'b200', 'mi355x');

  it('uses the per-pair image for og:image and the summary_large_image card (EN + ZH)', () => {
    for (const [meta, path] of [
      [buildPerDollarMetadata(slug, {}), `/compare-per-dollar/${slug}`],
      [
        buildPerDollarMetadataZh(slug, { scenarioSegment: undefined }),
        `/zh/compare-per-dollar/${slug}`,
      ],
    ] as const) {
      const image = expect.objectContaining({ url: `${SITE_URL}${path}/opengraph-image` });
      expect(meta.openGraph).toMatchObject({ images: [image] });
      expect(meta.twitter).toMatchObject({ card: 'summary_large_image', images: [image] });
      expect(String(meta.title).length).toBeLessThanOrEqual(META_TITLE_MAX);
    }
  });
});

describe('compare index page metadata', () => {
  it('fits the length targets and keeps og:image with the large card (EN + ZH)', () => {
    for (const [meta, locale] of [
      [compareIndex, 'en'],
      [perDollarIndex, 'en'],
      [precisionIndex, 'en'],
      [specDecodeIndex, 'en'],
      [compareIndexZh, 'zh'],
      [perDollarIndexZh, 'zh'],
      [precisionIndexZh, 'zh'],
      [specDecodeIndexZh, 'zh'],
    ] as const) {
      expectBounds(String(meta.title), meta.description ?? '', locale);
      const image = expect.objectContaining({ url: OG_IMAGE });
      expect(meta.openGraph).toMatchObject({ images: [image] });
      expect(meta.twitter).toMatchObject({ card: 'summary_large_image', images: [image] });
    }
  });
});
