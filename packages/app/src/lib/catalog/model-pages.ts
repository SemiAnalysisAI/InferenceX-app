import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';

import { COMPARE_MODEL_SLUGS, type CompareModelSlug } from '@/lib/compare/compare-slug';

export interface ModelPageFrontmatter {
  title: string;
  developer: string;
  releaseDate: string;
  description: string;
}

export interface ModelPage {
  meta: ModelPageFrontmatter;
  entry: CompareModelSlug;
  raw: string;
  contentLocale?: 'en' | 'zh';
}

const MODELS_DIR = path.join(process.cwd(), 'content', 'models');

export function getModelPageSlugs(): string[] {
  return COMPARE_MODEL_SLUGS.filter((m) =>
    fs.existsSync(path.join(MODELS_DIR, `${m.slug}.mdx`)),
  ).map((m) => m.slug);
}

export function getModelPage(slug: string, locale: 'en' | 'zh' = 'en'): ModelPage | null {
  const entry = COMPARE_MODEL_SLUGS.find((m) => m.slug === slug);
  if (!entry) return null;
  const translatedPath = path.join(MODELS_DIR, 'zh', `${slug}.mdx`);
  const translated = locale === 'zh' && fs.existsSync(translatedPath);
  const filePath = translated ? translatedPath : path.join(MODELS_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;
  const { data, content } = matter(fs.readFileSync(filePath, 'utf8'));
  return {
    meta: data as ModelPageFrontmatter,
    entry,
    raw: content,
    contentLocale: translated ? 'zh' : 'en',
  };
}
