import { describe, expect, it } from 'bun:test';

import { GENERATED_FAQ_DATA } from '@/components/about/faq';
import { FAQ_ITEMS } from '@/components/about/faq-data';
import { FAQ_ITEMS_ZH } from '@/components/about/faq-data-zh';
import { MODEL_OPTIONS, modelRequiresFeatureGate } from '@/lib/catalog/data-mappings';

const faqContentShape = (items: typeof FAQ_ITEMS) =>
  items.map((item) => ({
    hasAnswer: Boolean(item.answer),
    listLength: item.list?.length ?? 0,
    linkHref: item.link?.href ?? null,
  }));

describe('FAQ anchors', () => {
  it('gives every item a unique anchor', () => {
    const ids = FAQ_ITEMS.map((item) => item.id);

    expect(ids).toHaveLength(FAQ_ITEMS.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('faq-'))).toBe(true);
  });

  it('keeps English and Chinese anchors in exact parity', () => {
    expect(FAQ_ITEMS_ZH.map((item) => item.id)).toEqual(FAQ_ITEMS.map((item) => item.id));
  });

  it('keeps optional content fields structurally aligned across locales', () => {
    expect(faqContentShape(FAQ_ITEMS_ZH)).toEqual(faqContentShape(FAQ_ITEMS));
  });
});

describe('generated FAQ lists', () => {
  it('names every point release of a grouped model and leaves gated models out', () => {
    expect(GENERATED_FAQ_DATA.modelNames).toEqual(
      expect.arrayContaining(['Kimi-K2.5', 'Kimi-K2.6', 'Kimi-K2.7-Code', 'GLM-5.2', 'GLM-5.3']),
    );
    for (const gated of MODEL_OPTIONS.filter((model) => modelRequiresFeatureGate(model))) {
      expect(GENERATED_FAQ_DATA.modelNames).not.toContain(gated);
    }
    expect(new Set(GENERATED_FAQ_DATA.modelNames).size).toBe(GENERATED_FAQ_DATA.modelNames.length);
  });

  it('shows precisions by label, so the mixed precision reads FP4+FP8', () => {
    expect(GENERATED_FAQ_DATA.precisionNames).toContain('FP4+FP8');
    expect(GENERATED_FAQ_DATA.precisionNames).not.toContain('FP4FP8');
  });
});
