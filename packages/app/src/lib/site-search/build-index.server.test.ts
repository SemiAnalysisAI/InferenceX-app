// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { extractHeadings, getPostBySlug } from '@/lib/blog/blog';

import {
  assembleSearchIndex,
  type BuiltSearchIndex,
  collectSourcePages,
  getSiteSearchIndex,
} from './build-index.server';
import { NOT_INDEXED_ROUTES } from './coverage';
import { type IndexedPage, parseSearchIndexFile, SEARCH_INDEX_MANIFEST_PATH } from './index-format';
import { SiteSearchEngine } from './site-search-engine';

const APP_DIR = path.resolve(__dirname, '../../app');

function canonical(url: string): string {
  return url === '/zh' ? '/' : url.replace(/^\/zh(?=\/)/u, '');
}

/** App Router route patterns from every `page.tsx`, route groups removed. */
function routes(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...routes(full, name.startsWith('(') ? base : `${base}/${name}`));
    } else if (name === 'page.tsx') {
      out.push(base || '/');
    }
  }
  return out;
}

function toRegex(pattern: string): RegExp {
  return new RegExp(
    `^${pattern.replaceAll(/\[\.\.\.[^\]]+\]/gu, '.+').replaceAll(/\[[^\]]+\]/gu, '[^/]+')}$`,
    'u',
  );
}

let built: BuiltSearchIndex;
let en: IndexedPage[];
let zh: IndexedPage[];

beforeAll(async () => {
  built = await getSiteSearchIndex();
  en = built.files.en.pages;
  zh = built.files.zh.pages;
}, 60_000);

function page(pages: IndexedPage[], url: string): IndexedPage {
  const found = pages.find((entry) => entry.url === url);
  if (!found) throw new Error(`${url} missing from index`);
  return found;
}

/** An engine wired to the real generated index through a fake fetch. */
async function engineFor(locale: 'en' | 'zh'): Promise<SiteSearchEngine> {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const body =
      String(input) === SEARCH_INDEX_MANIFEST_PATH ? built.manifest : built.files[locale];
    return Promise.resolve(Response.json(body));
  });
  const engine = new SiteSearchEngine(locale, fetchMock as typeof fetch);
  await engine.load();
  expect(engine.status().state).toBe('ready');
  return engine;
}

