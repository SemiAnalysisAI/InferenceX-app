import { describe, expect, it } from 'vitest';

import { inferenceModelMeta, inferenceModelMetaZh } from '@/lib/routing/inference-model-meta';
import { INFERENCE_MODEL_SLUGS } from '@/lib/routing/inference-model-slug';

describe('inference model meta', () => {
  it.each(INFERENCE_MODEL_SLUGS.map((entry) => [entry.slug, entry] as const))(
    '%s has model-specific EN and ZH titles',
    (_slug, entry) => {
      const en = inferenceModelMeta(entry);
      const zh = inferenceModelMetaZh(entry);
      for (const meta of [en, zh]) {
        expect(meta.title).toContain(entry.seoName);
      }
      expect(zh.title).not.toBe(en.title);
      expect(zh.title).toMatch(/[\u4E00-\u9FFF]/);
    },
  );

  it.each(INFERENCE_MODEL_SLUGS.map((entry) => [entry.slug, entry] as const))(
    '%s keeps EN and ZH descriptions within the locale budget',
    (_slug, entry) => {
      expect(inferenceModelMeta(entry).description.length).toBeLessThanOrEqual(155);
      expect(inferenceModelMetaZh(entry).description.length).toBeLessThanOrEqual(120);
    },
  );

  it('falls back to the short model name when the detailed ZH description is too long', () => {
    const entry = { ...INFERENCE_MODEL_SLUGS[0], label: 'X'.repeat(60) };
    const zh = inferenceModelMetaZh(entry);
    expect(zh.description.length).toBeLessThanOrEqual(120);
    expect(zh.description).toContain(entry.seoName);
    expect(zh.description).not.toContain(entry.label);
  });
});
