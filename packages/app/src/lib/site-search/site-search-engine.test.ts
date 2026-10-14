// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { extractSections } from './extract';
import {
  type IndexedPage,
  SEARCH_INDEX_MANIFEST_PATH,
  SEARCH_INDEX_SCHEMA,
  searchIndexFilePath,
} from './index-format';
import { SiteSearchEngine } from './site-search-engine';

function html(title: string, main: string): string {
  return `<!doctype html><html><head><title>${title} | InferenceX</title>
<meta name="description" content="${title} description"></head>
<body><header><nav>Home Dashboard About</nav></header>
<main>${main}</main><footer>Footer links</footer>
<script>self.__next_f.push(["secret payload"])</script></body></html>`;
}

describe('extractSections', () => {
  it('reads page content that the open search modal marks aria-hidden', () => {
    // Radix hides everything behind a modal with aria-hidden plus a
    // data-aria-hidden marker; that content is still the page on screen.
    // Authored aria-hidden content stays excluded.
    document.title = 'About | InferenceX';
    document.body.innerHTML = `<main data-aria-hidden="true" aria-hidden="true">
      <h2 id="faq" data-aria-hidden="true" aria-hidden="true">FAQ</h2>
      <p data-aria-hidden="true" aria-hidden="true">The benchmark is open source.</p>
      <p aria-hidden="true">Decorative duplicate text.</p>
    </main>`;
    const docs = extractSections(document, '/about');
    expect(docs.find((doc) => doc.url === '/about#faq')?.text).toBe(
      'The benchmark is open source.',
    );
  });

  it('splits main content by heading and ignores chrome, scripts and charts', () => {
    const doc = new DOMParser().parseFromString(
      html(
        'MI355X',
        `<h1>MI355X</h1><p>Intro text.</p>
         <h2 id="memory">Memory</h2><p>288 GB HBM3E.</p><svg><text>0 100 200</text></svg>
         <button>Export CSV</button>
         <section id="cost"><h3>Cost</h3><p>Per hour pricing.</p></section>`,
      ),
      'text/html',
    );
    const sections = extractSections(doc, '/chips/mi355x');
    expect(sections.map((s) => [s.url, s.section, s.text])).toEqual([
      ['/chips/mi355x', undefined, 'MI355X description Intro text.'],
      ['/chips/mi355x#memory', 'Memory', '288 GB HBM3E.'],
      ['/chips/mi355x#cost', 'Cost', 'Per hour pricing.'],
    ]);
    const all = sections.map((s) => s.text).join(' ');
    expect(all).not.toMatch(/Footer|Dashboard|secret|Export|100/u);
    expect(sections[0].pageTitle).toBe('MI355X');
  });
});

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

const GENERATED_AT = '2026-10-14T12:00:00.000Z';

const EN_PAGES: IndexedPage[] = [
  {
    url: '/chips/b200',
    title: 'NVIDIA B200',
    coverage: 'partial',
    sections: [
      { text: 'Blackwell datacenter GPU.' },
      {
        anchor: 'chip-overview',
        heading: 'Overview',
        text: '1000 W power envelope, 180 GB HBM3E.',
      },
    ],
  },
  {
    url: '/agentx/methodology',
    title: 'AgentX Methodology',
    coverage: 'summary',
    sections: [{ text: 'How AgentX replays coding-agent traces against inference servers.' }],
  },
  {
    url: '/blog/agentx-replay',
    title: 'Inside AgentX replay',
    coverage: 'full',
    sections: [
      {
        anchor: 'trace-replay',
        heading: 'Trace replay',
        text: 'AgentX methodology for trace replay.',
      },
    ],
  },
];

