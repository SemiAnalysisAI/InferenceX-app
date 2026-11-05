import { describe, expect, it } from 'vitest';

import { localeForPathname, routeTemplateForPathname } from './route-template';

describe('routeTemplateForPathname', () => {
  it('maps dynamic pages to their template in both locales', () => {
    expect(routeTemplateForPathname('/inference/kimi-k3')).toBe('/inference/[model]');
    expect(routeTemplateForPathname('/zh/inference/kimi-k3')).toBe('/inference/[model]');
    expect(routeTemplateForPathname('/compare/h100-vs-b200/8k1k')).toBe(
      '/compare/[slug]/[scenario]',
    );
    expect(routeTemplateForPathname('/profit-estimator/dsr1/a/b/c')).toBe(
      '/profit-estimator/[model]/[...filters]',
    );
  });

  it('prefers static segments over dynamic ones', () => {
    expect(routeTemplateForPathname('/inference/agentic/42')).toBe('/inference/agentic/[id]');
    expect(routeTemplateForPathname('/inference/logs/42')).toBe('/inference/logs/[id]');
    expect(routeTemplateForPathname('/inference/agentic')).toBe('/inference/agentic');
  });

  it('keeps static pages and the locale root as-is', () => {
    expect(routeTemplateForPathname('/')).toBe('/');
    expect(routeTemplateForPathname('/zh')).toBe('/');
    expect(routeTemplateForPathname('/zh/overview')).toBe('/overview');
    expect(routeTemplateForPathname('/inference')).toBe('/inference');
    expect(routeTemplateForPathname('/blog/')).toBe('/blog');
  });

  it('does not treat a /zh-prefixed English slug as Chinese', () => {
    expect(routeTemplateForPathname('/zhfoo')).toBe('/zhfoo');
    expect(localeForPathname('/zhfoo')).toBe('en');
    expect(localeForPathname('/zh/blog/x')).toBe('zh');
  });
});
