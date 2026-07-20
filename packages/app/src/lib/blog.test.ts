import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

import {
  blogDescription,
  extractHeadings,
  getAdjacentPosts,
  getAllPosts,
  getPostBySlug,
  getReadingTime,
  hasZhTranslation,
  slugify,
  smartTruncate,
} from './blog';

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

const FAKE_MDX_MIDDLE = `---
title: 'Middle Post'
subtitle: 'A middle subtitle'
date: '2026-01-01'
---

# Middle

Some middle content.
`;

const FAKE_MDX_FUTURE = `---
title: 'Future Post'
subtitle: 'A future subtitle'
date: '2099-06-01'
publishDate: '2099-06-01'
---

# Future

This post is scheduled for the far future.
`;

const FAKE_MDX_PAST_PUBLISH = `---
title: 'Past Publish Post'
subtitle: 'Already published'
date: '2025-06-01'
publishDate: '2025-01-01'
---

# Past Publish

This post has a publishDate in the past.
`;

const FAKE_MDX_NO_PUBLISH = `---
title: 'No Publish Date Post'
subtitle: 'No publishDate set'
date: '2025-08-01'
---

# No Publish

This post has no publishDate field at all.
`;

const FAKE_MDX_ZH = `---
title: '测试文章'
subtitle: '一个测试副标题'
date: '2026-01-15'
tags:
  - testing
---

# 测试标题

这是一段中文正文内容。
`;

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, default: { ...actual } };
});

const isZhPath = (p: string) => p.includes('/zh/');

/**
 * Mock the content tree with English posts and a zh/ translations subdir.
 * Directory existence checks return true; file checks consult the maps.
 */
function mockLocalizedFiles(en: Record<string, string>, zh: Record<string, string>) {
  const lookup = (p: string) => {
    const files = isZhPath(p) ? zh : en;
    return Object.entries(files).find(([name]) => p.includes(name.replace('.mdx', '')))?.[1];
  };
  vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
    const p = String(filePath);
    if (!p.endsWith('.mdx')) return true;
    return lookup(p) !== undefined;
  });
  vi.spyOn(fs, 'readdirSync').mockReturnValue(Object.keys(en) as any);
  vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => lookup(String(filePath)) ?? '');
}

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

  it('keeps Han characters so Chinese headings get meaningful ids', () => {
    expect(slugify('性能 分析')).toBe('性能-分析');
    expect(slugify('GB200 性能对比')).toBe('gb200-性能对比');
    expect(slugify('（结论）')).toBe('结论');
  });
});

describe('getReadingTime', () => {
  it('returns 1 for short content', () => {
    expect(getReadingTime('hello world')).toBe(1);
  });

  it('calculates reading time for longer content', () => {
    const words = Array.from({ length: 500 }, () => 'word').join(' ');
    // 500 words / 265 wpm = 1.89 → ceil = 2
    expect(getReadingTime(words)).toBe(2);
  });

  it('counts CJK prose by characters, not whitespace-separated words', () => {
    // 800 Han chars with no spaces: 800 / 400 cpm = 2 minutes. The old
    // word-split logic would have counted this as a single "word" → 1 minute.
    const cjk = '推'.repeat(800);
    expect(getReadingTime(cjk)).toBe(2);
  });

  it('combines CJK characters and Latin words in mixed content', () => {
    // 400 Han chars (1 min at 400 cpm) + 265 Latin words (1 min at 265 wpm)
    const mixed = `${'理'.repeat(400)} ${Array.from({ length: 265 }, () => 'word').join(' ')}`;
    expect(getReadingTime(mixed)).toBe(2);
  });
});

