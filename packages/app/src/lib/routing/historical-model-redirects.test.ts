import { describe, expect, it } from 'vitest';

import { COMPARE_MODEL_ALIASES } from '../compare/compare-slug';
import { HISTORICAL_MODEL_ALIAS_REDIRECTS } from './historical-model-redirects';
import { resolveModelRouteSlug } from './model-routes';

describe('HISTORICAL_MODEL_ALIAS_REDIRECTS', () => {
  it('redirects every alias in both locale trees to the slug the page resolves', () => {
    expect(HISTORICAL_MODEL_ALIAS_REDIRECTS).toHaveLength(
      Object.keys(COMPARE_MODEL_ALIASES).length * 4,
    );
    for (const [alias, canonical] of Object.entries(COMPARE_MODEL_ALIASES)) {
      const resolved = resolveModelRouteSlug(alias);
      if (resolved) expect(resolved.route.slug).toBe(canonical);
      for (const locale of ['', '/zh']) {
        for (const source of ['/infx/historical', '/historical']) {
          expect(HISTORICAL_MODEL_ALIAS_REDIRECTS).toContainEqual({
            source: `${locale}${source}/${alias}`,
            destination: `${locale}/infx/historical/${canonical}`,
            permanent: true,
          });
        }
      }
    }
  });

  it('sends the indexed GLM-5.2 URL to GLM-5.3 in one permanent hop', () => {
    expect(HISTORICAL_MODEL_ALIAS_REDIRECTS).toContainEqual({
      source: '/infx/historical/glm-5-2',
      destination: '/infx/historical/glm-5-3',
      permanent: true,
    });
  });

  it('never redirects a canonical path to itself', () => {
    for (const redirect of HISTORICAL_MODEL_ALIAS_REDIRECTS) {
      expect(redirect.destination).not.toBe(redirect.source);
    }
  });
});
