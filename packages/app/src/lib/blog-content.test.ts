import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Integrity checks over the real MDX in `content/blog/`. These are cheap file reads,
 * not a rendering test — they catch the mistakes that only surface at build time or,
 * worse, silently ship: a post without its mandatory `/zh` translation, a `<Figure>`
 * pointing at an image nobody committed, and en/zh drifting apart in structure.
 */

// Resolved from this file so the suite works whether vitest runs from the repo root
// or from packages/app. `import.meta.dirname` rather than `new URL(...).pathname`:
// the latter keeps percent-encoding and yields a leading-slash `/C:/…` on Windows.
const APP_DIR = path.resolve(import.meta.dirname, '..', '..');
const CONTENT_DIR = path.join(APP_DIR, 'content', 'blog');
const ZH_DIR = path.join(CONTENT_DIR, 'zh');
const PUBLIC_DIR = path.join(APP_DIR, 'public');

const enFiles = fs
  .readdirSync(CONTENT_DIR)
  .filter((f) => f.endsWith('.mdx'))
  .toSorted();

const read = (file: string) => fs.readFileSync(file, 'utf8');

/** Frontmatter values we require to be byte-identical between a post and its translation. */
function frontmatterField(raw: string, field: string): string | null {
  const fm = raw.split('---')[1] ?? '';
  const match = new RegExp(`^${field}:\\s*(?<value>.*)$`, 'mu').exec(fm);
  return match?.groups ? match.groups.value.trim() : null;
}

function tagList(raw: string): string[] {
  const fm = raw.split('---')[1] ?? '';
  const after = fm.split(/^tags:\s*$/mu)[1];
  if (!after) return [];
  const tags: string[] = [];
  for (const line of after.split('\n')) {
    const item = /^\s+-\s+(?<tag>.*)$/u.exec(line);
    if (!item) break;
    tags.push(item.groups!.tag.trim());
  }
  return tags;
}

/** Local `<Figure src="/images/...">` and markdown `![alt](/images/...)` references. */
function localImageRefs(raw: string): string[] {
  return [
    ...raw.matchAll(/src="(?<path>\/[^"]+)"/gu),
    ...raw.matchAll(/!\[[^\]]*\]\((?<path>\/[^)]+)\)/gu),
  ].map((m) => m.groups!.path);
}

const countFigures = (raw: string) => (raw.match(/<Figure\b/gu) ?? []).length;
const countMathFences = (raw: string) => (raw.match(/^\$\$\s*$/gmu) ?? []).length;

it('finds English posts to check', () => {
  expect(enFiles.length).toBeGreaterThan(0);
});

describe.each(enFiles)('%s', (file) => {
  const en = read(path.join(CONTENT_DIR, file));
  const zhPath = path.join(ZH_DIR, file);

  it('ships a Simplified Chinese sibling with the same filename', () => {
    expect(fs.existsSync(zhPath), `missing content/blog/zh/${file}`).toBe(true);
  });

  it('keeps date, publishDate, and tags identical across locales', () => {
    const zh = read(zhPath);
    for (const field of ['date', 'publishDate', 'modifiedDate']) {
      expect(frontmatterField(zh, field), `${field} drifted`).toBe(frontmatterField(en, field));
    }
    expect(tagList(zh)).toEqual(tagList(en));
  });

  it('does not drift in figure or math-block count across locales', () => {
    const zh = read(zhPath);
    expect(countFigures(zh)).toBe(countFigures(en));
    expect(countMathFences(zh)).toBe(countMathFences(en));
  });

  it('references only images that exist under public/', () => {
    for (const [locale, raw] of [
      ['en', en],
      ['zh', read(zhPath)],
    ] as const) {
      for (const ref of localImageRefs(raw)) {
        const onDisk = path.join(PUBLIC_DIR, ref);
        expect(fs.existsSync(onDisk), `${locale}: missing public${ref}`).toBe(true);
      }
    }
  });

  it('opens and closes every $$ math block', () => {
    for (const [locale, raw] of [
      ['en', en],
      ['zh', read(zhPath)],
    ] as const) {
      expect(countMathFences(raw) % 2, `${locale}: unbalanced $$ fences`).toBe(0);
    }
  });
});
