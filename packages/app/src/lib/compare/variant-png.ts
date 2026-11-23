import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import type { BenchmarkRow } from '@/lib/api/api';
import { trackServer } from '@/lib/analytics/analytics-server';
import { getCachedBenchmarks } from '@/lib/compare/compare-ssr';
import {
  computeVariantCompareImageRows,
  computeVariantCompareTableData,
  pickVariantPairDefaults,
  type VariantCompareKind,
  type VariantCompareSide,
} from '@/lib/compare/compare-variant-ssr';
import {
  canonicalPrecisionCompareSlug,
  canonicalSpecDecodeCompareSlug,
  parsePrecisionCompareSlug,
  parseSpecDecodeCompareSlug,
  precisionDisplayLabel,
  specMethodDisplayLabel,
} from '@/lib/compare/compare-variant-slug';
import { getLogoSrc } from '@/lib/seo/og-assets';
import { renderComparePngChart } from '@/lib/compare/png-chart';

type Lang = 'en' | 'zh';

/** The plotted rows for one variant pair, computed as the page computes its table. */
function variantChartRows(
  kind: VariantCompareKind,
  rows: BenchmarkRow[],
  gpu: string,
  sideA: VariantCompareSide,
  sideB: VariantCompareSide,
) {
  const { sequence } = pickVariantPairDefaults(kind, rows, gpu, sideA, sideB);
  const { ssrRows, interactivityRange } = computeVariantCompareTableData(
    rows,
    gpu,
    sequence,
    sideA,
    sideB,
  );
  const plottedRows = ssrRows.filter((row) => row.a || row.b);
  const imageRows = computeVariantCompareImageRows(
    rows,
    gpu,
    sequence,
    sideA,
    sideB,
    interactivityRange,
    plottedRows.map((row) => row.target),
  ).filter((row) => row.a || row.b);
  return { sequence, plottedRows, curveRows: imageRows.length > 0 ? imageRows : plottedRows };
}

function reportRenderFailure(event: string, properties: Record<string, unknown>, error: unknown) {
  trackServer(event, {
    ...properties,
    error_name: error instanceof Error ? error.name : 'Unknown',
    error_message: (error instanceof Error ? error.message : String(error)).slice(0, 500),
  });
}

/**
 * The `/compare-precision/[slug]` hero PNG. Served from ISR routes in both locales, so a failed
 * render is rethrown: a regeneration that fails keeps the cached PNG instead of caching an error.
 */
export async function precisionPngResponse(slug: string, lang: Lang): Promise<Response> {
  const parsed = parsePrecisionCompareSlug(slug);
  if (
    !parsed ||
    canonicalPrecisionCompareSlug(parsed.model.slug, parsed.gpu, parsed.precA, parsed.precB) !==
      slug.toLowerCase()
  ) {
    return new Response('Not found', { status: 404 });
  }

  const [rows, logoSrc] = await Promise.all([
    getCachedBenchmarks(parsed.model.dbKeys),
    getLogoSrc(),
  ]);
  const { sequence, plottedRows, curveRows } = variantChartRows(
    'precision',
    rows,
    parsed.gpu,
    { precision: parsed.precA },
    { precision: parsed.precB },
  );
  const gpuLabel = HW_REGISTRY[parsed.gpu]?.label ?? parsed.gpu.toUpperCase();
  const aLabel = precisionDisplayLabel(parsed.precA);
  const bLabel = precisionDisplayLabel(parsed.precB);

  try {
    return await renderComparePngChart({
      curveRows,
      plottedRows,
      logoSrc,
      aLabel,
      bLabel,
      eyebrow: lang === 'zh' ? 'InferenceX 精度对比' : 'InferenceX Precision Comparison',
      title: `${parsed.model.label} · ${gpuLabel}`,
      subtitle:
        lang === 'zh'
          ? `${aLabel} 与 ${bLabel}｜每百万 token 成本`
          : `${aLabel} vs ${bLabel} | Cost per Million Tokens`,
      workload: sequence ?? '',
      rangeNote:
        lang === 'zh'
          ? '虚线延伸至各精度对应的运行区间'
          : "Dashed segments extend to each precision's operating envelope",
      footer:
        lang === 'zh'
          ? '精度对比｜数据由基准测试结果插值得出'
          : 'Precision comparison | interpolated from benchmark results',
      lang,
    });
  } catch (error) {
    reportRenderFailure(
      'compare_precision_png_render_failed',
      {
        route_template: `${lang === 'zh' ? '/zh' : ''}/compare-precision/[slug]/precision-comparison.png`,
        slug,
        model: parsed.model.slug,
        gpu: parsed.gpu,
        precisions: [parsed.precA, parsed.precB],
        sequence,
      },
      error,
    );
    throw error;
  }
}

/** The `/compare-spec-decode/[slug]` hero PNG, cached like `precisionPngResponse`. */
export async function specDecodePngResponse(slug: string, lang: Lang): Promise<Response> {
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

  const { precision } = parsed;
  const [rows, logoSrc] = await Promise.all([
    getCachedBenchmarks(parsed.model.dbKeys),
    getLogoSrc(),
  ]);
  const { sequence, plottedRows, curveRows } = variantChartRows(
    'spec-decode',
    rows,
    parsed.gpu,
    { specMethod: parsed.method, precision },
    { specMethod: 'none', precision },
  );
  const gpuLabel = HW_REGISTRY[parsed.gpu]?.label ?? parsed.gpu.toUpperCase();
  const precLabel = precisionDisplayLabel(precision);
  const aLabel = specMethodDisplayLabel(parsed.model.displayName, parsed.method);
  const bLabel = 'Off';
  const workload = [sequence, precision?.toUpperCase()].filter(Boolean).join(' / ');

  try {
    return await renderComparePngChart({
      curveRows,
      plottedRows,
      logoSrc,
      aLabel: lang === 'zh' ? `启用 ${aLabel}` : aLabel,
      bLabel: lang === 'zh' ? '关闭投机解码' : bLabel,
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
    reportRenderFailure(
      'compare_spec_decode_png_render_failed',
      {
        route_template: `${lang === 'zh' ? '/zh' : ''}/compare-spec-decode/[slug]/spec-decode-comparison.png`,
        slug,
        model: parsed.model.slug,
        gpu: parsed.gpu,
        method: parsed.method,
        sequence,
        precision,
      },
      error,
    );
    throw error;
  }
}
