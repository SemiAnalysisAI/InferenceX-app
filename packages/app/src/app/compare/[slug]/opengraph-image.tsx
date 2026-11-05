import { notFound } from 'next/navigation';

import { renderCompareOg } from '@/lib/compare/compare-og';
import { compareDisplayLabel, parseCompareSlug } from '@/lib/compare/compare-slug';

export const alt = 'Chip inference benchmark comparison';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams(): { slug: string }[] {
  return [];
}

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = parseCompareSlug(slug);
  if (!parsed) notFound();

  const title = compareDisplayLabel(parsed.a, parsed.b);
  const titleSize = title.length > 26 ? 80 : title.length > 18 ? 96 : 112;

  return renderCompareOg({
    eyebrow: `${parsed.model.label} · Head-to-head Chip benchmark`,
    title,
    titleSize,
    footer: 'AI inference benchmark · latency, throughput, cost',
    language: 'en',
    size,
  });
}
