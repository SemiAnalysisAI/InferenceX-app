import { describe, expect, it } from 'vitest';

import { Model, MODEL_OPTIONS } from './data-mappings';
import {
  DEFAULT_ROUTE_MODEL,
  MODEL_ROUTE_TABS,
  MODEL_ROUTES,
  modelRoutePath,
  modelRoutePathnameRewrite,
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

describe('modelRoutePath', () => {
  it('builds canonical English paths for both tabs', () => {
    for (const tab of MODEL_ROUTE_TABS) {
      expect(modelRoutePath(tab, 'kimi-k3')).toBe(`/${tab}/kimi-k3`);
    }
  });
});
