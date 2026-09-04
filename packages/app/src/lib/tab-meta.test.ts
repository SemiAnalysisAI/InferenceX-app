import { describe, expect, it } from 'vitest';

import { DASHBOARD_ROUTE_KEYS } from './dashboard-routes';
import { Model } from '@/lib/data-mappings';
import { defaultRouteModel, MODEL_ROUTES } from './model-routes';
import {
  getTabTitle,
  isValidTab,
  LANDING_META,
  MODEL_TAB_META,
  modelTabCanonicalPath,
  modelTabMetadata,
  TAB_META,
  tabMetadata,
} from './tab-meta';

describe('agentic inference positioning', () => {
  it('uses agentic inference for the category and AgentX for the scenario', () => {
    expect(LANDING_META.title).toContain('Agentic Inference Benchmark');
    expect(LANDING_META.title).not.toContain('AgentX');
    expect(LANDING_META.description).toMatch(/AgentX.*scenario/u);
    expect(LANDING_META.description).toContain('fixed-sequence');
    expect(TAB_META.inference.title).toContain('Agentic Inference');
    expect(TAB_META.inference.title).not.toContain('AgentX');
    expect(TAB_META.inference.description).toMatch(/AgentX.*workload/u);
    expect(TAB_META.inference.description).toContain('fixed-sequence');
  });
});

describe('current image metadata', () => {
  it('uses the canonical tab copy and bilingual alternates', () => {
    const meta = tabMetadata('current-inferencex-image');
    expect(meta.description).toBe(TAB_META['current-inferencex-image'].description);
    expect(meta.openGraph?.description).toBe(TAB_META['current-inferencex-image'].description);
    expect(meta.alternates?.languages).toBeDefined();
  });
});

describe('per-model profit estimator metadata', () => {
  const kimi = MODEL_ROUTES.find((route) => route.model === Model.Kimi_K3)!;
  const deepseek = MODEL_ROUTES.find((route) => route.model === Model.DeepSeek_V4_Pro)!;

  it('canonicalizes the default model (Kimi K3) to the bare tab path only', () => {
    expect(defaultRouteModel('profit-estimator')).toBe(Model.Kimi_K3);
    expect(modelTabCanonicalPath('profit-estimator', kimi)).toBe('/profit-estimator');
    expect(modelTabCanonicalPath('profit-estimator', deepseek)).toBe(
      `/profit-estimator/${deepseek.slug}`,
    );
    // The app-wide default model is not this tab's default, so it keeps a slug.
    expect(modelTabCanonicalPath('calculator', deepseek)).toBe('/calculator');
  });

  it('gives the per-gigawatt view its own Kimi-defaulted route and GW wording', () => {
    expect(defaultRouteModel('profit-estimator-per-gigawatt')).toBe(Model.Kimi_K3);
    expect(modelTabCanonicalPath('profit-estimator-per-gigawatt', kimi)).toBe(
      '/profit-estimator-per-gigawatt',
    );
    expect(MODEL_TAB_META['profit-estimator-per-gigawatt'].title(kimi.seoName)).toContain(
      'per GigaWatt',
    );
    expect(MODEL_TAB_META['profit-estimator'].description(kimi.seoName)).toContain('chip-hour');
  });

  it('names the model in the title and description', () => {
    const meta = modelTabMetadata('profit-estimator', deepseek);
    expect(meta.title).toBe(MODEL_TAB_META['profit-estimator'].title(deepseek.seoName));
    expect(meta.title).toContain(deepseek.seoName);
    expect(meta.description).toContain(deepseek.seoName);
    expect(meta.alternates?.canonical).toBe(
      `https://inferencex.semianalysis.com/profit-estimator/${deepseek.slug}`,
    );
  });
});

describe('isValidTab', () => {
  it.each(DASHBOARD_ROUTE_KEYS)('returns true for valid tab "%s"', (tab) => {
    expect(isValidTab(tab)).toBe(true);
  });

  it.each(['', 'nonexistent', 'Inference', 'INFERENCE', 'gpu_specs', 'tabs'])(
    'returns false for invalid tab "%s"',
    (tab) => {
      expect(isValidTab(tab)).toBe(false);
    },
  );
});

describe('getTabTitle', () => {
  it.each(DASHBOARD_ROUTE_KEYS)('returns formatted title for "%s"', (tab) => {
    const title = getTabTitle(tab);
    expect(title).toContain(TAB_META[tab].title);
    expect(title).toContain('|');
  });

  it('returns fallback title for invalid tab', () => {
    const title = getTabTitle('nonexistent');
    expect(title).not.toContain('|');
    expect(title.length).toBeGreaterThan(0);
  });
});
