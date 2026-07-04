import type { MetadataRoute } from 'next';

import { getAllPosts } from '@/lib/blog';
import { getAllComparableCompareSlugs } from '@/lib/compare-availability';
import { canonicalCompareSlug } from '@/lib/compare-slug';
import { languageAlternates, zhPath } from '@/lib/i18n';
import { SITE_URL as BASE_URL } from '@semianalysisai/inferencex-constants';

const TABS = [
  'evaluation',
  'historical',
  'calculator',
  'reliability',
  'gpu-specs',
  'gpu-metrics',
] as const;

type SitemapEntry = MetadataRoute.Sitemap[number];

/**
 * Emit an English page and its Chinese sibling as a pair, both carrying the
 * full hreflang set so crawlers link the two versions.
 */
function localizedPair(
  enPath: string,
  entry: Omit<SitemapEntry, 'url' | 'alternates'>,
): SitemapEntry[] {
  const languages = languageAlternates(enPath);
  return [
    {
      ...entry,
      url: enPath === '/' ? BASE_URL : `${BASE_URL}${enPath}`,
      alternates: { languages },
    },
    { ...entry, url: `${BASE_URL}${zhPath(enPath)}`, alternates: { languages } },
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString();
  // Only emit (model, pair) URLs that have benchmark data on both sides —
  // avoids polluting the sitemap with empty pages that hurt crawl budget.
  const compareSlugs = await getAllComparableCompareSlugs();
  const zhPosts = new Set(getAllPosts('zh').map((post) => post.slug));

  return [
    ...localizedPair('/', { lastModified: now, changeFrequency: 'daily', priority: 1 }),
    ...TABS.flatMap((tab) =>
      localizedPair(`/${tab}`, {
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: 0.9,
      }),
    ),
    ...localizedPair('/quotes', { lastModified: now, changeFrequency: 'monthly', priority: 0.6 }),
    ...localizedPair('/about', { lastModified: now, changeFrequency: 'monthly', priority: 0.6 }),
    ...localizedPair('/land-acknowledgement', {
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.4,
    }),
    ...localizedPair('/compare', { lastModified: now, changeFrequency: 'daily', priority: 0.8 }),
    ...localizedPair('/compare-per-dollar', {
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    }),
    ...localizedPair('/datasets', { lastModified: now, changeFrequency: 'weekly', priority: 0.6 }),
    ...localizedPair('/blog', { lastModified: now, changeFrequency: 'weekly', priority: 0.8 }),
    ...getAllPosts().flatMap((post) => {
      const entry = {
        lastModified: new Date(`${post.modifiedDate ?? post.date}T00:00:00Z`).toISOString(),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      };
      // Posts without a Chinese translation stay English-only in the sitemap.
      if (!zhPosts.has(post.slug)) return [{ ...entry, url: `${BASE_URL}/blog/${post.slug}` }];
      return localizedPair(`/blog/${post.slug}`, entry);
    }),
    ...compareSlugs.flatMap(({ modelSlug, a, b }) =>
      localizedPair(`/compare/${canonicalCompareSlug(modelSlug, a, b)}`, {
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }),
    ),
    // Every indexed per-dollar landing page has a stable data graphic so image
    // crawlers discover the PNG alongside the canonical comparison URL. The
    // Chinese sibling references the same English-hosted PNG.
    ...compareSlugs.flatMap(({ modelSlug, a, b }) => {
      const enPath = `/compare-per-dollar/${canonicalCompareSlug(modelSlug, a, b)}`;
      return localizedPair(enPath, {
        images: [`${BASE_URL}${enPath}/performance-per-dollar.png`],
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      });
    }),
  ];
}
