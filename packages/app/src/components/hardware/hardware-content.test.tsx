import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { TocHeading } from '@/lib/blog/blog';
import type { HardwarePageMeta } from '@/lib/hardware/hardware';

import { HardwareIndexContent } from './hardware-index-content';
import { HardwarePageContent } from './hardware-page-content';

const { VR, TPU, META, PAGES } = vi.hoisted(() => {
  const vr = 'vera-rubin-nvl72-vs-gb300-nvl72-agentx-results';
  const tpu = 'tpu-v7-ironwood-vs-gb300-nvl72-agentx-results';
  const meta: HardwarePageMeta = {
    slug: vr,
    readingTime: 9,
    title: 'Vera Rubin NVL72 vs GB300 NVL72 on AgentX',
    seoDescription: 'Vera Rubin NVL72 serves 1.8x to 2.0x the tokens per dollar of GB300 NVL72.',
    date: '2026-10-19',
    publishDate: '2026-10-19',
    tags: ['agentx', 'rubin'],
    lede: 'Vera Rubin NVL72 serves **1.8x to 2.0x as many tokens per dollar** as GB300 NVL72.',
    highlightsTitle: 'Largest lead in tokens per $1 TCO vs GB300 NVL72',
    highlights: [
      { value: '~8.3x', label: 'DeepSeek-V4-Pro', detail: 'at ~183 tok/s/user' },
      { value: '~10.2x', label: 'MiniMax-M3', detail: 'at ~337 tok/s/user' },
      { value: '~4.2x', label: 'Qwen3.8-Flash-Next', detail: 'at ~176 tok/s/user' },
      { value: '~3.9x', label: 'GLM-5.2', detail: 'at ~322 tok/s/user' },
    ],
    links: [
      {
        label: 'Open the AgentX dashboard',
        href: 'https://inferencex.semianalysis.com/inference?i_seq=agentic-traces',
      },
      { label: 'Read the methodology', href: '/agentx/methodology' },
    ],
    note: 'Charts load live dashboard data. See the [methodology](/agentx/methodology).',
  };
  const pages: HardwarePageMeta[] = [
    meta,
    {
      ...meta,
      slug: tpu,
      title: 'TPU v7 vs GB300 NVL72 on AgentX',
      highlights: meta.highlights.slice(0, 3),
    },
  ];
  return { VR: vr, TPU: tpu, META: meta, PAGES: pages };
});

vi.mock('@/lib/hardware/hardware', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getAllHardwarePages: () => PAGES,
}));

const HAN = /\p{Script=Han}/u;

const HEADINGS = [
  { id: 'summary', text: 'Summary', level: 2 },
  { id: 'method', text: 'Method', level: 2 },
] satisfies TocHeading[];

function count(html: string, needle: string) {
  return html.split(needle).length - 1;
}

function renderPage(locale: 'en' | 'zh', headings: TocHeading[] = HEADINGS) {
  return renderToStaticMarkup(
    <HardwarePageContent
      locale={locale}
      meta={META}
      headings={headings}
      content={<p>Article body</p>}
    />,
  );
}

