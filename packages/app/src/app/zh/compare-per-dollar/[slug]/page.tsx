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
import { canonicalCompareSlug, parseCompareSlug } from '@/lib/compare/compare-slug';
import { getGpuSpecs } from '@/lib/catalog/constants';
import {
  getComparePageDerivedData,
  initialCompareBenchmarkRows,
} from '@/lib/compare/compare-page-data.server';
import {
  AGENTIC_SCENARIO_INTRO_ZH,
  buildBreadcrumbJsonLdZh,
  buildJsonLdZh,
  compareTableNarrativeZh,
} from '@/lib/compare/compare-ssr-zh';
import { zhAlternates } from '@/lib/i18n/i18n';
import { compareSocialImages } from '@/lib/compare/compare-meta';
import { perDollarMetaDescriptionZh, perDollarMetaTitleZh } from '@/lib/compare/compare-meta-zh';
import { socialMetadata } from '@/lib/seo/social-metadata';

import ComparePerDollarPageClient from '../../../compare-per-dollar/[slug]/page-client';

export const revalidate = 3600;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

export interface ScenarioOptions {
  scenarioSegment?: ScenarioSegment;
}

function enScenarioPath(canonical: string, scenarioSegment?: ScenarioSegment): string {
  return scenarioSegment
    ? `/compare-per-dollar/${canonical}/${scenarioSegment}`
    : `/compare-per-dollar/${canonical}`;
}

function scenarioPath(canonical: string, scenarioSegment?: ScenarioSegment): string {
  return scenarioSegment
    ? `/zh/compare-per-dollar/${canonical}/${scenarioSegment}`
    : `/zh/compare-per-dollar/${canonical}`;
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
  return buildPerDollarMetadataZh(slug, {});
}

export function buildPerDollarMetadataZh(
  slug: string,
  { scenarioSegment }: ScenarioOptions,
): Metadata {
  const parsed = parseCompareSlug(slug);
  if (!parsed) return {};
  const gpuLabel = gpuPairLabelZh(parsed.a, parsed.b);
  const fullLabel = `${parsed.model.label} — ${gpuLabel}`;
  const canonical = canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b);
  const routePath = scenarioPath(canonical, scenarioSegment);
  const url = `${SITE_URL}${routePath}`;
  const description = perDollarMetaDescriptionZh(gpuLabel, parsed.model.label);
  const title = perDollarMetaTitleZh(gpuLabel, parsed.model.label);
  return {
    title,
    description,
    alternates: zhAlternates(enScenarioPath(canonical)),
    ...socialMetadata({
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      locale: 'zh',
      images: compareSocialImages(scenarioPath(canonical), `${fullLabel} 每美元性能`),
    }),
  };
}

export default async function ComparePerDollarPageZh({ params }: Props) {
  const { slug } = await params;
  return renderPerDollarPageZh(slug, {});
}

export async function renderPerDollarPageZh(slug: string, { scenarioSegment }: ScenarioOptions) {
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

  const url = `${SITE_URL}${scenarioPath(canonical, scenarioSegment)}`;
  const imageUrl = `${SITE_URL}/compare-per-dollar/${canonical}/performance-per-dollar.png?lang=zh`;
  const jsonLd = buildJsonLdZh(
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
  const label = `${parsed.model.label} — ${gpuPairLabelZh(parsed.a, parsed.b)}`;
  const breadcrumbJsonLd = buildBreadcrumbJsonLdZh('per-dollar', label, url);
  const aMeta = HW_REGISTRY[parsed.a];
  const bMeta = HW_REGISTRY[parsed.b];
  const aLabel = aMeta?.label ?? parsed.a.toUpperCase();
  const bLabel = bMeta?.label ?? parsed.b.toUpperCase();
  const narrative = compareTableNarrativeZh(
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
        agenticIntro={isAgenticSequence(effectiveSequence) ? AGENTIC_SCENARIO_INTRO_ZH : null}
        aLabel={aLabel}
        bLabel={bLabel}
        aVendor={aMeta?.vendor ?? ''}
        bVendor={bMeta?.vendor ?? ''}
        aArch={aMeta?.arch ?? ''}
        bArch={bMeta?.arch ?? ''}
        aCostPerGpuHr={aCostPerGpuHr}
        bCostPerGpuHr={bCostPerGpuHr}
        heroImageSrc={`/compare-per-dollar/${canonical}/performance-per-dollar.png?lang=zh`}
        locale="zh"
      />
    </>
  );
}
