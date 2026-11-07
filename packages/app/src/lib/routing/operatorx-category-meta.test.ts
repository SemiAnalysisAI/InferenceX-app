import { describe, expect, it } from 'vitest';

import { OPERATORX_CATEGORIES } from '@/lib/routing/operatorx-category';
import {
  operatorXCategoryMeta,
  operatorXCategoryMetaZh,
} from '@/lib/routing/operatorx-category-meta';

describe('OperatorX category meta', () => {
  it.each(OPERATORX_CATEGORIES.map((entry) => entry.slug))(
    '%s has distinct EN and ZH titles within the description budget',
    (category) => {
      const en = operatorXCategoryMeta(category);
      const zh = operatorXCategoryMetaZh(category);
      expect(en.title).toContain('OperatorX');
      expect(zh.title).toContain('OperatorX');
      expect(zh.title).toMatch(/[\u4E00-\u9FFF]/);
      expect(en.description.length).toBeLessThanOrEqual(155);
      expect(zh.description.length).toBeLessThanOrEqual(120);
    },
  );

  it('gives every category its own title and description', () => {
    for (const meta of [operatorXCategoryMeta, operatorXCategoryMetaZh]) {
      const entries = OPERATORX_CATEGORIES.map((entry) => meta(entry.slug));
      expect(new Set(entries.map((entry) => entry.title)).size).toBe(entries.length);
      expect(new Set(entries.map((entry) => entry.description)).size).toBe(entries.length);
    }
  });
});
