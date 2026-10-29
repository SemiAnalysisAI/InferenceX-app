import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { HW_REGISTRY, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/seo/json-ld';
import { comparisonScenarioForModel } from '@/lib/compare/compare-agentx';
import {
  isAgenticSequence,
  type ScenarioSegment,
  sequenceForScenarioSegment,
} from '@/lib/compare/compare-scenario-route';
import { languageAlternates } from '@/lib/i18n/i18n';
import {
  compareSocialImages,
  perDollarMetaDescription,
  perDollarMetaTitle,
} from '@/lib/compare/compare-meta';
import { socialMetadata } from '@/lib/seo/social-metadata';
import {
  canonicalCompareSlug,
  compareDisplayLabel,
  compareModelDisplayLabel,
  parseCompareSlug,
} from '@/lib/compare/compare-slug';
import { getGpuSpecs } from '@/lib/catalog/constants';
import {
  AGENTIC_SCENARIO_INTRO,
  buildBreadcrumbJsonLd,
  buildJsonLd,
  compareTableNarrative,
} from '@/lib/compare/compare-ssr';
import {
  getComparePageDerivedData,
  initialCompareBenchmarkRows,
} from '@/lib/compare/compare-page-data.server';

import ComparePerDollarPageClient from './page-client';

export const revalidate = 3600;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

export interface ScenarioOptions {
  scenarioSegment?: ScenarioSegment;
}

function scenarioPath(canonical: string, scenarioSegment?: ScenarioSegment): string {
  return scenarioSegment
    ? `/compare-per-dollar/${canonical}/${scenarioSegment}`
    : `/compare-per-dollar/${canonical}`;
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return buildPerDollarMetadata(slug, {});
}

export function buildPerDollarMetadata(
  slug: string,
  { scenarioSegment }: ScenarioOptions,
): Metadata {
  const parsed = parseCompareSlug(slug);
  if (!parsed) return {};
  const fullLabel = compareModelDisplayLabel(parsed.model, parsed.a, parsed.b);
  const gpuLabel = compareDisplayLabel(parsed.a, parsed.b);
  const canonical = canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b);
  const routePath = scenarioPath(canonical, scenarioSegment);
  const canonicalPath = scenarioPath(canonical);
  const url = `${SITE_URL}${routePath}`;
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  const description = perDollarMetaDescription(gpuLabel, parsed.model.label);
  const title = perDollarMetaTitle(gpuLabel, parsed.model.label);
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
      images: compareSocialImages(canonicalPath, `${fullLabel} performance per dollar`),
    }),
  };
}

export default async function ComparePerDollarPage({ params }: Props) {
  const { slug } = await params;
  return renderPerDollarPage(slug, {});
}

export async function renderPerDollarPage(slug: string, { scenarioSegment }: ScenarioOptions) {
  const parsed = parseCompareSlug(slug);
  if (!parsed) notFound();

  const canonical = canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b);
  if (canonical !== slug.toLowerCase()) {
    permanentRedirect(scenarioPath(canonical, scenarioSegment));
  }

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
    comparisonScenarioForModel(parsed.model).sequence,
  );

  const routePath = scenarioPath(canonical, scenarioSegment);
  const url = `${SITE_URL}${routePath}`;
  const imageUrl = `${url}/performance-per-dollar.png`;
  const jsonLd = buildJsonLd(
    'per-dollar',
    parsed.model,
    parsed.a,
    parsed.b,
    url,
    summaryA,
    summaryB,
    ssrRows,
    imageUrl,
    oldest,
    newest,
    parsed.model.displayName,
  );
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(
    'per-dollar',
    compareModelDisplayLabel(parsed.model, parsed.a, parsed.b),
    url,
  );
  const label = compareModelDisplayLabel(parsed.model, parsed.a, parsed.b);
  const aMeta = HW_REGISTRY[parsed.a];
  const bMeta = HW_REGISTRY[parsed.b];
  const aLabel = aMeta?.label ?? parsed.a.toUpperCase();
  const bLabel = bMeta?.label ?? parsed.b.toUpperCase();
  const narrative = compareTableNarrative(
    'per-dollar',
    parsed.model.label,
    aLabel,
    bLabel,
    ssrRows,
    interactivityRange,
  );
  const aCostPerGpuHr = getGpuSpecs(parsed.a).costh;
  const bCostPerGpuHr = getGpuSpecs(parsed.b).costh;

  return (
    <>
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <ComparePerDollarPageClient
        a={parsed.a}
        b={parsed.b}
        slug={canonical}
        label={label}
        modelLabel={parsed.model.label}
        defaultModel={parsed.model.displayName}
        defaultSequence={effectiveSequence}
        defaultPrecision={effectivePrecision}
        ssrTableData={{ defaultTargets, ssrRows, interactivityRange }}
        initialBenchmarkRows={initialCompareBenchmarkRows(
          initialPairBenchmarkRows,
          effectiveSequence,
        )}
        narrative={narrative}
        agenticIntro={isAgenticSequence(effectiveSequence) ? AGENTIC_SCENARIO_INTRO : null}
        aLabel={aLabel}
        bLabel={bLabel}
        aVendor={aMeta?.vendor ?? ''}
        bVendor={bMeta?.vendor ?? ''}
        aArch={aMeta?.arch ?? ''}
        bArch={bMeta?.arch ?? ''}
        aCostPerGpuHr={aCostPerGpuHr}
        bCostPerGpuHr={bCostPerGpuHr}
        heroImageSrc={`/compare-per-dollar/${canonical}/performance-per-dollar.png`}
      />
    </>
  );
}
