// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { extractSections, parseLlmsTxt } from './extract';
import { SiteSearchEngine } from './site-search-engine';

const LLMS_TXT = `# InferenceX by SemiAnalysis

## Chip Pages

- [NVIDIA B200](https://inferencex.semianalysis.com/chips/b200): specs, pricing and benchmarks
- [AMD Instinct MI355X](https://inferencex.semianalysis.com/chips/mi355x): specs, pricing and benchmarks
- [GitHub](https://github.com/SemiAnalysisAI/InferenceX)
- [RSS Feed](https://inferencex.semianalysis.com/feed.xml)

## Whitepapers

- [AgentX](https://inferencex.semianalysis.com/whitepaper/agentx): Agentic serving (PDF: https://inferencex.semianalysis.com/whitepaper/agentx.pdf)
`;

function html(title: string, main: string): string {
  return `<!doctype html><html><head><title>${title} | InferenceX</title>
<meta name="description" content="${title} description"></head>
<body><header><nav>Home Dashboard About</nav></header>
<main>${main}</main><footer>Footer links</footer>
<script>self.__next_f.push(["secret payload"])</script></body></html>`;
}

describe('parseLlmsTxt', () => {
  it('keeps same-site pages and drops feeds, PDFs and external links', () => {
    const seeds = parseLlmsTxt(LLMS_TXT, ['https://inferencex.semianalysis.com']);
    expect(seeds.map((s) => s.path)).toEqual([
      '/chips/b200',
      '/chips/mi355x',
      '/whitepaper/agentx',
    ]);
    expect(seeds[2]).toMatchObject({ group: 'Whitepapers', description: 'Agentic serving' });
  });
});

describe('extractSections', () => {
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

function response(body: string, type = 'text/html'): Response {
  return new Response(body, { status: 200, headers: { 'content-type': type } });
}

async function settle(engine: SiteSearchEngine): Promise<void> {
  for (let i = 0; i < 200 && engine.status().crawling; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }
}

describe('SiteSearchEngine', () => {
  it('serves seed results immediately, then replaces them with fetched page content', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/llms.txt') return Promise.resolve(response(LLMS_TXT, 'text/plain'));
      if (path === '/chips/b200') {
        return Promise.resolve(
          response(html('NVIDIA B200', '<h2 id="power">Power</h2><p>1000 W TDP Blackwell.</p>')),
        );
      }
      return Promise.resolve(response(html(path, `<p>${path} body</p>`)));
    });
    const engine = new SiteSearchEngine('en', fetchMock as typeof fetch);

    await engine.seed();
    expect(engine.search('b200')[0]).toMatchObject({ url: '/chips/b200', source: 'seed' });

    engine.prioritize('b200');
    engine.start();
    await settle(engine);

    // Seed is replaced by the real section; "watt" reaches it through concepts.
    expect(engine.search('watts')[0]).toMatchObject({
      url: '/chips/b200#power',
      source: 'page',
      section: 'Power',
    });
    // Query-matching pages are fetched before the rest of the queue.
    const crawlOrder = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((p) => p !== '/llms.txt');
    expect(crawlOrder[0]).toBe('/chips/b200');
    // Feeds and external links from llms.txt are never fetched.
    expect(crawlOrder).not.toContain('/feed.xml');
    expect(engine.status()).toMatchObject({ crawling: false, seeded: true });
    expect(engine.status().indexedPages).toBe(engine.status().totalPages);
  });

  it('does not crawl until started and stays usable when llms.txt fails', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('offline')));
    const engine = new SiteSearchEngine('en', fetchMock as typeof fetch);
    expect(fetchMock).not.toHaveBeenCalled();

    document.title = 'About | InferenceX';
    document.body.innerHTML = '<main><h2 id="team">Team</h2><p>SemiAnalysis engineers.</p></main>';
    engine.indexLiveDocument('/about');
    expect(engine.search('engineer')[0].url).toBe('/about#team');

    await engine.seed();
    expect(engine.status().seeded).toBe(true);
  });

  it('crawls the Chinese tree for /zh sessions', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        String(input) === '/llms.txt'
          ? response(LLMS_TXT, 'text/plain')
          : response(html('页面', '<p>内容</p>')),
      ),
    );
    const engine = new SiteSearchEngine('zh', fetchMock as typeof fetch);
    engine.start();
    await engine.seed();
    await settle(engine);
    const paths = fetchMock.mock.calls.map(([input]) => String(input));
    expect(paths).toContain('/zh/chips/b200');
    expect(paths).toContain('/zh/agentx');
  });

  it('links untranslated /zh family members to the English page instead of a 404', async () => {
    const llms = `## Articles

- [Untranslated post](https://inferencex.semianalysis.com/blog/untranslated-post): English only
- [B200](https://inferencex.semianalysis.com/chips/b200): chip page
`;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/llms.txt') return Promise.resolve(response(llms, 'text/plain'));
      if (path === '/zh/blog/untranslated-post') {
        return Promise.resolve(new Response('missing', { status: 404 }));
      }
      if (path === '/blog/untranslated-post') {
        return Promise.resolve(response(html('Untranslated post', '<p>Sunflower rack scale.</p>')));
      }
      if (path === '/zh/chips/b200') {
        return Promise.resolve(response(html('B200 中文', '<p>Blackwell 中文页面</p>')));
      }
      return Promise.resolve(new Response('missing', { status: 404 }));
    });
    const engine = new SiteSearchEngine('zh', fetchMock as typeof fetch);

    // Before anything is crawled, seeds link the English page, which always exists.
    await engine.seed();
    expect(engine.search('untranslated')[0].url).toBe('/blog/untranslated-post');

    engine.start();
    await settle(engine);
    expect(engine.search('sunflower')[0].url).toBe('/blog/untranslated-post');
    // Translated pages switch to /zh once that page loads, replacing the English seed.
    expect(engine.search('blackwell').map((r) => r.url)).toEqual(['/zh/chips/b200']);
    expect(engine.search('chip').every((r) => r.url !== '/chips/b200')).toBe(true);
  });
});
