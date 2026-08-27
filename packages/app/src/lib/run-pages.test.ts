import { describe, expect, it } from 'vitest';

import {
  fmtCostPerMtok,
  fmtGpuHour,
  fmtMs,
  fmtThroughput,
  pctCheaper,
  pctFaster,
} from '@/components/live-seo/format';
import { getAllChipPages } from '@/lib/chip-pages';
import { INFERENCE_MODEL_SLUGS } from '@/lib/inference-model-slug';
import {
  getAllRunPageEntries,
  getRunPageEntry,
  runPageDescription,
  runPageFaqQuestions,
  runPageHeading,
  runPageKeywords,
  runPagePath,
  runPageTitle,
} from '@/lib/run-pages';
import {
  runPageDescriptionZh,
  runPageFaqQuestionsZh,
  runPageHeadingZh,
  runPageKeywordsZh,
  runPageTitleZh,
} from '@/lib/run-pages-zh';

const FORBIDDEN_DASHES = /[\u2013\u2014]/;
const CJK = /[\u4E00-\u9FFF]/;

describe('run pages registry', () => {
  it('has one candidate per (model, chip) pair', () => {
    const entries = getAllRunPageEntries();
    expect(entries.length).toBe(INFERENCE_MODEL_SLUGS.length * getAllChipPages().length);
    expect(entries.length).toBe(108);
  });

  it('has unique, well-formed slugs', () => {
    const entries = getAllRunPageEntries();
    expect(new Set(entries.map((entry) => entry.slug)).size).toBe(entries.length);
    for (const entry of entries) {
      expect(entry.slug).toBe(`${entry.model.slug}-on-${entry.chip.slug}`);
      expect(entry.slug).toMatch(/^[a-z0-9-]+$/);
      expect(runPagePath(entry)).toBe(`/run/${entry.slug}`);
      expect(entry.dbKeys.length).toBeGreaterThan(0);
    }
  });

  it('resolves slugs case-insensitively and rejects unknown slugs', () => {
    const [first] = getAllRunPageEntries();
    expect(getRunPageEntry(first.slug)).toBe(first);
    expect(getRunPageEntry(first.slug.toUpperCase())).toBe(first);
    expect(getRunPageEntry('kimi-k3-on-abacus')).toBeUndefined();
  });
});

describe('run pages copy', () => {
  it('contains no em or en dashes and enough keywords in either locale', () => {
    for (const entry of getAllRunPageEntries()) {
      const faq = runPageFaqQuestions(entry);
      const faqZh = runPageFaqQuestionsZh(entry);
      const copy = [
        runPageTitle(entry),
        runPageHeading(entry),
        runPageDescription(entry),
        ...runPageKeywords(entry),
        faq.throughput,
        faq.cost,
        faq.serving,
        faq.methodology,
        runPageTitleZh(entry),
        runPageHeadingZh(entry),
        runPageDescriptionZh(entry),
        ...runPageKeywordsZh(entry),
        faqZh.throughput,
        faqZh.cost,
        faqZh.serving,
        faqZh.methodology,
      ];
      for (const text of copy) {
        expect(text, `dash found in copy for ${entry.slug}: ${text}`).not.toMatch(FORBIDDEN_DASHES);
        expect(text.length).toBeGreaterThan(0);
      }
      expect(runPageKeywords(entry).length).toBeGreaterThanOrEqual(6);
      expect(runPageKeywordsZh(entry).length).toBeGreaterThanOrEqual(6);
    }
  });

  it('keeps Chinese copy Chinese while model and chip names stay English', () => {
    for (const entry of getAllRunPageEntries()) {
      expect(runPageTitleZh(entry)).toMatch(CJK);
      expect(runPageDescriptionZh(entry)).toMatch(CJK);
      expect(runPageTitleZh(entry)).toContain(entry.model.seoName);
      expect(runPageTitleZh(entry)).toContain(entry.chip.label);
    }
  });

  it('mentions both the model and the chip in every English title', () => {
    for (const entry of getAllRunPageEntries()) {
      expect(runPageTitle(entry)).toContain(entry.model.seoName);
      expect(runPageTitle(entry)).toContain(entry.chip.label);
    }
  });
});

describe('live-seo number formatting', () => {
  it('formats throughput with sensible precision', () => {
    expect(fmtThroughput(1234.56)).toBe('1,235');
    expect(fmtThroughput(250)).toBe('250');
    expect(fmtThroughput(42.345)).toBe('42.3');
  });

  it('formats costs at cents precision with a sub-cent fallback', () => {
    expect(fmtCostPerMtok(1.234)).toBe('$1.23');
    expect(fmtCostPerMtok(0.056)).toBe('$0.056');
    expect(fmtGpuHour(2.5)).toBe('$2.50');
  });

  it('formats latency and percentage deltas', () => {
    expect(fmtMs(123.4)).toBe('123 ms');
    expect(fmtMs(45.67)).toBe('45.7 ms');
    expect(pctFaster(250, 200)).toBe(25);
    // A $1 winner against a $2 runner-up is 50% below, not 100%.
    expect(pctCheaper(1, 2)).toBe(50);
    expect(pctCheaper(1.5, 2)).toBe(25);
  });
});
