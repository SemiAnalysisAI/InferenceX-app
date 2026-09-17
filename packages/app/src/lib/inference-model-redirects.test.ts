import { describe, expect, it } from 'vitest';

import { INFERENCE_MODEL_ALIAS_REDIRECTS } from './inference-model-redirects';
import { INFERENCE_MODEL_ALIASES } from './inference-model-slug';

describe('INFERENCE_MODEL_ALIAS_REDIRECTS', () => {
  it('redirects every known alias in both locale trees', () => {
    expect(INFERENCE_MODEL_ALIAS_REDIRECTS).toHaveLength(
      Object.keys(INFERENCE_MODEL_ALIASES).length * 2,
    );

    for (const [alias, canonical] of Object.entries(INFERENCE_MODEL_ALIASES)) {
      for (const prefix of ['/inference', '/zh/inference']) {
        expect(INFERENCE_MODEL_ALIAS_REDIRECTS).toContainEqual({
          source: `${prefix}/${alias}`,
          destination: `${prefix}/${canonical}`,
          permanent: true,
        });
      }
    }
  });

  it('keeps the GLM-5.2 share-link alias on a one-hop permanent redirect', () => {
    expect(INFERENCE_MODEL_ALIAS_REDIRECTS).toContainEqual({
      source: '/inference/glm-5-2',
      destination: '/inference/glm-5-3',
      permanent: true,
    });
  });

  it('never redirects a canonical path to itself', () => {
    for (const redirect of INFERENCE_MODEL_ALIAS_REDIRECTS) {
      expect(redirect.destination).not.toBe(redirect.source);
    }
  });
});
