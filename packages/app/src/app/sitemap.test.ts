import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { DASHBOARD_ROUTES } from '@/lib/dashboard-routes';
import { getAllChipRouteSlugs } from '@/lib/chip-pages';
import { INFERENCE_MODEL_SLUGS } from '@/lib/inference-model-slug';
import { zhPath } from '@/lib/i18n';
import { getModelPageSlugs } from '@/lib/model-pages';
import {
  defaultRouteModel,
  MODEL_ROUTE_TABS,
  MODEL_ROUTES,
  modelRoutePath,
  modelRoutesForTab,
} from '@/lib/model-routes';
const mocks = vi.hoisted(() => ({
  fixturesMode: false,
  getDb: vi.fn(() => ({})),
  listDatasets: vi.fn(() => Promise.resolve([{ slug: 'agentx-fixture' }])),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  get FIXTURES_MODE() {
    return mocks.fixturesMode;
  },
  getDb: mocks.getDb,
}));
vi.mock('@semianalysisai/inferencex-db/queries/datasets', () => ({
  listDatasets: mocks.listDatasets,
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
vi.mock('@/lib/run-rankings-data.server', () => ({
  getAvailableRunEntries: () => Promise.resolve([]),
}));

import { getAllRankingPageEntries } from '@/lib/rankings';
import { getAllWhitepapers } from '@/lib/whitepapers';

import sitemap from './sitemap';

describe('sitemap locale parity', () => {
  beforeEach(() => {
    mocks.fixturesMode = false;
    vi.clearAllMocks();
  });

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

  it('emits both locales for every /inference/<model> page', async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));
    expect(INFERENCE_MODEL_SLUGS.length).toBeGreaterThan(0);
    for (const entry of INFERENCE_MODEL_SLUGS) {
      expect(urls.has(`${SITE_URL}/inference/${entry.slug}`)).toBe(true);
      expect(urls.has(`${SITE_URL}${zhPath(`/inference/${entry.slug}`)}`)).toBe(true);
    }
  });

  it("emits per-model tab pages in both locales for the models each tab serves, skipping the tab's default model", async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));
    for (const tab of MODEL_ROUTE_TABS) {
      const served = new Set(modelRoutesForTab(tab).map((route) => route.model));
      for (const route of MODEL_ROUTES) {
        // The default model's page canonicalizes to the bare tab path, which
        // the dashboard-route loop above already covers. Models a tab does not
        // serve (the profit estimator is Kimi K3, GLM 5.2/5.3 and MiniMax M3
        // only) 404 and stay out.
        const expected = served.has(route.model) && route.model !== defaultRouteModel(tab);
        const enPath = modelRoutePath(tab, route.slug);
        expect(urls.has(`${SITE_URL}${enPath}`)).toBe(expected);
        expect(urls.has(`${SITE_URL}${zhPath(enPath)}`)).toBe(expected);
      }
    }
  });

  it('emits both locales for the model index and every model deep-dive page', async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));
    expect(urls.has(`${SITE_URL}/model`)).toBe(true);
    expect(urls.has(`${SITE_URL}/zh/model`)).toBe(true);
    for (const slug of getModelPageSlugs()) {
      expect(urls.has(`${SITE_URL}/model/${slug}`)).toBe(true);
      expect(urls.has(`${SITE_URL}/zh/model/${slug}`)).toBe(true);
    }
  });

  it('emits both locales for the chips index and every chip page', async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));
    expect(urls.has(`${SITE_URL}/chips`)).toBe(true);
    expect(urls.has(`${SITE_URL}${zhPath('/chips')}`)).toBe(true);
    const slugs = getAllChipRouteSlugs();
    expect(slugs.length).toBe(21);
    for (const slug of slugs) {
      expect(urls.has(`${SITE_URL}/chips/${slug}`)).toBe(true);
      expect(urls.has(`${SITE_URL}${zhPath(`/chips/${slug}`)}`)).toBe(true);
    }
  });

  it('emits both locales for the rankings index and every ranking page', async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));
    expect(urls.has(`${SITE_URL}/rankings`)).toBe(true);
    expect(urls.has(`${SITE_URL}${zhPath('/rankings')}`)).toBe(true);
    const rankingEntries = getAllRankingPageEntries();
    expect(rankingEntries.length).toBeGreaterThan(0);
    for (const entry of rankingEntries) {
      expect(urls.has(`${SITE_URL}/rankings/${entry.slug}`)).toBe(true);
      expect(urls.has(`${SITE_URL}${zhPath(`/rankings/${entry.slug}`)}`)).toBe(true);
    }
  });

  it('emits the /run index in both locales and only available run pages', async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));
    expect(urls.has(`${SITE_URL}/run`)).toBe(true);
    expect(urls.has(`${SITE_URL}${zhPath('/run')}`)).toBe(true);
    // Availability mock returns no pairs, so no /run/<pair> URLs may leak in.
    for (const url of urls) {
      expect(url.startsWith(`${SITE_URL}/run/`)).toBe(false);
      expect(url.startsWith(`${SITE_URL}/zh/run/`)).toBe(false);
    }
  });

  it('emits both locales for indexable AgentX dataset pages', async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));
    expect(urls.has(`${SITE_URL}/agentx/agentx-fixture`)).toBe(true);
    expect(urls.has(`${SITE_URL}/zh/agentx/agentx-fixture`)).toBe(true);
  });

  it('emits both locales for the whitepaper index and every whitepaper with its hero image', async () => {
    const entries = await sitemap();
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));
    expect(byUrl.has(`${SITE_URL}/whitepaper`)).toBe(true);
    expect(byUrl.has(`${SITE_URL}${zhPath('/whitepaper')}`)).toBe(true);
    const papers = getAllWhitepapers();
    expect(papers.length).toBeGreaterThan(0);
    for (const paper of papers) {
      const enPath = `/whitepaper/${paper.slug}`;
      const en = byUrl.get(`${SITE_URL}${enPath}`);
      const zh = byUrl.get(`${SITE_URL}${zhPath(enPath)}`);
      expect(en?.images).toEqual([`${SITE_URL}${paper.heroImagePath}`]);
      expect(zh?.images).toEqual([`${SITE_URL}${paper.heroImagePath}`]);
      expect(en?.lastModified).toBe(`${paper.publishedDate}T00:00:00.000Z`);
      expect(en?.alternates?.languages).toEqual(zh?.alternates?.languages);
    }
  });

  it('does not require a database connection in fixture mode', async () => {
    mocks.fixturesMode = true;

    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));

    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.listDatasets).not.toHaveBeenCalled();
    expect(urls.has(`${SITE_URL}/agentx/agentx-fixture`)).toBe(false);
  });
});
