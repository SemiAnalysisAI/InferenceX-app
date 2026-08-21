import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import {
  HW_REGISTRY,
  SITE_NAME,
  SITE_URL,
  SUPPORTERS_LINE_ZH,
} from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/json-ld';
import {
  isAgenticSequence,
  type ScenarioSegment,
  sequenceForScenarioSegment,
} from '@/lib/compare-scenario-route';
import { pickPairDefaults } from '@/lib/compare-pair-defaults';
import {
  canonicalCompareSlug,
  compareDisplayLabel,
  compareModelDisplayLabel,
  parseCompareSlug,
} from '@/lib/compare-slug';
import { getGpuSpecs } from '@/lib/constants';
import {
  computeCompareTableData,
  dateRangeForPair,
  getCachedBenchmarks,
  KNOWN_MODELS,
  KNOWN_PRECISIONS,
  KNOWN_SEQUENCES,
  pickString,
  summarize,
} from '@/lib/compare-ssr';
import {
  AGENTIC_SCENARIO_INTRO_ZH,
  buildBreadcrumbJsonLdZh,
  buildJsonLdZh,
  compareTableNarrativeZh,
} from '@/lib/compare-ssr-zh';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';

import ComparePerDollarPageClient from '../../../compare-per-dollar/[slug]/page-client';

export const dynamic = 'force-dynamic';

/**
 * `/zh/compare-per-dollar/<slug>/<scenario>` renders this same page with the workload
 * pinned by the path. The segment is threaded through rather than duplicated
 * in a parallel route file so the body — redirects, JSON-LD, metadata, client
 * props — is written once and cannot drift between the two URLs.
 */
export interface ScenarioOptions {
  scenarioSegment?: ScenarioSegment;
}

/** English twin of `scenarioPath` — hreflang pairs are keyed off the
 *  English route, so the segment has to survive the locale swap. */
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
  const fullLabel = compareModelDisplayLabel(parsed.model, parsed.a, parsed.b);
  const gpuLabel = compareDisplayLabel(parsed.a, parsed.b);
  const canonical = canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b);
  // The scenario segments are views of one comparison, so the bare slug URL
  // stays the indexable representative and every segment canonicalizes to it.
  // Without this, `/…/<slug>/<default-scenario>` and `/…/<slug>` would serve
  // byte-identical pages, each claiming to be canonical.
  const routePath = scenarioPath(canonical, scenarioSegment);
  const url = `${SITE_URL}${routePath}`;
  const description = `${gpuLabel} 在 ${parsed.model.label} 上的每美元性能：来自 InferenceX（SemiAnalysis 推出的独立开源基准测试平台）的经验证、可复现的每百万 token 成本结果，基于云服务商 TCO 归一化。${SUPPORTERS_LINE_ZH}查看哪款 Chip 在各交互性水平下更经济。`;
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
    // Keep the scenario segment across the redirect — dropping it would send
    // the reader to the pair's default workload instead.
    permanentRedirect(`${scenarioPath(canonical, scenarioSegment)}${qs ? `?${qs}` : ''}`);
  }

  const rows = await getCachedBenchmarks(parsed.model.dbKeys);
  const summaryA = summarize(rows, parsed.a);
  const summaryB = summarize(rows, parsed.b);
  const { sequence: pickedSequence, precision: pickedPrecision } = pickPairDefaults(
    rows,
    parsed.a,
    parsed.b,
  );

  const urlSeq = pickString(sp.i_seq);
  const urlPrec = pickString(sp.i_prec);
  const urlModel = pickString(sp.g_model);
  // Path beats query beats the pair's default: a scenario segment is an
  // explicit address for one workload, so it outranks a stale `?i_seq=`.
  const pathSequence = scenarioSegment ? sequenceForScenarioSegment(scenarioSegment) : null;
  const effectiveSequence =
    pathSequence ?? (urlSeq && KNOWN_SEQUENCES.has(urlSeq) ? urlSeq : pickedSequence);
  const effectivePrecision = urlPrec && KNOWN_PRECISIONS.has(urlPrec) ? urlPrec : pickedPrecision;
  const effectiveModel =
    urlModel && KNOWN_MODELS.has(urlModel) ? urlModel : parsed.model.displayName;

  const { defaultTargets, ssrRows, interactivityRange } = computeCompareTableData(
    rows,
    parsed.a,
    parsed.b,
    effectiveSequence,
    effectivePrecision,
  );

  const url = `${SITE_URL}${scenarioPath(canonical, scenarioSegment)}`;
  // The PNG route exists only under the EN tree; zh JSON-LD references it there.
  const imageUrl = `${SITE_URL}/compare-per-dollar/${canonical}/performance-per-dollar.png`;
  const { oldest, newest } = dateRangeForPair(rows, parsed.a, parsed.b);
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
  const breadcrumbJsonLd = buildBreadcrumbJsonLdZh(
    'per-dollar',
    compareModelDisplayLabel(parsed.model, parsed.a, parsed.b),
    url,
  );
  const label = compareModelDisplayLabel(parsed.model, parsed.a, parsed.b);
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
        heroImageSrc={`/compare-per-dollar/${canonical}/performance-per-dollar.png`}
        locale="zh"
      />
    </>
  );
}
