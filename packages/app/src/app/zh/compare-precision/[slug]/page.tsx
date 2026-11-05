import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { HW_REGISTRY, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/seo/json-ld';
import { AGENTIC_SCENARIO_INTRO_ZH } from '@/lib/compare/compare-ssr-zh';
import {
  isAgenticSequence,
  type ScenarioSegment,
  sequenceForScenarioSegment,
} from '@/lib/compare/compare-scenario-route';
import { getCachedBenchmarks } from '@/lib/compare/compare-ssr';
import {
  canonicalPrecisionCompareSlug,
  parsePrecisionCompareSlug,
  precisionDisplayLabel,
} from '@/lib/compare/compare-variant-slug';
import {
  computeVariantCompareTableData,
  dateRangeForVariantPair,
  pickVariantPairDefaults,
  summarizeVariantSide,
} from '@/lib/compare/compare-variant-ssr';
import {
  buildVariantBreadcrumbJsonLdZh,
  buildVariantJsonLdZh,
  variantCompareNarrativeZh,
} from '@/lib/compare/compare-variant-ssr-zh';
import { zhAlternates } from '@/lib/i18n/i18n';
import { compareSocialImages } from '@/lib/compare/compare-meta';
import { precisionMetaDescriptionZh, precisionMetaTitleZh } from '@/lib/compare/compare-meta-zh';
import { socialMetadata } from '@/lib/seo/social-metadata';

import ComparePrecisionPageClient from '../../../compare-precision/[slug]/page-client';

export const revalidate = 3600;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

export interface ScenarioOptions {
  scenarioSegment?: ScenarioSegment;
}

function enScenarioPath(canonical: string, scenarioSegment?: ScenarioSegment): string {
  return scenarioSegment
    ? `/compare-precision/${canonical}/${scenarioSegment}`
    : `/compare-precision/${canonical}`;
}

function scenarioPath(canonical: string, scenarioSegment?: ScenarioSegment): string {
  return scenarioSegment
    ? `/zh/compare-precision/${canonical}/${scenarioSegment}`
    : `/zh/compare-precision/${canonical}`;
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return buildPrecisionMetadataZh(slug, {});
}

export function buildPrecisionMetadataZh(
  slug: string,
  { scenarioSegment }: ScenarioOptions,
): Metadata {
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
  const routePath = scenarioPath(canonical, scenarioSegment);
  const url = `${SITE_URL}${routePath}`;
  const description = precisionMetaDescriptionZh(parsed.model.label, gpuLabel, aLabel, bLabel);
  const title = precisionMetaTitleZh(parsed.model.label, gpuLabel, aLabel, bLabel);
  return {
    title,
    description,
    alternates: zhAlternates(enScenarioPath(canonical)),
    ...socialMetadata({
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      locale: 'zh',
      images: compareSocialImages(
        scenarioPath(canonical),
        `${parsed.model.label} ${gpuLabel} ${aLabel} 与 ${bLabel} 精度对比`,
      ),
    }),
  };
}

export default async function ComparePrecisionPageZh({ params }: Props) {
  const { slug } = await params;
  return renderPrecisionPageZh(slug, {});
}

export async function renderPrecisionPageZh(slug: string, { scenarioSegment }: ScenarioOptions) {
  const parsed = parsePrecisionCompareSlug(slug);
  if (!parsed) notFound();

  const canonical = canonicalPrecisionCompareSlug(
    parsed.model.slug,
    parsed.gpu,
    parsed.precA,
    parsed.precB,
  );
  if (canonical !== slug.toLowerCase()) {
    permanentRedirect(scenarioPath(canonical, scenarioSegment));
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

  const pathSequence = scenarioSegment ? sequenceForScenarioSegment(scenarioSegment) : null;
  const effectiveSequence = pathSequence ?? pickedSequence;

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

  const url = `${SITE_URL}${scenarioPath(canonical, scenarioSegment)}`;
  const imageUrl = `${SITE_URL}/compare-precision/${canonical}/precision-comparison.png?lang=zh`;
  const { oldest, newest } = dateRangeForVariantPair(rows, parsed.gpu, sideA, sideB);
  const jsonLd = buildVariantJsonLdZh(
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
  const pairLabel = `${parsed.model.label} — ${gpuLabel}：${aLabel} 与 ${bLabel}`;
  const breadcrumbJsonLd = buildVariantBreadcrumbJsonLdZh('precision', pairLabel, url);
  const narrative = variantCompareNarrativeZh(
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
        agenticIntro={isAgenticSequence(effectiveSequence) ? AGENTIC_SCENARIO_INTRO_ZH : null}
        gpuLabel={gpuLabel}
        gpuVendor={gpuMeta?.vendor ?? ''}
        gpuArch={gpuMeta?.arch ?? ''}
        aLabel={aLabel}
        bLabel={bLabel}
        heroImageSrc={`/compare-precision/${canonical}/precision-comparison.png?lang=zh`}
        locale="zh"
      />
    </>
  );
}
