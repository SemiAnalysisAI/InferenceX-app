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
  KNOWN_MODELS,
  KNOWN_PRECISIONS,
  KNOWN_SEQUENCES,
  pickString,
} from '@/lib/compare/compare-ssr';
import {
  getComparePageDerivedData,
  initialCompareBenchmarkRows,
} from '@/lib/compare/compare-page-data.server';
import {
  AGENTIC_SCENARIO_INTRO_ZH,
  buildBreadcrumbJsonLdZh,
  buildJsonLdZh,
  compareMetaDescriptionZh,
  compareTableNarrativeZh,
} from '@/lib/compare/compare-ssr-zh';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n/i18n';
import { CompareDetailRouteSkeleton } from '@/components/motion/route-skeletons';

import ComparePageClient from '../../../compare/[slug]/page-client';

export const dynamic = 'force-dynamic';

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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  const title = `${gpuLabel}：${modelSeoName} 推理基准测试 | ${SITE_NAME}`;

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
    openGraph: {
      title: `${fullLabel} | ${SITE_NAME}`,
      description,
      url,
      type: 'website',
      locale: ZH_OG_LOCALE,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${fullLabel} 推理基准测试`,
      description,
    },
  };
}

export default async function ComparePageZh({ params, searchParams }: Props) {
  const { slug } = await params;
  return renderComparePageZh(slug, await searchParams, {});
}

export function renderComparePageZh(
  slug: string,
  sp: Record<string, string | string[] | undefined>,
  { scenarioSegment }: ScenarioOptions,
) {
  const parsed = parseCompareSlug(slug);
  if (!parsed) notFound();

  const canonical = canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b);
  if (canonical !== slug.toLowerCase()) {
    const qs = Object.entries(sp)
      .flatMap(([k, v]) => {
        if (Array.isArray(v)) return v.map((vv) => [k, vv] as const);
        if (v === undefined) return [];
        return [[k, v] as const];
      })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    permanentRedirect(`${scenarioPath(canonical, scenarioSegment)}${qs ? `?${qs}` : ''}`);
  }

  return (
    <Suspense fallback={<CompareDetailRouteSkeleton />}>
      <CompareDetailZh
        parsed={parsed}
        canonical={canonical}
        sp={sp}
        scenarioSegment={scenarioSegment}
      />
    </Suspense>
  );
}

async function CompareDetailZh({
  parsed,
  canonical,
  sp,
  scenarioSegment,
}: {
  parsed: NonNullable<ReturnType<typeof parseCompareSlug>>;
  canonical: string;
  sp: Record<string, string | string[] | undefined>;
  scenarioSegment?: ScenarioSegment;
}) {
  const fallbackSequence = comparisonScenarioForModel(parsed.model).sequence;

  const urlSeq = pickString(sp.i_seq);
  const urlPrec = pickString(sp.i_prec);
  const urlModel = pickString(sp.g_model);
  const effectiveModel =
    urlModel && KNOWN_MODELS.has(urlModel) ? urlModel : parsed.model.displayName;
  const pathSequence = scenarioSegment ? sequenceForScenarioSegment(scenarioSegment) : null;
  const requestedSequence = pathSequence ?? (urlSeq && KNOWN_SEQUENCES.has(urlSeq) ? urlSeq : null);
  const requestedPrecision = urlPrec && KNOWN_PRECISIONS.has(urlPrec) ? urlPrec : null;
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
    requestedSequence,
    requestedPrecision,
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
        defaultModel={effectiveModel}
        defaultSequence={effectiveSequence}
        defaultPrecision={effectivePrecision}
        initialBenchmarkRows={initialCompareBenchmarkRows(
          parsed.model.displayName,
          effectiveModel,
          initialPairBenchmarkRows,
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
