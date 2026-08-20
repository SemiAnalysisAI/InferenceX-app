import { describe, expect, it, vi } from 'vitest';

import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { DASHBOARD_ROUTES } from '@/lib/dashboard-routes';
import { zhPath } from '@/lib/i18n';
vi.mock('@semianalysisai/inferencex-db/connection', () => ({ getDb: () => ({}) }));
vi.mock('@semianalysisai/inferencex-db/queries/datasets', () => ({
  listDatasets: () => Promise.resolve([{ slug: 'agentx-fixture' }]),
}));
vi.mock('@/lib/agentx-optimizations', () => ({ AGENTX_OPTIMIZATION_SLUGS: [] }));
vi.mock('@/lib/blog', () => ({ getAllPosts: () => [] }));
vi.mock('@/lib/compare-availability', () => ({
  getAllComparableCompareSlugs: () => Promise.resolve([]),
}));
vi.mock('@/lib/compare-variant-availability', () => ({
  getAllComparablePrecisionSlugs: () => Promise.resolve([]),
  getAllComparableSpecDecodeSlugs: () => Promise.resolve([]),
}));
vi.mock('@/lib/glossary', () => ({ getAllGlossaryEntries: () => [] }));

import sitemap from './sitemap';

describe('sitemap locale parity', () => {
  it('emits both locales for every indexable dashboard route and omits non-indexable routes', async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));

    for (const route of DASHBOARD_ROUTES) {
      const englishUrl =
        route.canonicalPath === '/' ? SITE_URL : `${SITE_URL}${route.canonicalPath}`;
      const chineseUrl = `${SITE_URL}${zhPath(route.canonicalPath)}`;

      expect(urls.has(englishUrl)).toBe(route.indexable);
      expect(urls.has(chineseUrl)).toBe(route.indexable && route.localeMirrored);
    }
  });

  it('emits both locales for indexable AgentX dataset pages', async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));
    expect(urls.has(`${SITE_URL}/agentx/agentx-fixture`)).toBe(true);
    expect(urls.has(`${SITE_URL}/zh/agentx/agentx-fixture`)).toBe(true);
  });
});
