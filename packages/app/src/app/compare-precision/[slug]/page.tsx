import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import {
  HW_REGISTRY,
  SITE_NAME,
  SITE_URL,
  SUPPORTERS_LINE,
} from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/json-ld';
import { languageAlternates } from '@/lib/i18n';
import { getCachedBenchmarks, KNOWN_SEQUENCES, pickString } from '@/lib/compare-ssr';
import {
  canonicalPrecisionCompareSlug,
  parsePrecisionCompareSlug,
  precisionDisplayLabel,
} from '@/lib/compare-variant-slug';
import {
  buildVariantBreadcrumbJsonLd,
  buildVariantJsonLd,
  computeVariantCompareTableData,
  dateRangeForVariantPair,
  pickVariantPairDefaults,
  summarizeVariantSide,
  variantCompareNarrative,
} from '@/lib/compare-variant-ssr';

import ComparePrecisionPageClient from './page-client';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parsePrecisionCompareSlug(slug);
  if (!parsed) return {};
  const gpuMeta = HW_REGISTRY[parsed.gpu];
  const gpuLabel = gpuMeta?.label ?? parsed.gpu.toUpperCase();
  const aLabel = precisionDisplayLabel(parsed.precA);
  const bLabel = precisionDisplayLabel(parsed.precB);
  const canonical = canonicalPrecisionCompareSlug(
    parsed.model.slug,
    parsed.gpu,
    parsed.precA,
    parsed.precB,
  );
  const url = `${SITE_URL}/compare-precision/${canonical}`;
  const description = `${gpuLabel} precision comparison of ${aLabel} versus ${bLabel} on ${parsed.model.label}: verified, reproducible results from InferenceX, the independent open-source benchmark by SemiAnalysis. ${SUPPORTERS_LINE} See which quantization level delivers better throughput and cost at every interactivity level.`;
  return {
    title: `${parsed.model.label} — ${gpuLabel} ${aLabel} vs ${bLabel} — Precision Comparison`,
    description,
    alternates: {
      canonical: url,
      languages: languageAlternates(`/compare-precision/${canonical}`),
    },
    openGraph: {
      title: `${parsed.model.label} — ${gpuLabel} ${aLabel} vs ${bLabel} — Precision Comparison | ${SITE_NAME}`,
      description,
      url,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${parsed.model.label} — ${gpuLabel} ${aLabel} vs ${bLabel} — Precision Comparison`,
      description,
    },
  };
}

export default async function ComparePrecisionPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const parsed = parsePrecisionCompareSlug(slug);
  if (!parsed) notFound();

  const sp = await searchParams;

  // 308 redirect to canonical — normalizes alias models and precision order.
  const canonical = canonicalPrecisionCompareSlug(
    parsed.model.slug,
    parsed.gpu,
    parsed.precA,
    parsed.precB,
  );
  if (canonical !== slug.toLowerCase()) {
    const qs = Object.entries(sp)
      .flatMap(([k, v]) => {
        if (Array.isArray(v)) return v.map((vv) => [k, vv] as const);
        if (v === undefined) return [];
        return [[k, v] as const];
      })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    permanentRedirect(`/compare-precision/${canonical}${qs ? `?${qs}` : ''}`);
  }

  const rows = await getCachedBenchmarks(parsed.model.dbKeys);
  const sideA = { precision: parsed.precA };
  const sideB = { precision: parsed.precB };

  const { sequence: pickedSequence } = pickVariantPairDefaults(
    'precision',
    rows,
    parsed.gpu,
    sideA,
    sideB,
  );

  const urlSeq = pickString(sp.i_seq);
  const effectiveSequence = urlSeq && KNOWN_SEQUENCES.has(urlSeq) ? urlSeq : pickedSequence;

  const { defaultTargets, ssrRows, interactivityRange } = computeVariantCompareTableData(
    rows,
    parsed.gpu,
    effectiveSequence,
    sideA,
    sideB,
  );

  const summaryA = summarizeVariantSide(rows, parsed.gpu, sideA);
  const summaryB = summarizeVariantSide(rows, parsed.gpu, sideB);

  const gpuMeta = HW_REGISTRY[parsed.gpu];
  const gpuLabel = gpuMeta?.label ?? parsed.gpu.toUpperCase();
  const aLabel = precisionDisplayLabel(parsed.precA);
  const bLabel = precisionDisplayLabel(parsed.precB);

  const url = `${SITE_URL}/compare-precision/${canonical}`;
  const imageUrl = `${url}/precision-comparison.png`;
  const { oldest, newest } = dateRangeForVariantPair(rows, parsed.gpu, sideA, sideB);
  const jsonLd = buildVariantJsonLd(
    'precision',
    parsed.model,
    parsed.gpu,
    aLabel,
    bLabel,
    url,
    summaryA,
    summaryB,
    ssrRows,
    imageUrl,
    oldest,
    newest,
  );
  const pairLabel = `${parsed.model.label} — ${gpuLabel} ${aLabel} vs ${bLabel}`;
  const breadcrumbJsonLd = buildVariantBreadcrumbJsonLd('precision', pairLabel, url);
  const narrative = variantCompareNarrative(
    'precision',
    parsed.model.label,
    gpuLabel,
    aLabel,
    bLabel,
    ssrRows,
    interactivityRange,
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <ComparePrecisionPageClient
        gpu={parsed.gpu}
        slug={canonical}
        modelLabel={parsed.model.label}
        defaultModel={parsed.model.displayName}
        defaultSequence={effectiveSequence}
        precA={parsed.precA}
        precB={parsed.precB}
        ssrTableData={{ defaultTargets, ssrRows, interactivityRange }}
        narrative={narrative}
        gpuLabel={gpuLabel}
        gpuVendor={gpuMeta?.vendor ?? ''}
        gpuArch={gpuMeta?.arch ?? ''}
        aLabel={aLabel}
        bLabel={bLabel}
        heroImageSrc={`/compare-precision/${canonical}/precision-comparison.png`}
      />
    </>
  );
}
