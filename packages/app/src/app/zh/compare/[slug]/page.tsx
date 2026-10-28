import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';

import { HW_REGISTRY, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/seo/json-ld';
import {
  isAgenticSequence,
  type ScenarioSegment,
  sequenceForScenarioSegment,
} from '@/lib/compare/compare-scenario-route';
import { comparisonScenarioForModel } from '@/lib/compare/compare-agentx';
import {
  canonicalCompareSlug,
  compareModelSeoName,
  parseCompareSlug,
} from '@/lib/compare/compare-slug';
import {
  getComparePageDerivedData,
  initialCompareBenchmarkRows,
} from '@/lib/compare/compare-page-data.server';
import {
  AGENTIC_SCENARIO_INTRO_ZH,
  buildBreadcrumbJsonLdZh,
  buildJsonLdZh,
  compareMetaDescriptionZh,
  compareSeoTitleZh,
  compareTableNarrativeZh,
} from '@/lib/compare/compare-ssr-zh';
import { compareSocialImages } from '@/lib/compare/compare-meta';
import { zhAlternates } from '@/lib/i18n/i18n';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { CompareDetailRouteSkeleton } from '@/components/motion/route-skeletons';

import ComparePageClient from '../../../compare/[slug]/page-client';

export const revalidate = 3600;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

export interface ScenarioOptions {
  scenarioSegment?: ScenarioSegment;
}

function enScenarioPath(canonical: string, scenarioSegment?: ScenarioSegment): string {
  return scenarioSegment ? `/compare/${canonical}/${scenarioSegment}` : `/compare/${canonical}`;
}

function scenarioPath(canonical: string, scenarioSegment?: ScenarioSegment): string {
  return scenarioSegment
    ? `/zh/compare/${canonical}/${scenarioSegment}`
    : `/zh/compare/${canonical}`;
}

function gpuPairLabelZh(a: string, b: string): string {
  const aLabel = HW_REGISTRY[a]?.label ?? a.toUpperCase();
  const bLabel = HW_REGISTRY[b]?.label ?? b.toUpperCase();
  return `${aLabel} 与 ${bLabel}`;
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return buildCompareMetadataZh(slug, {});
}

export async function buildCompareMetadataZh(
  slug: string,
  { scenarioSegment }: ScenarioOptions,
): Promise<Metadata> {
  const parsed = parseCompareSlug(slug);
  if (!parsed) return {};
  const gpuLabel = gpuPairLabelZh(parsed.a, parsed.b);
  const fullLabel = `${parsed.model.label} — ${gpuLabel}`;
  const modelSeoName = compareModelSeoName(parsed.model);
  const canonical = canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b);
  const routePath = scenarioPath(canonical, scenarioSegment);
  const url = `${SITE_URL}${routePath}`;

  const title = `${compareSeoTitleZh(gpuLabel, modelSeoName)} | ${SITE_NAME}`;

  const { ssrRows } = await getComparePageDerivedData(
    parsed.model.dbKeys,
    parsed.a,
    parsed.b,
    null,
    null,
    comparisonScenarioForModel(parsed.model).sequence,
  );
  const description = compareMetaDescriptionZh(parsed.model, parsed.a, parsed.b, ssrRows);

  return {
    title: { absolute: title },
    description,
    alternates: zhAlternates(enScenarioPath(canonical)),
    ...socialMetadata({
      title,
      description,
      url,
      locale: 'zh',
      images: compareSocialImages(scenarioPath(canonical), `${fullLabel} 推理基准测试`),
    }),
  };
}

export default async function ComparePageZh({ params }: Props) {
  const { slug } = await params;
  return renderComparePageZh(slug, {});
}

export function renderComparePageZh(slug: string, { scenarioSegment }: ScenarioOptions) {
  const parsed = parseCompareSlug(slug);
  if (!parsed) notFound();

  const canonical = canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b);
  if (canonical !== slug.toLowerCase()) {
    permanentRedirect(scenarioPath(canonical, scenarioSegment));
  }

  return (
    <Suspense fallback={<CompareDetailRouteSkeleton />}>
      <CompareDetailZh parsed={parsed} canonical={canonical} scenarioSegment={scenarioSegment} />
    </Suspense>
  );
}

async function CompareDetailZh({
  parsed,
  canonical,
  scenarioSegment,
}: {
  parsed: NonNullable<ReturnType<typeof parseCompareSlug>>;
  canonical: string;
  scenarioSegment?: ScenarioSegment;
}) {
  const fallbackSequence = comparisonScenarioForModel(parsed.model).sequence;
  const pathSequence = scenarioSegment ? sequenceForScenarioSegment(scenarioSegment) : null;
  const {
    sequence: effectiveSequence,
    precision: effectivePrecision,
    summaryA,
    summaryB,
    defaultTargets,
    ssrRows,
    interactivityRange,
    oldest,
    newest,
    initialPairBenchmarkRows,
  } = await getComparePageDerivedData(
    parsed.model.dbKeys,
    parsed.a,
    parsed.b,
    pathSequence,
    null,
    fallbackSequence,
  );

  const url = `${SITE_URL}${scenarioPath(canonical, scenarioSegment)}`;
  const jsonLd = buildJsonLdZh(
    'full',
    parsed.model,
    parsed.a,
    parsed.b,
    url,
    summaryA,
    summaryB,
    ssrRows,
    undefined,
    oldest,
    newest,
    parsed.model.displayName,
  );
  const label = `${parsed.model.label} — ${gpuPairLabelZh(parsed.a, parsed.b)}`;
  const breadcrumbJsonLd = buildBreadcrumbJsonLdZh('full', label, url);
  const aMeta = HW_REGISTRY[parsed.a];
  const bMeta = HW_REGISTRY[parsed.b];
  const aLabel = aMeta?.label ?? parsed.a.toUpperCase();
  const bLabel = bMeta?.label ?? parsed.b.toUpperCase();
  const narrative = compareTableNarrativeZh(
    'full',
    parsed.model.label,
    aLabel,
    bLabel,
    ssrRows,
    interactivityRange,
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <ComparePageClient
        a={parsed.a}
        b={parsed.b}
        slug={canonical}
        label={label}
        modelLabel={parsed.model.label}
        defaultModel={parsed.model.displayName}
        defaultSequence={effectiveSequence}
        defaultPrecision={effectivePrecision}
        initialBenchmarkRows={initialCompareBenchmarkRows(
          initialPairBenchmarkRows,
          effectiveSequence,
        )}
        ssrTableData={{ defaultTargets, ssrRows, interactivityRange }}
        narrative={narrative}
        agenticIntro={isAgenticSequence(effectiveSequence) ? AGENTIC_SCENARIO_INTRO_ZH : null}
        aLabel={aLabel}
        bLabel={bLabel}
        aVendor={aMeta?.vendor ?? ''}
        bVendor={bMeta?.vendor ?? ''}
        aArch={aMeta?.arch ?? ''}
        bArch={bMeta?.arch ?? ''}
        locale="zh"
      />
    </>
  );
}
