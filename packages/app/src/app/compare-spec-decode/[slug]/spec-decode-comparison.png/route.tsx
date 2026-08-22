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
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
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
  const workload = [sequence, precision?.toUpperCase()].filter(Boolean).join(' / ');

  try {
    return renderComparePngChart({
      curveRows,
      plottedRows,
      logoSrc,
      aLabel,
      bLabel,
      eyebrow: 'InferenceX Speculative Decoding Comparison',
      title: parsed.model.label,
      subtitle: `${gpuLabel} ${precLabel}: ${aLabel} vs ${bLabel} | Cost per Million Tokens`,
      workload,
      rangeNote:
        "Dashed segments extend to each config's operating envelope, where cost rises steeply",
      footer: 'Speculative decoding comparison | interpolated from benchmark results',
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
