import { describe, expect, it } from 'vitest';

import { isModelVisible, Model, MODEL_OPTIONS } from '@/lib/catalog/data-mappings';
import { getCompareModelBySlug, PUBLIC_COMPARE_MODEL_SLUGS } from '@/lib/compare/compare-slug';
import { getInferenceModelBySlug, PUBLIC_INFERENCE_MODEL_SLUGS } from './inference-model-slug';
import { isFeatureGatedModelPath } from './model-feature-visibility';

describe('model presentation visibility', () => {
  it('retains raw registrations but requires an explicit unlock for Flash UI', () => {
    expect(MODEL_OPTIONS).toContain(Model.GLM_5_3_Flash);
    expect(getCompareModelBySlug('glm-5-3-flash')?.dbKeys).toEqual(['glm5.3flash']);
    expect(getInferenceModelBySlug('glm-5-3-flash')?.model).toBe(Model.GLM_5_3_Flash);
    expect(isModelVisible(Model.GLM_5_3_Flash)).toBe(false);
    expect(isModelVisible(Model.GLM_5_3_Flash, true)).toBe(true);
    expect(isModelVisible(Model.GLM_5_2)).toBe(true);
    expect(PUBLIC_COMPARE_MODEL_SLUGS.map((entry) => entry.slug)).not.toContain('glm-5-3-flash');
    expect(PUBLIC_INFERENCE_MODEL_SLUGS.map((entry) => entry.slug)).not.toContain('glm-5-3-flash');
  });

  it.each([
    '/inference/glm-5-3-flash',
    '/zh/inference/GLM-5.3-Flash',
    '/calculator/glm-5-3-flash',
    '/zh/historical/glm-5-3-flash',
    '/compare/glm-5-3-flash-b200-vs-b300/agentx',
    '/compare/kimi-k3-vs-glm-5-3-flash',
    '/zh/compare-per-dollar/kimi-k3-vs-GLM-5.3-Flash',
    '/compare/kimi-k3-vs-glm%2D5%2D3%2Dflash',
    '/compare-precision/glm-5-3-flash-b200-fp8-vs-fp4',
    '/rankings/glm-5-3-flash',
    '/rankings/fastest-gpu-for-glm-5-3-flash',
    '/zh/rankings/cheapest-gpu-for-glm-5-3-flash',
    '/run/glm-5-3-flash-b300',
  ])('recognizes gated page %s', (path) => {
    expect(isFeatureGatedModelPath(path)).toBe(true);
  });

  it.each(['/inference/glm-5-3', '/zh/inference/kimi-k3', '/api', '/inference', '/%zz'])(
    'leaves existing public page %s alone',
    (path) => expect(isFeatureGatedModelPath(path)).toBe(false),
  );
});
