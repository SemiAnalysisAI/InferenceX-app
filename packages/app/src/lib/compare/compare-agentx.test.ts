import { describe, expect, it } from 'vitest';

import {
  agentxDashboardHref,
  AGENTX_NEW_MODEL_DISPLAY_NAMES,
  comparisonPairHref,
  comparisonScenarioForModel,
  FEATURED_AGENTX_MODELS,
  isNewAgentxModel,
} from './compare-agentx';
import { COMPARE_MODEL_SLUGS } from './compare-slug';
import { Model } from '../catalog/data-mappings';
import { overviewScenariosForModel } from '../overview/overview-data';

describe('AgentX comparison links', () => {
  it('keeps the featured AgentX models in the editorial order', () => {
    expect(FEATURED_AGENTX_MODELS.map((model) => model.slug)).toEqual([
      'kimi-k3',
      'muse-spark-open',
      'deepseek-v41-flash',
      'deepseek-v4',
      'glm-5-3',
      'minimax-m3',
      'qwen-3-5',
      'qwen-3-8-flash-next',
    ]);
  });

  it('keeps NEW off every featured model — the pill is reserved for the TPUv7 launch', () => {
    expect(AGENTX_NEW_MODEL_DISPLAY_NAMES).toEqual(new Set());
    for (const model of FEATURED_AGENTX_MODELS) {
      expect(isNewAgentxModel(model), model.slug).toBe(false);
    }
  });

  it('keeps the ledger pill and the selector pill on the same list', () => {
    const ledgerNew = FEATURED_AGENTX_MODELS.filter(isNewAgentxModel).map(
      (model) => model.displayName,
    );
    expect(new Set(ledgerNew)).toEqual(AGENTX_NEW_MODEL_DISPLAY_NAMES);
    for (const model of COMPARE_MODEL_SLUGS) {
      if (AGENTX_NEW_MODEL_DISPLAY_NAMES.has(model.displayName)) {
        expect(FEATURED_AGENTX_MODELS).toContain(model);
      }
    }
  });

  it('opens the bare model subroute — Agentic + Optimal Only are already the defaults', () => {
    expect(agentxDashboardHref('en', FEATURED_AGENTX_MODELS[0])).toBe('/inference/kimi-k3');
    expect(agentxDashboardHref('zh', FEATURED_AGENTX_MODELS[3])).toBe('/zh/inference/deepseek-v4');
  });

  it('routes every featured model to its registered page without query parameters', () => {
    for (const model of FEATURED_AGENTX_MODELS) {
      for (const locale of ['en', 'zh'] as const) {
        const url = new URL(agentxDashboardHref(locale, model), 'https://example.com');
        expect(url.pathname).toBe(`${locale === 'zh' ? '/zh' : ''}/inference/${model.slug}`);
        expect(url.search).toBe('');
      }
    }
  });

  it('routes DeepSeek V4.1 Flash to AgentX from the featured ledger', () => {
    const flash = COMPARE_MODEL_SLUGS.find((model) => model.slug === 'deepseek-v41-flash')!;
    expect(comparisonScenarioForModel(flash)).toEqual({
      label: 'AgentX',
      sequence: 'agentic-traces',
    });
    expect(comparisonPairHref('en', 'deepseek-v41-flash-gb300-vs-b200', flash)).toBe(
      '/compare/deepseek-v41-flash-gb300-vs-b200/agentic',
    );
    expect(
      comparisonPairHref('zh', 'deepseek-v41-flash-gb300-vs-b200', flash, 'compare-per-dollar'),
    ).toBe('/zh/compare-per-dollar/deepseek-v41-flash-gb300-vs-b200/agentic');
    expect(FEATURED_AGENTX_MODELS[2]).toBe(flash);
    expect(agentxDashboardHref('en', flash)).toBe('/inference/deepseek-v41-flash');
  });

  it('routes Muse results to the canonical AgentX dashboard in both locales', () => {
    const muse = COMPARE_MODEL_SLUGS.find((model) => model.slug === 'muse-spark-open')!;
    expect(agentxDashboardHref('en', muse)).toBe('/inference/muse-spark-open');
    expect(agentxDashboardHref('zh', muse)).toBe('/zh/inference/muse-spark-open');
    expect(comparisonScenarioForModel(muse)).toEqual({
      label: 'AgentX',
      sequence: 'agentic-traces',
    });
    expect(comparisonPairHref('en', 'muse-spark-open-mi355x-vs-b200', muse)).toBe(
      '/compare/muse-spark-open-mi355x-vs-b200/agentic',
    );
    expect(overviewScenariosForModel(Model.Muse_Spark_Open)).toEqual(['agentx']);
  });

  it('routes MiniMax M3.1 Flash to AgentX without featuring it on the ledger', () => {
    const flash = COMPARE_MODEL_SLUGS.find((model) => model.slug === 'minimax-m31-flash')!;
    expect(comparisonScenarioForModel(flash)).toEqual({
      label: 'AgentX',
      sequence: 'agentic-traces',
    });
    expect(comparisonPairHref('en', 'minimax-m31-flash-b300-vs-b200', flash)).toBe(
      '/compare/minimax-m31-flash-b300-vs-b200/agentic',
    );
    expect(FEATURED_AGENTX_MODELS).not.toContain(flash);
    expect(overviewScenariosForModel(Model.MiniMax_M3_1_Flash)).toEqual(['agentx']);
  });

  it('routes MiMo V2.6 Flash to AgentX without featuring it on the ledger', () => {
    const mimo = COMPARE_MODEL_SLUGS.find((model) => model.slug === 'mimo-v26-flash')!;
    expect(comparisonScenarioForModel(mimo)).toEqual({
      label: 'AgentX',
      sequence: 'agentic-traces',
    });
    expect(comparisonPairHref('en', 'mimo-v26-flash-b300-vs-b200', mimo)).toBe(
      '/compare/mimo-v26-flash-b300-vs-b200/agentic',
    );
    expect(FEATURED_AGENTX_MODELS).not.toContain(mimo);
    expect(overviewScenariosForModel(Model.MiMo_V2_6_Flash)).toEqual(['agentx']);
  });

  it('agrees with the overview matrix about which models are AgentX-only', () => {
    const modelValues = new Set<string>(Object.values(Model));
    for (const entry of COMPARE_MODEL_SLUGS) {
      if (!modelValues.has(entry.displayName)) continue;
      const scenarios = overviewScenariosForModel(entry.displayName as Model);
      if (!scenarios.includes('agentx') || scenarios.includes('single_turn_8k1k')) continue;
      expect(comparisonScenarioForModel(entry), `${entry.slug} is AgentX-only`).toEqual({
        label: 'AgentX',
        sequence: 'agentic-traces',
      });
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
    expect(
      comparisonPairHref('en', 'deepseek-v4-h100-vs-h200', deepSeekV4, 'compare-per-dollar'),
    ).toBe('/compare-per-dollar/deepseek-v4-h100-vs-h200/agentic');
    expect(
      comparisonPairHref('zh', 'deepseek-r1-h100-vs-h200', deepSeekR1, 'compare-per-dollar'),
    ).toBe('/zh/compare-per-dollar/deepseek-r1-h100-vs-h200/8k-1k');
  });
});
