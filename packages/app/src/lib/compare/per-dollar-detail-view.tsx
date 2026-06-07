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
import { getGpuSpecs } from '@/lib/constants';

import ComparePerDollarPageClient from './per-dollar-page-client';

/**
 * Shared server implementation of the `/compare-per-dollar/[slug]` (and the
 * `/zh/…` variant) detail page. Mirrors `full-detail-view.tsx` but adds the
 * owning-hyperscaler $/GPU/hr pricing inputs and wires the crawlable hero PNG.
 * The PNG route itself is language-neutral (a data graphic), so both locales
 * reuse the canonical English `performance-per-dollar.png` endpoint.
 */

type SearchParams = Record<string, string | string[] | undefined>;

export function perDollarDetailMetadata(slug: string, lang: Lang): Metadata {
  const parsed = parseCompareSlug(slug);
  if (!parsed) return {};
  const t = compareDict(lang).detail.perDollar;
  const fullLabel = compareModelDisplayLabel(parsed.model, parsed.a, parsed.b);
  const gpuLabel = compareDisplayLabel(parsed.a, parsed.b);
  const canonical = canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b);
  const url = `${SITE_URL}${compareSlugPath(lang, 'per-dollar', canonical)}`;
  const title = t.metaTitle(fullLabel);
  const description = t.metaDescription(parsed.model.label, gpuLabel);
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        en: `${SITE_URL}${compareSlugPath('en', 'per-dollar', canonical)}`,
        'zh-CN': `${SITE_URL}${compareSlugPath('zh', 'per-dollar', canonical)}`,
      },
    },
    openGraph: {
      title: `${fullLabel} ${lang === 'zh' ? '—— 每美元性能' : '— Performance per Dollar'} | ${SITE_NAME}`,
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

export default async function PerDollarDetailView({
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
    permanentRedirect(`${compareSlugPath(lang, 'per-dollar', canonical)}${qs ? `?${qs}` : ''}`);
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

  // Hero / OG PNG is a language-neutral data graphic — reuse the canonical
  // English endpoint regardless of locale so we don't duplicate the 500-line
  // Satori chart route per language.
  const enCanonicalUrl = `${SITE_URL}${compareSlugPath('en', 'per-dollar', canonical)}`;
  const imageUrl = `${enCanonicalUrl}/performance-per-dollar.png`;
  const url = `${SITE_URL}${compareSlugPath(lang, 'per-dollar', canonical)}`;
  const { oldest, newest } = dateRangeForPair(rows, parsed.a, parsed.b);
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
    lang,
  );
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(
    'per-dollar',
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
    'per-dollar',
    parsed.model.label,
    aLabel,
    bLabel,
    ssrRows,
    interactivityRange,
    lang,
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
        aLabel={aLabel}
        bLabel={bLabel}
        aVendor={aMeta?.vendor ?? ''}
        bVendor={bMeta?.vendor ?? ''}
        aArch={aMeta?.arch ?? ''}
        bArch={bMeta?.arch ?? ''}
        aCostPerGpuHr={aCostPerGpuHr}
        bCostPerGpuHr={bCostPerGpuHr}
        heroImageSrc={`${compareSlugPath('en', 'per-dollar', canonical)}/performance-per-dollar.png`}
        lang={lang}
      />
    </>
  );
}
