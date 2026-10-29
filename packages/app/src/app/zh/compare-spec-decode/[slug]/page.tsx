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
  canonicalSpecDecodeCompareSlug,
  parseSpecDecodeCompareSlug,
  precisionDisplayLabel,
  specMethodDisplayLabel,
} from '@/lib/compare/compare-variant-slug';
import {
  computeVariantCompareTableData,
  dateRangeForVariantPair,
  pickVariantPairDefaults,
  summarizeVariantSide,
  type VariantCompareSide,
} from '@/lib/compare/compare-variant-ssr';
import {
  buildVariantBreadcrumbJsonLdZh,
  buildVariantJsonLdZh,
  variantCompareNarrativeZh,
} from '@/lib/compare/compare-variant-ssr-zh';
import { zhAlternates } from '@/lib/i18n/i18n';
import { compareSocialImages } from '@/lib/compare/compare-meta';
import { specDecodeMetaDescriptionZh, specDecodeMetaTitleZh } from '@/lib/compare/compare-meta-zh';
import { socialMetadata } from '@/lib/seo/social-metadata';

import CompareSpecDecodePageClient from '../../../compare-spec-decode/[slug]/page-client';

export const revalidate = 3600;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

export interface ScenarioOptions {
  scenarioSegment?: ScenarioSegment;
}

function enScenarioPath(canonical: string, scenarioSegment?: ScenarioSegment): string {
  return scenarioSegment
    ? `/compare-spec-decode/${canonical}/${scenarioSegment}`
    : `/compare-spec-decode/${canonical}`;
}

function scenarioPath(canonical: string, scenarioSegment?: ScenarioSegment): string {
  return scenarioSegment
    ? `/zh/compare-spec-decode/${canonical}/${scenarioSegment}`
    : `/zh/compare-spec-decode/${canonical}`;
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return buildSpecDecodeMetadataZh(slug, {});
}

export function buildSpecDecodeMetadataZh(
  slug: string,
  { scenarioSegment }: ScenarioOptions,
): Metadata {
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
  const routePath = scenarioPath(canonical, scenarioSegment);
  const url = `${SITE_URL}${routePath}`;
  const description = specDecodeMetaDescriptionZh(parsed.model.label, gpuLabel, precLabel, aLabel);
  const title = specDecodeMetaTitleZh(parsed.model.label, gpuLabel, precLabel, aLabel);
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
        `${parsed.model.label} ${gpuLabel} ${precLabel} ${aLabel} 投机解码对比`,
      ),
    }),
  };
}

export default async function CompareSpecDecodePageZh({ params }: Props) {
  const { slug } = await params;
  return renderSpecDecodePageZh(slug, {});
}

export async function renderSpecDecodePageZh(slug: string, { scenarioSegment }: ScenarioOptions) {
  const parsed = parseSpecDecodeCompareSlug(slug);
  if (!parsed) notFound();

  const canonical = canonicalSpecDecodeCompareSlug(
    parsed.model.slug,
    parsed.gpu,
    parsed.precision,
    parsed.method,
  );
  if (canonical !== slug.toLowerCase()) {
    permanentRedirect(scenarioPath(canonical, scenarioSegment));
  }

  const rows = await getCachedBenchmarks(parsed.model.dbKeys);
  const gpuMeta = HW_REGISTRY[parsed.gpu];
  const gpuLabel = gpuMeta?.label ?? parsed.gpu.toUpperCase();
  const precLabel = precisionDisplayLabel(parsed.precision);
  const aLabel = specMethodDisplayLabel(parsed.model.displayName, parsed.method);
  const bLabel = '关闭';

  const sideA: VariantCompareSide = { specMethod: parsed.method, precision: parsed.precision };
  const sideB: VariantCompareSide = { specMethod: 'none', precision: parsed.precision };
  const defaults = pickVariantPairDefaults('spec-decode', rows, parsed.gpu, sideA, sideB);

  const pathSequence = scenarioSegment ? sequenceForScenarioSegment(scenarioSegment) : null;
  const effectiveSequence = pathSequence ?? defaults.sequence;
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

  const url = `${SITE_URL}${scenarioPath(canonical, scenarioSegment)}`;
  const imageUrl = `${SITE_URL}/compare-spec-decode/${canonical}/spec-decode-comparison.png?lang=zh`;

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
    `${parsed.model.label} — ${gpuLabel} ${precLabel}：启用 ${aLabel} 与关闭投机解码的对比`,
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
        agenticIntro={isAgenticSequence(effectiveSequence) ? AGENTIC_SCENARIO_INTRO_ZH : null}
        gpuLabel={gpuLabel}
        precisionLabel={precLabel}
        gpuArch={gpuMeta?.arch ?? ''}
        gpuVendor={gpuMeta?.vendor ?? ''}
        aLabel={aLabel}
        bLabel={bLabel}
        heroImageSrc={`/compare-spec-decode/${canonical}/spec-decode-comparison.png?lang=zh`}
        locale="zh"
      />
    </>
  );
}
