import { notFound } from 'next/navigation';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { renderCompareOg } from '@/lib/compare-og';
import { parseCompareSlug } from '@/lib/compare-slug';

export const alt = '芯片推理基准测试对比';
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
  const parsed = parseCompareSlug(slug);
  if (!parsed) notFound();

  const aLabel = HW_REGISTRY[parsed.a]?.label ?? parsed.a.toUpperCase();
  const bLabel = HW_REGISTRY[parsed.b]?.label ?? parsed.b.toUpperCase();
  const title = `${aLabel} 对比 ${bLabel}`;
  const titleSize = title.length > 26 ? 80 : title.length > 18 ? 96 : 112;

  return renderCompareOg({
    eyebrow: `${parsed.model.label} · 芯片基准测试对比`,
    title,
    titleSize,
    footer: 'AI 推理基准测试 · 延迟、吞吐量与成本',
    language: 'zh',
    size,
  });
}
