import type { MetadataRoute } from 'next';

import { getAllPosts } from '@/lib/blog';
import { SITE_URL as BASE_URL } from '@semianalysisai/inferencex-constants';

const TABS = [
  'evaluation',
  'historical',
  'calculator',
  'reliability',
  'gpu-specs',
  'gpu-metrics',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString();

  return [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
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
      url: `${BASE_URL}/blog`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...getAllPosts().map((post) => ({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: new Date((post.modifiedDate ?? post.date) + 'T00:00:00Z').toISOString(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];
}
