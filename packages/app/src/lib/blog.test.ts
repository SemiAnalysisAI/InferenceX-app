import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'fs';

import { extractHeadings, getAllPosts, getPostBySlug, getReadingTime, slugify } from './blog';

const FAKE_MDX = `---
title: 'Test Post'
subtitle: 'A test subtitle'
date: '2026-01-15'
tags:
  - testing
---

# Test Heading

Some test content here with enough words.
`;

const FAKE_MDX_OLDER = `---
title: 'Older Post'
subtitle: 'An older subtitle'
date: '2025-12-01'
---

# Older

Short content.
`;

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, default: { ...actual } };
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('slugify', () => {
  it('lowercases and replaces non-alphanumeric chars with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('My Post!!')).toBe('my-post');
  });

  it('collapses consecutive special chars into a single hyphen', () => {
    expect(slugify('foo---bar')).toBe('foo-bar');
    expect(slugify('a & b @ c')).toBe('a-b-c');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello');
  });

  it('returns "post" for empty or all-special-char input', () => {
    expect(slugify('')).toBe('post');
    expect(slugify('!!!')).toBe('post');
  });

  it('passes through already-valid slugs unchanged', () => {
    expect(slugify('hello-world')).toBe('hello-world');
  });
});

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
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['test-post.mdx', 'older-post.mdx'] as any);
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
      if (String(filePath).includes('test-post')) return FAKE_MDX;
      return FAKE_MDX_OLDER;
    });

    const posts = getAllPosts();
    expect(posts).toHaveLength(2);
    expect(posts[0].slug).toBe('test-post');
    expect(posts[1].slug).toBe('older-post');

    for (let i = 1; i < posts.length; i++) {
      expect(new Date(posts[i - 1].date).getTime()).toBeGreaterThanOrEqual(
        new Date(posts[i].date).getTime(),
      );
    }
  });

  it('returns posts with required frontmatter fields', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['test-post.mdx'] as any);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(FAKE_MDX);

    const posts = getAllPosts();
    for (const post of posts) {
      expect(post.slug).toBeTruthy();
      expect(post.title).toBeTruthy();
      expect(post.date).toBeTruthy();
      expect(post.subtitle).toBeTruthy();
      expect(post.readingTime).toBeGreaterThanOrEqual(1);
    }
  });

  it('returns empty array when content directory does not exist', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    expect(getAllPosts()).toEqual([]);
  });
});

describe('getPostBySlug', () => {
  it('returns null for non-existent slug', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    expect(getPostBySlug('does-not-exist')).toBeNull();
  });

  it('returns meta and raw MDX content for existing slug', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(FAKE_MDX);

    const result = getPostBySlug('test-post');
    expect(result).not.toBeNull();
    expect(result!.meta.title).toBe('Test Post');
    expect(result!.meta.slug).toBe('test-post');
    expect(result!.raw).toContain('# Test Heading');
  });
});

describe('extractHeadings', () => {
  it('extracts h1, h2, h3 headings with correct levels and ids', () => {
    const mdx = '# Top\n\n## Section\n\n### Sub';
    const headings = extractHeadings(mdx);
    expect(headings).toEqual([
      { level: 1, text: 'Top', id: 'top' },
      { level: 2, text: 'Section', id: 'section' },
      { level: 3, text: 'Sub', id: 'sub' },
    ]);
  });

  it('returns empty array for input with no headings', () => {
    expect(extractHeadings('Just a paragraph.')).toEqual([]);
    expect(extractHeadings('')).toEqual([]);
  });

  it('ignores headings inside fenced code blocks', () => {
    const mdx = '## Real\n\n```\n## Fake\n```\n\n## Also Real';
    const headings = extractHeadings(mdx);
    expect(headings).toHaveLength(2);
    expect(headings[0].text).toBe('Real');
    expect(headings[1].text).toBe('Also Real');
  });

  it('deduplicates same-text headings using parent prefix', () => {
    const mdx = '## Overview\n\n### Details\n\n## Results\n\n### Details';
    const headings = extractHeadings(mdx);
    expect(headings[1].id).toBe('details');
    expect(headings[3].id).toBe('results-details');
  });

  it('deduplicates top-level headings with level suffix fallback', () => {
    const mdx = '## Intro\n\n## Intro';
    const headings = extractHeadings(mdx);
    expect(headings[0].id).toBe('intro');
    expect(headings[1].id).toBe('intro-2');
  });
});
