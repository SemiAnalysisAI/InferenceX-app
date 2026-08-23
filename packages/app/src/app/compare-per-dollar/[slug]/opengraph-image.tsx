import { notFound } from 'next/navigation';

import { getAllComparableCompareSlugs } from '@/lib/compare-availability';
import { renderCompareOg } from '@/lib/compare-og';
import { canonicalCompareSlug, compareDisplayLabel, parseCompareSlug } from '@/lib/compare-slug';

export const alt = 'Chip performance-per-dollar inference benchmark comparison';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export async function generateStaticParams() {
  const slugs = await getAllComparableCompareSlugs();
  return slugs.map(({ modelSlug, a, b }) => ({ slug: canonicalCompareSlug(modelSlug, a, b) }));
}

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = parseCompareSlug(slug);
  if (!parsed) notFound();

  const title = compareDisplayLabel(parsed.a, parsed.b);
  const titleSize = title.length > 26 ? 80 : title.length > 18 ? 96 : 112;

  return renderCompareOg({
    eyebrow: `${parsed.model.label} · Performance per Dollar`,
    title,
    titleSize,
    footer: 'AI inference benchmark · cost per million tokens',
    language: 'en',
    size,
  });
}
