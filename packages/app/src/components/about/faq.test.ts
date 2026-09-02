import { describe, expect, it } from 'vitest';

import { FAQ_ITEMS } from '@/components/about/faq-data';
import { FAQ_ITEMS_ZH } from '@/components/about/faq-data-zh';

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
