import { notFound } from 'next/navigation';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { renderCompareOg } from '@/lib/compare-og';
import {
  canonicalSpecDecodeCompareSlug,
  parseSpecDecodeCompareSlug,
  precisionDisplayLabel,
  specMethodDisplayLabel,
} from '@/lib/compare-variant-slug';

export const alt = 'Chip speculative decoding inference benchmark comparison';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Rendered on demand (then cached) rather than prerendered at build time.
// Enumerating every comparable slug here queued ~700 satori renders per build
// across the compare-family OG routes, dominating `next build` static
// generation time. These images are only fetched by link-preview crawlers, so
// on-demand rendering with the default ISR cache serves them at the same URLs
// with no build-time cost. Returning [] (vs deleting generateStaticParams)
// keeps the route statically cacheable instead of per-request dynamic.
export function generateStaticParams(): { slug: string }[] {
  return [];
}

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = parseSpecDecodeCompareSlug(slug);
  if (
    !parsed ||
    canonicalSpecDecodeCompareSlug(
      parsed.model.slug,
      parsed.gpu,
      parsed.precision,
      parsed.method,
    ) !== slug.toLowerCase()
  ) {
    notFound();
  }

  const gpuLabel = HW_REGISTRY[parsed.gpu]?.label ?? parsed.gpu.toUpperCase();
  const precisionLabel = precisionDisplayLabel(parsed.precision);
  const methodLabel = specMethodDisplayLabel(parsed.model.displayName, parsed.method);
  const title = `${gpuLabel} ${precisionLabel}: ${methodLabel} vs Off`;
  const titleSize = title.length > 34 ? 72 : title.length > 26 ? 80 : title.length > 18 ? 96 : 112;

  return renderCompareOg({
    eyebrow: `${parsed.model.label} · Speculative Decoding`,
    title,
    titleSize,
    footer: 'AI inference benchmark · speculative decoding comparison',
    language: 'en',
    size,
  });
}
