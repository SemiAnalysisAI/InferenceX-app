import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';

import { HW_REGISTRY, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/seo/json-ld';
import { comparisonScenarioForModel } from '@/lib/compare/compare-agentx';
import {
  isAgenticSequence,
  type ScenarioSegment,
  sequenceForScenarioSegment,
} from '@/lib/compare/compare-scenario-route';
import { languageAlternates } from '@/lib/i18n/i18n';
import { compareSocialImages } from '@/lib/compare/compare-meta';
import { socialMetadata } from '@/lib/seo/social-metadata';
import {
  canonicalCompareSlug,
  compareDisplayLabel,
  compareModelDisplayLabel,
  compareModelSeoName,
  compareSeoTitle,
  parseCompareSlug,
} from '@/lib/compare/compare-slug';
import {
  AGENTIC_SCENARIO_INTRO,
  buildBreadcrumbJsonLd,
  buildJsonLd,
  compareMetaDescription,
  compareTableNarrative,
} from '@/lib/compare/compare-ssr';
import {
  getComparePageDerivedData,
  initialCompareBenchmarkRows,
} from '@/lib/compare/compare-page-data.server';
import { CompareDetailRouteSkeleton } from '@/components/motion/route-skeletons';

import ComparePageClient from './page-client';

export const revalidate = 3600;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

function comparePath(canonical: string, scenarioSegment?: ScenarioSegment): string {
  return scenarioSegment ? `/compare/${canonical}/${scenarioSegment}` : `/compare/${canonical}`;
}

interface Props {
  params: Promise<{ slug: string }>;
}

export interface ScenarioOptions {
  scenarioSegment?: ScenarioSegment;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return buildCompareMetadata(slug, {});
}

export async function buildCompareMetadata(
  slug: string,
  { scenarioSegment }: ScenarioOptions,
): Promise<Metadata> {
  const parsed = parseCompareSlug(slug);
  if (!parsed) return {};
  const fullLabel = compareModelDisplayLabel(parsed.model, parsed.a, parsed.b);
  const gpuLabel = compareDisplayLabel(parsed.a, parsed.b);
  const modelSeoName = compareModelSeoName(parsed.model);
  const canonical = canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b);
  const routePath = comparePath(canonical, scenarioSegment);
  const canonicalPath = comparePath(canonical);
  const url = `${SITE_URL}${routePath}`;
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;

  const title = compareSeoTitle(gpuLabel, modelSeoName);

  const { ssrRows } = await getComparePageDerivedData(
    parsed.model.dbKeys,
    parsed.a,
    parsed.b,
    null,
    null,
    comparisonScenarioForModel(parsed.model).sequence,
  );
  const description = compareMetaDescription(parsed.model, parsed.a, parsed.b, ssrRows);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: languageAlternates(canonicalPath),
    },
    ...socialMetadata({
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      locale: 'en',
      images: compareSocialImages(canonicalPath, `${fullLabel} inference benchmark`),
    }),
  };
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;
  return renderComparePage(slug, {});
}

export function renderComparePage(slug: string, { scenarioSegment }: ScenarioOptions) {
  const parsed = parseCompareSlug(slug);
  if (!parsed) notFound();

  const canonical = canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b);
  if (canonical !== slug.toLowerCase()) {
    permanentRedirect(comparePath(canonical, scenarioSegment));
  }

  return (
    <Suspense fallback={<CompareDetailRouteSkeleton />}>
      <CompareDetail parsed={parsed} canonical={canonical} scenarioSegment={scenarioSegment} />
    </Suspense>
  );
}

async function CompareDetail({
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

  const url = `${SITE_URL}${comparePath(canonical, scenarioSegment)}`;
  const jsonLd = buildJsonLd(
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
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(
    'full',
    compareModelDisplayLabel(parsed.model, parsed.a, parsed.b),
    url,
  );
  const label = compareModelDisplayLabel(parsed.model, parsed.a, parsed.b);
  const aMeta = HW_REGISTRY[parsed.a];
  const bMeta = HW_REGISTRY[parsed.b];
  const aLabel = aMeta?.label ?? parsed.a.toUpperCase();
  const bLabel = bMeta?.label ?? parsed.b.toUpperCase();
  const narrative = compareTableNarrative(
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
        agenticIntro={isAgenticSequence(effectiveSequence) ? AGENTIC_SCENARIO_INTRO : null}
        aLabel={aLabel}
        bLabel={bLabel}
        aVendor={aMeta?.vendor ?? ''}
        bVendor={bMeta?.vendor ?? ''}
        aArch={aMeta?.arch ?? ''}
        bArch={bMeta?.arch ?? ''}
      />
    </>
  );
}
