import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';

import { AUTHOR_NAME, OG_IMAGE, SITE_URL } from '@semianalysisai/inferencex-constants';
import { ZH_LANG_TAG } from '@/lib/i18n/i18n';

export interface BlogFrontmatter {
  title: string;
  date: string;
  subtitle: string;
  modifiedDate?: string;
  publishDate?: string;
  seoDescription?: string;
  tags?: string[];
  thumbnail?: string;
  thumbnailLight?: string;
  thumbnailDark?: string;
}

export interface BlogPostMeta extends BlogFrontmatter {
  slug: string;
  readingTime: number;
}

const CONTENT_DIR = path.join(process.cwd(), 'content', 'blog');
const WORDS_PER_MINUTE = 265;
const CJK_CHARS_PER_MINUTE = 400;

export type BlogLocale = 'en' | 'zh';

function contentDir(locale: BlogLocale): string {
  return locale === 'zh' ? path.join(CONTENT_DIR, 'zh') : CONTENT_DIR;
}

export function slugify(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replaceAll(/[^a-z0-9\p{Script=Han}]+/gu, '-')
      .replaceAll(/^-+|-+$/gu, '') || 'post'
  );
}

const CJK_CHAR_REGEX = /\p{Script=Han}/gu;
const WORD_TOKEN_REGEX = /[\p{L}\p{N}]/u;

function countContentUnits(content: string): { cjkChars: number; words: number } {
  const cjkChars = content.match(CJK_CHAR_REGEX)?.length ?? 0;
  const nonCjkContent = content.replaceAll(CJK_CHAR_REGEX, ' ').trim();
  const words = nonCjkContent
    ? nonCjkContent.split(/\s+/u).filter((token) => WORD_TOKEN_REGEX.test(token)).length
    : 0;
  return { cjkChars, words };
}

export function getWordCount(content: string): number {
  const { cjkChars, words } = countContentUnits(content);
  return words + cjkChars;
}

export function getReadingTime(content: string): number {
  const { cjkChars, words } = countContentUnits(content);
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE + cjkChars / CJK_CHARS_PER_MINUTE));
}

const TRAILING_PUNCT_REGEX = /[\s\p{P}]+$/u;

export function smartTruncate(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const boundary = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${boundary.replace(TRAILING_PUNCT_REGEX, '')}…`;
}

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
  const parents: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(stripped)) !== null) {
    const level = match[1].length as 1 | 2 | 3;
    const text = match[2].trim();
    const base = slugify(text);
    parents[level] = base;
    let id = base;
    if (seen.has(id)) {
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

export function hasZhTranslation(slug: string): boolean {
  return fs.existsSync(path.join(contentDir('zh'), `${slugify(slug)}.mdx`));
}

function blogPathPrefix(locale: BlogLocale): string {
  return locale === 'zh' ? '/zh/blog' : '/blog';
}

export function blogOgImageUrl(slug: string, locale: BlogLocale = 'en'): string {
  return `${SITE_URL}${blogPathPrefix(locale)}/${slug}/opengraph-image`;
}

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
      logo: {
        '@type': 'ImageObject',
        url: OG_IMAGE,
      },
    },
    datePublished: `${meta.date}T00:00:00Z`,
    ...(meta.modifiedDate && { dateModified: `${meta.modifiedDate}T00:00:00Z` }),
    description: blogDescription(meta),
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    inLanguage: locale === 'zh' ? ZH_LANG_TAG : 'en-US',
    wordCount: getWordCount(raw),
    timeRequired: `PT${meta.readingTime}M`,
  };
}

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

export function getTopTags(posts: readonly Pick<BlogPostMeta, 'tags'>[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

export function getRelatedPosts(
  slug: string,
  posts: readonly BlogPostMeta[],
  limit = 3,
): BlogPostMeta[] {
  const current = posts.find((p) => p.slug === slug);
  const others = posts.filter((p) => p.slug !== slug);
  if (!current) return others.slice(0, limit);
  const currentTags: readonly string[] = current.tags ?? [];
  const tags = new Set(currentTags);
  const scored = others.map((post, index) => ({
    post,
    index,
    shared: (post.tags ?? []).filter((tag) => tags.has(tag)).length,
  }));
  return scored
    .toSorted((a, b) => b.shared - a.shared || a.index - b.index)
    .slice(0, limit)
    .map((s) => s.post);
}

export function formatBlogDate(date: string, locale: BlogLocale = 'en'): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function blogOgImagePath(slug: string, locale: BlogLocale = 'en'): string {
  return `${blogPathPrefix(locale)}/${slug}/opengraph-image`;
}

export interface PostThumbnail {
  light?: string;
  dark?: string;
}

const THUMBNAIL_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg']);

const THUMBNAIL_SRC_PATTERN =
  /^(?:\/images\/[\w./-]+|https:\/\/substack-post-media\.s3\.amazonaws\.com\/[\w./-]+)$/u;

const FIGURE_TAG_PATTERN = /<Figure\b(?<attrs>[^>]*)\/?>/gu;
const FIGURE_ATTR_PATTERN = /\b(?<name>src|srcLight|srcDark)\s*=\s*"(?<value>[^"]*)"/gu;

function safeThumbnailSrc(src: string | undefined): string | undefined {
  if (!src || !THUMBNAIL_SRC_PATTERN.test(src)) return undefined;
  const ext = path
    .extname(new URL(src, 'https://inferencex.semianalysis.com').pathname)
    .toLowerCase();
  return THUMBNAIL_EXTENSIONS.has(ext) ? src : undefined;
}

function firstFigureThumbnail(body: string): PostThumbnail | null {
  for (const tag of body.matchAll(FIGURE_TAG_PATTERN)) {
    const attrs: Record<string, string> = {};
    for (const attr of (tag.groups?.attrs ?? '').matchAll(FIGURE_ATTR_PATTERN)) {
      if (attr.groups) attrs[attr.groups.name] = attr.groups.value;
    }
    const light = safeThumbnailSrc(attrs.srcLight ?? attrs.src);
    const dark = safeThumbnailSrc(attrs.srcDark ?? attrs.src);
    if (light || dark) return { light: light ?? dark, dark: dark ?? light };
  }
  return null;
}

function folderThumbnail(slug: string): PostThumbnail | null {
  const dir = path.join(process.cwd(), 'public', 'images', slug);
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((name) => THUMBNAIL_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'en'));
  if (files.length === 0) return null;
  const url = (name: string) =>
    safeThumbnailSrc(`/images/${encodeURIComponent(slug)}/${encodeURIComponent(name)}`);
  const light = files.find((name) => /light/i.test(name));
  const dark = files.find((name) => /dark/i.test(name));
  if (light && dark) return { light: url(light), dark: url(dark) };
  const only = url(light ?? dark ?? files[0]);
  return only ? { light: only, dark: only } : null;
}

export function getPostThumbnail(slug: string): PostThumbnail | null {
  const mdxPath = path.join(CONTENT_DIR, `${slug}.mdx`);
  if (fs.existsSync(mdxPath)) {
    const { data, content } = matter(fs.readFileSync(mdxPath, 'utf8'));
    const front = data as BlogFrontmatter;
    const light = safeThumbnailSrc(front.thumbnailLight ?? front.thumbnail);
    const dark = safeThumbnailSrc(front.thumbnailDark ?? front.thumbnail);
    if (light || dark) return { light: light ?? dark, dark: dark ?? light };
    const fromBody = firstFigureThumbnail(content);
    if (fromBody) return fromBody;
  }
  return folderThumbnail(slug);
}