describe('HardwarePageContent', () => {
  it('renders the hero, highlight cards, buttons, and note above the article', () => {
    const html = renderPage('en');

    expect(html).toContain('data-testid="hardware-page"');
    expect(html.indexOf('data-testid="hardware-hero"')).toBeLessThan(
      html.indexOf('data-testid="hardware-note"'),
    );
    expect(html.indexOf('data-testid="hardware-note"')).toBeLessThan(
      html.indexOf('data-testid="hardware-article"'),
    );
    expect(html.match(/<h1\b/gu)).toHaveLength(1);
    expect(html).toContain(
      '<strong class="font-semibold text-foreground">1.8x to 2.0x as many tokens per dollar</strong>',
    );
    expect(html).not.toContain('**');
    expect(html).toContain('Largest lead in tokens per $1 TCO vs GB300 NVL72');
    expect(count(html, 'data-testid="hardware-highlight"')).toBe(4);
    for (const highlight of META.highlights) {
      expect(html).toContain(highlight.value);
      expect(html).toContain(highlight.label);
      expect(html).toContain(highlight.detail);
    }
    expect(html).toContain('October 19, 2026');
    expect(html).toContain('9 min read');
    expect(html).toContain('href="/hardware"');
    expect(html).toContain('Article body');
    expect(html).toContain('All articles and posts are © SemiAnalysis');
    expect(html).not.toMatch(HAN);
  });

  it('styles the first link as the primary button and opens absolute URLs in a new tab', () => {
    const html = renderPage('en');
    const links = [...html.matchAll(/<a [^>]*data-testid="hardware-hero-link"[^>]*>/gu)].map(
      ([tag]) => tag,
    );

    expect(links).toHaveLength(2);
    expect(links[0]).toContain('bg-brand');
    expect(links[0]).toContain(
      'href="https://inferencex.semianalysis.com/inference?i_seq=agentic-traces"',
    );
    expect(links[0]).toContain('target="_blank"');
    expect(links[1]).not.toContain('bg-brand');
    expect(links[1]).toContain('href="/agentx/methodology"');
    expect(links[1]).not.toContain('target=');
  });

  it('renders the note link as a real anchor', () => {
    const html = renderPage('en');
    expect(html).toMatch(
      /role="note"[^>]*>.*Charts load live dashboard data\. See the <a [^>]*href="\/agentx\/methodology"[^>]*>methodology<\/a>\./su,
    );
  });

  it('keeps the table of contents and drops the blog share, CTA, navigation, and related widgets', () => {
    const html = renderPage('en');

    expect(html).toContain('data-testid="blog-toc-inline"');
    expect(html).toContain('data-testid="blog-toc-sidebar"');
    for (const blogOnly of [
      'share-twitter',
      'blog-copy-link',
      'blog-sidebar-cta',
      'blog-nav-prev',
      'blog-nav-next',
      'blog-related',
    ]) {
      expect(html).not.toContain(`data-testid="${blogOnly}"`);
    }
    expect(renderPage('en', [])).not.toContain('blog-toc');
  });

  it('renders Chinese chrome with /zh links and a link back to the English original', () => {
    const html = renderPage('zh');

    expect(html).toContain('href="/zh/hardware"');
    expect(html).toContain('硬件结果');
    expect(html).toContain('2026年10月19日');
    expect(html).toContain('预计阅读 9 分钟');
    expect(html.match(new RegExp(`<a [^>]*href="/hardware/${VR}"[^>]*>`, 'u'))?.[0]).toContain(
      'hrefLang="en"',
    );
    expect(html).toContain('aria-label="说明"');
    expect(html).not.toContain('min read');
    expect(html).not.toContain('Hardware Results');
  });
});

describe('HardwareIndexContent', () => {
  it('renders one card per page with its highlights and a link to the page', () => {
    const html = renderToStaticMarkup(<HardwareIndexContent locale="en" />);

    expect(html).toContain('data-testid="hardware-index-page"');
    expect(html).toContain('<h1');
    expect(html).toContain('Hardware Results');
    expect(count(html, 'data-testid="hardware-card"')).toBe(2);
    expect(html).toContain(`href="/hardware/${VR}"`);
    expect(html).toContain(`href="/hardware/${TPU}"`);
    expect(html).toContain('~10.2x');
    expect(html).toContain('Read the results');
    expect(html).toContain('"@type":"CollectionPage"');
    expect(html).not.toMatch(HAN);
  });

  it('links Chinese cards to the /zh pages', () => {
    const html = renderToStaticMarkup(<HardwareIndexContent locale="zh" />);

    expect(html).toContain(`href="/zh/hardware/${VR}"`);
    expect(html).toContain(`href="/zh/hardware/${TPU}"`);
    expect(html).toContain('查看结果');
    expect(html).not.toContain('Read the results');
  });
});
