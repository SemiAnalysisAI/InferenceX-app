import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { HW_REGISTRY, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/json-ld';
import { comparisonScenarioForModel } from '@/lib/compare-agentx';
import {
  isAgenticSequence,
  type ScenarioSegment,
  sequenceForScenarioSegment,
} from '@/lib/compare-scenario-route';
import { languageAlternates } from '@/lib/i18n';
import { pickPairDefaults } from '@/lib/compare-pair-defaults';
import {
  canonicalCompareSlug,
  compareDisplayLabel,
  compareModelDisplayLabel,
  compareModelSeoName,
  compareSeoTitle,
  parseCompareSlug,
} from '@/lib/compare-slug';
import {
  AGENTIC_SCENARIO_INTRO,
  buildBreadcrumbJsonLd,
  buildJsonLd,
  compareMetaDescription,
  compareTableNarrative,
  computeCompareTableData,
  dateRangeForPair,
  getCachedBenchmarks,
  KNOWN_MODELS,
  KNOWN_PRECISIONS,
  KNOWN_SEQUENCES,
  pickString,
  summarize,
} from '@/lib/compare-ssr';

import ComparePageClient from './page-client';

export const dynamic = 'force-dynamic';

function comparePath(canonical: string, scenarioSegment?: ScenarioSegment): string {
  return scenarioSegment ? `/compare/${canonical}/${scenarioSegment}` : `/compare/${canonical}`;
}

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * `/compare/<slug>/<scenario>` renders this same page with the workload
 * pinned by the path. The segment is threaded through rather than handled in
 * a parallel route file so the body — redirects, JSON-LD, metadata, the
 * client props — is written once and cannot drift between the two URLs.
 */
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
  // The scenario segments are views of one comparison, so the bare slug URL
  // stays the indexable representative and every segment canonicalizes to it.
  // Without this, `/…/<slug>/<default-scenario>` and `/…/<slug>` would serve
  // byte-identical pages, each claiming to be canonical.
  const routePath = comparePath(canonical, scenarioSegment);
  const canonicalPath = comparePath(canonical);
  const url = `${SITE_URL}${routePath}`;
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;

  // Lead the SEO title with the GPU pair — that's the phrase people search
  // ("b200 vs b300") and must survive Google's ~60-char SERP truncation. The
  // `absolute` form bypasses the long "%s | InferenceX by SemiAnalysis" root
  // template so the query isn't pushed off the end.
  const title = `${compareSeoTitle(gpuLabel, modelSeoName)} | ${SITE_NAME}`;

  // Stat-led meta description built from the interpolated head-to-head numbers
  // at the slug's default operating point (falls back to boilerplate for
  // sparse-data pairs). Fetch is blob-cached and shared with the page render.
  const rows = await getCachedBenchmarks(parsed.model.dbKeys);
  const { sequence, precision } = pickPairDefaults(
    rows,
    parsed.a,
    parsed.b,
    comparisonScenarioForModel(parsed.model).sequence,
  );
  const { ssrRows } = computeCompareTableData(rows, parsed.a, parsed.b, sequence, precision);
  const description = compareMetaDescription(parsed.model, parsed.a, parsed.b, ssrRows);

  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: languageAlternates(canonicalPath),
    },
    openGraph: {
      title: `${fullLabel} | ${SITE_NAME}`,
      description,
      url,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${fullLabel} Inference Benchmark`,
      description,
    },
  };
}

export default async function ComparePage({ params, searchParams }: Props) {
  const { slug } = await params;
  return renderComparePage(slug, await searchParams, {});
}

export async function renderComparePage(
  slug: string,
  sp: Record<string, string | string[] | undefined>,
  { scenarioSegment }: ScenarioOptions,
) {
  const parsed = parseCompareSlug(slug);
  if (!parsed) notFound();

  // One-hop redirect to the fully canonical URL. Handles all three normalization
  // cases in a single 308:
  //   - legacy bare slug:   `h100-vs-h200`              → `deepseek-r1-h100-vs-h200`
  //   - alias model:        `kimi-h100-vs-h200`         → `kimi-k26-h100-vs-h200`
  //   - non-canonical GPUs: `kimi-k26-h200-vs-h100`     → `kimi-k26-h100-vs-h200`
  //   - any combination of the above
  // Preserves the query string so `?i_seq=1k/1k&i_prec=fp8` etc. survive the
  // redirect — the original PR #351 redirect dropped these, but with bare slugs
  // now redirecting unconditionally we need to keep them.
  const canonical = canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b);
  // canonical is always lowercase; compare against lowercased input so mixed-case
  // URLs (e.g. /compare/H100-vs-H200) don't emit a fresh 308 + CDN cache entry
  // every hit when they actually match the canonical content.
  if (canonical !== slug.toLowerCase()) {
    const qs = Object.entries(sp)
      .flatMap(([k, v]) => {
        if (Array.isArray(v)) return v.map((vv) => [k, vv] as const);
        if (v === undefined) return [];
        return [[k, v] as const];
      })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    // 308 (not 307): bare-slug, alias model, and non-canonical GPU order are
    // all permanent decisions — using a permanent redirect lets search engines
    // consolidate link equity onto the canonical URL instead of keeping the
    // alias URL in the index alongside the canonical one.
    // Keep the scenario segment across the redirect — dropping it would send
    // `/compare/h100-vs-h200/agentic` to the pair's default workload.
    permanentRedirect(`${comparePath(canonical, scenarioSegment)}${qs ? `?${qs}` : ''}`);
  }

  const rows = await getCachedBenchmarks(parsed.model.dbKeys);
  const summaryA = summarize(rows, parsed.a);
  const summaryB = summarize(rows, parsed.b);
  const { sequence: pickedSequence, precision: pickedPrecision } = pickPairDefaults(
    rows,
    parsed.a,
    parsed.b,
    comparisonScenarioForModel(parsed.model).sequence,
  );

  // URL params win over slug-derived defaults; this baking-into-SSR avoids the
  // hydration flash where the client upgrades seeded defaults to URL values.
  // `sp` was already awaited above for the redirect-query-preservation path.
  const urlSeq = pickString(sp.i_seq);
  const urlPrec = pickString(sp.i_prec);
  const urlModel = pickString(sp.g_model);
  // Path beats query beats the pair's default: a scenario segment is an
  // explicit address for one workload, so it outranks a stale `?i_seq=`.
  const pathSequence = scenarioSegment ? sequenceForScenarioSegment(scenarioSegment) : null;
  const effectiveSequence =
    pathSequence ?? (urlSeq && KNOWN_SEQUENCES.has(urlSeq) ? urlSeq : pickedSequence);
  const effectivePrecision = urlPrec && KNOWN_PRECISIONS.has(urlPrec) ? urlPrec : pickedPrecision;
  // `?g_model=` is honored only if it matches a known model — but the slug's
  // model is the canonical default. Disregard URL param if user wants to
  // explicitly override (rare).
  const effectiveModel =
    urlModel && KNOWN_MODELS.has(urlModel) ? urlModel : parsed.model.displayName;

  const { defaultTargets, ssrRows, interactivityRange } = computeCompareTableData(
    rows,
    parsed.a,
    parsed.b,
    effectiveSequence,
    effectivePrecision,
  );

  const url = `${SITE_URL}${comparePath(canonical, scenarioSegment)}`;
  const { oldest, newest } = dateRangeForPair(rows, parsed.a, parsed.b);
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
        defaultModel={effectiveModel}
        defaultSequence={effectiveSequence}
        defaultPrecision={effectivePrecision}
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
