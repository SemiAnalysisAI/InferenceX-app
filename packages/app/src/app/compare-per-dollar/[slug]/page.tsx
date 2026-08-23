import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import {
  HW_REGISTRY,
  SITE_NAME,
  SITE_URL,
  SUPPORTERS_LINE,
} from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/json-ld';
import {
  isAgenticSequence,
  type ScenarioSegment,
  sequenceForScenarioSegment,
} from '@/lib/compare-scenario-route';
import { languageAlternates } from '@/lib/i18n';
import {
  canonicalCompareSlug,
  compareDisplayLabel,
  compareModelDisplayLabel,
  parseCompareSlug,
} from '@/lib/compare-slug';
import { getGpuSpecs } from '@/lib/constants';
import {
  AGENTIC_SCENARIO_INTRO,
  buildBreadcrumbJsonLd,
  buildJsonLd,
  compareTableNarrative,
  KNOWN_MODELS,
  KNOWN_PRECISIONS,
  KNOWN_SEQUENCES,
  pickString,
} from '@/lib/compare-ssr';
import {
  getComparePageDerivedData,
  initialCompareBenchmarkRows,
} from '@/lib/compare-page-data.server';

import ComparePerDollarPageClient from './page-client';

export const dynamic = 'force-dynamic';

/**
 * `/compare-per-dollar/<slug>/<scenario>` renders this same page with the workload
 * pinned by the path. The segment is threaded through rather than duplicated
 * in a parallel route file so the body — redirects, JSON-LD, metadata, client
 * props — is written once and cannot drift between the two URLs.
 */
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  // The scenario segments are views of one comparison, so the bare slug URL
  // stays the indexable representative and every segment canonicalizes to it.
  // Without this, `/…/<slug>/<default-scenario>` and `/…/<slug>` would serve
  // byte-identical pages, each claiming to be canonical.
  const routePath = scenarioPath(canonical, scenarioSegment);
  const canonicalPath = scenarioPath(canonical);
  const url = `${SITE_URL}${routePath}`;
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  // Description leads with the searched GPU pair + model, then the trust
  // signals (verified/reproducible, what InferenceX is, named supporters)
  // before weaving the per-dollar SEO terms ("performance per dollar", "cost
  // per million tokens", "TCO-normalized") without keyword-stuffing.
  const description = `${gpuLabel} performance per dollar on ${parsed.model.label}: verified, reproducible cost-per-million-token results from InferenceX, the independent open-source benchmark by SemiAnalysis, normalized by hyperscaler TCO. ${SUPPORTERS_LINE} See which chip is cheaper at every interactivity level.`;
  return {
    title: `${fullLabel} — Performance per Dollar`,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: languageAlternates(canonicalPath),
    },
    openGraph: {
      title: `${fullLabel} — Performance per Dollar | ${SITE_NAME}`,
      description,
      url,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${fullLabel} — Performance per Dollar`,
      description,
    },
  };
}

export default async function ComparePerDollarPage({ params, searchParams }: Props) {
  const { slug } = await params;
  return renderPerDollarPage(slug, await searchParams, {});
}

export async function renderPerDollarPage(
  slug: string,
  sp: Record<string, string | string[] | undefined>,
  { scenarioSegment }: ScenarioOptions,
) {
  const parsed = parseCompareSlug(slug);
  if (!parsed) notFound();

  // Same one-hop 308 normalization as /compare/[slug] — bare-slug fallback,
  // alias model resolution, GPU alphabetical order — but redirect target lives
  // under /compare-per-dollar/. Query string is preserved across the hop.
  const canonical = canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b);
  // canonical is always lowercase; compare against lowercased input so mixed-case
  // URLs don't emit a fresh 308 + CDN cache entry every hit.
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

  const fallbackSequence = null;

  const urlSeq = pickString(sp.i_seq);
  const urlPrec = pickString(sp.i_prec);
  const urlModel = pickString(sp.g_model);
  const effectiveModel =
    urlModel && KNOWN_MODELS.has(urlModel) ? urlModel : parsed.model.displayName;
  // Path beats query beats the pair's default: a scenario segment is an
  // explicit address for one workload, so it outranks a stale `?i_seq=`.
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
  // Owning-hyperscaler $/GPU/hr — the same `costh` value the per-dollar math
  // upstream uses to derive cost per million tokens. Rendered in the header
  // so the reader can audit the underlying pricing inputs without leaving
  // the page.
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
