import { describe, expect, it } from 'vitest';

import { inferenceModelMeta, inferenceModelMetaZh } from '@/lib/routing/inference-model-meta';
import { INFERENCE_MODEL_SLUGS } from '@/lib/routing/inference-model-slug';

describe('inference model meta', () => {
  it.each(INFERENCE_MODEL_SLUGS.map((entry) => [entry.slug, entry] as const))(
    '%s has model-specific EN and ZH title and intro',
    (_slug, entry) => {
      const en = inferenceModelMeta(entry);
      const zh = inferenceModelMetaZh(entry);
      for (const meta of [en, zh]) {
        expect(meta.title).toContain(entry.seoName);
        expect(meta.intro).toContain(entry.seoName);
      }
      expect(zh.title).not.toBe(en.title);
      expect(zh.intro).toMatch(/[\u4E00-\u9FFF]/);
    },
  );
});