describe('smartTruncate', () => {
  it('returns the text unchanged (no ellipsis) when at or under the limit', () => {
    expect(smartTruncate('Short and sweet.', 155)).toBe('Short and sweet.');
    const exact = 'x'.repeat(20);
    expect(smartTruncate(exact, 20)).toBe(exact);
    expect(smartTruncate('  trimmed  ', 155)).toBe('trimmed');
  });

  it('cuts at a word boundary (never mid-word) and appends an ellipsis', () => {
    const text = Array.from({ length: 60 }, () => 'word').join(' '); // 60×"word " → 299 chars
    const out = smartTruncate(text, 155);
    expect(out.length).toBeLessThanOrEqual(155);
    expect(out.endsWith('…')).toBe(true);
    const body = out.slice(0, -1);
    // Every retained token is a complete "word" — no "wor"/"rd" fragments.
    expect(body.split(' ').every((t) => t === 'word')).toBe(true);
  });

  it('strips trailing punctuation before the ellipsis', () => {
    const text = `${'alpha, '.repeat(40)}beta`; // lands the cut right after a comma
    const out = smartTruncate(text, 50);
    const body = out.slice(0, -1);
    expect(out.endsWith('…')).toBe(true);
    expect(/[\s,]$/u.test(body)).toBe(false);
    expect(out.length).toBeLessThanOrEqual(50);
  });

  it('hard-cuts CJK prose (no spaces) and stays within the limit', () => {
    const cjk = '推'.repeat(200);
    const out = smartTruncate(cjk, 155);
    expect(out.length).toBeLessThanOrEqual(155);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('blogDescription', () => {
  it('returns the explicit seoDescription verbatim when present', () => {
    const meta = { seoDescription: 'Hand-written, punchy, ≤155 chars.', subtitle: 'x'.repeat(300) };
    expect(blogDescription(meta)).toBe('Hand-written, punchy, ≤155 chars.');
  });

  it('smart-truncates the subtitle to ≤155 chars when no seoDescription is set', () => {
    const subtitle = Array.from({ length: 60 }, () => 'word').join(' ');
    const out = blogDescription({ subtitle });
    expect(out).toBe(smartTruncate(subtitle, 155));
    expect(out.length).toBeLessThanOrEqual(155);
    expect(out.endsWith('…')).toBe(true);
  });

  it('passes a short subtitle through without an ellipsis', () => {
    expect(blogDescription({ subtitle: 'A concise subtitle.' })).toBe('A concise subtitle.');
  });
});

describe('getAllPosts', () => {
  it('returns an array of posts sorted by date descending', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

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

function mockPostFiles(files: Record<string, string>) {
  vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  vi.spyOn(fs, 'readdirSync').mockReturnValue(Object.keys(files).map((name) => name) as any);
  vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
    const p = String(filePath);
    for (const [name, content] of Object.entries(files)) {
      if (p.includes(name.replace('.mdx', ''))) return content;
    }
    return '';
  });
}

describe('getAllPosts — publishDate filtering', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('filters out future-publishDate and missing-publishDate posts in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockPostFiles({
      'past-publish.mdx': FAKE_MDX_PAST_PUBLISH,
      'future-post.mdx': FAKE_MDX_FUTURE,
      'no-publish.mdx': FAKE_MDX_NO_PUBLISH,
    });

    const posts = getAllPosts();
    const slugs = posts.map((p) => p.slug);
    expect(slugs).toContain('past-publish');
    expect(slugs).not.toContain('no-publish');
    expect(slugs).not.toContain('future-post');
  });

  it('filters out posts without publishDate in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockPostFiles({
      'no-publish.mdx': FAKE_MDX_NO_PUBLISH,
    });

    const posts = getAllPosts();
    expect(posts).toHaveLength(0);
  });

  it('keeps posts with past publishDate in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockPostFiles({
      'past-publish.mdx': FAKE_MDX_PAST_PUBLISH,
    });

    const posts = getAllPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].slug).toBe('past-publish');
  });

  it('shows all posts including future-dated in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    mockPostFiles({
      'past-publish.mdx': FAKE_MDX_PAST_PUBLISH,
      'future-post.mdx': FAKE_MDX_FUTURE,
      'no-publish.mdx': FAKE_MDX_NO_PUBLISH,
    });

    const posts = getAllPosts();
    const slugs = posts.map((p) => p.slug);
    expect(slugs).toContain('past-publish');
    expect(slugs).toContain('future-post');
    expect(slugs).toContain('no-publish');
    expect(posts).toHaveLength(3);
  });

  it('shows all posts including future-dated in test env', () => {
    vi.stubEnv('NODE_ENV', 'test');
    mockPostFiles({
      'future-post.mdx': FAKE_MDX_FUTURE,
      'no-publish.mdx': FAKE_MDX_NO_PUBLISH,
    });

    const posts = getAllPosts();
    expect(posts).toHaveLength(2);
    const slugs = posts.map((p) => p.slug);
    expect(slugs).toContain('future-post');
    expect(slugs).toContain('no-publish');
  });

  it('returns empty array when all posts are future-dated in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockPostFiles({
      'future-post.mdx': FAKE_MDX_FUTURE,
    });

    const posts = getAllPosts();
    expect(posts).toHaveLength(0);
  });

  it('still sorts filtered results by date descending in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockPostFiles({
      'past-publish.mdx': FAKE_MDX_PAST_PUBLISH,
      'no-publish.mdx': FAKE_MDX_NO_PUBLISH,
      'future-post.mdx': FAKE_MDX_FUTURE,
    });

    const posts = getAllPosts();
    // only past-publish has a valid publishDate <= now
    expect(posts).toHaveLength(1);
    expect(posts[0].slug).toBe('past-publish');
  });
});