describe('build-time site search index', () => {
  it('indexes blog posts by section with the anchors the rendered TOC uses', () => {
    const slug = 'tpu-inferencex-full-steam';
    const post = page(en, `/blog/${slug}`);
    expect(post.coverage).toBe('full');
    const ids = new Set(extractHeadings(getPostBySlug(slug, 'en')!.raw).map((h) => h.id));
    const anchors = post.sections.flatMap((section) => section.anchor ?? []);
    expect(anchors.length).toBeGreaterThan(3);
    for (const anchor of anchors) expect(ids).toContain(anchor);
    // Prose only: no MDX tags, JSON-LD or markdown link syntax leaks into text.
    const text = post.sections.map((section) => section.text).join(' ');
    expect(text).not.toMatch(/<Figure|<DashboardCTA|"@context"|\]\(https?:/u);
  });

  it('covers representative page types with the right coverage level', () => {
    expect(page(en, '/glossary/time-to-first-token')).toMatchObject({ coverage: 'full' });
    expect(page(en, '/chips/mi355x')).toMatchObject({ coverage: 'partial' });
    expect(page(en, '/agentx/optimizations')).toMatchObject({ coverage: 'full' });
    expect(page(en, '/whitepaper/amd-mi355x-32b-revenue-per-gigawatt-kimi-k3')).toMatchObject({
      coverage: 'full',
    });
    expect(page(en, '/about')).toMatchObject({ coverage: 'partial' });
    expect(page(en, '/agentx/methodology')).toMatchObject({ coverage: 'summary' });
    expect(page(en, '/inference')).toMatchObject({ coverage: 'summary' });
    // Summary pages carry the description the page itself exports.
    expect(page(en, '/agentx/methodology').sections[0].text).toMatch(/coding-agent traces/u);
  });

  it('only uses section anchors that exist in the rendering component', () => {
    const sources: Record<string, string> = {
      '/glossary/': 'app/glossary/[slug]/page.tsx',
      '/zh/glossary/': 'app/zh/glossary/[slug]/page.tsx',
      '/chips/': 'components/chips/chip-page-sections.tsx',
      '/zh/chips/': 'components/chips/chip-page-sections.tsx',
      '/whitepaper/': 'components/whitepaper/whitepaper-detail-content.tsx',
      '/zh/whitepaper/': 'components/whitepaper/whitepaper-detail-content.tsx',
    };
    for (const [prefix, file] of Object.entries(sources)) {
      const source = readFileSync(path.resolve(APP_DIR, '..', file), 'utf8');
      const anchors = new Set(
        [...en, ...zh]
          .filter((entry) => entry.url.startsWith(prefix))
          .flatMap((entry) => entry.sections.flatMap((section) => section.anchor ?? [])),
      );
      expect(anchors.size, prefix).toBeGreaterThan(0);
      for (const anchor of anchors) expect(source, `${prefix}#${anchor}`).toContain(anchor);
    }
  });

  it('keeps English and Chinese variants in their own files', () => {
    expect(en.every((entry) => !entry.url.startsWith('/zh'))).toBe(true);
    const zhUrls = zh.filter((entry) => entry.url === '/zh' || entry.url.startsWith('/zh/'));
    expect(zhUrls.length).toBeGreaterThan(zh.length * 0.9);
    // Same page set in both locales: each zh entry is the variant of an en page.
    expect(new Set(zh.map((entry) => canonical(entry.url)))).toEqual(
      new Set(en.map((entry) => entry.url)),
    );
    expect(page(zh, '/zh/glossary/time-to-first-token').sections.map((s) => s.heading)).toContain(
      '技术定义',
    );
    expect(page(zh, '/zh/agentx/methodology').title).toBe('AgentX 测试方法');
  });

  it('ranks representative queries over the real index', async () => {
    const engine = await engineFor('en');
    // Tier order is unchanged: main pages (the /about FAQ, AgentX pages) list
    // before reference pages, so the chip page is near the top, not first.
    const chip = engine.search('MI355X', 8).map((r) => r.url);
    expect(chip.some((url) => /^\/chips\/mi355x(?:#|$)/u.test(url))).toBe(true);
    const ttft = engine.search('time to first token', 8).map((r) => r.url);
    expect(ttft[0]).toBe('/first-token');
    expect(
      engine
        .search('TTFT definition', 8)
        .some((r) => r.url.startsWith('/glossary/time-to-first-token')),
    ).toBe(true);
    expect(engine.search('AgentX methodology').some((r) => r.url === '/agentx/methodology')).toBe(
      true,
    );
    // Related-term matching: "energy" reaches pages that only say power/J/token.
    expect(engine.search('energy').length).toBeGreaterThan(0);
    // A section deep inside a blog post is reachable by its own heading and anchor.
    const post = page(en, '/blog/tpu-inferencex-full-steam');
    const deep = post.sections.filter((entry) => entry.anchor && entry.heading)[4];
    expect(engine.search(`${deep.heading} tpu`, 20).map((r) => r.url)).toContain(
      `/blog/tpu-inferencex-full-steam#${deep.anchor}`,
    );

    const zhEngine = await engineFor('zh');
    const zhHits = zhEngine.search('首个 token 延迟');
    expect(zhHits[0].url).toMatch(/^\/zh\//u);
  });

  it('is deterministic and versioned by content', async () => {
    const pages = await collectSourcePages();
    const a = assembleSearchIndex(pages, new Date('2026-01-01'));
    const b = assembleSearchIndex(pages, new Date('2026-06-01'));
    expect(a.manifest.version).toBe(b.manifest.version);
    expect(a.manifest.version).toBe(built.manifest.version);

    const edited = structuredClone(pages);
    edited[0].en.sections[0].text += ' edited';
    expect(assembleSearchIndex(edited).manifest.version).not.toBe(a.manifest.version);

    expect(a.manifest.locales.en.path).toBe(`/search-index/${a.manifest.version}/en.json`);
    expect(parseSearchIndexFile(a.files.zh, { version: a.manifest.version, locale: 'zh' })).toEqual(
      a.files.zh,
    );
  });

  it('stays within the transfer budget', () => {
    for (const locale of ['en', 'zh'] as const) {
      const gzipped = gzipSync(JSON.stringify(built.files[locale])).length;
      expect(gzipped, locale).toBeLessThan(600 * 1024);
    }
  });

  it('accounts for every app route: indexed or listed as not indexed', () => {
    const excluded = NOT_INDEXED_ROUTES.flatMap(({ pattern }) => [
      toRegex(pattern),
      toRegex(`/zh${pattern}`),
    ]);
    const urls = [...en, ...zh].map((entry) => entry.url);
    const unaccounted = routes(APP_DIR).filter((route) => {
      if (excluded.some((regex) => regex.test(route))) return false;
      const regex = toRegex(route === '/zh' ? '/zh' : route);
      return !urls.some((url) => regex.test(url));
    });
    expect(unaccounted).toEqual([]);
  });
});
