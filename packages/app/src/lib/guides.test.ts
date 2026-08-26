import { describe, expect, it } from 'vitest';

import { getPostBySlug } from './blog';
import { getChipPage } from './chip-pages';
import { getGlossaryEntry } from './glossary';
import {
  GUIDE_CATEGORIES,
  getAdjacentGuides,
  getAllGuides,
  getGuide,
  getGuidesByCategory,
  getRelatedGuides,
} from './guides';
import { GUIDE_CATEGORY_LABELS_ZH, getAllZhGuides, getZhGuide } from './guides-zh';

const guides = getAllGuides();
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function wordCount(text: string): number {
  return text.split(/\s+/u).filter(Boolean).length;
}

function renderedCopy(entry: (typeof guides)[number]): string {
  return [
    entry.quickAnswer,
    ...entry.sections.flatMap((section) => [section.heading, ...section.paragraphs]),
    ...entry.faq.flatMap((item) => [item.question, item.answer]),
  ].join(' ');
}

describe('guides library', () => {
  it('has at least 20 guides with unique slugs', () => {
    expect(guides.length).toBeGreaterThanOrEqual(20);
    const slugs = guides.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('uses URL-safe slugs and valid categories', () => {
    for (const entry of guides) {
      expect(entry.slug).toMatch(SLUG_PATTERN);
      expect(GUIDE_CATEGORIES).toContain(entry.category);
    }
  });

  it('contains no em or en dashes in any entry', () => {
    for (const entry of guides) {
      expect(JSON.stringify(entry)).not.toMatch(/[—–]/u);
    }
  });

  it('keeps quick answers snippet-sized and descriptions meta-sized', () => {
    for (const entry of guides) {
      const words = wordCount(entry.quickAnswer);
      expect(words).toBeGreaterThanOrEqual(30);
      expect(words).toBeLessThanOrEqual(120);
      expect(entry.description.length).toBeGreaterThanOrEqual(70);
      expect(entry.description.length).toBeLessThanOrEqual(220);
    }
  });

  it('ships substantial rendered copy on every guide', () => {
    for (const entry of guides) {
      expect(entry.sections.length).toBeGreaterThanOrEqual(3);
      for (const section of entry.sections) {
        expect(section.paragraphs.length).toBeGreaterThanOrEqual(1);
      }
      expect(wordCount(renderedCopy(entry))).toBeGreaterThanOrEqual(400);
    }
  });

  it('ships at least 3 FAQ items and 6 keywords per guide', () => {
    for (const entry of guides) {
      expect(entry.faq.length).toBeGreaterThanOrEqual(3);
      for (const item of entry.faq) {
        expect(item.question.trim().length).toBeGreaterThan(0);
        expect(item.answer.trim().length).toBeGreaterThan(0);
      }
      expect(entry.keywords.length).toBeGreaterThanOrEqual(6);
    }
  });

  it('resolves every related guide slug without self-links', () => {
    for (const entry of guides) {
      expect(entry.relatedGuideSlugs.length).toBeGreaterThanOrEqual(2);
      expect(new Set(entry.relatedGuideSlugs).size).toBe(entry.relatedGuideSlugs.length);
      for (const slug of entry.relatedGuideSlugs) {
        expect(slug).not.toBe(entry.slug);
        expect(
          getGuide(slug),
          `guide ${entry.slug} references unknown guide ${slug}`,
        ).toBeDefined();
      }
      expect(getRelatedGuides(entry).length).toBe(entry.relatedGuideSlugs.length);
    }
  });

  it('resolves every related chip slug against the chip pages', () => {
    for (const entry of guides) {
      for (const slug of entry.relatedChipSlugs) {
        expect(
          getChipPage(slug),
          `guide ${entry.slug} references unknown chip ${slug}`,
        ).toBeDefined();
      }
    }
  });

  it('resolves every related glossary slug against the glossary', () => {
    for (const entry of guides) {
      for (const slug of entry.relatedGlossarySlugs) {
        expect(
          getGlossaryEntry(slug),
          `guide ${entry.slug} references unknown glossary term ${slug}`,
        ).toBeDefined();
      }
    }
  });

  it('resolves every article slug against the blog library', () => {
    for (const entry of guides) {
      expect(entry.articleSlugs.length).toBeGreaterThanOrEqual(2);
      for (const slug of entry.articleSlugs) {
        expect(
          getPostBySlug(slug),
          `guide ${entry.slug} references unknown article ${slug}`,
        ).not.toBeNull();
      }
    }
  });

  it('groups every guide exactly once by category', () => {
    const grouped = getGuidesByCategory().flatMap((group) => group.guides);
    expect(grouped.length).toBe(guides.length);
    for (const group of getGuidesByCategory()) {
      for (const entry of group.guides) {
        expect(entry.category).toBe(group.category);
      }
    }
  });

  it('returns stable adjacent guides for pagination', () => {
    const first = guides.at(0);
    const last = guides.at(-1);
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (!first || !last) return;
    expect(getAdjacentGuides(first.slug).previous).toBeUndefined();
    expect(getAdjacentGuides(first.slug).next?.slug).toBe(guides.at(1)?.slug);
    expect(getAdjacentGuides(last.slug).next).toBeUndefined();
    expect(getAdjacentGuides('nonexistent-guide')).toEqual({
      previous: undefined,
      next: undefined,
    });
  });
});

describe('guides Chinese parity', () => {
  const zhGuides = getAllZhGuides();

  it('translates every guide with matching slugs and categories', () => {
    expect(zhGuides.length).toBe(guides.length);
    for (const entry of guides) {
      const zh = getZhGuide(entry.slug);
      expect(zh, `missing Chinese translation for ${entry.slug}`).toBeDefined();
      expect(zh?.category).toBe(entry.category);
    }
  });

  it('keeps structural parity between English and Chinese entries', () => {
    for (const entry of guides) {
      const zh = getZhGuide(entry.slug);
      if (!zh) continue;
      expect(zh.sections.length, `section count mismatch for ${entry.slug}`).toBe(
        entry.sections.length,
      );
      for (const [index, section] of entry.sections.entries()) {
        expect(
          zh.sections[index].paragraphs.length,
          `paragraph count mismatch in section ${index} of ${entry.slug}`,
        ).toBe(section.paragraphs.length);
      }
      expect(zh.faq.length, `faq count mismatch for ${entry.slug}`).toBe(entry.faq.length);
      expect(zh.keywords.length, `keyword count mismatch for ${entry.slug}`).toBe(
        entry.keywords.length,
      );
    }
  });

  it('actually translates the user-facing copy', () => {
    const cjk = /[\u4E00-\u9FFF]/u;
    for (const zh of zhGuides) {
      expect(zh.title, `untranslated title for ${zh.slug}`).toMatch(cjk);
      expect(zh.description, `untranslated description for ${zh.slug}`).toMatch(cjk);
      expect(zh.quickAnswer, `untranslated quick answer for ${zh.slug}`).toMatch(cjk);
    }
  });

  it('contains no em or en dashes in any Chinese entry', () => {
    for (const zh of zhGuides) {
      expect(JSON.stringify(zh)).not.toMatch(/[—–]/u);
    }
  });

  it('labels every category in Chinese', () => {
    for (const category of GUIDE_CATEGORIES) {
      expect(GUIDE_CATEGORY_LABELS_ZH[category]).toMatch(/[\u4E00-\u9FFF]/u);
    }
  });
});
