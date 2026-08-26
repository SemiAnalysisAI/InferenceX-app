import { describe, expect, it } from 'vitest';

import { COMPARE_MODEL_SLUGS } from './compare-slug';
import { getModelCategory, Model, MODEL_OPTIONS } from './data-mappings';
import {
  ACTIVE_INFERENCE_MODEL_SLUGS,
  getInferenceModelBySlug,
  INFERENCE_MODEL_ALIASES,
  INFERENCE_MODEL_SLUGS,
  inferenceModelForPathname,
  inferenceModelPath,
  inferenceModelSlugForModel,
} from './inference-model-slug';

describe('INFERENCE_MODEL_SLUGS registry', () => {
  it('covers every non-hidden dashboard model exactly once', () => {
    const models = INFERENCE_MODEL_SLUGS.map((entry) => entry.model);
    expect(new Set(models).size).toBe(models.length);
    expect(new Set(models)).toEqual(new Set(MODEL_OPTIONS));
  });

  it('excludes hidden models', () => {
    for (const entry of INFERENCE_MODEL_SLUGS) {
      expect(getModelCategory(entry.model)).not.toBe('hidden');
    }
  });

  it('has unique lowercase slugs shared with the compare vocabulary', () => {
    const compareSlugs = new Set(COMPARE_MODEL_SLUGS.map((entry) => entry.slug));
    const slugs = INFERENCE_MODEL_SLUGS.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toBe(slug.toLowerCase());
      expect(compareSlugs.has(slug)).toBe(true);
    }
  });

  it('keeps active (landing-promoted) entries a subset of the registry', () => {
    for (const entry of ACTIVE_INFERENCE_MODEL_SLUGS) {
      expect(getModelCategory(entry.model)).not.toBe('deprecated');
      expect(INFERENCE_MODEL_SLUGS).toContain(entry);
    }
  });
});

describe('getInferenceModelBySlug', () => {
  it('resolves canonical slugs', () => {
    expect(getInferenceModelBySlug('kimi-k3')?.model).toBe(Model.Kimi_K3);
    expect(getInferenceModelBySlug('deepseek-v4')?.model).toBe(Model.DeepSeek_V4_Pro);
  });

  it('is case-insensitive', () => {
    expect(getInferenceModelBySlug('Kimi-K3')?.model).toBe(Model.Kimi_K3);
  });

  it('resolves g_model display names as aliases', () => {
    for (const entry of INFERENCE_MODEL_SLUGS) {
      expect(getInferenceModelBySlug(entry.model)?.slug).toBe(entry.slug);
    }
  });

  it('resolves compare family aliases', () => {
    expect(getInferenceModelBySlug('kimi')?.slug).toBe('kimi-k26');
    expect(getInferenceModelBySlug('glm-5')?.slug).toBe('glm-5-1');
  });

  it('returns null for unknown and reserved segments', () => {
    expect(getInferenceModelBySlug('agentic')).toBeNull();
    expect(getInferenceModelBySlug('logs')).toBeNull();
    expect(getInferenceModelBySlug('not-a-model')).toBeNull();
  });

  it('alias targets all resolve to canonical entries', () => {
    for (const [alias, target] of Object.entries(INFERENCE_MODEL_ALIASES)) {
      expect(getInferenceModelBySlug(alias)?.slug).toBe(target);
    }
  });
});

describe('inferenceModelSlugForModel / inferenceModelPath', () => {
  it('round-trips every registry entry', () => {
    for (const entry of INFERENCE_MODEL_SLUGS) {
      expect(inferenceModelSlugForModel(entry.model)).toBe(entry.slug);
      expect(inferenceModelPath(entry.slug)).toBe(`/inference/${entry.slug}`);
    }
  });

  it('returns null for hidden models', () => {
    expect(inferenceModelSlugForModel(Model.Llama3_1_70B)).toBeNull();
  });
});

describe('inferenceModelForPathname', () => {
  it('pins the model on English model pages', () => {
    expect(inferenceModelForPathname('/inference/kimi-k3')).toBe(Model.Kimi_K3);
    expect(inferenceModelForPathname('/inference/minimax-m3/')).toBe(Model.MiniMax_M3);
  });

  it('pins the model on /zh model pages', () => {
    expect(inferenceModelForPathname('/zh/inference/kimi-k3')).toBe(Model.Kimi_K3);
  });

  it('resolves alias segments (pre-redirect client render)', () => {
    expect(inferenceModelForPathname('/inference/Kimi-K3')).toBe(Model.Kimi_K3);
    expect(inferenceModelForPathname('/inference/deepseek-v4-pro')).toBe(Model.DeepSeek_V4_Pro);
    expect(inferenceModelForPathname('/inference/Kimi-K2.5')).toBe(Model.Kimi_K2_5);
  });

  it('ignores query strings and hashes', () => {
    expect(inferenceModelForPathname('/inference/kimi-k3?i_seq=8k%2F1k#chart')).toBe(Model.Kimi_K3);
  });

  it('returns null off the model pages', () => {
    expect(inferenceModelForPathname('/inference')).toBeNull();
    expect(inferenceModelForPathname('/zh/inference')).toBeNull();
    expect(inferenceModelForPathname('/inference/agentic')).toBeNull();
    expect(inferenceModelForPathname('/inference/agentic/some-point')).toBeNull();
    expect(inferenceModelForPathname('/inference/logs')).toBeNull();
    expect(inferenceModelForPathname('/inference/kimi-k3/extra')).toBeNull();
    expect(inferenceModelForPathname('/compare/kimi-k3-gb200-vs-mi355x')).toBeNull();
    expect(inferenceModelForPathname('/')).toBeNull();
    expect(inferenceModelForPathname('/zh')).toBeNull();
    expect(inferenceModelForPathname('/inference/%E4%B8%8D%E5%AD%98%E5%9C%A8')).toBeNull();
  });
});
