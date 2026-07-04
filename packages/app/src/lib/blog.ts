import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';

export interface BlogFrontmatter {
  title: string;
  date: string;
  subtitle: string;
  modifiedDate?: string;
  publishDate?: string;
  tags?: string[];
}

export interface BlogPostMeta extends BlogFrontmatter {
  slug: string;
  readingTime: number;
}

const CONTENT_DIR = path.join(process.cwd(), 'content', 'blog');
const WORDS_PER_MINUTE = 265;
// CJK prose has no word boundaries; reading speed studies put Chinese at
// roughly 300-500 characters per minute — we use a middle value.
const CJK_CHARS_PER_MINUTE = 400;

export type BlogLocale = 'en' | 'zh';

/** Simplified Chinese translations live alongside the originals, same filename. */
function contentDir(locale: BlogLocale): string {
  return locale === 'zh' ? path.join(CONTENT_DIR, 'zh') : CONTENT_DIR;
}

export function slugify(raw: string): string {
  return (
    raw
      .toLowerCase()
      // Keep Han characters so Chinese headings get meaningful anchor ids
      // instead of all collapsing to the empty-slug fallback.
      .replaceAll(/[^a-z0-9\p{Script=Han}]+/gu, '-')
      .replaceAll(/^-+|-+$/gu, '') || 'post'
  );
}

const CJK_CHAR_REGEX = /\p{Script=Han}/gu;

export function getReadingTime(content: string): number {
  const cjkChars = content.match(CJK_CHAR_REGEX)?.length ?? 0;
  const words = content.replaceAll(CJK_CHAR_REGEX, ' ').trim().split(/\s+/u).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE + cjkChars / CJK_CHARS_PER_MINUTE));
}

export function getAllPosts(locale: BlogLocale = 'en'): BlogPostMeta[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.mdx'));

  const posts = files.map((filename) => {
    const slug = slugify(filename.replace(/\.mdx$/u, ''));
    const raw = fs.readFileSync(path.join(CONTENT_DIR, filename), 'utf8');
    const { data, content } = matter(raw);

    return {
      ...(data as BlogFrontmatter),
      slug,
      readingTime: getReadingTime(content),
    };
  });

  const now = new Date();
  const visible =
    process.env.NODE_ENV === 'production'
      ? posts.filter((p) => Boolean(p.publishDate) && new Date(`${p.publishDate}T00:00:00Z`) <= now)
      : posts;

  const sorted = visible.toSorted(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  if (locale === 'en') return sorted;

  // Chinese visibility derives from the English post (single source of truth
  // for publishDate gating) plus the existence of a translation file. Title,
  // subtitle, and reading time come from the translation.
  return sorted.flatMap((post) => {
    const zh = readPost(post.slug, 'zh');
    return zh ? [zh.meta] : [];
  });
}

function readPost(slug: string, locale: BlogLocale): { meta: BlogPostMeta; raw: string } | null {
  const safe = slugify(slug);
  const filePath = path.join(contentDir(locale), `${safe}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const fileContent = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(fileContent);

  return {
    meta: {
      ...(data as BlogFrontmatter),
      slug: safe,
      readingTime: getReadingTime(content),
    },
    raw: content,
  };
}

export interface AdjacentPosts {
  prev: BlogPostMeta | null;
  next: BlogPostMeta | null;
}

export function getAdjacentPosts(slug: string, locale: BlogLocale = 'en'): AdjacentPosts {
  const posts = getAllPosts(locale);
  const index = posts.findIndex((p) => p.slug === slug);
  if (index === -1) return { prev: null, next: null };
  return {
    next: index > 0 ? posts[index - 1] : null,
    prev: index < posts.length - 1 ? posts[index + 1] : null,
  };
}

export interface TocHeading {
  level: 1 | 2 | 3;
  text: string;
  id: string;
}

export function extractHeadings(rawMdx: string): TocHeading[] {
  const stripped = rawMdx.replaceAll(/```[\s\S]*?```/gu, '');
  const headingRegex = /^(?<hashes>#{1,3})\s+(?<title>.+)$/gmu;
  const headings: TocHeading[] = [];
  const seen = new Set<string>();
  const parents: string[] = []; // parents[level] = slug of most recent heading at that level
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(stripped)) !== null) {
    const level = match[1].length as 1 | 2 | 3;
    const text = match[2].trim();
    const base = slugify(text);
    parents[level] = base;
    let id = base;
    if (seen.has(id)) {
      // prefix with nearest parent heading
      const parent = parents.slice(1, level).findLast(Boolean);
      id = parent ? `${parent}-${base}` : `${base}-${level}`;
    }
    seen.add(id);
    headings.push({ level, text, id });
  }
  return headings;
}

export function getPostBySlug(
  slug: string,
  locale: BlogLocale = 'en',
): { meta: BlogPostMeta; raw: string } | null {
  return readPost(slug, locale);
}

/** Whether a Simplified Chinese translation exists for a post (any visibility). */
export function hasZhTranslation(slug: string): boolean {
  return fs.existsSync(path.join(contentDir('zh'), `${slugify(slug)}.mdx`));
}
