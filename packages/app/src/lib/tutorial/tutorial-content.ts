import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import type { Metadata } from 'next';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';
import {
  enAlternates,
  type Locale,
  localePath,
  ZH_LANG_TAG,
  ZH_OG_LOCALE,
  zhAlternates,
} from '@/lib/i18n/i18n';

/**
 * One long-form guide page rendered from `content/<contentDir>/<slug>.mdx` and its
 * `content/<contentDir>/zh/<slug>.mdx` sibling, served at `path` and `/zh<path>`.
 */
export interface TutorialGuide {
  contentDir: string;
  slug: string;
  path: string;
  /** Names the page in search results, link previews and the JSON-LD headline. */
  seoPrefix: Record<Locale, string>;
  /** The JSON-LD `about`. */
  about: string;
}

export interface TutorialMeta {
  title: string;
  description: string;
  updated: string;
}

export interface Tutorial {
  meta: TutorialMeta;
  raw: string;
}

const FRONTMATTER_FIELDS = ['title', 'description', 'updated'] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function tutorialFrontmatterErrors(data: unknown): string[] {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return ['frontmatter must be a YAML mapping'];
  }
  const fields = data as Record<string, unknown>;
  const errors = Object.keys(fields)
    .filter((key) => !(FRONTMATTER_FIELDS as readonly string[]).includes(key))
    .map((key) => `frontmatter has unknown field "${key}"`);
  for (const field of ['title', 'description'] as const) {
    if (typeof fields[field] !== 'string' || fields[field].trim() === '') {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (!isIsoDate(fields.updated)) errors.push("updated must be a quoted 'YYYY-MM-DD' date");
  return errors;
}

function tutorialFilePath(guide: TutorialGuide, locale: Locale): string {
  return path.join(
    process.cwd(),
    'content',
    guide.contentDir,
    locale === 'zh' ? 'zh' : '',
    `${guide.slug}.mdx`,
  );
}

export function getTutorial(guide: TutorialGuide, locale: Locale = 'en'): Tutorial {
  const filePath = tutorialFilePath(guide, locale);
  const { data, content } = matter(fs.readFileSync(filePath, 'utf8'));
  const errors = tutorialFrontmatterErrors(data);
  if (errors.length > 0) {
    const where = path.relative(process.cwd(), filePath);
    throw new Error(
      `Invalid ${guide.about} tutorial frontmatter in ${where}:\n- ${errors.join('\n- ')}`,
    );
  }
  return { meta: data as TutorialMeta, raw: content };
}

/**
 * The H1 is the launch line on its own; search results, link previews and the JSON-LD headline
 * carry the guide's prefix so they still say what the page is.
 */
function tutorialSeoTitle(guide: TutorialGuide, meta: TutorialMeta, locale: Locale): string {
  return `${guide.seoPrefix[locale]}${locale === 'zh' ? '：' : ': '}${meta.title}`;
}

export function tutorialMetadata(
  guide: TutorialGuide,
  meta: TutorialMeta,
  locale: Locale,
): Metadata {
  const url = `${SITE_URL}${localePath(guide.path, locale)}`;
  const title = tutorialSeoTitle(guide, meta, locale);
  return {
    title,
    description: meta.description,
    alternates: locale === 'zh' ? zhAlternates(guide.path) : enAlternates(guide.path),
    // Every guide's dashboard tab is noindex; flip both sides together when the tab is indexable.
    robots: { index: false, follow: true },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description: meta.description,
      url,
      type: 'article',
      modifiedTime: `${meta.updated}T00:00:00Z`,
      ...(locale === 'zh' && { locale: ZH_OG_LOCALE }),
    },
    twitter: { title: `${title} | ${SITE_NAME}`, description: meta.description },
  };
}

export function buildTutorialJsonLd(guide: TutorialGuide, meta: TutorialMeta, locale: Locale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: tutorialSeoTitle(guide, meta, locale),
    description: meta.description,
    url: `${SITE_URL}${localePath(guide.path, locale)}`,
    inLanguage: locale === 'zh' ? ZH_LANG_TAG : 'en',
    dateModified: `${meta.updated}T00:00:00Z`,
    about: guide.about,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
  };
}
