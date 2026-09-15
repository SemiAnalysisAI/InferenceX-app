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
import { Model } from './data-mappings';
import { overviewScenariosForModel } from './overview-data';

describe('AgentX comparison links', () => {
  it('keeps the live AgentX models in the editorial order', () => {
    expect(FEATURED_AGENTX_MODELS.map((model) => model.slug)).toEqual([
      'kimi-k3',
      'deepseek-v41-flash',
      'deepseek-v4',
      'glm-5-3',
      'minimax-m3',
      'qwen-3-5',
      'qwen-3-8-flash-next',
    ]);
  });

  it('marks only the still-new featured models for the dashboard selector', () => {
    // DeepSeek V4 Pro, MiniMax M3, and Qwen 3.5 stay in the ledger but their
    // launch pills have retired; V4.1 Flash picks one up on arrival.
    expect(AGENTX_NEW_MODEL_DISPLAY_NAMES).toEqual(
      new Set(['Kimi-K3', 'DeepSeek-V4.1-Flash', 'GLM-5.2', 'Qwen3.8-Flash-Next']),
    );
    expect(AGENTX_NEW_MODEL_DISPLAY_NAMES.has('DeepSeek-V4-Pro')).toBe(false);
    expect(AGENTX_NEW_MODEL_DISPLAY_NAMES.has('MiniMax-M3')).toBe(false);
    expect(AGENTX_NEW_MODEL_DISPLAY_NAMES.has('Qwen-3.5-397B-A17B')).toBe(false);
  });

  it('keeps the ledger pill and the selector pill on the same list', () => {
    const ledgerNew = FEATURED_AGENTX_MODELS.filter(isNewAgentxModel).map(
      (model) => model.displayName,
    );
    expect(new Set(ledgerNew)).toEqual(AGENTX_NEW_MODEL_DISPLAY_NAMES);
    // Every NEW model is a featured row — the pill never marks a model the
    // ledger does not show.
    for (const model of COMPARE_MODEL_SLUGS) {
      if (AGENTX_NEW_MODEL_DISPLAY_NAMES.has(model.displayName)) {
        expect(FEATURED_AGENTX_MODELS).toContain(model);
      }
    }
  });

  it('opens the bare model subroute — Agentic + Optimal Only are already the defaults', () => {
    expect(agentxDashboardHref('en', FEATURED_AGENTX_MODELS[0])).toBe('/inference/kimi-k3');
    expect(agentxDashboardHref('zh', FEATURED_AGENTX_MODELS[2])).toBe('/zh/inference/deepseek-v4');
  });

  it('routes every featured model to a registered inference page without query params', () => {
    for (const model of FEATURED_AGENTX_MODELS) {
      expect(agentxDashboardHref('en', model)).toBe(`/inference/${model.slug}`);
    }
  });

  it('routes DeepSeek V4.1 Flash to AgentX from the featured ledger', () => {
    // V4.1 Flash has no 8K/1K sweep, so the 8K/1K fallback would SSR an empty
    // compare page. It is now a featured row (second, under Kimi K3), and its
    // compare cards still point at the agentic workload.
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
    expect(FEATURED_AGENTX_MODELS[1]).toBe(flash);
    expect(agentxDashboardHref('en', flash)).toBe('/inference/deepseek-v41-flash');
    expect(isNewAgentxModel(flash)).toBe(true);
  });

  it('agrees with the overview matrix about which models are AgentX-only', () => {
    // Two modules encode the same fact — the compare scenario set here and
    // OVERVIEW_MODEL_SCENARIOS in overview-data.ts. This pins the agreement so
    // curating one without the other fails here instead of silently SSRing an
    // empty compare page. compare-agentx.ts cannot import the overview module
    // directly: ChartControls is a client component, and the import would drag
    // the matrix builder into the browser bundle.
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
    // The per-dollar catalog links the same workloads under its own family.
    expect(
      comparisonPairHref('en', 'deepseek-v4-h100-vs-h200', deepSeekV4, 'compare-per-dollar'),
    ).toBe('/compare-per-dollar/deepseek-v4-h100-vs-h200/agentic');
    expect(
      comparisonPairHref('zh', 'deepseek-r1-h100-vs-h200', deepSeekR1, 'compare-per-dollar'),
    ).toBe('/zh/compare-per-dollar/deepseek-r1-h100-vs-h200/8k-1k');
  });
});
