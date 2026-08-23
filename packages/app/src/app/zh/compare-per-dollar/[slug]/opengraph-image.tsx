import { notFound } from 'next/navigation';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { getAllComparableCompareSlugs } from '@/lib/compare-availability';
import { renderCompareOg } from '@/lib/compare-og';
import { canonicalCompareSlug, parseCompareSlug } from '@/lib/compare-slug';

export const alt = '芯片每美元推理性能基准测试对比';
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

  const aLabel = HW_REGISTRY[parsed.a]?.label ?? parsed.a.toUpperCase();
  const bLabel = HW_REGISTRY[parsed.b]?.label ?? parsed.b.toUpperCase();
  const title = `${aLabel} 对比 ${bLabel}`;
  const titleSize = title.length > 26 ? 80 : title.length > 18 ? 96 : 112;

  return renderCompareOg({
    eyebrow: `${parsed.model.label} · 每美元性能对比`,
    title,
    titleSize,
    footer: 'AI 推理基准测试 · 每百万 token 成本',
    language: 'zh',
    size,
  });
}
