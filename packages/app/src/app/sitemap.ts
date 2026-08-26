import type { MetadataRoute } from 'next';
import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import { listDatasets } from '@semianalysisai/inferencex-db/queries/datasets';

import { AGENTX_OPTIMIZATION_SLUGS } from '@/lib/agentx-optimizations';
import { DASHBOARD_ROUTES } from '@/lib/dashboard-routes';
import { getAllPosts } from '@/lib/blog';
import { getModelPageSlugs } from '@/lib/model-pages';
import { getAllComparableCompareSlugs } from '@/lib/compare-availability';
import { canonicalCompareSlug } from '@/lib/compare-slug';
import {
  getAllComparablePrecisionSlugs,
  getAllComparableSpecDecodeSlugs,
} from '@/lib/compare-variant-availability';
import {
  canonicalPrecisionCompareSlug,
  canonicalSpecDecodeCompareSlug,
} from '@/lib/compare-variant-slug';
import { getAllChipRouteSlugs } from '@/lib/chip-pages';
import { getAllGlossaryEntries } from '@/lib/glossary';
import { getAllGuides } from '@/lib/guides';
import { ACTIVE_INFERENCE_MODEL_SLUGS, INFERENCE_MODEL_SLUGS } from '@/lib/inference-model-slug';
import { languageAlternates, zhPath } from '@/lib/i18n';
import {
  DEFAULT_ROUTE_MODEL,
  MODEL_ROUTE_TABS,
  MODEL_ROUTES,
  modelRoutePath,
} from '@/lib/model-routes';
import { SITE_URL as BASE_URL } from '@semianalysisai/inferencex-constants';

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
  const [compareSlugs, precisionSlugs, specDecodeSlugs, datasets] = await Promise.all([
    getAllComparableCompareSlugs(),
    getAllComparablePrecisionSlugs(),
    getAllComparableSpecDecodeSlugs(),
    FIXTURES_MODE ? Promise.resolve([]) : listDatasets(getDb()),
  ]);
  const zhPosts = new Set(getAllPosts('zh').map((post) => post.slug));

  return [
    ...DASHBOARD_ROUTES.filter((route) => route.indexable).flatMap((route) =>
      localizedPair(route.canonicalPath, {
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: route.canonicalPath === '/' ? 1 : 0.9,
      }),
    ),
    // Per-model tab routes (/calculator/<slug>, /historical/<slug>). The
    // default model's pages canonicalize to the bare tab paths (already
    // emitted above), so they stay out of the sitemap.
    ...MODEL_ROUTE_TABS.flatMap((tab) =>
      MODEL_ROUTES.filter((route) => route.model !== DEFAULT_ROUTE_MODEL).flatMap((route) =>
        localizedPair(modelRoutePath(tab, route.slug), {
          lastModified: now,
          changeFrequency: 'daily' as const,
          priority: 0.8,
        }),
      ),
    ),
    ...localizedPair('/overview', {
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    }),
    ...localizedPair('/quotes', { lastModified: now, changeFrequency: 'monthly', priority: 0.6 }),
    ...localizedPair('/about', { lastModified: now, changeFrequency: 'monthly', priority: 0.6 }),
    ...localizedPair('/land-acknowledgement', {
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.4,
    }),
    // Per-model inference pages — the indexable path form of
    // `/inference?g_model=…`. Deprecated models keep their pages (historical
    // data stays reachable) at a lower priority than actively benchmarked ones.
    ...INFERENCE_MODEL_SLUGS.flatMap((entry) =>
      localizedPair(`/inference/${entry.slug}`, {
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: ACTIVE_INFERENCE_MODEL_SLUGS.includes(entry) ? 0.8 : 0.5,
      }),
    ),
    // The catalog index is indexable; the per-point detail pages it links to
    // stay noindex, so only this page enters the sitemap.
    ...localizedPair('/inference/agentic', {
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.7,
    }),
    ...localizedPair('/compare', { lastModified: now, changeFrequency: 'daily', priority: 0.8 }),
    ...localizedPair('/compare-per-dollar', {
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    }),
    ...localizedPair('/compare-precision', {
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    }),
    ...localizedPair('/compare-spec-decode', {
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    }),
    ...localizedPair('/agentx', { lastModified: now, changeFrequency: 'weekly', priority: 0.6 }),
    ...datasets.flatMap((dataset) =>
      localizedPair(`/agentx/${dataset.slug}`, {
        lastModified: now,
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      }),
    ),
    ...localizedPair('/agentx/methodology', {
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    }),
    ...localizedPair('/agentx/telemetry', {
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    }),
    ...localizedPair('/agentx/optimizations', {
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    }),
    ...AGENTX_OPTIMIZATION_SLUGS.flatMap((slug) =>
      localizedPair(`/agentx/optimizations/${slug}`, {
        lastModified: now,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      }),
    ),
    ...localizedPair('/api', { lastModified: now, changeFrequency: 'monthly', priority: 0.7 }),
    ...localizedPair('/blog', { lastModified: now, changeFrequency: 'weekly', priority: 0.8 }),
    ...localizedPair('/glossary', {
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    }),
    ...getAllGlossaryEntries().flatMap((entry) =>
      localizedPair(`/glossary/${entry.slug}`, {
        lastModified: now,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      }),
    ),
    ...localizedPair('/guides', {
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    }),
    ...getAllGuides().flatMap((entry) =>
      localizedPair(`/guides/${entry.slug}`, {
        lastModified: now,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      }),
    ),
    ...localizedPair('/chips', {
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    }),
    ...getAllChipRouteSlugs().flatMap((slug) =>
      localizedPair(`/chips/${slug}`, {
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }),
    ),
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
    // Model deep-dive pages (architecture + vendor evals + embedded dashboard).
    // English-only: no /zh sibling, so no localizedPair.
    {
      url: `${BASE_URL}/model`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
    ...getModelPageSlugs().map((slug) => ({
      url: `${BASE_URL}/model/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
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
    // Precision comparison pages — each slug page has a hero PNG chart.
    ...precisionSlugs.flatMap(({ modelSlug, gpu, precA, precB }) => {
      const enPath = `/compare-precision/${canonicalPrecisionCompareSlug(modelSlug, gpu, precA, precB)}`;
      return localizedPair(enPath, {
        images: [`${BASE_URL}${enPath}/precision-comparison.png`],
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      });
    }),
    // Speculative decoding comparison pages — each slug page has a hero PNG chart.
    ...specDecodeSlugs.flatMap(({ modelSlug, gpu, precision, method }) => {
      const enPath = `/compare-spec-decode/${canonicalSpecDecodeCompareSlug(modelSlug, gpu, precision, method)}`;
      return localizedPair(enPath, {
        images: [`${BASE_URL}${enPath}/spec-decode-comparison.png`],
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      });
    }),
  ];
}