const ZH_PAGES: IndexedPage[] = [
  {
    url: '/zh/chips/b200',
    title: 'NVIDIA B200',
    coverage: 'partial',
    sections: [
      { anchor: 'chip-overview', heading: '概述', text: 'Blackwell 数据中心 GPU，功耗 1000 W。' },
    ],
  },
  {
    // English-only page inside a /zh session keeps its English URL.
    url: '/blog/english-only',
    title: 'English only post',
    coverage: 'full',
    sections: [{ text: 'Untranslated benchmark notes.' }],
  },
];

function manifest(version: string, schema: number = SEARCH_INDEX_SCHEMA) {
  return {
    schema,
    version,
    generatedAt: GENERATED_AT,
    locales: {
      en: {
        path: searchIndexFilePath(version, 'en'),
        pages: EN_PAGES.length,
        sections: 4,
        bytes: 1,
      },
      zh: {
        path: searchIndexFilePath(version, 'zh'),
        pages: ZH_PAGES.length,
        sections: 2,
        bytes: 1,
      },
    },
  };
}

function indexFile(version: string, locale: 'en' | 'zh') {
  return {
    schema: SEARCH_INDEX_SCHEMA,
    version,
    locale,
    pages: locale === 'en' ? EN_PAGES : ZH_PAGES,
  };
}

type Route = (init?: RequestInit) => Response | Promise<Response>;

/** Fetch stub answering only the given paths; anything else fails the test. */
function server(routes: Record<string, Route>) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const route = routes[String(input)];
    if (!route) throw new Error(`unexpected fetch ${String(input)}`);
    return Promise.resolve(route(init));
  });
}

function currentServer(version = 'v1') {
  return server({
    [SEARCH_INDEX_MANIFEST_PATH]: () => json(manifest(version)),
    [searchIndexFilePath(version, 'en')]: () => json(indexFile(version, 'en')),
    [searchIndexFilePath(version, 'zh')]: () => json(indexFile(version, 'zh')),
  });
}

