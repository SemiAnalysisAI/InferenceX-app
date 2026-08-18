import { describe, expect, it } from 'vitest';

import { agentxDashboardHref, FEATURED_AGENTX_MODELS } from './compare-agentx';

describe('AgentX comparison links', () => {
  it('keeps the live AgentX models in the editorial order', () => {
    expect(FEATURED_AGENTX_MODELS.map((model) => model.slug)).toEqual([
      'kimi-k3',
      'deepseek-v4',
      'minimax-m3',
      'qwen-3-5',
      'glm-5-2',
    ]);
  });

  it('opens the selected model directly in the Agentic Traces scenario', () => {
    expect(agentxDashboardHref('en', FEATURED_AGENTX_MODELS[0])).toBe(
      '/inference?g_model=Kimi-K3&i_seq=agentic-traces&i_optimal=1',
    );
    expect(agentxDashboardHref('zh', FEATURED_AGENTX_MODELS[1])).toBe(
      '/zh/inference?g_model=DeepSeek-V4-Pro&i_seq=agentic-traces&i_optimal=1',
    );
  });
});
