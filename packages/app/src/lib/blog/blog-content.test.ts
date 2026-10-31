import fs from 'node:fs';
import path from 'node:path';
import { compileMDX } from 'next-mdx-remote/rsc';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { compareBlogPair } from '../i18n/zh-objective-guard';

const APP_DIR = path.resolve(import.meta.dirname, '..', '..', '..');
const CONTENT_DIR = path.join(APP_DIR, 'content', 'blog');
const ZH_DIR = path.join(CONTENT_DIR, 'zh');
const PUBLIC_DIR = path.join(APP_DIR, 'public');

const enFiles = fs
  .readdirSync(CONTENT_DIR)
  .filter((f) => f.endsWith('.mdx'))
  .toSorted();
const zhFiles = fs
  .readdirSync(ZH_DIR)
  .filter((f) => f.endsWith('.mdx'))
  .toSorted();

const read = (file: string) => fs.readFileSync(file, 'utf8');

function frontmatterField(raw: string, field: string): string | null {
  const fm = raw.split('---')[1] ?? '';
  const match = new RegExp(`^${field}:\\s*(?<value>.*)$`, 'mu').exec(fm);
  return match?.groups ? match.groups.value.trim() : null;
}

function tagList(raw: string): string[] {
  const fm = raw.split('---')[1] ?? '';
  const match = /^tags:\s*\n(?<items>(?:[ \t]+-[^\n]*(?:\n|$))+)/mu.exec(fm);
  if (!match?.groups) return [];
  return [...match.groups.items.matchAll(/^\s+-\s+(?<tag>.*)$/gmu)].map((item) =>
    item.groups!.tag.trim(),
  );
}

function localImageRefs(raw: string): string[] {
  return [
    ...raw.matchAll(/src="(?<path>\/[^"]+)"/gu),
    ...raw.matchAll(/!\[[^\]]*\]\((?<path>\/[^)]+)\)/gu),
  ].map((m) => m.groups!.path);
}

const countMathFences = (raw: string) => (raw.match(/^\$\$\s*$/gmu) ?? []).length;

it('checks every current locale pair in both directions', () => {
  expect(enFiles.length).toBeGreaterThan(0);
  expect(zhFiles).toEqual(enFiles);
});

describe.each(enFiles)('%s', (file) => {
  const en = read(path.join(CONTENT_DIR, file));
  const zhPath = path.join(ZH_DIR, file);

  it('keeps date, publishDate, and tags identical across locales', () => {
    const zh = read(zhPath);
    for (const field of ['date', 'publishDate', 'modifiedDate']) {
      expect(frontmatterField(zh, field), `${field} drifted`).toBe(frontmatterField(en, field));
    }
    expect(tagList(zh)).toEqual(tagList(en));
  });

  it('preserves code blocks, inline identifiers, math, Figure sources, links, and JSON-LD structure', () => {
    expect(compareBlogPair(file, en, read(zhPath))).toEqual([]);
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

describe('Chinese technical Markdown rendering', () => {
  it('renders every multiplication factor in the workflow job calculation', async () => {
    const source = read(path.join(ZH_DIR, 'inferencemax-open-source-inference-benchmarking.mdx'));
    const paragraph = source.split('\n\n').find((block) => block.startsWith('具体来说：'));
    expect(paragraph).toBeDefined();
    const { content } = await compileMDX({ source: paragraph! });
    const html = renderToStaticMarkup(content);
    expect(html).toContain('3 * 7 * 3 * 2 * 4 * 4 = 2016');
    expect(html).not.toContain('<em>');
  });

  it('preserves underscores and the wildcard in the SGLang optimization flag', async () => {
    const source = read(path.join(ZH_DIR, 'mi355x-deepseek-v4-pro-sglang-110x-in-26-days.mdx'));
    const paragraph = source
      .split('\n')
      .find((block) => block.startsWith('- **分支 → SGLang main 上游迁移。**'));
    expect(paragraph).toBeDefined();
    const { content } = await compileMDX({ source: paragraph! });
    expect(renderToStaticMarkup(content)).toContain('<code>SGLANG_OPT_*</code>');
  });
});
