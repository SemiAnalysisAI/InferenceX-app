import { describe, expect, it } from 'vitest';

import { GPU_SPECS } from '@/lib/gpu-specs';
import { getPostBySlug } from '@/lib/blog';
import { getGlossaryEntry } from '@/lib/glossary';
import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import {
  buildChipFaq,
  buildChipVsFaq,
  buildChipVsHighlights,
  CHIP_VS_HIGHLIGHT_LABELS_EN,
  CHIP_VS_PAIRS,
  chipVsSlug,
  getAllChipPages,
  getAllChipRouteSlugs,
  getAllChipVsPages,
  getChipPage,
  getChipVsPage,
} from './chip-pages';
import {
  assertZhChipParity,
  buildZhChipFaq,
  buildZhChipVsFaq,
  CHIP_VS_HIGHLIGHT_LABELS_ZH,
  getAllZhChipSlugs,
  getZhChipTranslation,
  localizeVsHighlightValueZh,
} from './chip-pages-zh';

const EM_OR_EN_DASH = /[—–]/u;

describe('chip page registry integrity', () => {
  it('resolves every hwKey in HW_REGISTRY and every specName in GPU_SPECS', () => {
    for (const entry of getAllChipPages()) {
      expect(HW_REGISTRY[entry.hwKey], `hwKey ${entry.hwKey}`).toBeDefined();
      expect(
        GPU_SPECS.find((spec) => spec.name === entry.specName),
        `specName ${entry.specName}`,
      ).toBeDefined();
    }
  });

  it('has unique slugs across chip and versus pages', () => {
    const slugs = getAllChipRouteSlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('covers 9 chips and 12 versus pages (44 localized URLs with the index)', () => {
    expect(getAllChipPages()).toHaveLength(9);
    expect(getAllChipVsPages()).toHaveLength(12);
    // index + chips + versus, each in en and zh
    expect(2 * (1 + getAllChipRouteSlugs().length)).toBe(44);
  });

  it('only pairs known chips and never a chip with itself', () => {
    for (const { a, b } of CHIP_VS_PAIRS) {
      expect(a).not.toBe(b);
      expect(getChipPage(a), `pair member ${a}`).toBeDefined();
      expect(getChipPage(b), `pair member ${b}`).toBeDefined();
      expect(getChipVsPage(chipVsSlug(a, b))).toBeDefined();
    }
  });

  it('links only to blog posts and glossary terms that exist', () => {
    for (const entry of getAllChipPages()) {
      for (const slug of entry.relatedBlogSlugs) {
        expect(getPostBySlug(slug), `blog ${slug} on ${entry.slug}`).not.toBeNull();
      }
      for (const slug of entry.relatedGlossarySlugs) {
        expect(getGlossaryEntry(slug), `glossary ${slug} on ${entry.slug}`).toBeDefined();
      }
      for (const slug of entry.relatedChipSlugs) {
        expect(getChipPage(slug), `related chip ${slug} on ${entry.slug}`).toBeDefined();
      }
    }
  });

  it('builds a ratio-bearing highlight table for every versus page', () => {
    for (const page of getAllChipVsPages()) {
      const highlights = buildChipVsHighlights(page);
      expect(highlights.length).toBeGreaterThanOrEqual(5);
      for (const row of highlights) {
        expect(CHIP_VS_HIGHLIGHT_LABELS_EN[row.key]).toBeDefined();
        expect(CHIP_VS_HIGHLIGHT_LABELS_ZH[row.key]).toBeDefined();
        expect(row.aValue.length).toBeGreaterThan(0);
        expect(row.bValue.length).toBeGreaterThan(0);
        // Only fp4 may omit the ratio (when one side lacks FP4 support).
        if (row.key !== 'fp4') {
          expect(row.ratio, `${page.slug} ${row.key} ratio`).toBeDefined();
        }
      }
    }
  });
});

describe('chip page content quality', () => {
  it('has non-empty keyword-bearing prose and FAQs on every English page', () => {
    for (const entry of getAllChipPages()) {
      expect(entry.summary.length).toBeGreaterThan(80);
      expect(entry.overview.length).toBeGreaterThanOrEqual(2);
      expect(entry.keywords.length).toBeGreaterThanOrEqual(5);
      const faq = buildChipFaq(entry);
      expect(faq.length).toBeGreaterThanOrEqual(4);
      for (const item of faq) {
        expect(item.question.length).toBeGreaterThan(0);
        expect(item.answer.length).toBeGreaterThan(0);
      }
    }
    for (const page of getAllChipVsPages()) {
      expect(buildChipVsFaq(page).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('contains no em or en dashes in any locale (glossary style rule)', () => {
    for (const entry of getAllChipPages()) {
      const zh = getZhChipTranslation(entry.slug);
      const texts = [
        entry.summary,
        ...entry.overview,
        entry.benchmarkContext,
        ...buildChipFaq(entry).flatMap((item) => [item.question, item.answer]),
        ...(zh ? [zh.summary, ...zh.overview, zh.benchmarkContext] : []),
        ...buildZhChipFaq(entry).flatMap((item) => [item.question, item.answer]),
      ];
      for (const text of texts) {
        expect(text).not.toMatch(EM_OR_EN_DASH);
      }
    }
    for (const page of getAllChipVsPages()) {
      for (const item of [...buildChipVsFaq(page), ...buildZhChipVsFaq(page)]) {
        expect(item.question).not.toMatch(EM_OR_EN_DASH);
        expect(item.answer).not.toMatch(EM_OR_EN_DASH);
      }
    }
  });
});

describe('Chinese chip page parity', () => {
  it('ships a zh translation for every English page and nothing extra', () => {
    expect(() => assertZhChipParity()).not.toThrow();
    expect(getAllZhChipSlugs().length).toBe(getAllChipPages().length);
  });

  it('keeps SKUs in English while translating the prose', () => {
    for (const entry of getAllChipPages()) {
      const zh = getZhChipTranslation(entry.slug);
      expect(zh).toBeDefined();
      if (!zh) continue;
      expect(zh.summary).toMatch(/[\u4E00-\u9FFF]/u);
      expect(zh.summary).toContain(entry.label);
      expect(zh.keywords.length).toBeGreaterThanOrEqual(5);
      // zh-copy rule: the standalone English noun "Chip" must not appear.
      for (const text of [zh.summary, ...zh.overview, zh.benchmarkContext]) {
        expect(text).not.toMatch(/(?<![A-Za-z])[Cc]hips?(?![A-Za-z])/u);
      }
    }
  });

  it('localizes generated FAQ answers and highlight values', () => {
    expect(localizeVsHighlightValueZh('Not supported')).toBe('不支持');
    expect(localizeVsHighlightValueZh('72 chips')).toBe('72 芯片');
    expect(localizeVsHighlightValueZh('8 TB/s')).toBe('8 TB/s');
    for (const entry of getAllChipPages()) {
      for (const item of buildZhChipFaq(entry)) {
        expect(item.question).toMatch(/[\u4E00-\u9FFF]/u);
        expect(item.answer).toMatch(/[\u4E00-\u9FFF]/u);
      }
    }
    for (const page of getAllChipVsPages()) {
      for (const item of buildZhChipVsFaq(page)) {
        expect(item.answer).toMatch(/[\u4E00-\u9FFF]/u);
      }
    }
  });
});
