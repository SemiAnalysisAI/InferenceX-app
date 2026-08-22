import { notFound } from 'next/navigation';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { renderCompareOg } from '@/lib/compare-og';
import { getAllComparableSpecDecodeSlugs } from '@/lib/compare-variant-availability';
import {
  canonicalSpecDecodeCompareSlug,
  parseSpecDecodeCompareSlug,
  precisionDisplayLabel,
  specMethodDisplayLabel,
} from '@/lib/compare-variant-slug';

export const alt = '芯片推理投机解码基准测试对比';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export async function generateStaticParams() {
  const slugs = await getAllComparableSpecDecodeSlugs();
  return slugs.map(({ modelSlug, gpu, precision, method }) => ({
    slug: canonicalSpecDecodeCompareSlug(modelSlug, gpu, precision, method),
  }));
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
  const title = `${gpuLabel} ${precisionLabel}：${methodLabel} 对比关闭`;
  const titleSize = title.length > 34 ? 72 : title.length > 26 ? 80 : title.length > 18 ? 96 : 112;

  return renderCompareOg({
    eyebrow: `${parsed.model.label} · 投机解码对比`,
    title,
    titleSize,
    footer: 'AI 推理基准测试 · 投机解码对比',
    language: 'zh',
    size,
  });
}
