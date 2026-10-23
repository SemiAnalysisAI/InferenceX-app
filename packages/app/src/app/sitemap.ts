import type { MetadataRoute } from 'next';
import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import { listDatasets } from '@semianalysisai/inferencex-db/queries/datasets';

import { AGENTX_OPTIMIZATION_SLUGS } from '@/lib/agentx/agentx-optimizations';
import { DASHBOARD_ROUTES } from '@/lib/routing/dashboard-routes';
import { getAllPosts } from '@/lib/blog/blog';
import { getAllHardwarePages } from '@/lib/hardware/hardware';
import { getModelPageSlugs } from '@/lib/catalog/model-pages';
import { getAllComparableCompareSlugs } from '@/lib/compare/compare-availability';
import { canonicalCompareSlug } from '@/lib/compare/compare-slug';
import {
  getAllComparablePrecisionSlugs,
  getAllComparableSpecDecodeSlugs,
} from '@/lib/compare/compare-variant-availability';
import {
  canonicalPrecisionCompareSlug,
  canonicalSpecDecodeCompareSlug,
} from '@/lib/compare/compare-variant-slug';
import { getAllChipRouteSlugs } from '@/lib/catalog/chip-pages';
import { getAllGlossaryEntries } from '@/lib/content/glossary';
import {
  ACTIVE_INFERENCE_MODEL_SLUGS,
  INFERENCE_MODEL_SLUGS,
} from '@/lib/routing/inference-model-slug';
import { languageAlternates, zhPath } from '@/lib/i18n/i18n';
import {
  defaultRouteModel,
  MODEL_ROUTE_TABS,
  modelRoutePath,
  modelRoutesForTab,
} from '@/lib/routing/model-routes';
import { getAllRankingPageEntries } from '@/lib/live-seo/rankings';
import { getAvailableRunEntries } from '@/lib/live-seo/run-rankings-data.server';
import { getAllWhitepapers } from '@/lib/content/whitepapers';
import { SITE_URL as BASE_URL } from '@semianalysisai/inferencex-constants';

type SitemapEntry = MetadataRoute.Sitemap[number];

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
  const [compareSlugs, precisionSlugs, specDecodeSlugs, datasets, runEntries] = await Promise.all([
    getAllComparableCompareSlugs(),
    getAllComparablePrecisionSlugs(),
    getAllComparableSpecDecodeSlugs(),
    FIXTURES_MODE ? Promise.resolve([]) : listDatasets(getDb()),
    getAvailableRunEntries(),
  ]);
  const zhPosts = new Set(getAllPosts('zh').map((post) => post.slug));
  const zhHardwarePages = new Set(getAllHardwarePages('zh').map((page) => page.slug));

  return [
    ...DASHBOARD_ROUTES.filter((route) => route.indexable).flatMap((route) =>
      localizedPair(route.canonicalPath, {
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: route.canonicalPath === '/' ? 1 : 0.9,
      }),
    ),
    ...MODEL_ROUTE_TABS.flatMap((tab) =>
      modelRoutesForTab(tab)
        .filter((route) => route.model !== defaultRouteModel(tab))
        .flatMap((route) =>
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
    ...INFERENCE_MODEL_SLUGS.flatMap((entry) =>
      localizedPair(`/inference/${entry.slug}`, {
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: ACTIVE_INFERENCE_MODEL_SLUGS.includes(entry) ? 0.8 : 0.5,
      }),
    ),
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
    ...localizedPair('/agentx/quickstart', {
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    }),
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
    ...localizedPair('/rankings', { lastModified: now, changeFrequency: 'daily', priority: 0.8 }),
    ...getAllRankingPageEntries().flatMap((entry) =>
      localizedPair(`/rankings/${entry.slug}`, {
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }),
    ),
    ...localizedPair('/run', { lastModified: now, changeFrequency: 'daily', priority: 0.8 }),
    ...runEntries.flatMap((entry) =>
      localizedPair(`/run/${entry.slug}`, {
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }),
    ),
    ...getAllPosts().flatMap((post) => {
      const entry = {
        lastModified: new Date(`${post.modifiedDate ?? post.date}T00:00:00Z`).toISOString(),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      };
      if (!zhPosts.has(post.slug)) return [{ ...entry, url: `${BASE_URL}/blog/${post.slug}` }];
      return localizedPair(`/blog/${post.slug}`, entry);
    }),
    ...localizedPair('/hardware', { lastModified: now, changeFrequency: 'weekly', priority: 0.8 }),
    ...getAllHardwarePages().flatMap((page) => {
      const enPath = `/hardware/${page.slug}`;
      const entry = {
        lastModified: new Date(`${page.date}T00:00:00Z`).toISOString(),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      };
      if (!zhHardwarePages.has(page.slug)) return [{ ...entry, url: `${BASE_URL}${enPath}` }];
      return localizedPair(enPath, entry);
    }),
    ...localizedPair('/whitepaper', {
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    }),
    ...getAllWhitepapers().flatMap((paper) =>
      localizedPair(`/whitepaper/${paper.slug}`, {
        images: [`${BASE_URL}${paper.heroImagePath}`],
        lastModified: new Date(`${paper.publishedDate}T00:00:00Z`).toISOString(),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      }),
    ),
    ...localizedPair('/model', {
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }),
    ...getModelPageSlugs().flatMap((slug) =>
      localizedPair(`/model/${slug}`, {
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }),
    ),
    ...compareSlugs.flatMap(({ modelSlug, a, b }) =>
      localizedPair(`/compare/${canonicalCompareSlug(modelSlug, a, b)}`, {
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }),
    ),
    ...compareSlugs.flatMap(({ modelSlug, a, b }) => {
      const enPath = `/compare-per-dollar/${canonicalCompareSlug(modelSlug, a, b)}`;
      return localizedPair(enPath, {
        images: [`${BASE_URL}${enPath}/performance-per-dollar.png`],
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      });
    }),
    ...precisionSlugs.flatMap(({ modelSlug, gpu, precA, precB }) => {
      const enPath = `/compare-precision/${canonicalPrecisionCompareSlug(modelSlug, gpu, precA, precB)}`;
      return localizedPair(enPath, {
        images: [`${BASE_URL}${enPath}/precision-comparison.png`],
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      });
    }),
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
