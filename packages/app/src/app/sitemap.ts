import type { MetadataRoute } from 'next';
import { isFeatureGatedModelPath } from '@/lib/routing/model-feature-visibility';
import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import { listDatasets } from '@semianalysisai/inferencex-db/queries/datasets';

import { AGENTX_OPTIMIZATION_SLUGS } from '@/lib/agentx/agentx-optimizations';
import { DASHBOARD_ROUTES } from '@/lib/routing/dashboard-routes';
import { getAllPosts } from '@/lib/blog/blog';
import { getAllHardwarePages } from '@/lib/hardware/hardware';
import { getModelPageSlugs } from '@/lib/catalog/model-pages';
import {
  getAllComparableCompareSlugs,
  getCachedAvailability,
} from '@/lib/compare/compare-availability';
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
import { EXPLORER_BASE_PATH } from '@/lib/agentic-workload-explorer/paths';
import { EXPLORER_SECTION_META } from '@/lib/agentic-workload-explorer/page-meta';
import { dataLastModified } from '@/lib/seo/sitemap-lastmod';
import { cachedQuery } from '@/lib/cache/api-cache';
import { SITE_URL as BASE_URL } from '@semianalysisai/inferencex-constants';

export const revalidate = 3600;

const getCachedDatasets = cachedQuery(() => listDatasets(getDb()), 'sitemap-datasets');

type SitemapEntry = MetadataRoute.Sitemap[number];

function dayIso(date: string): string {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).toISOString();
}