describe('SiteSearchEngine', () => {
  it('loads the manifest and versioned index once, then answers queries locally', async () => {
    const fetchMock = currentServer();
    const engine = new SiteSearchEngine('en', fetchMock as typeof fetch);
    expect(engine.status().state).toBe('idle');

    await engine.load();
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      SEARCH_INDEX_MANIFEST_PATH,
      searchIndexFilePath('v1', 'en'),
    ]);
    // The manifest is revalidated; the content-addressed file uses the HTTP cache.
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-cache' });
    expect(engine.status()).toMatchObject({
      state: 'ready',
      pages: 3,
      summaryPages: 1,
      generatedAt: GENERATED_AT,
    });

    // Anchored section results and related-term matching ("watts" -> power/W).
    expect(engine.search('b200 hbm3e')[0]).toMatchObject({
      url: '/chips/b200#chip-overview',
      pageTitle: 'NVIDIA B200',
      section: 'Overview',
      source: 'page',
    });
    expect(engine.search('watts')[0].url).toBe('/chips/b200#chip-overview');

    // Summary-only pages are marked and lose ties to real page sections.
    const methodology = engine.search('agentx methodology');
    expect(methodology.map((r) => r.source)).toContain('summary');
    expect(methodology.find((r) => r.url === '/agentx/methodology')?.source).toBe('summary');

    await engine.load();
    engine.search('anything');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refetches the manifest once when the named version is gone after a deploy', async () => {
    let deployed = 'old';
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === SEARCH_INDEX_MANIFEST_PATH) {
        // A cached manifest still names the old build until caches are bypassed.
        return Promise.resolve(json(manifest(init?.cache === 'reload' ? deployed : 'old')));
      }
      if (path === searchIndexFilePath('new', 'en')) {
        return Promise.resolve(json(indexFile('new', 'en')));
      }
      return Promise.resolve(new Response('Not found', { status: 404 }));
    });
    deployed = 'new';
    const engine = new SiteSearchEngine('en', fetchMock as typeof fetch);
    await engine.load();

    expect(fetchMock.mock.calls.map(([input, init]) => [String(input), init?.cache])).toEqual([
      [SEARCH_INDEX_MANIFEST_PATH, 'no-cache'],
      [searchIndexFilePath('old', 'en'), undefined],
      [SEARCH_INDEX_MANIFEST_PATH, 'reload'],
      [searchIndexFilePath('new', 'en'), undefined],
    ]);
    expect(engine.status()).toMatchObject({ state: 'ready', pages: 3 });
  });

  it('rejects an index file whose version does not match the manifest', async () => {
    const fetchMock = server({
      [SEARCH_INDEX_MANIFEST_PATH]: () => json(manifest('v2')),
      // A stale cached copy of the previous version, served at the new URL.
      [searchIndexFilePath('v2', 'en')]: () => json(indexFile('v1', 'en')),
    });
    const engine = new SiteSearchEngine('en', fetchMock as typeof fetch);
    await engine.load();
    expect(engine.status()).toMatchObject({ state: 'unavailable', pages: 0 });
    expect(engine.search('b200')).toEqual([]);
  });

  it('keeps the live page searchable when the index is missing, and retries on next open', async () => {
    let online = false;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (!online) return Promise.reject(new TypeError('offline'));
      const path = String(input);
      return Promise.resolve(
        json(path === SEARCH_INDEX_MANIFEST_PATH ? manifest('v1') : indexFile('v1', 'en')),
      );
    });
    const engine = new SiteSearchEngine('en', fetchMock as typeof fetch);

    document.title = 'About | InferenceX';
    document.body.innerHTML = '<main><h2 id="team">Team</h2><p>SemiAnalysis engineers.</p></main>';
    engine.indexLiveDocument('/about');
    await engine.load();
    expect(engine.status()).toMatchObject({ state: 'unavailable', liveIndexed: true });
    expect(engine.search('engineer')[0].url).toBe('/about#team');

    online = true;
    await engine.load();
    expect(engine.status().state).toBe('ready');
    expect(engine.search('b200')[0].url).toBe('/chips/b200');
    expect(engine.search('engineer')[0].url).toBe('/about#team');
  });

  it('treats an unknown manifest schema as unavailable', async () => {
    const fetchMock = server({
      [SEARCH_INDEX_MANIFEST_PATH]: () => json(manifest('v1', SEARCH_INDEX_SCHEMA + 1)),
    });
    const engine = new SiteSearchEngine('en', fetchMock as typeof fetch);
    await engine.load();
    expect(engine.status().state).toBe('unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('loads the Chinese index for /zh sessions and keeps English-only URLs', async () => {
    const fetchMock = currentServer();
    const engine = new SiteSearchEngine('zh', fetchMock as typeof fetch);
    await engine.load();
    expect(String(fetchMock.mock.calls[1][0])).toBe(searchIndexFilePath('v1', 'zh'));
    expect(engine.search('功耗')[0]).toMatchObject({
      url: '/zh/chips/b200#chip-overview',
      section: '概述',
    });
    expect(engine.search('untranslated')[0].url).toBe('/blog/english-only');
  });

  it('prefers the live DOM over the indexed copy of the page on screen', async () => {
    const fetchMock = currentServer();
    const engine = new SiteSearchEngine('zh', fetchMock as typeof fetch);

    document.title = 'NVIDIA B200 | InferenceX';
    const liveId = 'chip-live-results';
    document.body.innerHTML = `<main><h2 id="${liveId}">实测结果</h2><p>DeepSeek 吞吐量 12345 tok/s。</p></main>`;
    engine.indexLiveDocument('/zh/chips/b200');
    await engine.load();

    // The index copy did not overwrite the live sections of the same page.
    expect(engine.search('12345')[0].url).toBe('/zh/chips/b200#chip-live-results');
    expect(engine.search('概述').some((r) => r.url === '/zh/chips/b200#chip-overview')).toBe(false);
    expect(engine.status().pages).toBe(2);
  });
});
