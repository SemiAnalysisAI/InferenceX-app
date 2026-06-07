import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { HW_REGISTRY, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/json-ld';
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
import { type Lang, compareDict, compareSlugPath } from '@/lib/compare/i18n';

import ComparePageClient from './full-page-client';

/**
 * Shared server implementation of the `/compare/[slug]` (and `/zh/compare/[slug]`)
 * detail page. The route files are thin wrappers passing `lang`. All slug
 * parsing, the 308 canonicalization redirect, the benchmark fetch, the SSR
 * interpolation, and the JSON-LD live here so the English and Chinese pages
 * never drift on those mechanics — only copy and the URL prefix change.
 */

type SearchParams = Record<string, string | string[] | undefined>;

export function fullDetailMetadata(slug: string, lang: Lang): Metadata {
  const parsed = parseCompareSlug(slug);
  if (!parsed) return {};
  const t = compareDict(lang).detail.full;
  const fullLabel = compareModelDisplayLabel(parsed.model, parsed.a, parsed.b);
  const gpuLabel = compareDisplayLabel(parsed.a, parsed.b);
  const canonical = canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b);
  const url = `${SITE_URL}${compareSlugPath(lang, 'full', canonical)}`;
  const title = t.metaTitle(fullLabel);
  const description = t.metaDescription(parsed.model.label, gpuLabel);
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        en: `${SITE_URL}${compareSlugPath('en', 'full', canonical)}`,
        'zh-CN': `${SITE_URL}${compareSlugPath('zh', 'full', canonical)}`,
      },
    },
    openGraph: {
      title: `${fullLabel} | ${SITE_NAME}`,
      description,
      url,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function FullDetailView({
  slug,
  sp,
  lang,
}: {
  slug: string;
  sp: SearchParams;
  lang: Lang;
}) {
  const parsed = parseCompareSlug(slug);
  if (!parsed) notFound();

  // One-hop 308 to the fully canonical URL (legacy bare slug, alias model,
  // non-canonical GPU order, mixed case), preserving the query string. The
  // redirect target stays within the current locale.
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
    permanentRedirect(`${compareSlugPath(lang, 'full', canonical)}${qs ? `?${qs}` : ''}`);
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
  const effectiveSequence = urlSeq && KNOWN_SEQUENCES.has(urlSeq) ? urlSeq : pickedSequence;
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

  const url = `${SITE_URL}${compareSlugPath(lang, 'full', canonical)}`;
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
    lang,
  );
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(
    'full',
    compareModelDisplayLabel(parsed.model, parsed.a, parsed.b),
    url,
    lang,
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
    lang,
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
        lang={lang}
      />
    </>
  );
}
