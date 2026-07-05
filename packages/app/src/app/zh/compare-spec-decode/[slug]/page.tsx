import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import {
  HW_REGISTRY,
  SITE_NAME,
  SITE_URL,
  SUPPORTERS_LINE_ZH,
} from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/json-ld';
import { getCachedBenchmarks, KNOWN_SEQUENCES, pickString } from '@/lib/compare-ssr';
import {
  canonicalSpecDecodeCompareSlug,
  parseSpecDecodeCompareSlug,
  precisionDisplayLabel,
  specMethodDisplayLabel,
} from '@/lib/compare-variant-slug';
import {
  computeVariantCompareTableData,
  dateRangeForVariantPair,
  pickVariantPairDefaults,
  summarizeVariantSide,
  type VariantCompareSide,
} from '@/lib/compare-variant-ssr';
import {
  buildVariantBreadcrumbJsonLdZh,
  buildVariantJsonLdZh,
  variantCompareNarrativeZh,
} from '@/lib/compare-variant-ssr-zh';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';

import CompareSpecDecodePageClient from '../../../compare-spec-decode/[slug]/page-client';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseSpecDecodeCompareSlug(slug);
  if (!parsed) return {};
  const gpuMeta = HW_REGISTRY[parsed.gpu];
  const gpuLabel = gpuMeta?.label ?? parsed.gpu.toUpperCase();
  const precLabel = precisionDisplayLabel(parsed.precision);
  const aLabel = specMethodDisplayLabel(parsed.model.displayName, parsed.method);
  const canonical = canonicalSpecDecodeCompareSlug(
    parsed.model.slug,
    parsed.gpu,
    parsed.precision,
    parsed.method,
  );
  const url = `${SITE_URL}/zh/compare-spec-decode/${canonical}`;
  const description = `${parsed.model.label} 在 ${gpuLabel} ${precLabel} 上的 ${aLabel} vs Off 投机解码对比：来自 InferenceX（SemiAnalysis 推出的独立开源基准测试平台）的经验证、可复现结果。${SUPPORTERS_LINE_ZH}查看投机解码是否在各交互性水平下提升吞吐量和降低成本。`;
  const title = `${parsed.model.label} — ${gpuLabel} ${precLabel}: ${aLabel} vs Off — 投机解码对比`;
  return {
    title,
    description,
    alternates: zhAlternates(`/compare-spec-decode/${canonical}`),
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      type: 'website',
      locale: ZH_OG_LOCALE,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function CompareSpecDecodePageZh({ params, searchParams }: Props) {
  const { slug } = await params;
  const parsed = parseSpecDecodeCompareSlug(slug);
  if (!parsed) notFound();

  const sp = await searchParams;

  const canonical = canonicalSpecDecodeCompareSlug(
    parsed.model.slug,
    parsed.gpu,
    parsed.precision,
    parsed.method,
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
    permanentRedirect(`/zh/compare-spec-decode/${canonical}${qs ? `?${qs}` : ''}`);
  }

  const rows = await getCachedBenchmarks(parsed.model.dbKeys);
  const gpuMeta = HW_REGISTRY[parsed.gpu];
  const gpuLabel = gpuMeta?.label ?? parsed.gpu.toUpperCase();
  const precLabel = precisionDisplayLabel(parsed.precision);
  const aLabel = specMethodDisplayLabel(parsed.model.displayName, parsed.method);
  const bLabel = 'Off';

  // Precision is fixed by the slug — both sides share it.
  const sideA: VariantCompareSide = { specMethod: parsed.method, precision: parsed.precision };
  const sideB: VariantCompareSide = { specMethod: 'none', precision: parsed.precision };
  const defaults = pickVariantPairDefaults('spec-decode', rows, parsed.gpu, sideA, sideB);

  const urlSeq = pickString(sp.i_seq);
  const effectiveSequence = urlSeq && KNOWN_SEQUENCES.has(urlSeq) ? urlSeq : defaults.sequence;
  const effectivePrecision = parsed.precision;

  const sideAFull: VariantCompareSide = {
    specMethod: parsed.method,
    precision: effectivePrecision,
  };
  const sideBFull: VariantCompareSide = {
    specMethod: 'none',
    precision: effectivePrecision,
  };

  const { defaultTargets, ssrRows, interactivityRange } = computeVariantCompareTableData(
    rows,
    parsed.gpu,
    effectiveSequence,
    sideAFull,
    sideBFull,
  );

  const summaryA = summarizeVariantSide(rows, parsed.gpu, sideAFull);
  const summaryB = summarizeVariantSide(rows, parsed.gpu, sideBFull);
  const { oldest, newest } = dateRangeForVariantPair(rows, parsed.gpu, sideAFull, sideBFull);

  const url = `${SITE_URL}/zh/compare-spec-decode/${canonical}`;
  // The PNG route exists only under the EN tree; zh JSON-LD references it there.
  const imageUrl = `${SITE_URL}/compare-spec-decode/${canonical}/spec-decode-comparison.png`;

  const jsonLd = buildVariantJsonLdZh(
    'spec-decode',
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
  const breadcrumbJsonLd = buildVariantBreadcrumbJsonLdZh(
    'spec-decode',
    `${parsed.model.label} — ${gpuLabel} ${precLabel}: ${aLabel} vs ${bLabel}`,
    url,
  );
  const narrative = variantCompareNarrativeZh(
    'spec-decode',
    parsed.model.label,
    `${gpuLabel} ${precLabel}`,
    aLabel,
    bLabel,
    ssrRows,
    interactivityRange,
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <CompareSpecDecodePageClient
        gpu={parsed.gpu}
        method={parsed.method}
        slug={canonical}
        modelLabel={parsed.model.label}
        modelDisplayName={parsed.model.displayName}
        defaultSequence={effectiveSequence}
        defaultPrecision={effectivePrecision}
        ssrTableData={{ defaultTargets, ssrRows, interactivityRange }}
        narrative={narrative}
        gpuLabel={gpuLabel}
        precisionLabel={precLabel}
        gpuArch={gpuMeta?.arch ?? ''}
        gpuVendor={gpuMeta?.vendor ?? ''}
        aLabel={aLabel}
        bLabel={bLabel}
        heroImageSrc={`/compare-spec-decode/${canonical}/spec-decode-comparison.png`}
        locale="zh"
      />
    </>
  );
}
