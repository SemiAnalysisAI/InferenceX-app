import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { DASHBOARD_ROUTES } from '@/lib/routing/dashboard-routes';
import { getAllChipRouteSlugs } from '@/lib/catalog/chip-pages';
import { INFERENCE_MODEL_SLUGS } from '@/lib/routing/inference-model-slug';
import { languageAlternates, zhPath } from '@/lib/i18n/i18n';
import { getModelPageSlugs } from '@/lib/catalog/model-pages';
import {
  defaultRouteModel,
  MODEL_ROUTE_TABS,
  MODEL_ROUTES,
  modelRoutePath,
  modelRoutesForTab,
} from '@/lib/routing/model-routes';
const mocks = vi.hoisted(() => ({
  fixturesMode: false,
  getDb: vi.fn(() => ({})),
  listDatasets: vi.fn(() =>
    Promise.resolve([{ slug: 'agentx-fixture', ingested_at: '2026-09-02 10:11:12.123+00' }]),
  ),
  availability: [
    { model: 'qwen3.5', hardware: 'b200', date: '2026-10-01' },
    { model: 'qwen3.5', hardware: 'mi355x', date: '2026-10-20' },
    { model: 'llama70b', hardware: 'h100', date: '2026-10-24' },
    { model: 'not-a-mapped-model', hardware: 'h100', date: '2026-10-25' },
  ],
  hardwarePages: {
    en: [
      { slug: 'vera-rubin-nvl72-vs-gb300-nvl72-agentx-results', date: '2026-10-19' },
      { slug: 'tpu-v7-ironwood-vs-gb300-nvl72-agentx-results', date: '2026-10-18' },
    ],
    zh: [{ slug: 'vera-rubin-nvl72-vs-gb300-nvl72-agentx-results', date: '2026-10-19' }],
  },
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
vi.mock('@/lib/cache/api-cache', () => ({
  cachedQuery: <Args extends unknown[], T>(fn: (...args: Args) => Promise<T>) => fn,
}));
vi.mock('@/lib/agentx/agentx-optimizations', () => ({ AGENTX_OPTIMIZATION_SLUGS: [] }));
vi.mock('@/lib/blog/blog', () => ({ getAllPosts: () => [] }));
vi.mock('@/lib/hardware/hardware', () => ({
  getAllHardwarePages: (locale: 'en' | 'zh' = 'en') => mocks.hardwarePages[locale],
}));
vi.mock('@/lib/compare/compare-availability', () => ({
  getAllComparableCompareSlugs: () => Promise.resolve([]),
  getCachedAvailability: () => Promise.resolve(mocks.availability),
}));
vi.mock('@/lib/compare/compare-variant-availability', () => ({
  getAllComparablePrecisionSlugs: () => Promise.resolve([]),
  getAllComparableSpecDecodeSlugs: () => Promise.resolve([]),
}));
vi.mock('@/lib/content/glossary', () => ({ getAllGlossaryEntries: () => [] }));
vi.mock('@/lib/live-seo/run-rankings-data.server', () => ({
  getAvailableRunEntries: () => Promise.resolve([]),
}));

import { getAllRankingPageEntries } from '@/lib/live-seo/rankings';
import { getAllWhitepapers } from '@/lib/content/whitepapers';
import { EXPLORER_SECTION_META } from '@/lib/agentic-workload-explorer/page-meta';

import sitemap from './sitemap';

describe('sitemap locale parity', () => {
  it('includes the shareable AgentX quickstart in both languages', async () => {
    const entries = await sitemap();
    for (const path of ['/agentx/quickstart', '/zh/agentx/quickstart']) {
      const entry = entries.find((item) => item.url === `${SITE_URL}${path}`);
      expect(entry?.alternates?.languages).toMatchObject({
        en: `${SITE_URL}/agentx/quickstart`,
        'zh-CN': `${SITE_URL}/zh/agentx/quickstart`,
      });
    }
  });

  beforeEach(() => {
    mocks.fixturesMode = false;
    vi.clearAllMocks();
  });

  it('emits both locales for every indexable dashboard route and omits non-indexable routes', async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));

    for (const route of DASHBOARD_ROUTES) {
      const englishUrl = `${SITE_URL}${route.canonicalPath}`;
      const chineseUrl = `${SITE_URL}${zhPath(route.canonicalPath)}`;

      expect(urls.has(englishUrl)).toBe(route.indexable);
      expect(urls.has(chineseUrl)).toBe(route.indexable && route.localeMirrored);
    }
  });

  it('lists the landing page and the self-canonical /inference dashboard as separate URLs', async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));
    for (const url of [
      SITE_URL,
      `${SITE_URL}/zh`,
      `${SITE_URL}/inference`,
      `${SITE_URL}/zh/inference`,
    ]) {
      expect(urls.has(url)).toBe(true);
    }
  });

  it('emits both locales for every agentic workload explorer section', async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));
    const sections = Object.keys(EXPLORER_SECTION_META);
    expect(sections).toContain('/harnesses');
    for (const section of sections) {
      expect(urls.has(`${SITE_URL}/agentic-workload-explorer${section}`)).toBe(true);
      expect(urls.has(`${SITE_URL}/zh/agentic-workload-explorer${section}`)).toBe(true);
    }
  });

  it('derives lastmod from benchmark and content dates instead of the build time', async () => {
    const entries = await sitemap();
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));
    // newest row overall, including models without a page
    expect(byUrl.get(`${SITE_URL}/inference`)?.lastModified).toBe('2026-10-25T00:00:00.000Z');
    // newest row for that model across chips
    expect(byUrl.get(`${SITE_URL}/model/qwen-3-5`)?.lastModified).toBe('2026-10-20T00:00:00.000Z');
    expect(byUrl.get(`${SITE_URL}/zh/model/qwen-3-5`)?.lastModified).toBe(
      '2026-10-20T00:00:00.000Z',
    );
    expect(byUrl.get(`${SITE_URL}/agentx/agentx-fixture`)?.lastModified).toBe(
      '2026-09-02T00:00:00.000Z',
    );
    expect(byUrl.get(`${SITE_URL}/hardware`)?.lastModified).toBe('2026-10-19T00:00:00.000Z');
    expect(byUrl.get(`${SITE_URL}/about`)).toBeDefined();
    expect(byUrl.get(`${SITE_URL}/about`)?.lastModified).toBeUndefined();
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

  it('emits the hardware index in both locales and pairs only translated hardware pages', async () => {
    const entries = await sitemap();
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));
    expect(byUrl.get(`${SITE_URL}/hardware`)?.alternates?.languages).toEqual(
      languageAlternates('/hardware'),
    );
    expect(byUrl.has(`${SITE_URL}/zh/hardware`)).toBe(true);

    const paired = '/hardware/vera-rubin-nvl72-vs-gb300-nvl72-agentx-results';
    for (const url of [`${SITE_URL}${paired}`, `${SITE_URL}${zhPath(paired)}`]) {
      expect(byUrl.get(url)?.alternates?.languages).toEqual(languageAlternates(paired));
      expect(byUrl.get(url)?.lastModified).toBe('2026-10-19T00:00:00.000Z');
    }

    const englishOnly = '/hardware/tpu-v7-ironwood-vs-gb300-nvl72-agentx-results';
    expect(byUrl.get(`${SITE_URL}${englishOnly}`)).toEqual({
      url: `${SITE_URL}${englishOnly}`,
      lastModified: '2026-10-18T00:00:00.000Z',
      changeFrequency: 'monthly',
      priority: 0.7,
    });
    expect(byUrl.has(`${SITE_URL}${zhPath(englishOnly)}`)).toBe(false);
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
