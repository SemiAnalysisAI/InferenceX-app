import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';

import { COMPARE_MODEL_SLUGS, type CompareModelSlug } from '@/lib/compare-slug';

/**
 * Frontmatter for `/model/[slug]` deep-dive pages. Content lives in
 * `content/models/<slug>.mdx`, one file per canonical compare slug — the body
 * is standard MDX (Overview, Architecture, Official vendor eval scores,
 * Benchmark explanations) compiled with the same pipeline as blog posts.
 */
export interface ModelPageFrontmatter {
  /** Page H1 / SEO title, e.g. 'Kimi K3'. */
  title: string;
  /** Model developer shown in the fact strip, e.g. 'Moonshot AI'. */
  developer: string;
  /** Human-readable release date(s); free-form to allow multi-version slugs. */
  releaseDate: string;
  /** Meta description and page subtitle. Keep ≤160 chars. */
  description: string;
}

export interface ModelPage {
  meta: ModelPageFrontmatter;
  entry: CompareModelSlug;
  raw: string;
}

const MODELS_DIR = path.join(process.cwd(), 'content', 'models');

/**
 * Canonical model-page slugs in the master compare-index order, filtered to
 * slugs that actually have a content file. Drives `generateStaticParams` and
 * the sitemap so a slug without content never produces a route.
 */
export function getModelPageSlugs(): string[] {
  return COMPARE_MODEL_SLUGS.filter((m) =>
    fs.existsSync(path.join(MODELS_DIR, `${m.slug}.mdx`)),
  ).map((m) => m.slug);
}

/** Loads one model page. Returns null for unknown slugs or missing content. */
export function getModelPage(slug: string): ModelPage | null {
  const entry = COMPARE_MODEL_SLUGS.find((m) => m.slug === slug);
  if (!entry) return null;
  const filePath = path.join(MODELS_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;
  const { data, content } = matter(fs.readFileSync(filePath, 'utf8'));
  return { meta: data as ModelPageFrontmatter, entry, raw: content };
}
