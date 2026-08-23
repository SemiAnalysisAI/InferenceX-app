import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { trackServer } from '@/lib/analytics-server';
import { getCachedBenchmarks } from '@/lib/compare-ssr';
import {
  computeVariantCompareImageRows,
  computeVariantCompareTableData,
  pickVariantPairDefaults,
} from '@/lib/compare-variant-ssr';
import {
  canonicalPrecisionCompareSlug,
  parsePrecisionCompareSlug,
  precisionDisplayLabel,
} from '@/lib/compare-variant-slug';
import { getLogoSrc } from '@/lib/og-assets';
import { renderComparePngChart } from '@/lib/png-chart';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const parsed = parsePrecisionCompareSlug(slug);
  // Compare case-insensitively. The HTML pages lowercase before their 308, so
  // a mixed-case PNG URL should serve rather than 404.
  if (
    !parsed ||
    canonicalPrecisionCompareSlug(parsed.model.slug, parsed.gpu, parsed.precA, parsed.precB) !==
      slug.toLowerCase()
  ) {
    return new Response('Not found', { status: 404 });
  }

  const sideA = { precision: parsed.precA };
  const sideB = { precision: parsed.precB };
  const [rows, logoSrc] = await Promise.all([
    getCachedBenchmarks(parsed.model.dbKeys),
    getLogoSrc(),
  ]);
  const { sequence } = pickVariantPairDefaults('precision', rows, parsed.gpu, sideA, sideB);
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

  const gpuMeta = HW_REGISTRY[parsed.gpu];
  const gpuLabel = gpuMeta?.label ?? parsed.gpu.toUpperCase();
  const aLabel = precisionDisplayLabel(parsed.precA);
  const bLabel = precisionDisplayLabel(parsed.precB);

  try {
    return renderComparePngChart({
      curveRows,
      plottedRows,
      logoSrc,
      aLabel,
      bLabel,
      eyebrow: 'InferenceX Precision Comparison',
      title: `${parsed.model.label} · ${gpuLabel}`,
      subtitle: `${aLabel} vs ${bLabel} | Cost per Million Tokens`,
      workload: sequence ?? '',
      rangeNote: "Dashed segments extend to each precision's operating envelope",
      footer: 'Precision comparison | interpolated from benchmark results',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    trackServer('compare_precision_png_render_failed', {
      slug,
      model: parsed.model.slug,
      gpu: parsed.gpu,
      precA: parsed.precA,
      precB: parsed.precB,
      sequence,
      error_name: error instanceof Error ? error.name : 'Unknown',
      error_message: message.slice(0, 500),
    });
    return new Response('PNG render failed', {
      status: 502,
      headers: { 'Cache-Control': 'public, s-maxage=60' },
    });
  }
}
