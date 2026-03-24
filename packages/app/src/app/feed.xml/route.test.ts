import { describe, expect, it, vi } from 'vitest';

import type { BlogPostMeta } from '@/lib/blog';

const FAKE_POSTS: BlogPostMeta[] = [
  {
    title: 'Test Post',
    subtitle: 'A test subtitle',
    date: '2026-01-15',
    slug: 'test-post',
    readingTime: 1,
    tags: ['testing'],
  },
];

vi.mock('@/lib/blog', () => ({
  getAllPosts: () => FAKE_POSTS,
  getPostBySlug: (slug: string) => {
    const post = FAKE_POSTS.find((p) => p.slug === slug);
    if (!post) return null;
    return { meta: post, raw: '# Test\n\nSome content.' };
  },
}));

const { GET } = await import('./route');

describe('RSS feed route', () => {
  it('returns valid RSS XML with correct content type', async () => {
    const response = await GET();

    expect(response.headers.get('Content-Type')).toBe('application/rss+xml; charset=utf-8');

    const body = await response.text();
    expect(body).toContain('<?xml version="1.0"');
    expect(body).toContain('<rss');
    expect(body).toContain('</channel>');
    expect(body).toContain('</rss>');
  });

  it('includes blog posts in the feed', async () => {
    const response = await GET();
    const body = await response.text();

    expect(body).toContain('<item>');
    expect(body).toContain('Test Post');
  });

  it('includes required RSS namespaces', async () => {
    const response = await GET();
    const body = await response.text();

    expect(body).toContain('xmlns:dc=');
    expect(body).toContain('xmlns:atom=');
  });
});
