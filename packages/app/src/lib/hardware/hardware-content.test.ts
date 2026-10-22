import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';

import { slugify } from '../blog/blog';
import { hasZhSibling, zhPath } from '../i18n/i18n';
import { compareBlogPair, normalizeLocalizedLink } from '../i18n/zh-objective-guard';
import { hardwareFrontmatterErrors } from './hardware';

const APP_DIR = path.resolve(import.meta.dirname, '..', '..', '..');
const CONTENT_DIR = path.join(APP_DIR, 'content', 'hardware');
const ZH_DIR = path.join(CONTENT_DIR, 'zh');
const BLOG_DIR = path.join(APP_DIR, 'content', 'blog');
const PUBLIC_DIR = path.join(APP_DIR, 'public');

const mdxFiles = (dir: string) =>
  fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.mdx'))
    .toSorted();

const enFiles = mdxFiles(CONTENT_DIR);
const zhFiles = mdxFiles(ZH_DIR);
const hardwareSlugs = enFiles.map((file) => file.replace(/\.mdx$/u, ''));

const read = (file: string) => fs.readFileSync(file, 'utf8');

interface HeroFields {
  date?: unknown;
  publishDate?: unknown;
  tags?: unknown;
  links?: { href?: unknown }[];
}

const hero = (raw: string) => matter(raw).data as HeroFields;

function localImageRefs(raw: string): string[] {
  return [
    ...raw.matchAll(/src="(?<path>\/[^"]+)"/gu),
    ...raw.matchAll(/!\[[^\]]*\]\((?<path>\/[^)]+)\)/gu),
  ].map((m) => m.groups!.path);
}

function heroHrefs(fields: HeroFields): string[] {
  return (fields.links ?? []).map((link) => String(link.href));
}

const countMathFences = (raw: string) => (raw.match(/^\$\$\s*$/gmu) ?? []).length;

it('checks every current hardware page pair in both directions', () => {
  expect(enFiles.length).toBeGreaterThan(0);
  expect(zhFiles).toEqual(enFiles);
});

it('names every file by its final slug', () => {
  for (const slug of hardwareSlugs) expect(slugify(slug)).toBe(slug);
});

it('leaves no hardware page behind in the blog and no link to its old blog URL', () => {
  const stale = new RegExp(`/blog/(?:${hardwareSlugs.join('|')})\\b`, 'u');
  for (const slug of hardwareSlugs) {
    expect(fs.existsSync(path.join(BLOG_DIR, `${slug}.mdx`)), slug).toBe(false);
    expect(fs.existsSync(path.join(BLOG_DIR, 'zh', `${slug}.mdx`)), slug).toBe(false);
  }
  for (const dir of [BLOG_DIR, path.join(BLOG_DIR, 'zh'), CONTENT_DIR, ZH_DIR]) {
    for (const file of mdxFiles(dir)) {
      expect(stale.test(read(path.join(dir, file))), `${dir}/${file}`).toBe(false);
    }
  }
});

describe.each(enFiles)('%s', (file) => {
  const en = read(path.join(CONTENT_DIR, file));
  const zh = read(path.join(ZH_DIR, file));

  it.each([
    ['en', en],
    ['zh', zh],
  ])('has %s frontmatter that matches the hardware page schema', (_locale, raw) => {
    expect(hardwareFrontmatterErrors(matter(raw).data)).toEqual([]);
  });

  it('keeps date, publishDate, and tags identical across locales', () => {
    const [enHero, zhHero] = [hero(en), hero(zh)];
    expect(zhHero.date).toBe(enHero.date);
    expect(zhHero.publishDate).toBe(enHero.publishDate);
    expect(zhHero.tags).toEqual(enHero.tags);
  });

  it('keeps link targets identical across locales', () => {
    const [enHero, zhHero] = [hero(en), hero(zh)];
    expect(heroHrefs(zhHero).map(normalizeLocalizedLink)).toEqual(
      heroHrefs(enHero).map(normalizeLocalizedLink),
    );
  });

  it('points Chinese hero links at the Chinese sibling of internal routes', () => {
    for (const href of heroHrefs(hero(en))) {
      expect(href.startsWith('/zh/'), href).toBe(false);
    }
    for (const href of heroHrefs(hero(zh)).filter((target) => target.startsWith('/'))) {
      const pathname = href.split(/[?#]/u)[0];
      const enPathname = pathname.replace(/^\/zh(?=\/|$)/u, '') || '/';
      expect(pathname, href).toBe(hasZhSibling(enPathname) ? zhPath(enPathname) : enPathname);
    }
  });

  it('preserves code blocks, inline identifiers, math, Figure sources, links, and JSON-LD structure', () => {
    expect(compareBlogPair(file, en, zh)).toEqual([]);
  });

  it('references only images that exist under public/', () => {
    for (const [locale, raw] of [
      ['en', en],
      ['zh', zh],
    ] as const) {
      for (const ref of localImageRefs(raw)) {
        expect(fs.existsSync(path.join(PUBLIC_DIR, ref)), `${locale}: missing public${ref}`).toBe(
          true,
        );
      }
    }
  });

  it('opens and closes every $$ math block', () => {
    for (const [locale, raw] of [
      ['en', en],
      ['zh', zh],
    ] as const) {
      expect(countMathFences(raw) % 2, `${locale}: unbalanced $$ fences`).toBe(0);
    }
  });
});
