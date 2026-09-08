import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { BlogPostMeta, TocHeading } from '@/lib/blog';

import { BlogPostContent } from './blog-post-content';
import { BlogPostNav } from './blog-post-nav';

const mk = (slug: string, date: string, tags: string[]): BlogPostMeta => ({
  slug,
  title: `Title ${slug}`,
  subtitle: `Subtitle ${slug}`,
  date,
  tags,
  readingTime: 6,
});

const META: BlogPostMeta = {
  ...mk('current', '2026-08-19', ['benchmark', 'agentic']),
  modifiedDate: '2026-08-25',
};
const HEADINGS = [
  { id: 'results', text: 'Results', level: 2 },
  { id: 'method', text: 'Method', level: 3 },
] satisfies TocHeading[];
const RELATED = [mk('a', '2026-08-01', ['benchmark']), mk('b', '2026-07-01', ['agentic'])];

function render(locale: 'en' | 'zh') {
  return renderToStaticMarkup(
    <BlogPostContent
      locale={locale}
      meta={META}
      headings={HEADINGS}
      content={<p>Body copy</p>}
      adjacent={{ prev: mk('older', '2026-07-01', []), next: mk('newer', '2026-09-01', []) }}
      related={RELATED}
    />,
  );
}

describe('BlogPostContent', () => {
  it('keeps the data hooks and test ids the progress bar, share buttons, and analytics rely on', () => {
    const html = render('en');

    expect(html).toContain('data-blog-section');
    expect(html).toContain('data-blog-article');
    expect(html).toContain('data-testid="share-twitter"');
    expect(html).toContain('data-testid="share-linkedin"');
    expect(html).toContain('data-testid="blog-copy-link"');
    expect(html).toContain('data-testid="blog-toc-inline"');
    expect(html).toContain('data-testid="blog-toc-sidebar"');
    expect(html).toContain('data-testid="blog-sidebar-cta"');
    expect(html).toContain('data-testid="blog-nav-prev"');
    expect(html).toContain('data-testid="blog-nav-next"');
    expect(html).toContain('href="/agentx"');
  });

  it('renders the hero meta, tag links, and related strip in English', () => {
    const html = render('en');

    expect(html).toContain('Title current');
    expect(html).toContain('August 19, 2026');
    expect(html).toContain('Updated August 25, 2026');
    expect(html).toContain('6 min read');
    expect(html).toContain('href="/blog?tag=benchmark"');
    expect(html).toContain('More articles');
    expect(html.match(/data-testid="blog-post-card"/gu)).toHaveLength(RELATED.length);
    expect(html).toContain('href="/blog/older"');
    expect(html).toContain('href="/blog/newer"');
    expect(html).not.toContain('阅读英文原文');
  });

  it('renders Chinese chrome with zh routes and a link to the English original', () => {
    const html = render('zh');

    expect(html).toContain('href="/zh/blog"');
    expect(html).toContain('href="/zh/blog?tag=benchmark"');
    expect(html).toContain('href="/zh/blog/older"');
    expect(html).toContain('href="/zh/agentx"');
    expect(html).toContain('href="/blog/current"');
    expect(html).toContain('hrefLang="en"');
    expect(html).toContain('2026年8月19日');
    expect(html).not.toContain('min read');
    expect(html).not.toContain('More articles');
    expect(html).not.toContain('Back to articles');
  });
});

describe('BlogPostNav', () => {
  it('renders nothing when the post has no neighbours', () => {
    expect(renderToStaticMarkup(<BlogPostNav prev={null} next={null} />)).toBe('');
  });

  it('renders only the available direction with localized labels', () => {
    const html = renderToStaticMarkup(
      <BlogPostNav
        prev={null}
        next={{ slug: 'n', title: 'Next one' }}
        basePath="/zh/blog"
        labels={{ prev: '上一篇', next: '下一篇' }}
      />,
    );
    expect(html).toContain('href="/zh/blog/n"');
    expect(html).toContain('下一篇');
    expect(html).not.toContain('data-testid="blog-nav-prev"');
  });
});
