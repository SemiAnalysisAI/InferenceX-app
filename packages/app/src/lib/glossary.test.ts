import { describe, expect, it } from 'vitest';

import { getAllPosts, getPostBySlug } from './blog';
import {
  GLOSSARY_CATEGORIES,
  getAdjacentGlossaryEntries,
  getAllGlossaryEntries,
  getGlossaryEntry,
  getRelatedGlossaryEntries,
} from './glossary';
import {
  GLOSSARY_CATEGORY_LABELS_ZH,
  compareZhGlossaryEntries,
  getAdjacentZhGlossaryEntries,
  getAllZhGlossaryEntries,
  getRelatedZhGlossaryEntries,
  getZhGlossaryEntry,
} from './glossary-zh';

describe('glossary content', () => {
  it('provides unique, indexable entries with substantive explanations', () => {
    const entries = getAllGlossaryEntries();
    const slugs = entries.map((entry) => entry.slug);

    expect(entries.length).toBeGreaterThanOrEqual(40);
    expect(new Set(slugs).size).toBe(entries.length);

    for (const entry of entries) {
      expect(entry.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
      expect(GLOSSARY_CATEGORIES).toContain(entry.category);
      expect(entry.relatedTerms.length).toBeGreaterThanOrEqual(3);
      expect(entry.articleSlugs.length).toBeGreaterThanOrEqual(1);
      const plainEnglishWords = entry.plainEnglish.split(/\s+/u);
      expect(plainEnglishWords.length, entry.term).toBeGreaterThanOrEqual(8);
      expect(plainEnglishWords.length, entry.term).toBeLessThanOrEqual(40);
      expect(entry.plainEnglish).not.toBe(entry.definition);
      expect(JSON.stringify(entry), entry.term).not.toMatch(/[—–]/u);

      const renderedCopy = [
        entry.definition,
        entry.explanation,
        entry.significance,
        entry.benchmarkContext,
      ].join(' ');
      expect(renderedCopy.split(/\s+/u).length, entry.term).toBeGreaterThanOrEqual(90);
    }
  });

  it('resolves every related term without self-links', () => {
    for (const entry of getAllGlossaryEntries()) {
      expect(entry.relatedTerms).not.toContain(entry.slug);
      expect(getRelatedGlossaryEntries(entry).map((related) => related.slug)).toEqual(
        entry.relatedTerms,
      );
    }
  });

  it('links every glossary source to a real article and covers the complete article library', () => {
    const entries = getAllGlossaryEntries();
    const referencedArticles = new Set(entries.flatMap((entry) => entry.articleSlugs));

    for (const slug of referencedArticles) {
      expect(getPostBySlug(slug), slug).not.toBeNull();
    }

    expect(referencedArticles).toEqual(new Set(getAllPosts().map((post) => post.slug)));
  });
});

describe('Chinese glossary content', () => {
  it('provides a substantive translation for every English entry', () => {
    const englishEntries = getAllGlossaryEntries();
    const zhEntries = getAllZhGlossaryEntries();

    expect(zhEntries.map((entry) => entry.slug)).toEqual(englishEntries.map((entry) => entry.slug));
    expect(Object.keys(GLOSSARY_CATEGORY_LABELS_ZH)).toEqual([...GLOSSARY_CATEGORIES]);

    for (const entry of zhEntries) {
      const plainLanguageCharacters = entry.plainEnglish.match(/\p{Script=Han}/gu)?.length ?? 0;
      expect(plainLanguageCharacters, entry.slug).toBeGreaterThanOrEqual(8);
      expect(plainLanguageCharacters, entry.slug).toBeLessThanOrEqual(60);
      expect(entry.plainEnglish).not.toBe(entry.definition);
      expect(JSON.stringify(entry), entry.term).not.toMatch(/[—–]/u);
      const englishMeasurement = getGlossaryEntry(entry.slug)?.measurement;
      if (englishMeasurement) {
        expect(entry.measurement, entry.term).toBeDefined();
        expect(entry.measurement?.label, entry.term).not.toBe(englishMeasurement.label);
        expect(entry.measurement?.value, entry.term).not.toBe(englishMeasurement.value);
      }
      const renderedCopy = [
        entry.definition,
        entry.explanation,
        entry.significance,
        entry.benchmarkContext,
      ].join('');
      expect(
        renderedCopy.match(/\p{Script=Han}/gu)?.length ?? 0,
        entry.slug,
      ).toBeGreaterThanOrEqual(100);
      expect(getRelatedZhGlossaryEntries(entry).map((related) => related.slug)).toEqual(
        entry.relatedTerms,
      );
      for (const articleSlug of entry.articleSlugs) {
        expect(getPostBySlug(articleSlug, 'zh'), articleSlug).not.toBeNull();
      }
    }
  });

  it('resolves canonical slugs and walks the Chinese term order without gaps', () => {
    expect(getZhGlossaryEntry('multi-token-prediction')?.term).toBe('多 token 预测');
    expect(getZhGlossaryEntry('not-a-real-term')).toBeUndefined();

    const sorted = getAllZhGlossaryEntries().toSorted(compareZhGlossaryEntries);
    for (const [index, entry] of sorted.entries()) {
      expect(getAdjacentZhGlossaryEntries(entry.slug)).toEqual({
        previous: sorted[index - 1] ?? null,
        next: sorted[index + 1] ?? null,
      });
    }
  });
});

describe('glossary navigation', () => {
  it('returns entries by canonical slug', () => {
    expect(getGlossaryEntry('multi-token-prediction')?.abbreviation).toBe('MTP');
    expect(getGlossaryEntry('not-a-real-term')).toBeUndefined();
  });

  it('walks the complete alphabetized term list without gaps', () => {
    const sorted = getAllGlossaryEntries().toSorted((a, b) => a.term.localeCompare(b.term));

    for (const [index, entry] of sorted.entries()) {
      expect(getAdjacentGlossaryEntries(entry.slug)).toEqual({
        previous: sorted[index - 1] ?? null,
        next: sorted[index + 1] ?? null,
      });
    }
  });
});
