import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { trackServer } from '@/lib/analytics-server';
import { pickPairDefaults } from '@/lib/compare-pair-defaults';
import { canonicalCompareSlug, parseCompareSlug } from '@/lib/compare-slug';
import {
  computeCompareImageRows,
  computeCompareTableData,
  getCachedBenchmarks,
} from '@/lib/compare-ssr';
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
  const parsed = parseCompareSlug(slug);
  if (
    !parsed ||
    canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b) !== slug.toLowerCase()
  ) {
    return new Response('Not found', { status: 404 });
  }

  const [rows, logoSrc] = await Promise.all([
    getCachedBenchmarks(parsed.model.dbKeys),
    getLogoSrc(),
  ]);
  const { sequence, precision } = pickPairDefaults(rows, parsed.a, parsed.b);
  const { ssrRows, interactivityRange } = computeCompareTableData(
    rows,
    parsed.a,
    parsed.b,
    sequence,
    precision,
  );
  const plottedRows = ssrRows.filter((row) => row.a || row.b);
  const imageRows = computeCompareImageRows(
    rows,
    parsed.a,
    parsed.b,
    sequence,
    precision,
    interactivityRange,
    plottedRows.map((row) => row.target),
  ).filter((row) => row.a || row.b);
  const curveRows = imageRows.length > 0 ? imageRows : plottedRows;

  const aLabel = HW_REGISTRY[parsed.a]?.label ?? parsed.a.toUpperCase();
  const bLabel = HW_REGISTRY[parsed.b]?.label ?? parsed.b.toUpperCase();
  const workload = [sequence, precision?.toUpperCase()].filter(Boolean).join(' / ');

  try {
    return await renderComparePngChart({
      curveRows,
      plottedRows,
      logoSrc,
      aLabel,
      bLabel,
      eyebrow: lang === 'zh' ? 'InferenceX 每美元性能' : 'InferenceX Performance per Dollar',
      title: parsed.model.label,
      subtitle:
        lang === 'zh'
          ? `${aLabel} 与 ${bLabel}｜每百万 token 成本`
          : `${aLabel} vs ${bLabel} | Cost per Million Tokens`,
      workload,
      rangeNote:
        lang === 'zh'
          ? '虚线延伸至各 SKU 的运行区间；接近区间边界时，成本会快速上升'
          : "Dashed segments extend to each SKU's operating envelope, where cost rises steeply",
      footer:
        lang === 'zh'
          ? 'Hyperscaler 自有设备 TCO｜数据由基准测试结果插值得出'
          : 'Owning-hyperscaler TCO | interpolated from benchmark results',
      lang,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    trackServer('compare_per_dollar_png_render_failed', {
      slug,
      model: parsed.model.slug,
      a: parsed.a,
      b: parsed.b,
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