describe('getAllPosts — zh locale', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns only posts with a zh translation, using zh frontmatter', () => {
    mockLocalizedFiles(
      { 'test-post.mdx': FAKE_MDX, 'older-post.mdx': FAKE_MDX_OLDER },
      { 'test-post.mdx': FAKE_MDX_ZH },
    );

    const posts = getAllPosts('zh');
    expect(posts).toHaveLength(1);
    expect(posts[0].slug).toBe('test-post');
    expect(posts[0].title).toBe('测试文章');
    expect(posts[0].subtitle).toBe('一个测试副标题');
  });

  it('inherits publishDate gating from the English post in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    // English original is unpublished (no publishDate) — the zh translation
    // must not leak even though its file exists.
    mockLocalizedFiles(
      { 'no-publish.mdx': FAKE_MDX_NO_PUBLISH },
      { 'no-publish.mdx': FAKE_MDX_ZH },
    );

    expect(getAllPosts('zh')).toHaveLength(0);
  });

  it('keeps English getAllPosts unaffected by zh translations', () => {
    mockLocalizedFiles({ 'test-post.mdx': FAKE_MDX }, { 'test-post.mdx': FAKE_MDX_ZH });

    const posts = getAllPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe('Test Post');
  });
});

describe('getPostBySlug — zh locale', () => {
  it('returns the zh translation meta and content', () => {
    mockLocalizedFiles({ 'test-post.mdx': FAKE_MDX }, { 'test-post.mdx': FAKE_MDX_ZH });

    const result = getPostBySlug('test-post', 'zh');
    expect(result).not.toBeNull();
    expect(result!.meta.title).toBe('测试文章');
    expect(result!.raw).toContain('# 测试标题');
  });

  it('returns null when no zh translation exists', () => {
    mockLocalizedFiles({ 'test-post.mdx': FAKE_MDX }, {});

    expect(getPostBySlug('test-post', 'zh')).toBeNull();
  });
});

describe('hasZhTranslation', () => {
  it('reflects existence of the zh translation file', () => {
    mockLocalizedFiles(
      { 'test-post.mdx': FAKE_MDX, 'older-post.mdx': FAKE_MDX_OLDER },
      { 'test-post.mdx': FAKE_MDX_ZH },
    );

    expect(hasZhTranslation('test-post')).toBe(true);
    expect(hasZhTranslation('older-post')).toBe(false);
  });
});

describe('getAdjacentPosts — zh locale', () => {
  it('navigates within translated posts only', () => {
    mockLocalizedFiles(
      {
        'test-post.mdx': FAKE_MDX,
        'middle-post.mdx': FAKE_MDX_MIDDLE,
        'older-post.mdx': FAKE_MDX_OLDER,
      },
      // middle-post has no translation: zh prev/next must skip over it.
      { 'test-post.mdx': FAKE_MDX_ZH, 'older-post.mdx': FAKE_MDX_ZH },
    );

    const { prev, next } = getAdjacentPosts('test-post', 'zh');
    expect(next).toBeNull();
    expect(prev!.slug).toBe('older-post');
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

  it('returns a post with future publishDate regardless of NODE_ENV', () => {
    vi.stubEnv('NODE_ENV', 'production');

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(FAKE_MDX_FUTURE);

    const result = getPostBySlug('future-post');
    expect(result).not.toBeNull();
    expect(result!.meta.title).toBe('Future Post');
    expect(result!.meta.publishDate).toBe('2099-06-01');

    vi.unstubAllEnvs();
  });
});

describe('getAdjacentPosts', () => {
  function mockThreePosts() {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    vi.spyOn(fs, 'readdirSync').mockReturnValue([
      'test-post.mdx',
      'middle-post.mdx',
      'older-post.mdx',
    ] as any);
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
      const p = String(filePath);
      if (p.includes('test-post')) return FAKE_MDX;
      if (p.includes('middle-post')) return FAKE_MDX_MIDDLE;
      return FAKE_MDX_OLDER;
    });
  }

  it('returns prev (older) and next (newer) for a middle post', () => {
    mockThreePosts();
    // sorted newest-first: test-post (Jan 15), middle-post (Jan 1), older-post (Dec 1)
    const { prev, next } = getAdjacentPosts('middle-post');
    expect(next!.slug).toBe('test-post');
    expect(prev!.slug).toBe('older-post');
  });

  it('returns null next for the newest post', () => {
    mockThreePosts();
    const { prev, next } = getAdjacentPosts('test-post');
    expect(next).toBeNull();
    expect(prev!.slug).toBe('middle-post');
  });

  it('returns null prev for the oldest post', () => {
    mockThreePosts();
    const { prev, next } = getAdjacentPosts('older-post');
    expect(next!.slug).toBe('middle-post');
    expect(prev).toBeNull();
  });

  it('returns both null for an unknown slug', () => {
    mockThreePosts();
    const { prev, next } = getAdjacentPosts('nonexistent');
    expect(prev).toBeNull();
    expect(next).toBeNull();
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
