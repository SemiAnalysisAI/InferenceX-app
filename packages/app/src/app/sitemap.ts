import type { MetadataRoute } from 'next';

import { getAllPosts } from '@/lib/blog';
import { getAllComparableCompareSlugs } from '@/lib/compare-availability';
import { canonicalCompareSlug } from '@/lib/compare-slug';
import { SITE_URL as BASE_URL } from '@semianalysisai/inferencex-constants';

const TABS = [
  'evaluation',
  'historical',
  'calculator',
  'reliability',
  'gpu-specs',
  'gpu-metrics',
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString();
  // Only emit (model, pair) URLs that have benchmark data on both sides —
  // avoids polluting the sitemap with empty pages that hurt crawl budget.
  const compareSlugs = await getAllComparableCompareSlugs();

  return [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    ...TABS.map((tab) => ({
      url: `${BASE_URL}/${tab}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.9,
    })),
    {
      url: `${BASE_URL}/quotes`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/land-acknowledgement`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${BASE_URL}/compare`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/compare-per-dollar`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...getAllPosts().map((post) => ({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: new Date(`${post.modifiedDate ?? post.date}T00:00:00Z`).toISOString(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...compareSlugs.map(({ modelSlug, a, b }) => ({
      url: `${BASE_URL}/compare/${canonicalCompareSlug(modelSlug, a, b)}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
    // Per-dollar variant URLs — same (model, pair) availability filter as the
    // /compare set, so the count matches exactly. Each is a distinct canonical
    // URL with its own SSR metadata, JSON-LD, and OG image.
    ...compareSlugs.map(({ modelSlug, a, b }) => ({
      url: `${BASE_URL}/compare-per-dollar/${canonicalCompareSlug(modelSlug, a, b)}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
  ];
}
