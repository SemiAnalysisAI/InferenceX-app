import { createHash } from 'node:crypto';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { trackServer } from '@/lib/analytics/analytics-server';
import { comparisonScenarioForModel } from '@/lib/compare/compare-agentx';
import { getComparePageDerivedData } from '@/lib/compare/compare-page-data.server';
import {
  canonicalCompareSlug,
  type CompareSlug,
  parseCompareSlug,
} from '@/lib/compare/compare-slug';
import { computeCompareImageRows } from '@/lib/compare/compare-ssr';
import { getLogoSrc } from '@/lib/seo/og-assets';
import { renderComparePngChart } from '@/lib/compare/png-chart';

// Bump when the per-dollar PNG drawing changes, so the hero srcSet URLs change on that deploy.
export const PER_DOLLAR_PNG_RENDER_REVISION = 1;

/** What the hero PNG draws for a pair, from the page's own cached pair data. */
async function perDollarChartRows({ model, a, b }: CompareSlug) {
  const { sequence, precision, ssrRows, interactivityRange, initialPairBenchmarkRows } =
    await getComparePageDerivedData(
      model.dbKeys,
      a,
      b,
      null,
      null,
      comparisonScenarioForModel(model).sequence,
    );
  const plottedRows = ssrRows.filter((row) => row.a || row.b);
  const imageRows = computeCompareImageRows(
    initialPairBenchmarkRows,
    a,
    b,
    sequence,
    precision,
    interactivityRange,
    plottedRows.map((row) => row.target),
  ).filter((row) => row.a || row.b);
  return {
    sequence,
    precision,
    plottedRows,
    curveRows: imageRows.length > 0 ? imageRows : plottedRows,
    workload: [sequence, precision?.toUpperCase()].filter(Boolean).join(' / '),
  };
}

/**
 * A short hash of the data the hero PNG draws and the renderer revision. The page's
 * `/_next/image` srcSet points at `performance-per-dollar/<version>.png`, whose optimized responses
 * browsers keep for `images.minimumCacheTTL`, so an ingest that changes the chart, or a deploy that
 * changes the drawing, also changes the optimized image URL.
 */
export async function perDollarPngVersion(
  pair: CompareSlug,
  renderRevision = PER_DOLLAR_PNG_RENDER_REVISION,
): Promise<string> {
  const { workload, plottedRows, curveRows } = await perDollarChartRows(pair);
  return createHash('sha256')
    .update(JSON.stringify([renderRevision, workload, plottedRows, curveRows]))
    .digest('hex')
    .slice(0, 12);
}

const VERSIONED_PNG_FILE = /^[0-9a-f]{12}\.png$/u;

/**
 * The hero PNG at `performance-per-dollar/<version>.png`. Each version is its own ISR entry,
 * rendered on its first request as static generation, which refetches stale data in the
 * foreground, so a version that first appears after an ingest never serves the pre-ingest chart.
 * The plain PNG route would serve its stale entry once. The version only keys the cache: a stale
 * page that still names an older version gets the current chart.
 */
export function perDollarVersionedPngResponse(
  slug: string,
  file: string,
  lang: 'en' | 'zh',
): Promise<Response> {
  if (!VERSIONED_PNG_FILE.test(file)) {
    return Promise.resolve(new Response('Not found', { status: 404 }));
  }
  return perDollarPngResponse(slug, lang);
}

/**
 * The compare-per-dollar hero PNG. It reads the page's own cached pair data, so the ingest purge
 * that marks the page stale marks the PNG stale with it.
 */
export async function perDollarPngResponse(slug: string, lang: 'en' | 'zh'): Promise<Response> {
  const parsed = parseCompareSlug(slug);
  if (
    !parsed ||
    canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b) !== slug.toLowerCase()
  ) {
    return new Response('Not found', { status: 404 });
  }

  const [{ sequence, precision, plottedRows, curveRows, workload }, logoSrc] = await Promise.all([
    perDollarChartRows(parsed),
    getLogoSrc(),
  ]);
  const aLabel = HW_REGISTRY[parsed.a]?.label ?? parsed.a.toUpperCase();
  const bLabel = HW_REGISTRY[parsed.b]?.label ?? parsed.b.toUpperCase();

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
          : 'Owning at Large Hyperscaler Volume TCO | interpolated from benchmark results',
      lang,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    trackServer('compare_per_dollar_png_render_failed', {
      route_template: `${lang === 'zh' ? '/zh' : ''}/compare-per-dollar/[slug]/performance-per-dollar.png`,
      slug,
      model: parsed.model.slug,
      gpus: [parsed.a, parsed.b],
      sequence,
      precision,
      error_name: error instanceof Error ? error.name : 'Unknown',
      error_message: message.slice(0, 500),
    });
    // Rethrown so a failed regeneration keeps the cached PNG instead of caching an error.
    throw error;
  }
}
