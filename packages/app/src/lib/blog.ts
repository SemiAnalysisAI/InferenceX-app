import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';

import { AUTHOR_NAME, OG_IMAGE, SITE_URL } from '@semianalysisai/inferencex-constants';
import { ZH_LANG_TAG } from '@/lib/i18n';

export interface BlogFrontmatter {
  title: string;
  date: string;
  subtitle: string;
  modifiedDate?: string;
  publishDate?: string;
  /** Optional hand-written SEO/social meta description. When set it overrides
   *  the auto-truncated `subtitle` for the SERP snippet — use it on posts whose
   *  `subtitle` runs past ~155 chars and would otherwise truncate mid-sentence.
   *  Keep it ≤155 chars (English) / ≤~78 CJK chars and compelling. */
  seoDescription?: string;
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

/** Trailing whitespace + punctuation (any script), so a truncated snippet
 *  doesn't end in a dangling comma / dash / open bracket before the ellipsis. */
const TRAILING_PUNCT_REGEX = /[\s\p{P}]+$/u;

/**
 * Truncate to at most `max` characters (ellipsis included) without cutting a
 * word in half. Cuts at the last space that fits, strips trailing punctuation,
 * and appends "…" only when the text was actually shortened. CJK prose has no
 * spaces, so it falls back to a hard character cut (which is correct — there
 * are no word boundaries to preserve).
 */
export function smartTruncate(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  // Reserve one char for the ellipsis so the result is guaranteed ≤ max.
  const slice = clean.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const boundary = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${boundary.replace(TRAILING_PUNCT_REGEX, '')}…`;
}

/**
 * SERP / social meta description for a post: the explicit `seoDescription`
 * frontmatter when present, otherwise the `subtitle` smart-truncated to a
 * SERP-safe length. Used for the `<meta name="description">`, OpenGraph, and
 * Twitter descriptions.
 */
export function blogDescription(meta: Pick<BlogPostMeta, 'seoDescription' | 'subtitle'>): string {
  return meta.seoDescription ?? smartTruncate(meta.subtitle, 155);
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

// ---------------------------------------------------------------------------
// Structured data (JSON-LD)
//
// Pure builders shared by the English (`/blog/[slug]`) and Chinese
// (`/zh/blog/[slug]`) post pages. Kept here — not inline in the page — so the
// recommended schema.org fields are unit-testable and the two language pages
// can't drift on the shape.
// ---------------------------------------------------------------------------

/** Locale-aware route prefix for a post's canonical URL. */
function blogPathPrefix(locale: BlogLocale): string {
  return locale === 'zh' ? '/zh/blog' : '/blog';
}

/**
 * Absolute URL of a post's Open Graph image. Next.js serves the
 * file-convention image at `<postUrl>/opengraph-image`; the `/zh` route has its
 * own segment that reuses the English card art (its Satori font has no CJK
 * glyphs), so each locale points at its own route.
 */
export function blogOgImageUrl(slug: string, locale: BlogLocale = 'en'): string {
  return `${SITE_URL}${blogPathPrefix(locale)}/${slug}/opengraph-image`;
}

/**
 * schema.org `BlogPosting` for a post page. Includes the recommended Article
 * fields — `image`, `inLanguage`, `mainEntityOfPage`, and `publisher.logo` —
 * on top of the required headline/author/dates so posts qualify for Google's
 * Article rich results.
 */
export function buildBlogPostingJsonLd(meta: BlogPostMeta, raw: string, locale: BlogLocale = 'en') {
  const url = `${SITE_URL}${blogPathPrefix(locale)}/${meta.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: meta.title,
    image: blogOgImageUrl(meta.slug, locale),
    author: { '@type': 'Person', name: AUTHOR_NAME },
    publisher: {
      '@type': 'Organization',
      name: AUTHOR_NAME,
      // Dimensions are intentionally omitted: the OG_IMAGE asset's real size
      // (1200×675) disagrees with the root layout's OG declaration (1200×630),
      // so rather than assert a conflicting number we follow the existing
      // Organization-logo precedent in layout.tsx and leave width/height off
      // (both are optional in schema.org's ImageObject).
      logo: {
        '@type': 'ImageObject',
        url: OG_IMAGE,
      },
    },
    datePublished: `${meta.date}T00:00:00Z`,
    ...(meta.modifiedDate && { dateModified: `${meta.modifiedDate}T00:00:00Z` }),
    // Keep structured-data description in sync with the SERP/OG/Twitter meta
    // (both go through blogDescription) so they never diverge for posts with a
    // seoDescription or a long subtitle.
    description: blogDescription(meta),
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    inLanguage: locale === 'zh' ? ZH_LANG_TAG : 'en-US',
    wordCount: raw.trim().split(/\s+/u).length,
    timeRequired: `PT${meta.readingTime}M`,
  };
}

/**
 * schema.org `BreadcrumbList` for a post: Home → Blog → post title. Emitted as
 * a separate JSON-LD block alongside the BlogPosting so Google can render the
 * trail in search results (mirrors the compare pages' breadcrumb). Matches the
 * shape of `buildBreadcrumbJsonLd` in `compare-ssr.ts`.
 */
export function buildBlogBreadcrumbJsonLd(slug: string, title: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: title, item: `${SITE_URL}/blog/${slug}` },
    ],
  };
}

/** Simplified Chinese port of `buildBlogBreadcrumbJsonLd` — 1:1 structural
 *  mirror with translated labels and `/zh` URLs. */
export function buildBlogBreadcrumbJsonLdZh(slug: string, title: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首页', item: `${SITE_URL}/zh` },
      { '@type': 'ListItem', position: 2, name: '博客', item: `${SITE_URL}/zh/blog` },
      { '@type': 'ListItem', position: 3, name: title, item: `${SITE_URL}/zh/blog/${slug}` },
    ],
  };
}