function newestDate(dates: readonly string[]): string | undefined {
  let newest: string | undefined;
  for (const date of dates) if (newest === undefined || date > newest) newest = date;
  return newest && dayIso(newest);
}

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
  const [compareSlugs, precisionSlugs, specDecodeSlugs, datasets, runEntries, availability] =
    await Promise.all([
      getAllComparableCompareSlugs(),
      getAllComparablePrecisionSlugs(),
      getAllComparableSpecDecodeSlugs(),
      FIXTURES_MODE ? Promise.resolve([]) : getCachedDatasets(),
      getAvailableRunEntries(),
      getCachedAvailability(),
    ]);
  const dataDates = dataLastModified(availability);
  const latestData = dataDates.latest;
  const modelData = (modelSlug: string) => dataDates.forModel(modelSlug) ?? latestData;
  const posts = getAllPosts();
  const hardwarePages = getAllHardwarePages();
  const whitepapers = getAllWhitepapers();
  const zhPosts = new Set(getAllPosts('zh').map((post) => post.slug));
  const zhHardwarePages = new Set(getAllHardwarePages('zh').map((page) => page.slug));

  const entries: MetadataRoute.Sitemap = [
    ...localizedPair('/', { lastModified: latestData, changeFrequency: 'daily', priority: 1 }),
    ...DASHBOARD_ROUTES.filter((route) => route.indexable).flatMap((route) =>
      localizedPair(route.canonicalPath, {
        lastModified: latestData,
        changeFrequency: 'daily' as const,
        priority: 0.9,
      }),
    ),
    ...Object.keys(EXPLORER_SECTION_META).flatMap((section) =>
      localizedPair(`${EXPLORER_BASE_PATH}${section}`, {
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      }),
    ),
    ...MODEL_ROUTE_TABS.flatMap((tab) =>
      modelRoutesForTab(tab)
        .filter((route) => route.model !== defaultRouteModel(tab))
        .flatMap((route) =>
          localizedPair(modelRoutePath(tab, route.slug), {
            lastModified: modelData(route.slug),
            changeFrequency: 'daily' as const,
            priority: 0.8,
          }),
        ),
    ),
    ...localizedPair('/overview', {
      lastModified: latestData,
      changeFrequency: 'daily',
      priority: 0.9,
    }),
    ...localizedPair('/quotes', { changeFrequency: 'monthly', priority: 0.6 }),
    ...localizedPair('/about', { changeFrequency: 'monthly', priority: 0.6 }),
    ...localizedPair('/land-acknowledgement', { changeFrequency: 'yearly', priority: 0.4 }),
    ...INFERENCE_MODEL_SLUGS.flatMap((entry) =>
      localizedPair(`/inference/${entry.slug}`, {
        lastModified: modelData(entry.slug),
        changeFrequency: 'daily' as const,
        priority: ACTIVE_INFERENCE_MODEL_SLUGS.includes(entry) ? 0.8 : 0.5,
      }),
    ),
    ...localizedPair('/inference/agentic', {
      lastModified: latestData,
      changeFrequency: 'daily',
      priority: 0.7,
    }),
    ...localizedPair('/compare', {
      lastModified: latestData,
      changeFrequency: 'daily',
      priority: 0.8,
    }),
    ...localizedPair('/compare-per-dollar', {
      lastModified: latestData,
      changeFrequency: 'daily',
      priority: 0.8,
    }),
    ...localizedPair('/compare-precision', {
      lastModified: latestData,
      changeFrequency: 'daily',
      priority: 0.8,
    }),
    ...localizedPair('/compare-spec-decode', {
      lastModified: latestData,
      changeFrequency: 'daily',
      priority: 0.8,
    }),
    ...localizedPair('/agentx', {
      lastModified: newestDate(datasets.map((dataset) => dataset.ingested_at)),
      changeFrequency: 'weekly',
      priority: 0.6,
    }),
    ...datasets.flatMap((dataset) =>
      localizedPair(`/agentx/${dataset.slug}`, {
        lastModified: dayIso(dataset.ingested_at),
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      }),
    ),
    ...localizedPair('/agentx/quickstart', {
      changeFrequency: 'monthly',
      priority: 0.7,
    }),
    ...localizedPair('/agentx/methodology', {
      changeFrequency: 'monthly',
      priority: 0.6,
    }),
    ...localizedPair('/agentx/telemetry', {
      changeFrequency: 'monthly',
      priority: 0.6,
    }),
    ...localizedPair('/agentx/optimizations', {
      changeFrequency: 'monthly',
      priority: 0.7,
    }),
    ...AGENTX_OPTIMIZATION_SLUGS.flatMap((slug) =>
      localizedPair(`/agentx/optimizations/${slug}`, {
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      }),
    ),
    ...localizedPair('/api', { changeFrequency: 'monthly', priority: 0.7 }),
    ...localizedPair('/blog', {
      lastModified: newestDate(posts.map((post) => post.modifiedDate ?? post.date)),
      changeFrequency: 'weekly',
      priority: 0.8,
    }),
    ...localizedPair('/glossary', {
      changeFrequency: 'monthly',
      priority: 0.7,
    }),
    ...getAllGlossaryEntries().flatMap((entry) =>
      localizedPair(`/glossary/${entry.slug}`, {
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      }),
    ),
    ...localizedPair('/chips', {
      changeFrequency: 'weekly',
      priority: 0.8,
    }),
    ...getAllChipRouteSlugs().flatMap((slug) =>
      localizedPair(`/chips/${slug}`, {
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }),
    ),
    ...localizedPair('/rankings', {
      lastModified: latestData,
      changeFrequency: 'daily',
      priority: 0.8,
    }),
    ...getAllRankingPageEntries().flatMap((entry) =>
      localizedPair(`/rankings/${entry.slug}`, {
        lastModified: modelData(entry.model.slug),
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }),
    ),
    ...localizedPair('/run', { lastModified: latestData, changeFrequency: 'daily', priority: 0.8 }),
    ...runEntries.flatMap((entry) =>
      localizedPair(`/run/${entry.slug}`, {
        lastModified: dataDates.forModelChips(entry.model.slug, [entry.chip.hwKey]) ?? latestData,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }),
    ),
    ...posts.flatMap((post) => {
      const entry = {
        lastModified: new Date(`${post.modifiedDate ?? post.date}T00:00:00Z`).toISOString(),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      };
      if (!zhPosts.has(post.slug)) return [{ ...entry, url: `${BASE_URL}/blog/${post.slug}` }];
      return localizedPair(`/blog/${post.slug}`, entry);
    }),
    ...localizedPair('/hardware', {
      lastModified: newestDate(hardwarePages.map((page) => page.date)),
      changeFrequency: 'weekly',
      priority: 0.8,
    }),
    ...hardwarePages.flatMap((page) => {
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
      lastModified: newestDate(whitepapers.map((paper) => paper.publishedDate)),
      changeFrequency: 'monthly',
      priority: 0.7,
    }),
    ...whitepapers.flatMap((paper) =>
      localizedPair(`/whitepaper/${paper.slug}`, {
        images: [`${BASE_URL}${paper.heroImagePath}`],
        lastModified: new Date(`${paper.publishedDate}T00:00:00Z`).toISOString(),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      }),
    ),
    ...localizedPair('/model', {
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }),
    ...getModelPageSlugs().flatMap((slug) =>
      localizedPair(`/model/${slug}`, {
        lastModified: modelData(slug),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }),
    ),
    ...compareSlugs.flatMap(({ modelSlug, a, b }) =>
      localizedPair(`/compare/${canonicalCompareSlug(modelSlug, a, b)}`, {
        lastModified: dataDates.forModelChips(modelSlug, [a, b]) ?? latestData,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }),
    ),
    ...compareSlugs.flatMap(({ modelSlug, a, b }) => {
      const enPath = `/compare-per-dollar/${canonicalCompareSlug(modelSlug, a, b)}`;
      return localizedPair(enPath, {
        images: [`${BASE_URL}${enPath}/performance-per-dollar.png`],
        lastModified: dataDates.forModelChips(modelSlug, [a, b]) ?? latestData,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      });
    }),
    ...precisionSlugs.flatMap(({ modelSlug, gpu, precA, precB }) => {
      const enPath = `/compare-precision/${canonicalPrecisionCompareSlug(modelSlug, gpu, precA, precB)}`;
      return localizedPair(enPath, {
        images: [`${BASE_URL}${enPath}/precision-comparison.png`],
        lastModified: dataDates.forModelChips(modelSlug, [gpu]) ?? latestData,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      });
    }),
    ...specDecodeSlugs.flatMap(({ modelSlug, gpu, precision, method }) => {
      const enPath = `/compare-spec-decode/${canonicalSpecDecodeCompareSlug(modelSlug, gpu, precision, method)}`;
      return localizedPair(enPath, {
        images: [`${BASE_URL}${enPath}/spec-decode-comparison.png`],
        lastModified: dataDates.forModelChips(modelSlug, [gpu]) ?? latestData,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      });
    }),
  ];
  return entries.filter((entry) => !isFeatureGatedModelPath(new URL(entry.url).pathname));
}
