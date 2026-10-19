import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import {
  HW_REGISTRY,
  SITE_NAME,
  SITE_URL,
  SUPPORTERS_LINE_ZH,
} from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/seo/json-ld';
import {
  isAgenticSequence,
  type ScenarioSegment,
  sequenceForScenarioSegment,
} from '@/lib/compare/compare-scenario-route';
import { canonicalCompareSlug, parseCompareSlug } from '@/lib/compare/compare-slug';
import { getGpuSpecs } from '@/lib/catalog/constants';
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
  compareTableNarrativeZh,
} from '@/lib/compare/compare-ssr-zh';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n/i18n';

import ComparePerDollarPageClient from '../../../compare-per-dollar/[slug]/page-client';

export const dynamic = 'force-dynamic';

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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  const description = `${gpuLabel} 在 ${parsed.model.label} 上的每美元性能对比。InferenceX 是 SemiAnalysis 推出的独立开源基准测试平台；本页提供经过验证、可复现的每百万 token 成本数据，并采用 Hyperscaler 自有设备 TCO 口径。${SUPPORTERS_LINE_ZH}比较各交互性水平下哪款芯片的成本更低。`;
  return {
    title: `${fullLabel} — 每美元性能`,
    description,
    alternates: zhAlternates(enScenarioPath(canonical)),
    openGraph: {
      title: `${fullLabel} — 每美元性能 | ${SITE_NAME}`,
      description,
      url,
      type: 'website',
      locale: ZH_OG_LOCALE,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${fullLabel} — 每美元性能`,
      description,
    },
  };
}

export default async function ComparePerDollarPageZh({ params, searchParams }: Props) {
  const { slug } = await params;
  return renderPerDollarPageZh(slug, await searchParams, {});
}

export async function renderPerDollarPageZh(
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

  const fallbackSequence = null;

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
        defaultModel={effectiveModel}
        defaultSequence={effectiveSequence}
        defaultPrecision={effectivePrecision}
        ssrTableData={{ defaultTargets, ssrRows, interactivityRange }}
        initialBenchmarkRows={initialCompareBenchmarkRows(
          parsed.model.displayName,
          effectiveModel,
          initialPairBenchmarkRows,
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
