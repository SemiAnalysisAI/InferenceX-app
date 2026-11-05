import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { clampMetaDescription, fitMetaTitle } from '@/lib/seo/meta-text';
import type { SocialImage } from '@/lib/seo/social-metadata';

/** The per-pair `opengraph-image` route under a compare `[slug]` path (e.g. `/zh/compare/<slug>`). */
export function compareSocialImages(slugPath: string, alt: string): SocialImage[] {
  return [{ url: `${SITE_URL}${slugPath}/opengraph-image`, width: 1200, height: 630, alt }];
}

const SOURCE_EN = `Verified open-source ${SITE_NAME} benchmarks by ${AUTHOR_NAME}.`;

export function perDollarMetaTitle(gpuLabel: string, modelLabel: string): string {
  return fitMetaTitle([
    `${gpuLabel}: ${modelLabel} Performance per Dollar`,
    `${gpuLabel}: ${modelLabel} Perf per Dollar`,
    `${gpuLabel}: ${modelLabel}`,
  ]);
}

export function perDollarMetaDescription(gpuLabel: string, modelLabel: string): string {
  return clampMetaDescription(
    `${gpuLabel} performance per dollar on ${modelLabel}: cost per million tokens at every interactivity level, normalized by hyperscaler TCO. ${SOURCE_EN}`,
    'en',
  );
}

export function precisionMetaTitle(
  modelLabel: string,
  gpuLabel: string,
  aLabel: string,
  bLabel: string,
): string {
  return fitMetaTitle([
    `${modelLabel} on ${gpuLabel}: ${aLabel} vs ${bLabel} Precision`,
    `${modelLabel} ${gpuLabel}: ${aLabel} vs ${bLabel}`,
    `${modelLabel}: ${aLabel} vs ${bLabel}`,
  ]);
}

export function precisionMetaDescription(
  modelLabel: string,
  gpuLabel: string,
  aLabel: string,
  bLabel: string,
): string {
  return clampMetaDescription(
    `${aLabel} vs ${bLabel} for ${modelLabel} on ${gpuLabel}: which quantization level delivers better throughput and cost at every interactivity level. ${SOURCE_EN}`,
    'en',
  );
}

export function specDecodeMetaTitle(
  modelLabel: string,
  gpuLabel: string,
  precLabel: string,
  methodLabel: string,
): string {
  return fitMetaTitle([
    `${modelLabel} on ${gpuLabel} ${precLabel}: ${methodLabel} vs Off`,
    `${modelLabel} ${gpuLabel}: ${methodLabel} vs Off`,
    `${modelLabel}: ${methodLabel} vs Off`,
  ]);
}

export function specDecodeMetaDescription(
  modelLabel: string,
  gpuLabel: string,
  precLabel: string,
  methodLabel: string,
): string {
  return clampMetaDescription(
    `${methodLabel} vs no speculative decoding for ${modelLabel} on ${gpuLabel} ${precLabel}: throughput and cost at every interactivity level. ${SOURCE_EN}`,
    'en',
  );
}
