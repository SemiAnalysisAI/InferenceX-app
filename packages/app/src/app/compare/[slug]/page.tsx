import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import {
  HW_REGISTRY,
  SITE_NAME,
  SITE_URL,
  SUPPORTERS_LINE,
} from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/json-ld';
import { languageAlternates } from '@/lib/i18n';
import { pickPairDefaults } from '@/lib/compare-pair-defaults';
import {
  canonicalCompareSlug,
  compareDisplayLabel,
  compareModelDisplayLabel,
  parseCompareSlug,
} from '@/lib/compare-slug';
import {
  buildBreadcrumbJsonLd,
  buildJsonLd,
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

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseCompareSlug(slug);
  if (!parsed) return {};
  const fullLabel = compareModelDisplayLabel(parsed.model, parsed.a, parsed.b);
  const gpuLabel = compareDisplayLabel(parsed.a, parsed.b);
  const url = `${SITE_URL}/compare/${canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b)}`;
  const description = `${gpuLabel} inference benchmark on ${parsed.model.label}: verified, reproducible head-to-head results from InferenceX, the independent open-source GPU benchmark by SemiAnalysis. ${SUPPORTERS_LINE} Compare latency, throughput & cost.`;
  return {
    title: `${fullLabel} Inference Benchmark`,
    description,
    alternates: {
      canonical: url,
      languages: languageAlternates(
        `/compare/${canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b)}`,
      ),
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
  const parsed = parseCompareSlug(slug);
  if (!parsed) notFound();

  // Await searchParams once so we can both preserve them on redirect and read
  // them for URL-param overrides further down.
  const sp = await searchParams;

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
    permanentRedirect(`/compare/${canonical}${qs ? `?${qs}` : ''}`);
  }

  const rows = await getCachedBenchmarks(parsed.model.dbKeys);
  const summaryA = summarize(rows, parsed.a);
  const summaryB = summarize(rows, parsed.b);
  const { sequence: pickedSequence, precision: pickedPrecision } = pickPairDefaults(
    rows,
    parsed.a,
    parsed.b,
  );

  // URL params win over slug-derived defaults; this baking-into-SSR avoids the
  // hydration flash where the client upgrades seeded defaults to URL values.
  // `sp` was already awaited above for the redirect-query-preservation path.
  const urlSeq = pickString(sp.i_seq);
  const urlPrec = pickString(sp.i_prec);
  const urlModel = pickString(sp.g_model);
  const effectiveSequence = urlSeq && KNOWN_SEQUENCES.has(urlSeq) ? urlSeq : pickedSequence;
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

  const url = `${SITE_URL}/compare/${canonical}`;
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
