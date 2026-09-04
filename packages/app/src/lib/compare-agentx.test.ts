import { describe, expect, it } from 'vitest';

import {
  agentxDashboardHref,
  AGENTX_NEW_MODEL_DISPLAY_NAMES,
  comparisonPairHref,
  comparisonScenarioForModel,
  FEATURED_AGENTX_MODELS,
} from './compare-agentx';
import { COMPARE_MODEL_SLUGS } from './compare-slug';

describe('AgentX comparison links', () => {
  it('keeps the live AgentX models in the editorial order', () => {
    expect(FEATURED_AGENTX_MODELS.map((model) => model.slug)).toEqual([
      'kimi-k3',
      'deepseek-v4',
      'glm-5-2',
      'minimax-m3',
      'qwen-3-5',
      'qwen-3-8-flash-next',
    ]);
  });

  it('marks exactly the featured models as NEW for the dashboard selector', () => {
    expect(AGENTX_NEW_MODEL_DISPLAY_NAMES).toEqual(
      new Set([
        'Kimi-K3',
        'DeepSeek-V4-Pro',
        'GLM-5.2',
        'MiniMax-M3',
        'Qwen-3.5-397B-A17B',
        'Qwen3.8-Flash-Next',
      ]),
    );
  });

  it('opens the bare model subroute — Agentic + Optimal Only are already the defaults', () => {
    expect(agentxDashboardHref('en', FEATURED_AGENTX_MODELS[0])).toBe('/inference/kimi-k3');
    expect(agentxDashboardHref('zh', FEATURED_AGENTX_MODELS[1])).toBe('/zh/inference/deepseek-v4');
  });

  it('routes every featured model to a registered inference page without query params', () => {
    for (const model of FEATURED_AGENTX_MODELS) {
      expect(agentxDashboardHref('en', model)).toBe(`/inference/${model.slug}`);
    }
  });

  it('uses AgentX for supported models and 8K/1K for the rest', () => {
    const deepSeekV4 = COMPARE_MODEL_SLUGS.find((model) => model.slug === 'deepseek-v4')!;
    const deepSeekR1 = COMPARE_MODEL_SLUGS.find((model) => model.slug === 'deepseek-r1')!;

    expect(comparisonScenarioForModel(deepSeekV4)).toEqual({
      label: 'AgentX',
      sequence: 'agentic-traces',
    });
    expect(comparisonPairHref('en', 'deepseek-v4-h100-vs-h200', deepSeekV4)).toBe(
      '/compare/deepseek-v4-h100-vs-h200/agentic',
    );
    expect(comparisonScenarioForModel(deepSeekR1)).toEqual({
      label: '8K/1K',
      sequence: '8k/1k',
    });
    expect(comparisonPairHref('zh', 'deepseek-r1-h100-vs-h200', deepSeekR1)).toBe(
      '/zh/compare/deepseek-r1-h100-vs-h200/8k-1k',
    );
    // The per-dollar catalog links the same workloads under its own family.
    expect(
      comparisonPairHref('en', 'deepseek-v4-h100-vs-h200', deepSeekV4, 'compare-per-dollar'),
    ).toBe('/compare-per-dollar/deepseek-v4-h100-vs-h200/agentic');
    expect(
      comparisonPairHref('zh', 'deepseek-r1-h100-vs-h200', deepSeekR1, 'compare-per-dollar'),
    ).toBe('/zh/compare-per-dollar/deepseek-r1-h100-vs-h200/8k-1k');
  });
});
