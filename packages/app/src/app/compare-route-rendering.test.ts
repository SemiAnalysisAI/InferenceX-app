import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Compare detail pages are ISR: served from the CDN and regenerated after an ingest purge, with a
// daily (hourly for precision and spec-decode) backstop. Reading request
// data, opting into dynamic rendering, or wrapping the page in a Suspense fallback would
// bring back per-request renders or a skeleton that paints before the content.
const FAMILIES = ['compare', 'compare-per-dollar', 'compare-precision', 'compare-spec-decode'];
const LOCALES = ['', 'zh'];
const APP_DIR = __dirname;

const pages = LOCALES.flatMap((locale) =>
  FAMILIES.flatMap((family) => [
    path.join(locale, family, '[slug]', 'page.tsx'),
    path.join(locale, family, '[slug]', '[scenario]', 'page.tsx'),
  ]),
);
const layouts = LOCALES.flatMap((locale) =>
  FAMILIES.map((family) => path.join(locale, family, 'layout.tsx')),
).filter((file) => existsSync(path.join(APP_DIR, file)));

const read = (file: string) => readFileSync(path.join(APP_DIR, file), 'utf8');

const DAILY_FAMILIES = new Set(['compare', 'compare-per-dollar']);

const DYNAMIC_PATTERNS: [string, RegExp][] = [
  ['searchParams', /\bsearchParams\b/],
  ['next/headers', /from ['"]next\/headers['"]/],
  ['connection()', /\bconnection\(/],
  ['dynamic export', /export const dynamic\b/],
  ['dynamicParams = false', /export const dynamicParams\s*=\s*false/],
];

describe('compare detail route rendering', () => {
  it('covers all four families, their scenario children and the /zh mirrors', () => {
    expect(pages).toHaveLength(16);
    for (const file of pages) expect(existsSync(path.join(APP_DIR, file)), file).toBe(true);
  });

  it.each(pages)('%s revalidates on its backstop interval and renders on demand', (file) => {
    const source = read(file);
    const revalidate = file.split(path.sep).some((part) => DAILY_FAMILIES.has(part))
      ? '86400'
      : '3600';
    expect(source).toMatch(new RegExp(`^export const revalidate = ${revalidate};$`, 'm'));
    expect(source).toMatch(/^export function generateStaticParams\(\)/m);
  });

  it.each([...pages, ...layouts])('%s reads no request data', (file) => {
    const source = read(file);
    for (const [label, pattern] of DYNAMIC_PATTERNS) {
      expect(pattern.test(source), `${file} uses ${label}`).toBe(false);
    }
  });

  it.each(pages)('%s serves its content without a Suspense fallback', (file) => {
    expect(read(file)).not.toMatch(/<Suspense\b/);
  });
});
