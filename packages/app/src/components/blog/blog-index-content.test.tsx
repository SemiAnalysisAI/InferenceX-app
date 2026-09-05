import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type * as BlogLib from '@/lib/blog';
import type { BlogPostMeta } from '@/lib/blog';

const mk = (slug: string, date: string, tags: string[]): BlogPostMeta => ({
  slug,
  title: `Title ${slug}`,
  subtitle: `Subtitle ${slug}`,
  date,
  tags,
  readingTime: 4,
});

const POSTS = [
  mk('newest', '2026-05-01', ['nvidia', 'b200', 'agentx', 'inference', 'gpu']),
  mk('mid', '2026-04-01', ['amd', 'mi355x', 'agentx']),
  mk('old', '2026-03-01', ['nvidia', 'agentx']),
  mk('older', '2026-02-01', ['sglang', 'vllm', 'rocm', 'cann', 'kimi', 'qwen', 'fp8']),
];

const THUMBNAILS: Record<string, BlogLib.PostThumbnail | null> = {
  newest: {
    light: '/images/newest/benchmark-light.png',
    dark: '/images/newest/benchmark-dark.png',
  },
  mid: { light: '/images/mid/context.png', dark: '/images/mid/context.png' },
};

vi.mock('@/lib/blog', async (importOriginal) => {
  const actual = await importOriginal<typeof BlogLib>();
  return {
    ...actual,
    getAllPosts: () => POSTS,
    getPostThumbnail: (slug: string) => THUMBNAILS[slug] ?? null,
  };
});

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: undefined }) }));

import { BlogFeaturedPost } from './blog-featured-post';
import { BlogIndexContent } from './blog-index-content';

const HAN = /\p{Script=Han}/u;

describe('BlogIndexContent', () => {
  it('features the newest post once and lists the rest in the grid', () => {
    const html = renderToStaticMarkup(<BlogIndexContent locale="en" />);

    expect(html).toContain('data-testid="blog-featured-post"');
    expect(html).toContain('href="/blog/newest"');
    expect(html.match(/data-testid="blog-post-card"/gu)).toHaveLength(POSTS.length - 1);
    expect(html).toContain('InferenceX Research');
    expect(html).toContain('href="/glossary"');
    expect(html).not.toContain('opengraph-image');
    expect(html).toContain('4 min read');
  });

  it('uses post figures as thumbnails and a text-free tile when a post has none', () => {
    const html = renderToStaticMarkup(<BlogIndexContent locale="en" />);

    // Paired light/dark figures go through the themed image (per-theme data attributes).
    expect(html).toContain('data-src-light="/images/newest/benchmark-light.png"');
    expect(html).toContain('data-src-dark="/images/newest/benchmark-dark.png"');
    // A single theme-neutral figure renders as a plain image.
    expect(html).toContain('src="/images/mid/context.png"');
    // Posts without figures get the tile; the title never appears inside it.
    expect(html.match(/data-testid="blog-thumbnail-tile"/gu)).toHaveLength(2);
    expect(html.match(/data-testid="blog-thumbnail-figure"/gu)).toHaveLength(2);
    const tile = html.slice(html.indexOf('data-testid="blog-thumbnail-tile"'));
    const tileInner = tile.slice(0, tile.indexOf('<div class="flex flex-1'));
    expect(tileInner).not.toContain('Title old');
    expect(tileInner).toContain('>nvidia<');
    expect(tileInner).toContain('4 min read');
    expect(html).toContain('data-layout="figure"');
    expect(html).toContain('class="grid items-start');
  });

  it('lays the featured card out as a single text column when the post has no figure', () => {
    const html = renderToStaticMarkup(
      <BlogFeaturedPost
        slug="newest"
        title="Title newest"
        subtitle="Subtitle newest"
        dateLabel="May 1, 2026"
        date="2026-05-01"
        readingLabel="4 min read"
        tags={['nvidia']}
        thumbnail={null}
        labels={{ eyebrow: 'Latest', read: 'Read article', tags: 'Tags' }}
      />,
    );
    expect(html).toContain('data-layout="text"');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('blog-thumbnail');
    expect(html).toContain('Title newest');
    expect(html).toContain('Read article');
  });

  it('keeps the ?tag= filter contract and drops the featured card when filtering', () => {
    const html = renderToStaticMarkup(<BlogIndexContent locale="en" activeTag="nvidia" />);

    expect(html).not.toContain('data-testid="blog-featured-post"');
    expect(html.match(/data-testid="blog-post-card"/gu)).toHaveLength(2);
    expect(html).toContain('href="/blog?tag=agentx"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Tagged');
  });

  it('accepts any casing in the tag query', () => {
    const html = renderToStaticMarkup(<BlogIndexContent locale="en" activeTag="NVIDIA" />);
    expect(html.match(/data-testid="blog-post-card"/gu)).toHaveLength(2);
  });

  it('puts the long tail of tags behind a disclosure and keeps the active tail tag visible', () => {
    const html = renderToStaticMarkup(<BlogIndexContent locale="en" activeTag="qwen" />);

    expect(html).toContain('<details');
    expect(html).toContain('More tags');
    expect(html).toContain('href="/blog?tag=qwen"');
    expect(html).toContain('href="/blog?tag=fp8"');
  });

  it('shows an empty state with a reset link for unknown tags', () => {
    const html = renderToStaticMarkup(<BlogIndexContent locale="en" activeTag="tpu" />);

    expect(html).not.toContain('data-testid="blog-post-card"');
    expect(html).toContain('No articles tagged');
    expect(html).toContain('href="/blog"');
  });

  it('renders Chinese chrome and zh routes for the zh locale', () => {
    const html = renderToStaticMarkup(<BlogIndexContent locale="zh" activeTag="agentx" />);

    expect(html).toContain('href="/zh/blog?tag=nvidia"');
    expect(html).toContain('href="/zh/blog/newest"');
    expect(html).toContain('href="/zh/glossary"');
    expect(html).toContain('href="/zh/blog/newest"');
    expect(html).toContain('文章');
    expect(html).not.toContain('min read');
    expect(html).not.toContain('More tags');
    const text = html.replaceAll(/<[^>]+>/gu, ' ');
    expect(HAN.test(text)).toBe(true);
  });
});
