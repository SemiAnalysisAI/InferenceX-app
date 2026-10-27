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

export interface PowerXTutorialMeta {
  title: string;
  description: string;
  updated: string;
}

export interface PowerXTutorial {
  meta: PowerXTutorialMeta;
  raw: string;
}

export const POWERX_PATH = '/powerx';
export const POWERX_TUTORIAL_PATH = '/powerx/tutorial';

const CONTENT_DIR = path.join(process.cwd(), 'content', 'powerx');
const FRONTMATTER_FIELDS = ['title', 'description', 'updated'] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export function tutorialFrontmatterErrors(data: unknown): string[] {
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

export function tutorialFilePath(locale: Locale = 'en'): string {
  return path.join(CONTENT_DIR, locale === 'zh' ? 'zh' : '', 'tutorial.mdx');
}

export function getPowerXTutorial(locale: Locale = 'en'): PowerXTutorial {
  const filePath = tutorialFilePath(locale);
  const { data, content } = matter(fs.readFileSync(filePath, 'utf8'));
  const errors = tutorialFrontmatterErrors(data);
  if (errors.length > 0) {
    const where = path.relative(process.cwd(), filePath);
    throw new Error(`Invalid PowerX tutorial frontmatter in ${where}:\n- ${errors.join('\n- ')}`);
  }
  return { meta: data as PowerXTutorialMeta, raw: content };
}

export function powerxTutorialPath(locale: Locale = 'en'): string {
  return localePath(POWERX_TUTORIAL_PATH, locale);
}

/**
 * The H1 is the launch line on its own; search results, link previews and the JSON-LD headline
 * carry a "PowerX tutorial" prefix so they still say what the page is.
 */
export function powerxTutorialSeoTitle(meta: PowerXTutorialMeta, locale: Locale): string {
  return locale === 'zh' ? `PowerX 教程：${meta.title}` : `PowerX tutorial: ${meta.title}`;
}

export function powerxTutorialMetadata(meta: PowerXTutorialMeta, locale: Locale): Metadata {
  const url = `${SITE_URL}${powerxTutorialPath(locale)}`;
  const title = powerxTutorialSeoTitle(meta, locale);
  return {
    title,
    description: meta.description,
    alternates:
      locale === 'zh' ? zhAlternates(POWERX_TUTORIAL_PATH) : enAlternates(POWERX_TUTORIAL_PATH),
    // The /powerx tab is not indexable until the article ships; flip both sides together.
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

export function buildPowerXTutorialJsonLd(meta: PowerXTutorialMeta, locale: Locale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: powerxTutorialSeoTitle(meta, locale),
    description: meta.description,
    url: `${SITE_URL}${powerxTutorialPath(locale)}`,
    inLanguage: locale === 'zh' ? ZH_LANG_TAG : 'en',
    dateModified: `${meta.updated}T00:00:00Z`,
    about: 'PowerX',
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
  };
}
