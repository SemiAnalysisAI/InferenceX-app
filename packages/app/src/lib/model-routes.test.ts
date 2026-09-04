import { describe, expect, it } from 'vitest';

import { Model, MODEL_OPTIONS } from './data-mappings';
import {
  DEFAULT_ROUTE_MODEL,
  defaultRouteModel,
  MODEL_ROUTE_TABS,
  MODEL_ROUTES,
  modelRoutePath,
  modelRoutePathnameRewrite,
  modelRouteAvailableForTab,
  modelRoutesForTab,
  pathWithSearchParams,
  modelRouteSlug,
  parseModelRoutePathname,
  resolveModelRouteSlug,
  routeModelForPathname,
} from './model-routes';
import { PARAM_DEFAULTS } from './url-state';

describe('MODEL_ROUTES registry', () => {
  it('covers every visible model with a unique canonical slug', () => {
    expect(MODEL_ROUTES.map((route) => route.model)).toEqual([...MODEL_OPTIONS]);
    const slugs = MODEL_ROUTES.map((route) => route.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('uses lowercase hyphenated URL-safe slugs', () => {
    for (const route of MODEL_ROUTES) {
      expect(route.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    }
  });

  it('keeps the default route model in lockstep with the g_model URL default', () => {
    // The pathname rewrite treats a bare /calculator or /historical as
    // DEFAULT_ROUTE_MODEL; if the app-wide default drifted, plain page loads
    // would rewrite the URL.
    expect(PARAM_DEFAULTS.g_model).toBe(DEFAULT_ROUTE_MODEL);
  });

  it('gives every tab a default model, with the profit estimator pinned to Kimi K3', () => {
    expect(MODEL_ROUTE_TABS).toEqual([
      'calculator',
      'historical',
      'profit-estimator',
      'profit-estimator-per-gigawatt',
    ]);
    expect(defaultRouteModel('calculator')).toBe(DEFAULT_ROUTE_MODEL);
    expect(defaultRouteModel('historical')).toBe(DEFAULT_ROUTE_MODEL);
    // The estimator only plots agentic traces, and Kimi K3 is the model with
    // the widest agentic hardware coverage; the page seeds its provider from
    // this same helper.
    expect(defaultRouteModel('profit-estimator')).toBe(Model.Kimi_K3);
    expect(defaultRouteModel('profit-estimator-per-gigawatt')).toBe(Model.Kimi_K3);
    for (const tab of MODEL_ROUTE_TABS) {
      expect(MODEL_ROUTES.some((route) => route.model === defaultRouteModel(tab))).toBe(true);
    }
  });
});

describe('resolveModelRouteSlug', () => {
  it('resolves canonical slugs without flagging an alias', () => {
    const resolved = resolveModelRouteSlug('kimi-k3');
    expect(resolved?.route.model).toBe(Model.Kimi_K3);
    expect(resolved?.isAlias).toBe(false);
  });

  it('resolves compare aliases and flags them for redirect', () => {
    const resolved = resolveModelRouteSlug('kimi');
    expect(resolved?.route.slug).toBe('kimi-k26');
    expect(resolved?.isAlias).toBe(true);
  });

  it('is case-insensitive but flags non-canonical casing', () => {
    const resolved = resolveModelRouteSlug('Kimi-K3');
    expect(resolved?.route.slug).toBe('kimi-k3');
    expect(resolved?.isAlias).toBe(true);
  });

  it('returns null for unknown slugs', () => {
    expect(resolveModelRouteSlug('not-a-model')).toBeNull();
  });
});

describe('parseModelRoutePathname', () => {
  it('parses bare and slugged English tab paths', () => {
    expect(parseModelRoutePathname('/calculator')).toEqual({
      tab: 'calculator',
      zh: false,
      slug: null,
    });
    expect(parseModelRoutePathname('/historical/kimi-k3')).toEqual({
      tab: 'historical',
      zh: false,
      slug: 'kimi-k3',
    });
  });

  it('parses /zh siblings', () => {
    expect(parseModelRoutePathname('/zh/calculator/deepseek-r1')).toEqual({
      tab: 'calculator',
      zh: true,
      slug: 'deepseek-r1',
    });
    expect(parseModelRoutePathname('/zh/historical')).toEqual({
      tab: 'historical',
      zh: true,
      slug: null,
    });
  });

  it('rejects other routes and deeper paths', () => {
    expect(parseModelRoutePathname('/')).toBeNull();
    expect(parseModelRoutePathname('/inference')).toBeNull();
    expect(parseModelRoutePathname('/compare/kimi-k3-b200-vs-mi355x')).toBeNull();
    expect(parseModelRoutePathname('/historical/kimi-k3/extra')).toBeNull();
    expect(parseModelRoutePathname('/calculatorx')).toBeNull();
  });
});

describe('routeModelForPathname', () => {
  it('maps slugged paths (including aliases) to models', () => {
    expect(routeModelForPathname('/historical/kimi-k3')).toBe(Model.Kimi_K3);
    expect(routeModelForPathname('/zh/calculator/deepseek-r1')).toBe(Model.DeepSeek_R1);
    expect(routeModelForPathname('/calculator/glm')).toBe(Model.GLM_5);
  });

  it('returns null for bare tabs, unknown slugs, and non-model routes', () => {
    expect(routeModelForPathname('/historical')).toBeNull();
    expect(routeModelForPathname('/historical/not-a-model')).toBeNull();
    expect(routeModelForPathname('/inference')).toBeNull();
    expect(routeModelForPathname(null)).toBeNull();
    expect(routeModelForPathname(undefined)).toBeNull();
  });
});

describe('modelRoutePathnameRewrite', () => {
  it('rewrites slugged paths when the model changes', () => {
    expect(modelRoutePathnameRewrite('/historical/kimi-k3', Model.DeepSeek_R1)).toBe(
      '/historical/deepseek-r1',
    );
    expect(modelRoutePathnameRewrite('/zh/calculator/kimi-k3', Model.MiniMax_M3)).toBe(
      '/zh/calculator/minimax-m3',
    );
  });

  it('rewrites bare paths only for non-default models', () => {
    expect(modelRoutePathnameRewrite('/calculator', DEFAULT_ROUTE_MODEL)).toBeNull();
    expect(modelRoutePathnameRewrite('/calculator', Model.Kimi_K3)).toBe('/calculator/kimi-k3');
    // Per-tab default: the profit estimator's bare path means Kimi K3, so the
    // app-wide default model is the one that gets a slug there.
    expect(modelRoutePathnameRewrite('/profit-estimator', Model.Kimi_K3)).toBeNull();
    expect(modelRoutePathnameRewrite('/zh/profit-estimator', Model.Kimi_K3)).toBeNull();
    expect(modelRoutePathnameRewrite('/profit-estimator', DEFAULT_ROUTE_MODEL)).toBe(
      `/profit-estimator/${modelRouteSlug(DEFAULT_ROUTE_MODEL)}`,
    );
    expect(
      modelRoutePathnameRewrite(
        `/profit-estimator/${modelRouteSlug(DEFAULT_ROUTE_MODEL)}`,
        Model.Kimi_K3,
      ),
    ).toBe('/profit-estimator/kimi-k3');
    expect(modelRoutePathnameRewrite('/zh/historical', Model.Kimi_K3)).toBe(
      '/zh/historical/kimi-k3',
    );
  });

  it('keeps the slugged path when switching to the default model', () => {
    expect(modelRoutePathnameRewrite('/historical/kimi-k3', DEFAULT_ROUTE_MODEL)).toBe(
      `/historical/${modelRouteSlug(DEFAULT_ROUTE_MODEL)}`,
    );
  });

  it('returns null when the path already matches', () => {
    expect(modelRoutePathnameRewrite('/historical/kimi-k3', Model.Kimi_K3)).toBeNull();
  });

  it('never rewrites non-model routes or unknown slugs', () => {
    expect(modelRoutePathnameRewrite('/inference', Model.Kimi_K3)).toBeNull();
    expect(modelRoutePathnameRewrite('/', Model.Kimi_K3)).toBeNull();
    expect(modelRoutePathnameRewrite('/historical/not-a-model', Model.Kimi_K3)).toBeNull();
  });
});

describe('modelRoutesForTab', () => {
  it('serves Kimi K3 and GLM 5.2/5.3 on the profit estimators and every model elsewhere', () => {
    for (const tab of ['profit-estimator', 'profit-estimator-per-gigawatt'] as const) {
      expect(modelRoutesForTab(tab).map((route) => route.model)).toEqual([
        Model.Kimi_K3,
        Model.GLM_5_2,
      ]);
      expect(modelRouteAvailableForTab(tab, Model.GLM_5_2)).toBe(true);
      // GLM 5.2 and 5.3 share one data bucket, so the profit page is reached
      // through the same slug as the rest of the site.
      expect(modelRoutesForTab(tab).find((route) => route.model === Model.GLM_5_2)?.slug).toBe(
        'glm-5-2',
      );
      expect(modelRouteAvailableForTab(tab, Model.DeepSeek_V4_Pro)).toBe(false);
      expect(modelRouteAvailableForTab(tab, Model.GLM_5)).toBe(false);
    }
    for (const tab of ['calculator', 'historical'] as const) {
      expect(modelRoutesForTab(tab)).toEqual(MODEL_ROUTES);
      expect(modelRouteAvailableForTab(tab, Model.DeepSeek_V4_Pro)).toBe(true);
    }
  });
});

describe('modelRoutePath', () => {
  it('builds canonical English paths for both tabs', () => {
    for (const tab of MODEL_ROUTE_TABS) {
      expect(modelRoutePath(tab, 'kimi-k3')).toBe(`/${tab}/kimi-k3`);
    }
  });
});

describe('pathWithSearchParams', () => {
  it('returns the bare path when there are no params', () => {
    expect(pathWithSearchParams('/calculator/kimi-k26', {})).toBe('/calculator/kimi-k26');
  });

  it('keeps share-link params, including repeated keys and reserved characters', () => {
    expect(
      pathWithSearchParams('/calculator/kimi-k26', {
        i_seq: '8k/1k',
        unofficialruns: ['a', 'b'],
        missing: undefined,
      }),
    ).toBe('/calculator/kimi-k26?i_seq=8k%2F1k&unofficialruns=a&unofficialruns=b');
  });
});
