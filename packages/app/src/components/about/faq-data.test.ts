import { describe, expect, it } from 'vitest';

import { FAQ_ITEMS_ZH } from './faq-data-zh';
import { FAQ_ITEMS } from './faq-data';

describe('localized About FAQ', () => {
  it('keeps every English FAQ item and optional field represented in Chinese', () => {
    expect(FAQ_ITEMS_ZH).toHaveLength(FAQ_ITEMS.length);
    expect(
      FAQ_ITEMS_ZH.map((item) => ({
        hasAnswer: Boolean(item.answer),
        listLength: item.list?.length ?? 0,
        linkHref: item.link?.href ?? null,
      })),
    ).toEqual(
      FAQ_ITEMS.map((item) => ({
        hasAnswer: Boolean(item.answer),
        listLength: item.list?.length ?? 0,
        linkHref: item.link?.href ?? null,
      })),
    );
  });

  it('spells the NeoCloud pricing category correctly', () => {
    const metrics = FAQ_ITEMS_ZH.find((item) => item.question === 'InferenceX 测量哪些指标？');
    expect(metrics?.list?.join('\n')).toContain('NeoCloud');
    expect(metrics?.list?.join('\n')).not.toContain('NeoCoud');
  });
});
