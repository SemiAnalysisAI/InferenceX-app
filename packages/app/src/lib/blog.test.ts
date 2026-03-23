import { describe, expect, it } from 'vitest';

import { getAllPosts, getPostBySlug, getReadingTime } from './blog';

describe('getReadingTime', () => {
  it('returns 1 for short content', () => {
    expect(getReadingTime('hello world')).toBe(1);
  });

  it('calculates reading time for longer content', () => {
    const words = Array(500).fill('word').join(' ');
    // 500 words / 265 wpm = 1.89 → ceil = 2
    expect(getReadingTime(words)).toBe(2);
  });
});

describe('getAllPosts', () => {
  it('returns an array of posts sorted by date descending', () => {
    const posts = getAllPosts();
    expect(Array.isArray(posts)).toBe(true);
    expect(posts.length).toBeGreaterThan(0);

    // Verify sorted descending
    for (let i = 1; i < posts.length; i++) {
      expect(new Date(posts[i - 1].date).getTime()).toBeGreaterThanOrEqual(
        new Date(posts[i].date).getTime(),
      );
    }
  });

  it('returns posts with required frontmatter fields', () => {
    const posts = getAllPosts();
    for (const post of posts) {
      expect(post.slug).toBeTruthy();
      expect(post.title).toBeTruthy();
      expect('SemiAnalysis').toBeTruthy();
      expect(post.date).toBeTruthy();
      expect(post.subtitle).toBeTruthy();
      expect(post.readingTime).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('getPostBySlug', () => {
  it('returns null for non-existent slug', () => {
    expect(getPostBySlug('does-not-exist')).toBeNull();
  });

  it('returns meta and raw MDX content for existing slug', () => {
    const result = getPostBySlug('hello-world');
    expect(result).not.toBeNull();
    expect(result!.meta.title).toBe('Hello World');
    expect(result!.meta.slug).toBe('hello-world');
    expect(result!.raw).toContain('# Hello World');
  });
});
