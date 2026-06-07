import type { Metadata } from 'next';
import Link from 'next/link';

import { HW_REGISTRY, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { ComparePairCardLink } from '@/components/compare/compare-pair-card-link';
import { JsonLd } from '@/components/json-ld';
import { Card } from '@/components/ui/card';
import { getComparablePairsByModelSlug } from '@/lib/compare-availability';
import { type ComparePair, COMPARE_MODEL_SLUGS, type CompareModelSlug } from '@/lib/compare-slug';
import { bucketComparePairsByVendor, formatModelList } from '@/lib/compare-ssr';
import {
  type CompareVariant,
  type Lang,
  compareBasePath,
  compareDict,
  compareSlugPath,
} from '@/lib/compare/i18n';

/**
 * Shared implementation of the `/compare` and `/compare-per-dollar` master index
 * pages, in both English and Chinese. The route files are thin wrappers that
 * call `CompareIndexView` / `compareIndexMetadata` with the right
 * `(variant, lang)` pair, so the four index URLs stay in lockstep on the
 * data-fetch, vendor-bucketing, and card-grid mechanics — only the copy and the
 * URL prefix differ.
 */

interface VendorGroup {
  heading: string;
  description: string;
  pairs: { a: string; b: string; slug: string; label: string }[];
}

function groupPairsByVendorForModel(
  model: CompareModelSlug,
  comparablePairs: ComparePair[],
  variant: CompareVariant,
  lang: Lang,
): VendorGroup[] {
  const { cross, nvidia, amd } = bucketComparePairsByVendor(model.slug, comparablePairs);
  const dict = compareDict(lang);
  const headings = dict.vendorHeadings;
  const vendorDesc = (variant === 'per-dollar' ? dict.index.perDollar : dict.index.full).vendor;
  const groups: VendorGroup[] = [];
  if (cross.length > 0) {
    groups.push({ heading: headings.cross, description: vendorDesc.cross, pairs: cross });
  }
  if (nvidia.length > 0) {
    groups.push({ heading: headings.nvidia, description: vendorDesc.nvidia, pairs: nvidia });
  }
  if (amd.length > 0) {
    groups.push({ heading: headings.amd, description: vendorDesc.amd, pairs: amd });
  }
  return groups;
}

/** Locale-aware metadata for an index page. */
export function compareIndexMetadata(variant: CompareVariant, lang: Lang): Metadata {
  const dict = compareDict(lang);
  const v = variant === 'per-dollar' ? dict.index.perDollar : dict.index.full;
  const url = `${SITE_URL}${compareBasePath(lang, variant)}`;
  const title = v.metaTitle;
  const description = v.metaDescription;
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        en: `${SITE_URL}${compareBasePath('en', variant)}`,
        'zh-CN': `${SITE_URL}${compareBasePath('zh', variant)}`,
      },
    },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
    },
  };
}

export default async function CompareIndexView({
  variant,
  lang,
}: {
  variant: CompareVariant;
  lang: Lang;
}) {
  // Server-side filter: only show (model, pair) combinations where both GPUs
  // have benchmark data for that model. Avoids cards that would link to an
  // empty-state page. The detail page still renders the empty-state for direct
  // URL hits, so this is purely navigation hygiene.
  const comparablePairsByModel = await getComparablePairsByModelSlug();
  const totalUrls = [...comparablePairsByModel.values()].reduce((s, p) => s + p.length, 0);
  const modelsWithPairs = COMPARE_MODEL_SLUGS.filter(
    (m) => (comparablePairsByModel.get(m.slug)?.length ?? 0) > 0,
  );

  const dict = compareDict(lang);
  const v = variant === 'per-dollar' ? dict.index.perDollar : dict.index.full;
  const url = `${SITE_URL}${compareBasePath(lang, variant)}`;
  const isFull = variant !== 'per-dollar';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${v.metaTitle} | ${SITE_NAME}`,
    description: v.metaDescription,
    url,
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <section>
        <Card>
          <h1 className="text-2xl lg:text-4xl font-bold tracking-tight">{v.h1}</h1>
          <p className="mt-3 text-base lg:text-lg text-muted-foreground max-w-3xl">
            {v.lede(totalUrls.toLocaleString(), formatModelList(modelsWithPairs, lang))}
          </p>
          {isFull && (
            <div className="mt-6">
              <Link
                data-testid="compare-index-per-dollar-link"
                href={compareBasePath(lang, 'per-dollar')}
                className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-3 text-base lg:text-lg font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-brand/90"
              >
                {dict.index.full.perDollarCta}
                <span aria-hidden="true" className="text-lg lg:text-xl">
                  →
                </span>
              </Link>
            </div>
          )}
        </Card>
      </section>

      {modelsWithPairs.map((model) => {
        const pairs = comparablePairsByModel.get(model.slug) ?? [];
        const groups = groupPairsByVendorForModel(model, pairs, variant, lang);
        return (
          <section key={model.slug} id={model.slug}>
            <Card className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl lg:text-2xl font-bold tracking-tight">{model.label}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {v.modelSubtext(pairs.length, model.label)}
                </p>
              </div>
              {groups.map((group) => (
                <div key={`${model.slug}__${group.heading}`} className="flex flex-col gap-3">
                  <div>
                    <h3 className="text-base font-semibold">{group.heading}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{group.description}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {group.pairs.map(({ slug, label, a, b }) => {
                      const aMeta = HW_REGISTRY[a];
                      const bMeta = HW_REGISTRY[b];
                      const archLine = `${aMeta?.arch ?? '—'} · ${bMeta?.arch ?? '—'}`;
                      return (
                        <ComparePairCardLink
                          key={slug}
                          href={compareSlugPath(lang, variant, slug)}
                          slug={slug}
                          label={label}
                          archLine={archLine}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </Card>
          </section>
        );
      })}
    </>
  );
}
