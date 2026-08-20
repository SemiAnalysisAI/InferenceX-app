import { notFound } from 'next/navigation';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { renderCompareOg } from '@/lib/compare-og';
import { getAllComparablePrecisionSlugs } from '@/lib/compare-variant-availability';
import {
  canonicalPrecisionCompareSlug,
  parsePrecisionCompareSlug,
  precisionDisplayLabel,
} from '@/lib/compare-variant-slug';

export const alt = 'Chip precision inference benchmark comparison';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export async function generateStaticParams() {
  const slugs = await getAllComparablePrecisionSlugs();
  return slugs.map(({ modelSlug, gpu, precA, precB }) => ({
    slug: canonicalPrecisionCompareSlug(modelSlug, gpu, precA, precB),
  }));
}

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = parsePrecisionCompareSlug(slug);
  if (
    !parsed ||
    canonicalPrecisionCompareSlug(parsed.model.slug, parsed.gpu, parsed.precA, parsed.precB) !==
      slug.toLowerCase()
  ) {
    notFound();
  }

  const gpuLabel = HW_REGISTRY[parsed.gpu]?.label ?? parsed.gpu.toUpperCase();
  const aLabel = precisionDisplayLabel(parsed.precA);
  const bLabel = precisionDisplayLabel(parsed.precB);
  const title = `${gpuLabel}: ${aLabel} vs ${bLabel}`;
  const titleSize = title.length > 26 ? 80 : title.length > 18 ? 96 : 112;

  return renderCompareOg({
    eyebrow: `${parsed.model.label} · Precision Comparison`,
    title,
    titleSize,
    footer: 'AI inference benchmark · precision comparison',
    language: 'en',
    size,
  });
}
