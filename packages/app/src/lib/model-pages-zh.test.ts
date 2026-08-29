import { describe, expect, it } from 'vitest';

import { getModelPage, getModelPageSlugs } from './model-pages';
import { MODEL_PAGE_ZH, getLocalizedModelPage } from './model-pages-zh';

describe('Chinese model-page catalog', () => {
  it('covers every published model slug without orphan translations', () => {
    expect(Object.keys(MODEL_PAGE_ZH).sort()).toEqual([...getModelPageSlugs()].sort());
  });

  it.each(getModelPageSlugs())('preserves canonical facts and English MDX for %s', (slug) => {
    const canonical = getModelPage(slug);
    expect(canonical).not.toBeNull();

    const english = getLocalizedModelPage(slug, 'en');
    const chinese = getLocalizedModelPage(slug, 'zh');
    expect(english).not.toBeNull();
    expect(chinese).not.toBeNull();

    expect(english?.meta).toEqual(canonical?.meta);
    expect(english?.raw).toBe(canonical?.raw);
    expect(chinese?.raw).toBe(canonical?.raw);
    expect(chinese?.entry).toBe(canonical?.entry);
    expect(chinese?.meta.title).toBe(canonical?.meta.title);
    expect(chinese?.meta.developer).toBe(canonical?.meta.developer);
    expect(chinese?.meta.releaseDate).not.toBe(canonical?.meta.releaseDate);
    expect(chinese?.meta.releaseDate).toMatch(/[年月]/u);
    expect(chinese?.meta.releaseDate).not.toMatch(
      /January|February|March|April|May|June|July|August|September|October|November|December/u,
    );
    expect(chinese?.meta.description).not.toBe(canonical?.meta.description);
    expect(chinese?.meta.description).toMatch(/[\u3400-\u9FFF]/u);
  });

  it('retains representative protected technical facts in Chinese summaries', () => {
    expect(MODEL_PAGE_ZH['deepseek-r1'].description).toContain('671B');
    expect(MODEL_PAGE_ZH['deepseek-r1'].description).toContain('37B');
    expect(MODEL_PAGE_ZH['deepseek-r1'].description).toContain('MoE');
    expect(MODEL_PAGE_ZH['deepseek-r1'].description).toContain('MLA');
    expect(MODEL_PAGE_ZH['deepseek-v4'].description).toContain('CSA+HCA');
    expect(MODEL_PAGE_ZH['qwen-3-8-flash-next'].description).toContain('176B');
    expect(MODEL_PAGE_ZH['qwen-3-8-flash-next'].description).toContain('51B');
  });

  it('preserves the scope of the GLM-5.3 agentic post-training claim', () => {
    expect(MODEL_PAGE_ZH['glm-5-2'].description).toContain('重点面向智能体能力的后训练');
    expect(MODEL_PAGE_ZH['glm-5-2'].description).not.toContain('大规模智能体后训练');
  });
});
