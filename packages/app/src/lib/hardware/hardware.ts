import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import type { Metadata } from 'next';

import {
  AUTHOR_HANDLE,
  AUTHOR_NAME,
  SITE_NAME,
  SITE_URL,
} from '@semianalysisai/inferencex-constants';
import {
  buildArticleJsonLd,
  buildSectionBreadcrumbJsonLd,
  getReadingTime,
  slugify,
} from '@/lib/blog/blog';
import { HARDWARE_COPY } from '@/lib/hardware/hardware-copy';
import { type HardwareLink, isSupportedHref, MARKDOWN_LINK } from '@/lib/hardware/hardware-markup';
import {
  enAlternates,
  type Locale,
  localePath,
  ZH_LANG_TAG,
  ZH_OG_LOCALE,
  zhAlternates,
} from '@/lib/i18n/i18n';

export interface HardwareFrontmatter {
  title: string;
  seoDescription: string;
  date: string;
  publishDate: string;
  tags: string[];
  lede: string;
  links: HardwareLink[];
}

export interface HardwarePageMeta extends HardwareFrontmatter {
  slug: string;
  readingTime: number;
}

export interface HardwarePage {
  meta: HardwarePageMeta;
  raw: string;
}

export const HARDWARE_PATH = '/hardware';

const CONTENT_DIR = path.join(process.cwd(), 'content', 'hardware');

const FRONTMATTER_FIELDS: readonly string[] = [
  'title',
  'seoDescription',
  'date',
  'publishDate',
  'tags',
  'lede',
  'links',
];
const TEXT_FIELDS = ['title', 'seoDescription', 'lede'] as const;
const DATE_FIELDS = ['date', 'publishDate'] as const;
const LINK_FIELDS: readonly string[] = ['label', 'href'];
const MAX_LINKS = 2;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function fieldErrors(value: unknown, where: string, fields: readonly string[]): string[] {
  if (!isFields(value)) return [`${where} must be a mapping with ${fields.join(', ')}`];
  return [
    ...Object.keys(value)
      .filter((key) => !fields.includes(key))
      .map((key) => `${where} has unknown field "${key}"`),
    ...fields
      .filter((field) => !isText(value[field]))
      .map((field) => `${where}.${field} must be a non-empty string`),
  ];
}

export function hardwareFrontmatterErrors(data: unknown): string[] {
  if (!isFields(data)) return ['frontmatter must be a YAML mapping'];
  const errors = Object.keys(data)
    .filter((key) => !FRONTMATTER_FIELDS.includes(key))
    .map((key) => `frontmatter has unknown field "${key}"`);

  for (const field of TEXT_FIELDS) {
    if (!isText(data[field])) errors.push(`${field} must be a non-empty string`);
  }
  for (const field of DATE_FIELDS) {
    if (!isIsoDate(data[field])) errors.push(`${field} must be a quoted 'YYYY-MM-DD' date`);
  }

  const { tags, lede, links } = data;
  if (!Array.isArray(tags) || tags.length === 0 || !tags.every(isText)) {
    errors.push('tags must be a non-empty list of strings');
  }

  if (typeof lede === 'string') {
    if (lede.split('**').length % 2 === 0) errors.push('lede must close every ** bold marker');
    if (MARKDOWN_LINK.test(lede) || lede.includes('`')) {
      errors.push('lede supports **bold** only; move links and code into the body');
    }
  }

  if (!Array.isArray(links) || links.length === 0 || links.length > MAX_LINKS) {
    errors.push(`links must list 1 to ${MAX_LINKS} items; the first one is the primary button`);
  }
  if (Array.isArray(links)) {
    links.forEach((item, index) => {
      const where = `links[${index}]`;
      errors.push(...fieldErrors(item, where, LINK_FIELDS));
      if (isFields(item) && isText(item.href) && !isSupportedHref(item.href)) {
        errors.push(`${where}.href must be a root-relative path or an https URL`);
      }
    });
  }

  return errors;
}

export function parseHardwareFrontmatter(data: unknown, source: string): HardwareFrontmatter {
  const errors = hardwareFrontmatterErrors(data);
  if (errors.length > 0) {
    throw new Error(`Invalid hardware page frontmatter in ${source}:\n- ${errors.join('\n- ')}`);
  }
  return data as HardwareFrontmatter;
}

