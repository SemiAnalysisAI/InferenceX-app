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
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
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
    return renderComparePngChart({
      curveRows,
      plottedRows,
      logoSrc,
      aLabel,
      bLabel,
      eyebrow: 'InferenceX Performance per Dollar',
      title: parsed.model.label,
      subtitle: `${aLabel} vs ${bLabel} | Cost per Million Tokens`,
      workload,
      rangeNote:
        "Dashed segments extend to each SKU's operating envelope, where cost rises steeply",
      footer: 'Owning-hyperscaler TCO | interpolated from benchmark results',
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
