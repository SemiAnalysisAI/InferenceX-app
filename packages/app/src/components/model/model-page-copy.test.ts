import { describe, expect, it } from 'vitest';

import {
  MODEL_PAGE_COPY,
  modelAliasDestination,
  modelDashboardHref,
  modelDetailHref,
  modelEnglishArticleHref,
  modelIndexHref,
  modelInferenceHref,
} from './model-page-copy';

describe('model page copy', () => {
  it('includes the requested model and workload in each locale', () => {
    for (const copy of Object.values(MODEL_PAGE_COPY)) {
      for (const [model, scenario] of [
        ['Kimi K3', 'AgentX'],
        ['DeepSeek-R1-0528', '8K / 1K'],
      ]) {
        expect(copy.detailTitle(model)).toContain(model);
        expect(copy.inferenceBenchmarksLink(model)).toContain(model);
        expect(copy.inferenceBenchmarksLink(model)).toContain('$/M tok');
        expect(copy.dashboardHeading(model, scenario)).toContain(model);
        expect(copy.dashboardHeading(model, scenario)).toContain(scenario);
      }
    }
  });
});

describe('model page locale paths', () => {
  it('keeps index, detail, aliases, dashboard, and English-source links in the intended tree', () => {
    expect(modelIndexHref('en')).toBe('/model');
    expect(modelIndexHref('zh')).toBe('/zh/model');
    expect(modelDetailHref('deepseek-r1', 'en')).toBe('/model/deepseek-r1');
    expect(modelDetailHref('deepseek-r1', 'zh')).toBe('/zh/model/deepseek-r1');
    expect(modelAliasDestination('deepseek-r1', 'zh')).toBe('/zh/model/deepseek-r1');
    expect(modelDashboardHref('g_model=DeepSeek-R1-0528', 'zh')).toBe(
      '/zh/inference?g_model=DeepSeek-R1-0528',
    );
    expect(modelEnglishArticleHref('deepseek-r1')).toBe('/model/deepseek-r1');
  });

  it('links each model page to its dedicated inference benchmark page', () => {
    expect(modelInferenceHref('kimi-k3', 'en')).toBe('/inference/kimi-k3');
    expect(modelInferenceHref('kimi-k3', 'zh')).toBe('/zh/inference/kimi-k3');
    expect(modelInferenceHref('not-a-model', 'en')).toBeNull();
  });
});