export function getHardwarePageBySlug(slug: string, locale: Locale = 'en'): HardwarePage | null {
  const safe = slugify(slug);
  const dir = locale === 'zh' ? path.join(CONTENT_DIR, 'zh') : CONTENT_DIR;
  const filePath = path.join(dir, `${safe}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const { data, content } = matter(fs.readFileSync(filePath, 'utf8'));
  const frontmatter = parseHardwareFrontmatter(data, path.relative(process.cwd(), filePath));
  return {
    meta: { ...frontmatter, slug: safe, readingTime: getReadingTime(content) },
    raw: content,
  };
}

export function getAllHardwarePages(locale: Locale = 'en'): HardwarePageMeta[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];

  const pages = fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith('.mdx'))
    .flatMap((file) => {
      const page = getHardwarePageBySlug(file.replace(/\.mdx$/u, ''));
      return page ? [page.meta] : [];
    });

  const now = new Date();
  const visible =
    process.env.NODE_ENV === 'production'
      ? pages.filter((page) => new Date(`${page.publishDate}T00:00:00Z`) <= now)
      : pages;
  const sorted = visible.toSorted(
    (a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug),
  );
  if (locale === 'en') return sorted;

  return sorted.flatMap((page) => {
    const zh = getHardwarePageBySlug(page.slug, 'zh');
    return zh ? [zh.meta] : [];
  });
}

export function hasZhHardwarePage(slug: string): boolean {
  return fs.existsSync(path.join(CONTENT_DIR, 'zh', `${slugify(slug)}.mdx`));
}

export function hardwareIndexPath(locale: Locale = 'en'): string {
  return localePath(HARDWARE_PATH, locale);
}

export function hardwarePagePath(slug: string, locale: Locale = 'en'): string {
  return localePath(`${HARDWARE_PATH}/${slug}`, locale);
}

export function hardwareOgImageUrl(slug: string, locale: Locale = 'en'): string {
  return `${SITE_URL}${hardwarePagePath(slug, locale)}/opengraph-image`;
}

export function hardwareIndexMetadata(locale: Locale): Metadata {
  const t = HARDWARE_COPY[locale];
  return {
    title: t.indexTitle,
    description: t.indexDescription,
    alternates: locale === 'zh' ? zhAlternates(HARDWARE_PATH) : enAlternates(HARDWARE_PATH),
    openGraph: {
      title: `${t.indexTitle} | ${SITE_NAME}`,
      description: t.indexDescription,
      url: `${SITE_URL}${hardwareIndexPath(locale)}`,
      ...(locale === 'zh' && { locale: ZH_OG_LOCALE }),
    },
  };
}

export function hardwarePageMetadata(meta: HardwarePageMeta, locale: Locale): Metadata {
  const enPath = hardwarePagePath(meta.slug);
  const url = `${SITE_URL}${hardwarePagePath(meta.slug, locale)}`;
  const title = `${meta.title} | ${SITE_NAME}`;
  let alternates: Metadata['alternates'] = { canonical: url };
  if (locale === 'zh') alternates = zhAlternates(enPath);
  else if (hasZhHardwarePage(meta.slug)) alternates = enAlternates(enPath);

  return {
    title: { absolute: title },
    description: meta.seoDescription,
    keywords: meta.tags,
    authors: [{ name: AUTHOR_NAME }],
    alternates,
    openGraph: {
      title,
      description: meta.seoDescription,
      url,
      type: 'article',
      ...(locale === 'zh' && { locale: ZH_OG_LOCALE }),
      publishedTime: `${meta.date}T00:00:00Z`,
      authors: [AUTHOR_NAME],
      tags: meta.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: meta.seoDescription,
      site: AUTHOR_HANDLE,
      creator: AUTHOR_HANDLE,
    },
  };
}

export function buildHardwareArticleJsonLd(
  meta: HardwarePageMeta,
  raw: string,
  locale: Locale = 'en',
) {
  return buildArticleJsonLd({
    type: 'Article',
    path: hardwarePagePath(meta.slug, locale),
    title: meta.title,
    description: meta.seoDescription,
    date: meta.date,
    image: hardwareOgImageUrl(meta.slug, locale),
    locale,
    raw,
    readingTime: meta.readingTime,
  });
}

export function buildHardwareBreadcrumbJsonLd(
  meta: Pick<HardwarePageMeta, 'slug' | 'title'>,
  locale: Locale = 'en',
) {
  return buildSectionBreadcrumbJsonLd(
    locale,
    { name: HARDWARE_COPY[locale].indexTitle, path: HARDWARE_PATH },
    meta.slug,
    meta.title,
  );
}

export function buildHardwareIndexJsonLd(pages: readonly HardwarePageMeta[], locale: Locale) {
  const t = HARDWARE_COPY[locale];
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${SITE_NAME} ${t.indexTitle}`,
    description: t.indexDescription,
    url: `${SITE_URL}${hardwareIndexPath(locale)}`,
    inLanguage: locale === 'zh' ? ZH_LANG_TAG : 'en-US',
    publisher: { '@type': 'Organization', name: AUTHOR_NAME },
    hasPart: pages.map((page) => ({
      '@type': 'Article',
      headline: page.title,
      url: `${SITE_URL}${hardwarePagePath(page.slug, locale)}`,
      datePublished: `${page.date}T00:00:00Z`,
    })),
  };
}
