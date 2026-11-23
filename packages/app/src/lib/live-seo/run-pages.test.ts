import { describe, expect, it } from 'bun:test';

import { META_TITLE_MAX } from '@/lib/seo/meta-text';

import {
  fmtCostPerMtok,
  fmtGpuHour,
  fmtMs,
  fmtThroughput,
  pctCheaper,
  pctFaster,
} from '@/components/live-seo/format';
import { getAllChipPages } from '@/lib/catalog/chip-pages';
import { INFERENCE_MODEL_SLUGS } from '@/lib/routing/inference-model-slug';
import {
  canonicalRunPageSlug,
  getAllRunPageEntries,
  getRunPageEntry,
  runPagePath,
  runPageTitle,
} from '@/lib/live-seo/run-pages';
import { runPageDescriptionZh, runPageTitleZh } from '@/lib/live-seo/run-pages-zh';

const CJK = /[\u4E00-\u9FFF]/;

describe('run pages registry', () => {
  it('has one candidate per (model, chip) pair', () => {
    const entries = getAllRunPageEntries();
    expect(entries.length).toBe(INFERENCE_MODEL_SLUGS.length * getAllChipPages().length);
    expect(entries.length).toBe(171);
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

describe('canonicalRunPageSlug', () => {
  it.each([
    ['deepseek-v4.1-flash-on-h200', 'deepseek-v41-flash-on-h200'],
    ['deepseek-v4-1-flash-on-b300', 'deepseek-v41-flash-on-b300'],
    ['kimi-k3.1-pro-on-b300', 'kimi-k31-pro-on-b300'],
    ['llama-3.3-70b-on-h100', 'llama-3-3-70b-on-h100'],
    ['qwen3.5-on-h200', 'qwen-3-5-on-h200'],
    ['gpt-oss-120b-on-h200', 'gptoss-120b-on-h200'],
    ['deepseek-v4-pro-on-b300', 'deepseek-v4-on-b300'],
    ['glm-5.2-on-h200', 'glm-5-3-on-h200'],
    ['kimi-k2-5-on-b200', 'kimi-k26-on-b200'],
    ['deepseek-r1-on-gb300', 'deepseek-r1-on-gb300-nvl72'],
    ['deepseek-v41-flash-on-h100-sxm', 'deepseek-v41-flash-on-h100'],
  ])('maps %s to %s', (slug, current) => {
    expect(canonicalRunPageSlug(slug)).toBe(current);
  });

  it.each([
    'deepseek-v3.1-on-h200',
    'deepseek-v4-flash-on-h200',
    'qwen-3-8-27b-on-rtx-pro-6000',
    'deepseek-v41-flash-on-h200.md',
    'sitemap.xml',
  ])('finds no page for %s', (slug) => {
    expect(canonicalRunPageSlug(slug)).toBeNull();
  });

  it('maps every model and chip name to its own page', () => {
    for (const entry of getAllRunPageEntries()) {
      for (const model of [entry.model.slug, entry.model.model, entry.model.seoName]) {
        for (const chip of [entry.chip.slug, entry.chip.hwKey, entry.chip.label]) {
          expect(canonicalRunPageSlug(`${model}-on-${chip}`), `${model} on ${chip}`).toBe(
            entry.slug,
          );
        }
      }
    }
  });
});

describe('run pages copy', () => {
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

  it('keeps every title within the meta title budget in both locales', () => {
    for (const entry of getAllRunPageEntries()) {
      expect(runPageTitle(entry).length, runPageTitle(entry)).toBeLessThanOrEqual(META_TITLE_MAX);
      expect(runPageTitleZh(entry).length, runPageTitleZh(entry)).toBeLessThanOrEqual(
        META_TITLE_MAX,
      );
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
    expect(pctCheaper(1, 2)).toBe(50);
    expect(pctCheaper(1.5, 2)).toBe(25);
  });
});
