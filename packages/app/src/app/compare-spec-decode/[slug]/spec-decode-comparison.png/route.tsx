import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { trackServer } from '@/lib/analytics-server';
import { getCachedBenchmarks } from '@/lib/compare-ssr';
import {
  computeVariantCompareImageRows,
  computeVariantCompareTableData,
  pickVariantPairDefaults,
  type VariantCompareSide,
} from '@/lib/compare-variant-ssr';
import {
  canonicalSpecDecodeCompareSlug,
  parseSpecDecodeCompareSlug,
  precisionDisplayLabel,
  specMethodDisplayLabel,
} from '@/lib/compare-variant-slug';
import { getLogoSrc } from '@/lib/og-assets';
import { renderComparePngChart } from '@/lib/png-chart';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const lang = new URL(request.url).searchParams.get('lang') === 'zh' ? 'zh' : 'en';
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
    return new Response('Not found', { status: 404 });
  }

  const [rows, logoSrc] = await Promise.all([
    getCachedBenchmarks(parsed.model.dbKeys),
    getLogoSrc(),
  ]);
  // Precision is fixed by the slug, and both sides share it.
  const sideA: VariantCompareSide = { specMethod: parsed.method, precision: parsed.precision };
  const sideB: VariantCompareSide = { specMethod: 'none', precision: parsed.precision };
  const { sequence } = pickVariantPairDefaults('spec-decode', rows, parsed.gpu, sideA, sideB);
  const precision = parsed.precision;
  const { ssrRows, interactivityRange } = computeVariantCompareTableData(
    rows,
    parsed.gpu,
    sequence,
    sideA,
    sideB,
  );
  const plottedRows = ssrRows.filter((row) => row.a || row.b);
  const imageRows = computeVariantCompareImageRows(
    rows,
    parsed.gpu,
    sequence,
    sideA,
    sideB,
    interactivityRange,
    plottedRows.map((row) => row.target),
  ).filter((row) => row.a || row.b);
  const curveRows = imageRows.length > 0 ? imageRows : plottedRows;

  const gpuLabel = HW_REGISTRY[parsed.gpu]?.label ?? parsed.gpu.toUpperCase();
  const precLabel = precisionDisplayLabel(parsed.precision);
  const aLabel = specMethodDisplayLabel(parsed.model.displayName, parsed.method);
  const bLabel = 'Off';
  const imageALabel = lang === 'zh' ? `启用 ${aLabel}` : aLabel;
  const imageBLabel = lang === 'zh' ? '关闭投机解码' : bLabel;
  const workload = [sequence, precision?.toUpperCase()].filter(Boolean).join(' / ');

  try {
    return await renderComparePngChart({
      curveRows,
      plottedRows,
      logoSrc,
      aLabel: imageALabel,
      bLabel: imageBLabel,
      eyebrow:
        lang === 'zh' ? 'InferenceX 投机解码对比' : 'InferenceX Speculative Decoding Comparison',
      title: parsed.model.label,
      subtitle:
        lang === 'zh'
          ? `${gpuLabel} ${precLabel}：启用 ${aLabel} 与关闭投机解码｜每百万 token 成本`
          : `${gpuLabel} ${precLabel}: ${aLabel} vs ${bLabel} | Cost per Million Tokens`,
      workload,
      rangeNote:
        lang === 'zh'
          ? '虚线延伸至各配置对应的运行区间；接近区间边界时，成本会快速上升'
          : "Dashed segments extend to each config's operating envelope, where cost rises steeply",
      footer:
        lang === 'zh'
          ? '投机解码对比｜数据由基准测试结果插值得出'
          : 'Speculative decoding comparison | interpolated from benchmark results',
      lang,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    trackServer('compare_spec_decode_png_render_failed', {
      slug,
      model: parsed.model.slug,
      gpu: parsed.gpu,
      method: parsed.method,
      sequence,
      precision,
      error_name: error instanceof Error ? error.name : 'Unknown',
      error_message: message.slice(0, 500),
    });
    return new Response('PNG render failed', {
      status: 502,
      headers: { 'Cache-Control': 'public, s-maxage=60' },
    });
  }
}
