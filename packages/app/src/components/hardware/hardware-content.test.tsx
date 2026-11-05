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
    links: [
      {
        label: 'Open the AgentX dashboard',
        href: 'https://inferencex.semianalysis.com/inference?i_seq=agentic-traces',
      },
      { label: 'Read the methodology', href: '/agentx/methodology' },
    ],
  };
  const pages: HardwarePageMeta[] = [
    meta,
    { ...meta, slug: tpu, title: 'TPU v7 vs GB300 NVL72 on AgentX' },
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
  it('renders an unboxed header with meta line, title, lede, and links above the article', () => {
    const html = renderPage('en');

    expect(html).toContain('data-testid="hardware-page"');
    expect(html.indexOf('href="/hardware"')).toBeLessThan(html.indexOf('<h1'));
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('data-testid="hardware-lede"'));
    expect(html.indexOf('data-testid="hardware-lede"')).toBeLessThan(
      html.indexOf('data-testid="hardware-hero-links"'),
    );
    expect(html.indexOf('data-testid="hardware-hero-links"')).toBeLessThan(
      html.indexOf('data-testid="hardware-article"'),
    );
    expect(html.match(/<h1\b/gu)).toHaveLength(1);
    expect(html).toContain(
      '<strong class="font-semibold text-foreground">1.8x to 2.0x as many tokens per dollar</strong>',
    );
    expect(html).not.toContain('**');
    expect(html).not.toContain('role="note"');
    expect(html).not.toContain('rounded-2xl');
    expect(html).toContain('October 19, 2026');
    expect(html).toContain('9 min read');
    expect(html).toContain('href="/hardware"');
    expect(html).toContain('Article body');
    expect(html).toContain('All articles and posts are © SemiAnalysis');
    expect(html).not.toMatch(HAN);
  });

  it('renders the first link as the primary button and the second as a text link', () => {
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
    expect(links[1]).not.toContain('data-slot="button"');
    expect(links[1]).toContain('text-brand');
    expect(links[1]).toContain('href="/agentx/methodology"');
    expect(links[1]).not.toContain('target=');
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
    expect(html).not.toContain('min read');
    expect(html).not.toContain('Hardware Results');
  });
});

describe('HardwareIndexContent', () => {
  it('renders one card per page with its date, title, lede, and a link to the page', () => {
    const html = renderToStaticMarkup(<HardwareIndexContent locale="en" />);

    expect(html).toContain('data-testid="hardware-index-page"');
    expect(html).toContain('<h1');
    expect(html).toContain('Hardware Results');
    expect(count(html, 'data-testid="hardware-card"')).toBe(2);
    expect(html).toContain(`href="/hardware/${VR}"`);
    expect(html).toContain(`href="/hardware/${TPU}"`);
    expect(html).toContain('October 19, 2026');
    expect(html).toContain('1.8x to 2.0x as many tokens per dollar');
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
