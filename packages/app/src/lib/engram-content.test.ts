import fs from 'node:fs';
import path from 'node:path';
import { compile } from '@mdx-js/mdx';
import { describe, expect, it } from 'vitest';

import { getAllPosts, getPostBySlug } from './blog';
import { getGlossaryEntry } from './glossary';
import { getZhGlossaryEntry } from './glossary-zh';
import { compareBlogPair } from './zh-objective-guard';

const ARTICLE = 'engrams-embedding-entendre-codesign';
const SOURCE = `https://newsletter.semianalysis.com/p/${ARTICLE}`;
const APP_DIR = path.resolve(import.meta.dirname, '../..');
const NEW_TERMS = [
  'engram',
  'n-gram-embedding',
  'conditional-memory',
  'embedding-table',
  'parameter-offloading',
  'sparse-embedding-lookup',
  'embedding-prefetch',
  'unified-virtual-addressing',
  'pinned-host-memory',
  'memory-mapped-file',
  'filesystem-page-cache',
  'cache-hotness',
  'context-dependent-gating',
  'inference-time-ablation',
  'teacher-forcing',
];

describe('Engram article port', () => {
  it('publishes both locale versions and preserves their non-translatable structure', () => {
    for (const locale of ['en', 'zh'] as const) {
      expect(getAllPosts(locale).map((post) => post.slug)).toContain(ARTICLE);
      const post = getPostBySlug(ARTICLE, locale)!;
      expect(post).not.toBeNull();
      expect(post.raw).toContain(SOURCE);
      expect(post.raw).toContain('Bryan Shan');
      expect(post.raw).toContain('Kimbo Chen');
      expect(post.raw).toContain('Myron Xie');
      for (const value of ['189 GiB', '12.4 KiB', '3.1 KiB', '0.2848', '0.3093', '0.3375']) {
        expect(post.raw).toContain(value);
      }
    }
    const read = (locale: string) =>
      fs.readFileSync(
        path.join(APP_DIR, 'content/blog', locale === 'zh' ? 'zh' : '', `${ARTICLE}.mdx`),
        'utf8',
      );
    expect(compareBlogPair(`${ARTICLE}.mdx`, read('en'), read('zh'))).toEqual([]);
  });

  it.each(['en', 'zh'] as const)(
    'compiles the %s MDX and includes all 19 local figures',
    async (locale) => {
      const post = getPostBySlug(ARTICLE, locale)!;
      await expect(compile(post.raw)).resolves.toBeDefined();
      const figures = [...post.raw.matchAll(/src="(?<src>\/images\/[^"]+)"/gu)];
      expect(figures).toHaveLength(19);
      expect(new Set(figures.map((figure) => figure.groups!.src)).size).toBe(19);
      for (const figure of figures) {
        expect(fs.statSync(path.join(APP_DIR, 'public', figure.groups!.src)).size).toBeGreaterThan(
          1000,
        );
      }
    },
  );

  it('keeps the subscriber boundary and experimental limitations explicit', () => {
    const content = getPostBySlug(ARTICLE)!.raw;
    expect(content).toContain('subscriber-only continuation');
    expect(content).toContain('not current rankings');
    expect(content).toContain('unable to turn on GDS');
    expect(content).toContain('unoptimized');
    expect(content).toContain('does not separate the time spent');
    expect(content).toContain('121 million total tokens per dollar versus 52 million');
  });
});

describe('Engram glossary coverage', () => {
  it.each(NEW_TERMS)('provides a translated, source-linked definition for %s', (slug) => {
    const english = getGlossaryEntry(slug)!;
    const chinese = getZhGlossaryEntry(slug)!;
    expect(english, slug).toBeDefined();
    expect(chinese, slug).toBeDefined();
    expect(english.articleSlugs).toContain(ARTICLE);
    expect(chinese.articleSlugs).toContain(ARTICLE);
    expect(chinese.definition).not.toBe(english.definition);
    expect(english.relatedTerms.length).toBeGreaterThanOrEqual(3);
  });

  it.each(['cpu-offloading', 'nvme-offloading', 'kv-cache-offload'])(
    'updates existing %s terminology without changing its canonical route',
    (slug) => {
      for (const lookup of [getGlossaryEntry, getZhGlossaryEntry]) {
        const entry = lookup(slug)!;
        expect(entry.slug).toBe(slug);
        expect(entry.articleSlugs).toContain(ARTICLE);
        expect(`${entry.explanation} ${entry.benchmarkContext}`).toContain('Engram');
      }
    },
  );

  it('does not conflate cached SSD files with pinned memory or gate strength with hotness', () => {
    expect(getGlossaryEntry('filesystem-page-cache')?.benchmarkContext).toContain(
      'CPU coordination',
    );
    expect(getGlossaryEntry('cache-hotness')?.benchmarkContext).toContain(
      'strong gates do not identify cache-hot rows',
    );
    expect(getGlossaryEntry('unified-virtual-addressing')?.significance).toContain(
      'does not imply automatic page migration',
    );
    expect(getGlossaryEntry('inference-time-ablation')?.explanation).toContain(
      'not the quality difference between independently trained models',
    );
  });
});
